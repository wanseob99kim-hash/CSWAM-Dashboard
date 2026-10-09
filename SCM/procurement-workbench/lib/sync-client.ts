// Client-side sync state transitions, kept pure so they can be tested without
// React or a network. `synced` is the last workspace the server confirmed;
// rows where `current` differs from `synced` are local, unsent ("dirty") edits.
import type { WorkspaceSnapshot } from "./storage";
import { COLLECTION_KEYS, isDeepEqual, type CollectionKey, type SyncRequest, type VersionMap } from "./sync";

export type SyncState = {
  current: WorkspaceSnapshot;
  synced: WorkspaceSnapshot;
  versions: VersionMap;
  /** serverTime of the last read or write; the next incremental read starts here. */
  serverTime: string | null;
};

export type ServerRead = {
  snapshot: Partial<WorkspaceSnapshot>;
  versions: VersionMap;
  deletedIds: Partial<Record<CollectionKey, string[]>>;
  serverTime: string;
};

export type ServerSyncResult = {
  applied: Partial<Record<CollectionKey, Array<{ id: string; version: number; deleted: boolean }>>>;
  conflicts: Partial<Record<CollectionKey, Array<{ id: string; version: number; deleted: boolean; item: unknown | null }>>>;
  serverTime: string;
};

type Item = { id: string };
type Lists = Record<CollectionKey, Item[]>;

export function emptyWorkspace(): WorkspaceSnapshot {
  return {
    projects: [],
    deliveries: [],
    bomItems: [],
    purchasePoLines: [],
    supplierPlans: [],
    supplierNcrs: [],
    internalNcrs: [],
    ecnRecords: [],
    todoItems: [],
  };
}

export function completeSnapshot(partial: Partial<WorkspaceSnapshot>): WorkspaceSnapshot {
  return { ...emptyWorkspace(), ...partial };
}

const laterTime = (left: string | null, right: string) => (left && left > right ? left : right);

/** Ids whose current row differs from the confirmed one, including local adds and deletes. */
export function dirtyIds(current: readonly Item[], synced: readonly Item[]): Set<string> {
  const syncedById = new Map(synced.map((item) => [item.id, item]));
  const currentIds = new Set(current.map((item) => item.id));
  const dirty = new Set<string>();
  for (const item of current) if (!isDeepEqual(syncedById.get(item.id), item)) dirty.add(item.id);
  for (const id of syncedById.keys()) if (!currentIds.has(id)) dirty.add(id);
  return dirty;
}

/** Replaces rows by id, keeping the existing order and appending new ids; drops ids in `remove`. */
function upsertById(list: readonly Item[], updates: Map<string, Item>, remove: Set<string> = new Set()): Item[] {
  const seen = new Set<string>();
  const next: Item[] = [];
  for (const item of list) {
    if (remove.has(item.id)) continue;
    seen.add(item.id);
    next.push(updates.get(item.id) ?? item);
  }
  for (const [id, item] of updates) if (!seen.has(id) && !remove.has(id)) next.push(item);
  return next;
}

/**
 * Folds a server read into the local state. Server rows win for every id the
 * user has not touched; dirty rows keep their local value and the version they
 * were based on, so sending them later surfaces a conflict instead of silently
 * overwriting someone else's change.
 */
export function mergeServerRead(state: SyncState, read: ServerRead, mode: "full" | "incremental"): SyncState {
  const current = { ...state.current } as Lists;
  const synced = { ...state.synced } as Lists;
  const versions: VersionMap = { ...state.versions };

  for (const key of COLLECTION_KEYS) {
    const serverRows = (read.snapshot[key] ?? []) as Item[];
    const serverVersions = read.versions[key] ?? {};
    const knownVersions = state.versions[key] ?? {};
    // A read that started before one of our saves finished can carry older versions; never go back.
    const stale = serverRows
      .filter((row) => (knownVersions[row.id] ?? 0) > (serverVersions[row.id] ?? 0))
      .map((row) => row.id);
    // Rows to leave untouched: unsent local edits, and rows we already know a newer version of.
    const dirty = new Set([...dirtyIds(state.current[key], state.synced[key]), ...stale]);
    const keptVersions = Object.fromEntries(
      Object.entries(state.versions[key] ?? {}).filter(([id]) => dirty.has(id)),
    );
    const cleanServerRows = new Map(serverRows.filter((row) => !dirty.has(row.id)).map((row) => [row.id, row]));
    const cleanServerVersions = Object.fromEntries(Object.entries(serverVersions).filter(([id]) => !dirty.has(id)));

    if (mode === "full") {
      const serverIds = new Set(serverRows.map((row) => row.id));
      const goneOnServer = new Set(
        (state.current[key] as Item[]).filter((row) => !serverIds.has(row.id) && !dirty.has(row.id)).map((row) => row.id),
      );
      const dirtySynced = (state.synced[key] as Item[]).filter((row) => dirty.has(row.id));
      current[key] = upsertById(state.current[key], cleanServerRows, goneOnServer);
      synced[key] = upsertById(dirtySynced, cleanServerRows);
      versions[key] = { ...cleanServerVersions, ...keptVersions };
    } else {
      const deleted = new Set((read.deletedIds[key] ?? []).filter((id) => !dirty.has(id)));
      current[key] = upsertById(state.current[key], cleanServerRows, deleted);
      synced[key] = upsertById(state.synced[key], cleanServerRows, deleted);
      const merged = { ...(state.versions[key] ?? {}), ...cleanServerVersions };
      for (const id of deleted) delete merged[id];
      versions[key] = merged;
    }
  }

  return {
    current: current as unknown as WorkspaceSnapshot,
    synced: synced as unknown as WorkspaceSnapshot,
    versions,
    serverTime: laterTime(state.serverTime, read.serverTime),
  };
}

/**
 * Records what the server accepted and applies conflicts (server wins).
 * `current` may contain edits made while the request was in flight; those stay dirty.
 */
export function applySyncResult(
  state: SyncState,
  request: SyncRequest,
  result: ServerSyncResult,
): { state: SyncState; conflictCount: number } {
  const current = { ...state.current } as Lists;
  const synced = { ...state.synced } as Lists;
  const versions: VersionMap = { ...state.versions };
  let conflictCount = 0;

  for (const key of COLLECTION_KEYS) {
    const applied = result.applied[key] ?? [];
    const conflicts = result.conflicts[key] ?? [];
    if (!applied.length && !conflicts.length) continue;

    const sent = new Map(
      ((request.changes[key]?.upserts ?? []) as Array<Item & { baseVersion?: number }>).map((upsert) => {
        const item = { ...upsert };
        delete item.baseVersion;
        return [item.id, item as Item];
      }),
    );
    const keyVersions = { ...(versions[key] ?? {}) };
    const syncedUpdates = new Map<string, Item>();
    const currentUpdates = new Map<string, Item>();
    const removed = new Set<string>();

    for (const write of applied) {
      if (write.deleted) {
        removed.add(write.id);
        delete keyVersions[write.id];
        continue;
      }
      const item = sent.get(write.id);
      if (item) syncedUpdates.set(write.id, item);
      keyVersions[write.id] = write.version;
    }

    for (const conflict of conflicts) {
      conflictCount += 1;
      if (conflict.deleted || !conflict.item) {
        removed.add(conflict.id);
        delete keyVersions[conflict.id];
        continue;
      }
      const item = conflict.item as Item;
      syncedUpdates.set(conflict.id, item);
      currentUpdates.set(conflict.id, item);
      keyVersions[conflict.id] = conflict.version;
    }

    const conflictRemovals = new Set(conflicts.filter((conflict) => conflict.deleted || !conflict.item).map((conflict) => conflict.id));
    synced[key] = upsertById(state.synced[key], syncedUpdates, removed);
    current[key] = upsertById(state.current[key], currentUpdates, conflictRemovals);
    versions[key] = keyVersions;
  }

  return {
    state: {
      current: current as unknown as WorkspaceSnapshot,
      synced: synced as unknown as WorkspaceSnapshot,
      versions,
      serverTime: laterTime(state.serverTime, result.serverTime),
    },
    conflictCount,
  };
}

/** Splits a sync request so no single request carries more than `maxRows` upserts plus deletes. */
export function chunkSyncRequest(request: SyncRequest, maxRows: number): SyncRequest[] {
  type Entry = { key: CollectionKey; kind: "upserts" | "deletes"; value: unknown };
  const entries: Entry[] = [];
  for (const key of COLLECTION_KEYS) {
    const changes = request.changes[key];
    if (!changes) continue;
    for (const value of changes.upserts) entries.push({ key, kind: "upserts", value });
    for (const value of changes.deletes) entries.push({ key, kind: "deletes", value });
  }

  const requests: SyncRequest[] = [];
  for (let start = 0; start < entries.length; start += maxRows) {
    const chunk: Record<string, { upserts: unknown[]; deletes: unknown[] }> = {};
    for (const { key, kind, value } of entries.slice(start, start + maxRows)) {
      (chunk[key] ??= { upserts: [], deletes: [] })[kind].push(value);
    }
    requests.push({ changes: chunk } as SyncRequest);
  }
  return requests;
}

/** Local rows that differ from the server, laid over the server workspace. Used for "import this browser's data". */
export function overlayLocal(server: WorkspaceSnapshot, local: WorkspaceSnapshot): WorkspaceSnapshot {
  const next = { ...server } as Lists;
  for (const key of COLLECTION_KEYS) {
    next[key] = upsertById(server[key], new Map((local[key] as Item[]).map((item) => [item.id, item])));
  }
  return next as unknown as WorkspaceSnapshot;
}
