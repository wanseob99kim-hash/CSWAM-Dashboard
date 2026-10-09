// Keeps the browser workspace in step with the shared D1 workspace.
// Framework-free: storage, API, and timers are injected, so the whole flow
// (connect, save, conflicts, offline, polling, import) is testable.
import {
  loadSyncMeta,
  preSyncBackupKey,
  saveSyncMeta,
  saveWorkspace,
  type StorageLike,
  type WorkspaceSnapshot,
} from "./storage";
import { buildSyncRequest, COLLECTION_KEYS, diffWorkspace, type WorkspaceChanges } from "./sync";
import {
  applySyncResult,
  chunkSyncRequest,
  completeSnapshot,
  mergeServerRead,
  overlayLocal,
  type SyncState,
} from "./sync-client";
import type { fetchWorkspace, postSync } from "./workspace-api";

export const SAVE_DEBOUNCE_MS = 800;
export const POLL_INTERVAL_MS = 60_000;
export const RETRY_DELAY_MS = 30_000;
const MAX_ROWS_PER_REQUEST = 200;

export type SyncStatusKind = "connecting" | "saved" | "saving" | "offline" | "local-only" | "error";

export type SyncStatus = {
  kind: SyncStatusKind;
  message: string | null;
  /** Rows changed here but not yet confirmed by the server. */
  pendingRows: number;
  /** Conflicts resolved in the server's favor since the user last dismissed them. */
  conflicts: number;
  /** Rows of this browser's pre-sync data that differ from the shared workspace. */
  importRows: number;
};

export type Timers = {
  setTimeout: (callback: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  setInterval: (callback: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
};

export type SyncEngineDeps = {
  storage: StorageLike;
  api: { fetchWorkspace: typeof fetchWorkspace; postSync: typeof postSync };
  /**
   * Replace the app's workspace data. `previous` is the workspace the engine last
   * knew; a list the app changed since then holds a newer edit and must be kept.
   */
  onSnapshot: (snapshot: WorkspaceSnapshot, previous: WorkspaceSnapshot) => void;
  onStatus: (status: SyncStatus) => void;
  timers?: Timers;
};

const defaultTimers: Timers = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  setInterval: (callback, ms) => globalThis.setInterval(callback, ms),
  clearInterval: (handle) => globalThis.clearInterval(handle as ReturnType<typeof setInterval>),
};

export function countRows(changes: WorkspaceChanges): number {
  return Object.values(changes).reduce((sum, collection) => sum + (collection ? collection.upserts.length + collection.deletes.length : 0), 0);
}

const sameLists = (left: WorkspaceSnapshot, right: WorkspaceSnapshot) => COLLECTION_KEYS.every((key) => left[key] === right[key]);

export class SyncEngine {
  private current: WorkspaceSnapshot;
  private state: SyncState | null = null;
  private pendingImport: WorkspaceSnapshot | null = null;
  private status: SyncStatus = { kind: "connecting", message: null, pendingRows: 0, conflicts: 0, importRows: 0 };
  private running: Promise<void> | null = null;
  private connecting: Promise<void> | null = null;
  private rerun = false;
  private disposed = false;
  private saveTimer: unknown = null;
  private retryTimer: unknown = null;
  private pollTimer: unknown = null;
  private readonly timers: Timers;

  constructor(
    private readonly deps: SyncEngineDeps,
    initial: WorkspaceSnapshot,
  ) {
    this.current = initial;
    this.timers = deps.timers ?? defaultTimers;
  }

  /** Loads the shared workspace and starts saving and polling. */
  async start(): Promise<void> {
    await this.connect();
  }

  /** Call with the app's workspace after every change (including ones this engine pushed). */
  localChange(snapshot: WorkspaceSnapshot): void {
    if (this.disposed || sameLists(snapshot, this.current)) return;
    this.current = snapshot;
    saveWorkspace(this.deps.storage, snapshot);
    if (!this.state) return;
    this.state = { ...this.state, current: snapshot };
    this.persistMeta();
    this.updateStatus({ pendingRows: this.pendingRowCount() });
    if (this.saveTimer) this.timers.clearTimeout(this.saveTimer);
    this.saveTimer = this.timers.setTimeout(() => {
      this.saveTimer = null;
      void this.flush();
    }, SAVE_DEBOUNCE_MS);
  }

  /**
   * Sends unsaved changes now. If a save is already running, waits for it and
   * for one more pass that picks up anything changed in the meantime.
   */
  flush(): Promise<void> {
    if (this.disposed || !this.state) return Promise.resolve();
    if (this.saveTimer) {
      this.timers.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.running) {
      this.rerun = true;
      return this.running;
    }
    this.running = (async () => {
      let again = true;
      while (again && !this.disposed) {
        this.rerun = false;
        const succeeded = await this.sendChanges();
        again = succeeded && this.rerun;
      }
    })().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /** One save pass. Returns false when it stopped on an error. */
  private async sendChanges(): Promise<boolean> {
    if (!this.state) return false;
    const changes = diffWorkspace(this.state.synced, this.current);
    if (!countRows(changes)) {
      this.updateStatus({ kind: "saved", message: null, pendingRows: 0 });
      return true;
    }

    this.updateStatus({ kind: "saving", message: null, pendingRows: countRows(changes) });
    for (const request of chunkSyncRequest(buildSyncRequest(changes, this.state.versions), MAX_ROWS_PER_REQUEST)) {
      const outcome = await this.deps.api.postSync(request);
      if (this.disposed || !this.state) return false;
      if (outcome.kind !== "ok") {
        this.handleFailure(outcome, () => void this.flush());
        return false;
      }
      const { state, conflictCount } = applySyncResult({ ...this.state, current: this.current }, request, outcome.data);
      this.applyState(state);
      if (conflictCount) this.updateStatus({ conflicts: this.status.conflicts + conflictCount });
    }
    this.updateStatus({ kind: "saved", message: null, pendingRows: this.pendingRowCount() });
    return true;
  }

  /** Pulls changes other people saved since the last read. */
  async poll(): Promise<void> {
    if (this.disposed || this.running) return;
    if (!this.state) {
      // Not connected yet (offline at start, or a failed first load): try again.
      if (this.status.kind === "offline") await this.connect();
      return;
    }
    const outcome = await this.deps.api.fetchWorkspace(this.state.serverTime);
    if (this.disposed || !this.state) return;
    if (outcome.kind !== "ok") {
      this.handleFailure(outcome, () => void this.poll());
      return;
    }
    this.applyState(mergeServerRead({ ...this.state, current: this.current }, outcome.data, "incremental"));
    if (this.status.kind === "offline") void this.flush();
  }

  /** Adds this browser's pre-sync rows to the shared workspace. */
  importLocal(): void {
    if (!this.state || !this.pendingImport) return;
    const merged = overlayLocal(this.current, this.pendingImport);
    this.pendingImport = null;
    this.updateStatus({ importRows: 0 });
    this.pushSnapshot(merged);
    void this.flush();
  }

  dismissImport(): void {
    this.pendingImport = null;
    this.updateStatus({ importRows: 0 });
  }

  /** Throws away edits the server has not accepted, e.g. after it rejected them. */
  discardLocalChanges(): void {
    if (!this.state) return;
    this.pushSnapshot(this.state.synced);
    this.updateStatus({ kind: "saved", message: null, pendingRows: 0 });
  }

  dismissConflicts(): void {
    this.updateStatus({ conflicts: 0 });
  }

  dispose(): void {
    this.disposed = true;
    for (const timer of [this.saveTimer, this.retryTimer]) if (timer) this.timers.clearTimeout(timer);
    if (this.pollTimer) this.timers.clearInterval(this.pollTimer);
  }

  /** Loads the shared workspace. Concurrent callers (focus, retry, poll) share one attempt. */
  private connect(): Promise<void> {
    if (!this.connecting) {
      if (this.retryTimer) {
        this.timers.clearTimeout(this.retryTimer);
        this.retryTimer = null;
      }
      this.connecting = this.connectOnce().finally(() => {
        this.connecting = null;
      });
    }
    return this.connecting;
  }

  private async connectOnce(): Promise<void> {
    const meta = loadSyncMeta(this.deps.storage);
    const outcome = await this.deps.api.fetchWorkspace(null);
    if (this.disposed) return;

    if (outcome.kind !== "ok") {
      // Keep queuing edits against what this browser last confirmed, if anything.
      if (meta && outcome.kind === "unavailable") this.state = { current: this.current, ...meta };
      this.handleFailure(outcome, () => void this.connect());
      return;
    }

    const read = outcome.data;
    if (meta) {
      this.applyState(mergeServerRead({ current: this.current, ...meta }, read, "full"));
    } else {
      // First connection from this browser: show the shared data and offer to add what was saved here.
      const server = completeSnapshot(read.snapshot);
      const importRows = countRows(diffWorkspace(server, overlayLocal(server, this.current)));
      if (importRows) {
        this.deps.storage.setItem(preSyncBackupKey, JSON.stringify(this.current));
        this.pendingImport = this.current;
      }
      this.updateStatus({ importRows });
      this.applyState({ current: server, synced: server, versions: read.versions, serverTime: read.serverTime });
    }

    if (!this.pollTimer) this.pollTimer = this.timers.setInterval(() => void this.poll(), POLL_INTERVAL_MS);
    this.updateStatus({ kind: "saved", message: null });
    await this.flush();
  }

  private handleFailure(outcome: { kind: "unauthorized" | "rejected" | "unavailable"; message?: string }, retry: () => void) {
    if (outcome.kind === "unauthorized") {
      this.state = null;
      this.updateStatus({ kind: "local-only", message: "Not signed in. Changes are saved on this device only." });
      return;
    }
    if (outcome.kind === "rejected") {
      this.updateStatus({ kind: "error", message: outcome.message ?? "The server rejected these changes." });
      return;
    }
    this.updateStatus({
      kind: "offline",
      message: "Can't reach the server. Changes are kept on this device and will be sent when the connection returns.",
      pendingRows: this.pendingRowCount(),
    });
    if (this.retryTimer) this.timers.clearTimeout(this.retryTimer);
    this.retryTimer = this.timers.setTimeout(() => {
      this.retryTimer = null;
      retry();
    }, RETRY_DELAY_MS);
  }

  private applyState(next: SyncState): void {
    this.state = next;
    this.persistMeta();
    if (!sameLists(next.current, this.current)) this.pushSnapshot(next.current);
  }

  private pushSnapshot(snapshot: WorkspaceSnapshot): void {
    const previous = this.current;
    this.current = snapshot;
    if (this.state) this.state = { ...this.state, current: snapshot };
    saveWorkspace(this.deps.storage, snapshot);
    this.deps.onSnapshot(snapshot, previous);
  }

  private persistMeta(): void {
    if (!this.state) return;
    const { synced, versions, serverTime } = this.state;
    saveSyncMeta(this.deps.storage, { synced, versions, serverTime });
  }

  private pendingRowCount(): number {
    return this.state ? countRows(diffWorkspace(this.state.synced, this.current)) : 0;
  }

  private updateStatus(patch: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...patch };
    this.deps.onStatus(this.status);
  }
}
