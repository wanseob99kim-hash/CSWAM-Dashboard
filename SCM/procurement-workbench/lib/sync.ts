// Computes what changed between the last server-confirmed workspace and the
// current one, so the client can send only those rows to /api/workspace/sync.
import type { WorkspaceSnapshot } from "./storage";

export type CollectionKey = keyof WorkspaceSnapshot;
export type CollectionItem<K extends CollectionKey> = WorkspaceSnapshot[K][number];

export type CollectionChanges<T> = {
  upserts: T[];
  deletes: string[];
};

export type WorkspaceChanges = {
  [K in CollectionKey]?: CollectionChanges<CollectionItem<K>>;
};

/** Server row versions the client last saw, per collection and id. */
export type VersionMap = {
  [K in CollectionKey]?: Record<string, number>;
};

export type SyncRequest = {
  changes: {
    [K in CollectionKey]?: {
      upserts: Array<CollectionItem<K> & { baseVersion: number }>;
      deletes: Array<{ id: string; baseVersion: number }>;
    };
  };
};

export const COLLECTION_KEYS: CollectionKey[] = [
  "projects",
  "deliveries",
  "bomItems",
  "purchasePoLines",
  "supplierPlans",
  "supplierNcrs",
  "internalNcrs",
  "ecnRecords",
  "todoItems",
];

/** Structural equality for JSON-like data; key order does not matter, undefined equals missing. */
export function isDeepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => isDeepEqual(value, right[index]));
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]);
  return [...keys].every((key) => isDeepEqual(leftRecord[key], rightRecord[key]));
}

/** Rows that are new or changed, and ids that disappeared. Duplicate ids: the last occurrence wins. */
export function diffCollection<T extends { id: string }>(previous: readonly T[], next: readonly T[]): CollectionChanges<T> {
  if (previous === next) return { upserts: [], deletes: [] };
  const previousById = new Map(previous.map((item) => [item.id, item]));
  const nextById = new Map(next.map((item) => [item.id, item]));
  return {
    upserts: [...nextById.values()].filter((item) => !isDeepEqual(previousById.get(item.id), item)),
    deletes: [...previousById.keys()].filter((id) => !nextById.has(id)),
  };
}

export function diffWorkspace(previous: WorkspaceSnapshot, next: WorkspaceSnapshot): WorkspaceChanges {
  const changes: WorkspaceChanges = {};
  for (const key of COLLECTION_KEYS) {
    const diff = diffCollection<{ id: string }>(previous[key], next[key]);
    if (diff.upserts.length || diff.deletes.length) {
      (changes as Record<CollectionKey, CollectionChanges<{ id: string }>>)[key] = diff;
    }
  }
  return changes;
}

export function hasChanges(changes: WorkspaceChanges): boolean {
  return Object.keys(changes).length > 0;
}

/** Attaches the version each row had when the client last saw it; 0 means "new to the server". */
export function buildSyncRequest(changes: WorkspaceChanges, versions: VersionMap): SyncRequest {
  const request: SyncRequest = { changes: {} };
  for (const key of COLLECTION_KEYS) {
    const diff = changes[key] as CollectionChanges<{ id: string }> | undefined;
    if (!diff) continue;
    const known = versions[key] ?? {};
    (request.changes as Record<CollectionKey, unknown>)[key] = {
      upserts: diff.upserts.map((item) => ({ ...item, baseVersion: known[item.id] ?? 0 })),
      deletes: diff.deletes.map((id) => ({ id, baseVersion: known[id] ?? 0 })),
    };
  }
  return request;
}
