import { describe, expect, test } from "vitest";
import {
  applySyncResult,
  chunkSyncRequest,
  completeSnapshot,
  dirtyIds,
  emptyWorkspace,
  mergeServerRead,
  overlayLocal,
  type SyncState,
} from "../../lib/sync-client";
import { buildSyncRequest, diffWorkspace } from "../../lib/sync";
import type { TodoItem } from "../../lib/types";

const todo = (id: string, title = id): TodoItem => ({
  id,
  projectId: "p",
  title,
  owner: "",
  mode: "General",
  priority: "Normal",
  dueWeek: "2026-10-14",
  done: false,
});

function stateWith(current: TodoItem[], synced: TodoItem[], versions: Record<string, number>): SyncState {
  return {
    current: completeSnapshot({ todoItems: current }),
    synced: completeSnapshot({ todoItems: synced }),
    versions: { todoItems: versions },
    serverTime: "2026-10-09T12:00:00.000Z",
  };
}

const read = (todoItems: TodoItem[], versions: Record<string, number>, deletedIds: string[] = []) => ({
  snapshot: { todoItems },
  versions: { todoItems: versions },
  deletedIds: deletedIds.length ? { todoItems: deletedIds } : {},
  serverTime: "2026-10-09T13:00:00.000Z",
});

describe("dirtyIds", () => {
  test("finds edited, added, and deleted rows", () => {
    const synced = [todo("a"), todo("b"), todo("c")];
    const current = [todo("a"), todo("b", "edited"), todo("d")];
    expect([...dirtyIds(current, synced)].sort()).toEqual(["b", "c", "d"]);
  });
});

describe("mergeServerRead (full)", () => {
  test("takes server rows for untouched ids and drops rows deleted on the server", () => {
    const state = stateWith([todo("a"), todo("gone")], [todo("a"), todo("gone")], { a: 1, gone: 1 });
    const next = mergeServerRead(state, read([todo("a", "theirs"), todo("new")], { a: 2, new: 1 }), "full");
    expect(next.current.todoItems.map((item) => [item.id, item.title])).toEqual([
      ["a", "theirs"],
      ["new", "new"],
    ]);
    expect(next.synced.todoItems).toEqual(next.current.todoItems);
    expect(next.versions.todoItems).toEqual({ a: 2, new: 1 });
    expect(next.serverTime).toBe("2026-10-09T13:00:00.000Z");
  });

  test("keeps unsent local edits and the version they were based on", () => {
    const state = stateWith([todo("a", "mine"), todo("local")], [todo("a")], { a: 1 });
    const next = mergeServerRead(state, read([todo("a", "theirs")], { a: 2 }), "full");
    expect(next.current.todoItems.map((item) => item.title)).toEqual(["mine", "local"]);
    expect(next.synced.todoItems).toEqual([todo("a")]);
    expect(next.versions.todoItems).toEqual({ a: 1 });
    expect(diffWorkspace(next.synced, next.current).todoItems?.upserts.map((item) => item.id)).toEqual(["a", "local"]);
  });

  test("does not resurrect a row deleted locally but not yet sent", () => {
    const state = stateWith([], [todo("a")], { a: 1 });
    const next = mergeServerRead(state, read([todo("a")], { a: 1 }), "full");
    expect(next.current.todoItems).toEqual([]);
    expect(diffWorkspace(next.synced, next.current).todoItems?.deletes).toEqual(["a"]);
  });
});

describe("mergeServerRead (incremental)", () => {
  test("applies changed and deleted rows but leaves everything else alone", () => {
    const state = stateWith([todo("a"), todo("b"), todo("c")], [todo("a"), todo("b"), todo("c")], { a: 1, b: 1, c: 1 });
    const next = mergeServerRead(state, read([todo("b", "theirs")], { b: 2 }, ["c"]), "incremental");
    expect(next.current.todoItems.map((item) => [item.id, item.title])).toEqual([
      ["a", "a"],
      ["b", "theirs"],
    ]);
    expect(next.versions.todoItems).toEqual({ a: 1, b: 2 });
  });

  test("keeps a dirty row even if the server deleted it", () => {
    const state = stateWith([todo("c", "mine")], [todo("c")], { c: 1 });
    const next = mergeServerRead(state, read([], {}, ["c"]), "incremental");
    expect(next.current.todoItems).toEqual([todo("c", "mine")]);
    expect(next.versions.todoItems).toEqual({ c: 1 });
  });
});

describe("applySyncResult", () => {
  test("marks sent rows as confirmed but keeps edits made while the request was in flight", () => {
    const base = stateWith([todo("a", "v2")], [todo("a")], { a: 1 });
    const request = buildSyncRequest(diffWorkspace(base.synced, base.current), base.versions);
    const inFlightEdit = { ...base, current: completeSnapshot({ todoItems: [todo("a", "v3")] }) };

    const { state, conflictCount } = applySyncResult(inFlightEdit, request, {
      applied: { todoItems: [{ id: "a", version: 2, deleted: false }] },
      conflicts: {},
      serverTime: "2026-10-09T14:00:00.000Z",
    });
    expect(conflictCount).toBe(0);
    expect(state.synced.todoItems).toEqual([todo("a", "v2")]);
    expect(state.current.todoItems).toEqual([todo("a", "v3")]);
    expect(state.versions.todoItems).toEqual({ a: 2 });
  });

  test("lets the server win conflicts and removes rows deleted elsewhere", () => {
    const base = stateWith([todo("a", "mine"), todo("b", "mine")], [todo("a"), todo("b")], { a: 1, b: 1 });
    const request = buildSyncRequest(diffWorkspace(base.synced, base.current), base.versions);
    const { state, conflictCount } = applySyncResult(base, request, {
      applied: {},
      conflicts: {
        todoItems: [
          { id: "a", version: 3, deleted: false, item: todo("a", "theirs") },
          { id: "b", version: 2, deleted: true, item: null },
        ],
      },
      serverTime: "2026-10-09T14:00:00.000Z",
    });
    expect(conflictCount).toBe(2);
    expect(state.current.todoItems).toEqual([todo("a", "theirs")]);
    expect(state.synced.todoItems).toEqual([todo("a", "theirs")]);
    expect(state.versions.todoItems).toEqual({ a: 3 });
  });

  test("forgets rows the server confirmed as deleted", () => {
    const base = stateWith([], [todo("a")], { a: 1 });
    const request = buildSyncRequest(diffWorkspace(base.synced, base.current), base.versions);
    const { state } = applySyncResult(base, request, {
      applied: { todoItems: [{ id: "a", version: 2, deleted: true }] },
      conflicts: {},
      serverTime: "2026-10-09T14:00:00.000Z",
    });
    expect(state.synced.todoItems).toEqual([]);
    expect(state.versions.todoItems).toEqual({});
    expect(diffWorkspace(state.synced, state.current)).toEqual({});
  });
});

describe("chunkSyncRequest", () => {
  test("splits rows across requests and keeps collections apart", () => {
    const request = {
      changes: {
        todoItems: { upserts: [todo("a"), todo("b"), todo("c")].map((item) => ({ ...item, baseVersion: 0 })), deletes: [{ id: "d", baseVersion: 1 }] },
        ecnRecords: { upserts: [], deletes: [{ id: "e", baseVersion: 2 }] },
      },
    };
    const chunks = chunkSyncRequest(request, 2);
    expect(chunks).toHaveLength(3);
    // Rows follow COLLECTION_KEYS order (ECN records before to-dos).
    expect(chunks.map((chunk) => Object.keys(chunk.changes))).toEqual([["ecnRecords", "todoItems"], ["todoItems"], ["todoItems"]]);
    expect(chunks[1].changes.todoItems).toEqual({ upserts: [todo("b"), todo("c")].map((item) => ({ ...item, baseVersion: 0 })), deletes: [] });
    expect(chunks[2].changes.todoItems).toEqual({ upserts: [], deletes: [{ id: "d", baseVersion: 1 }] });
  });

  test("returns no requests when nothing changed", () => {
    expect(chunkSyncRequest({ changes: {} }, 200)).toEqual([]);
  });
});

describe("overlayLocal", () => {
  test("lays local rows over the server without deleting server-only rows", () => {
    const server = completeSnapshot({ todoItems: [todo("a"), todo("server-only")] });
    const local = completeSnapshot({ todoItems: [todo("a", "mine"), todo("local-only")] });
    expect(overlayLocal(server, local).todoItems.map((item) => [item.id, item.title])).toEqual([
      ["a", "mine"],
      ["server-only", "server-only"],
      ["local-only", "local-only"],
    ]);
    expect(overlayLocal(emptyWorkspace(), emptyWorkspace())).toEqual(emptyWorkspace());
  });
});

describe("stale server reads", () => {
  test("an incremental read older than our last save does not roll a row back", () => {
    // We saved "a" as v2; a poll that the server answered before that save still says v1.
    const state = stateWith([todo("a", "saved v2")], [todo("a", "saved v2")], { a: 2 });
    const next = mergeServerRead(state, read([todo("a", "old v1"), todo("b")], { a: 1, b: 1 }), "incremental");
    expect(next.current.todoItems.map((item) => [item.id, item.title])).toEqual([
      ["a", "saved v2"],
      ["b", "b"],
    ]);
    expect(next.versions.todoItems).toEqual({ a: 2, b: 1 });
  });

  test("a full read older than our last save keeps the newer row too", () => {
    const state = stateWith([todo("a", "saved v2")], [todo("a", "saved v2")], { a: 2 });
    const next = mergeServerRead(state, read([todo("a", "old v1")], { a: 1 }), "full");
    expect(next.current.todoItems).toEqual([todo("a", "saved v2")]);
    expect(next.versions.todoItems).toEqual({ a: 2 });
  });
});
