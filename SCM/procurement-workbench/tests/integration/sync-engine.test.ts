// Two simulated browsers syncing through the real API handlers and a local D1.
import type { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { defaultProjects } from "../../lib/seed-data";
import { preSyncBackupKey, storageKey, syncMetaKey, type StorageLike, type WorkspaceSnapshot } from "../../lib/storage";
import { completeSnapshot } from "../../lib/sync-client";
import { SyncEngine, type SyncStatus, type Timers } from "../../lib/sync-engine";
import type { ApiOutcome } from "../../lib/workspace-api";
import type { TodoItem } from "../../lib/types";
import { handleGetWorkspace, handleSync } from "../../server/workspace-handlers";
import { createTestD1, type TestD1 } from "../helpers/d1";

let mf: Miniflare;
let db: TestD1["db"];

beforeAll(async () => {
  ({ mf, db } = await createTestD1("workbench-sync-engine"));
}, 60_000);

afterAll(async () => {
  await mf?.dispose();
});

let tick = 0;
const clock = () => new Date(Date.UTC(2026, 9, 9, 15, 0, 0) + ++tick * 1000);

type Network = { mode: "up" | "down" | "signed-out" };

async function toOutcome<T>(response: Response): Promise<ApiOutcome<T>> {
  if (response.status === 401) return { kind: "unauthorized" };
  const body = (await response.json()) as { success: boolean; data: T; error: string };
  if (response.ok) return { kind: "ok", data: body.data };
  return response.status < 500 ? { kind: "rejected", message: body.error } : { kind: "unavailable", message: body.error };
}

/** The browser API client, but routed straight into the server handlers. */
function apiFor(user: string, network: Network) {
  const headers = () => new Headers(network.mode === "signed-out" ? {} : { "oai-authenticated-user-email": user });
  return {
    fetchWorkspace: async (since: string | null) => {
      if (network.mode === "down") return { kind: "unavailable", message: "offline" } as const;
      const query = since ? `?since=${encodeURIComponent(since)}` : "";
      return toOutcome(await handleGetWorkspace(new Request(`http://localhost/api/workspace${query}`, { headers: headers() }), db, clock));
    },
    postSync: async (request: unknown) => {
      if (network.mode === "down") return { kind: "unavailable", message: "offline" } as const;
      const response = await handleSync(
        new Request("http://localhost/api/workspace/sync", { method: "POST", headers: headers(), body: JSON.stringify(request) }),
        db,
        clock,
      );
      return toOutcome(response);
    },
  } as ConstructorParameters<typeof SyncEngine>[0]["api"];
}

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (key) => data[key] ?? null, setItem: (key, value) => void (data[key] = value) };
}

/** Timers that only fire when the test asks. */
function manualTimers(): Timers & { pending: number; fireAll: () => void } {
  const queue = new Map<number, () => void>();
  let next = 0;
  return {
    setTimeout: (callback) => (queue.set(++next, callback), next),
    clearTimeout: (handle) => void queue.delete(handle as number),
    setInterval: () => 0,
    clearInterval: () => undefined,
    get pending() {
      return queue.size;
    },
    fireAll: () => {
      const callbacks = [...queue.values()];
      queue.clear();
      callbacks.forEach((callback) => callback());
    },
  };
}

/** A browser tab: app state, local storage, and a sync engine. */
function browser(user: string, storage = memoryStorage(), initial: WorkspaceSnapshot = completeSnapshot({})) {
  const network: Network = { mode: "up" };
  const timers = manualTimers();
  const tab = {
    network,
    storage,
    timers,
    app: initial,
    status: null as SyncStatus | null,
    engine: null as unknown as SyncEngine,
    edit(update: (snapshot: WorkspaceSnapshot) => WorkspaceSnapshot) {
      tab.app = update(tab.app);
      tab.engine.localChange(tab.app);
    },
  };
  tab.engine = new SyncEngine(
    {
      storage,
      api: apiFor(user, network),
      timers,
      onSnapshot: (snapshot) => (tab.app = snapshot),
      onStatus: (status) => (tab.status = status),
    },
    initial,
  );
  return tab;
}

const todo = (id: string, title = id): TodoItem => ({
  id,
  projectId: "project-1700",
  title,
  owner: "",
  mode: "General",
  priority: "Normal",
  dueWeek: "2026-10-14",
  done: false,
});
const addTodo = (item: TodoItem) => (snapshot: WorkspaceSnapshot) => ({ ...snapshot, todoItems: [...snapshot.todoItems, item] });
const renameTodo = (id: string, title: string) => (snapshot: WorkspaceSnapshot) => ({
  ...snapshot,
  todoItems: snapshot.todoItems.map((item) => (item.id === id ? { ...item, title } : item)),
});
const titleOf = (snapshot: WorkspaceSnapshot, id: string) => snapshot.todoItems.find((item) => item.id === id)?.title;

describe("sync engine against the real API", () => {
  test("loads the shared workspace on first connect", async () => {
    const tab = browser("a@cswind.example");
    await tab.engine.start();
    expect(tab.app.projects).toHaveLength(defaultProjects.length);
    expect(tab.status).toMatchObject({ kind: "saved", importRows: 0, pendingRows: 0 });
    expect(tab.storage.data[syncMetaKey]).toBeTruthy();
  });

  test("saves edits after the debounce and shows them to another browser", async () => {
    const alice = browser("a@cswind.example");
    const bob = browser("b@cswind.example");
    await alice.engine.start();
    await bob.engine.start();

    alice.edit(addTodo(todo("t-shared", "from alice")));
    expect(alice.status).toMatchObject({ pendingRows: 1 });
    expect(alice.timers.pending).toBe(1);
    alice.timers.fireAll();
    await alice.engine.flush(); // waits for the save the debounce started
    expect(alice.status).toMatchObject({ kind: "saved", pendingRows: 0 });

    await bob.engine.poll();
    expect(titleOf(bob.app, "t-shared")).toBe("from alice");
  });

  test("resolves a simultaneous edit in favor of whoever saved first", async () => {
    const alice = browser("a@cswind.example");
    const bob = browser("b@cswind.example");
    await alice.engine.start();
    await bob.engine.start();

    alice.edit(renameTodo("t-shared", "alice wins"));
    bob.edit(renameTodo("t-shared", "bob loses"));
    await alice.engine.flush();
    await bob.engine.flush();

    expect(bob.status).toMatchObject({ kind: "saved", conflicts: 1, pendingRows: 0 });
    expect(titleOf(bob.app, "t-shared")).toBe("alice wins");
    bob.engine.dismissConflicts();
    expect(bob.status?.conflicts).toBe(0);
  });

  test("propagates deletions", async () => {
    const alice = browser("a@cswind.example");
    const bob = browser("b@cswind.example");
    await alice.engine.start();
    await bob.engine.start();

    alice.edit((snapshot) => ({ ...snapshot, todoItems: snapshot.todoItems.filter((item) => item.id !== "t-shared") }));
    await alice.engine.flush();
    await bob.engine.poll();
    expect(titleOf(bob.app, "t-shared")).toBeUndefined();
  });

  test("keeps edits while offline and sends them when the connection returns", async () => {
    const tab = browser("a@cswind.example");
    await tab.engine.start();

    tab.network.mode = "down";
    tab.edit(addTodo(todo("t-offline", "written offline")));
    await tab.engine.flush();
    expect(tab.status).toMatchObject({ kind: "offline", pendingRows: 1 });
    expect(tab.timers.pending).toBeGreaterThan(0);

    tab.network.mode = "up";
    tab.timers.fireAll();
    await tab.engine.flush();
    expect(tab.status).toMatchObject({ kind: "saved", pendingRows: 0 });

    const other = browser("b@cswind.example");
    await other.engine.start();
    expect(titleOf(other.app, "t-offline")).toBe("written offline");
  });

  test("sends edits left unsent when the page was closed", async () => {
    const storage = memoryStorage();
    const first = browser("a@cswind.example", storage);
    await first.engine.start();
    first.network.mode = "down";
    first.edit(addTodo(todo("t-reload", "before reload")));
    first.engine.dispose();

    // Reload: the app starts from the cached workspace.
    const cached = JSON.parse(storage.data[storageKey]) as WorkspaceSnapshot;
    const second = browser("a@cswind.example", storage, completeSnapshot(cached));
    await second.engine.start();
    expect(second.status).toMatchObject({ kind: "saved", pendingRows: 0, importRows: 0 });

    const other = browser("b@cswind.example");
    await other.engine.start();
    expect(titleOf(other.app, "t-reload")).toBe("before reload");
  });

  test("offers to import data saved in this browser before sync existed", async () => {
    const legacy = completeSnapshot({ projects: defaultProjects, todoItems: [todo("t-legacy", "old browser data")] });
    const storage = memoryStorage({ [storageKey]: JSON.stringify(legacy) });
    const tab = browser("a@cswind.example", storage, legacy);
    await tab.engine.start();

    expect(tab.status).toMatchObject({ kind: "saved", importRows: 1 });
    expect(titleOf(tab.app, "t-legacy")).toBeUndefined();
    expect(JSON.parse(storage.data[preSyncBackupKey]).todoItems[0].id).toBe("t-legacy");

    tab.engine.importLocal();
    await tab.engine.flush();
    expect(tab.status).toMatchObject({ kind: "saved", importRows: 0, pendingRows: 0 });
    expect(titleOf(tab.app, "t-legacy")).toBe("old browser data");
  });

  test("falls back to this device only when not signed in", async () => {
    const tab = browser("a@cswind.example");
    tab.network.mode = "signed-out";
    await tab.engine.start();
    expect(tab.status).toMatchObject({ kind: "local-only" });

    tab.edit(addTodo(todo("t-local", "device only")));
    expect(JSON.parse(tab.storage.data[storageKey]).todoItems.map((item: TodoItem) => item.id)).toContain("t-local");
    expect(tab.timers.pending).toBe(0);
  });

  test("reports data the server rejects without retrying in a loop", async () => {
    const tab = browser("a@cswind.example");
    await tab.engine.start();
    tab.edit(addTodo({ ...todo("t-bad"), title: undefined as unknown as string }));
    await tab.engine.flush();
    expect(tab.status).toMatchObject({ kind: "error", pendingRows: 1 });
    expect(tab.status?.message).toMatch(/Invalid changes/);
    expect(tab.timers.pending).toBe(0);
  });
});

describe("sync engine edge cases", () => {
  test("simultaneous reconnect attempts keep the import offer", async () => {
    const legacy = completeSnapshot({ projects: defaultProjects, todoItems: [todo("t-legacy-2", "old data")] });
    const storage = memoryStorage({ [storageKey]: JSON.stringify(legacy) });
    const tab = browser("a@cswind.example", storage, legacy);
    tab.network.mode = "down";
    await tab.engine.start();
    expect(tab.status?.kind).toBe("offline");

    // Focus, visibilitychange, and the retry timer all fire when the connection returns.
    tab.network.mode = "up";
    tab.timers.fireAll();
    await Promise.all([tab.engine.poll(), tab.engine.poll()]);
    expect(tab.status).toMatchObject({ kind: "saved", importRows: 1 });
  });

  test("tells the app which lists it last saw, so newer local edits are not overwritten", async () => {
    const storage = memoryStorage();
    const calls: Array<[WorkspaceSnapshot, WorkspaceSnapshot]> = [];
    const initial = completeSnapshot({});
    const engine = new SyncEngine(
      { storage, api: apiFor("a@cswind.example", { mode: "up" }), timers: manualTimers(), onSnapshot: (next, previous) => calls.push([next, previous]), onStatus: () => undefined },
      initial,
    );
    await engine.start();
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toBe(initial);
    expect(calls[0][0].projects.length).toBeGreaterThan(0);
  });

  test("can discard changes the server keeps rejecting", async () => {
    const tab = browser("a@cswind.example");
    await tab.engine.start();
    tab.edit(addTodo({ ...todo("t-bad-2"), title: undefined as unknown as string }));
    await tab.engine.flush();
    expect(tab.status?.kind).toBe("error");

    tab.engine.discardLocalChanges();
    expect(tab.status).toMatchObject({ kind: "saved", pendingRows: 0 });
    expect(tab.app.todoItems.some((item) => item.id === "t-bad-2")).toBe(false);
    await tab.engine.flush();
    expect(tab.status?.kind).toBe("saved");
  });
});
