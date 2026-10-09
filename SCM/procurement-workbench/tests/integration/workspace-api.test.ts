import type { D1Database } from "@cloudflare/workers-types/latest";
import { eq } from "drizzle-orm";
import type { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import * as schema from "../../db/schema";
import { defaultDeliveries, defaultProjects } from "../../lib/seed-data";
import type { SyncRequest } from "../../lib/sync";
import { MAX_ROWS_PER_SYNC } from "../../server/validation";
import { handleGetWorkspace, handleSync } from "../../server/workspace-handlers";
import type { SyncResult, WorkspaceRead } from "../../server/workspace-service";
import { fullWorkspace } from "../fixtures/workspace";
import { createTestD1, type TestD1 } from "../helpers/d1";

let mf: Miniflare;
let d1: D1Database;
let db: TestD1["db"];

beforeAll(async () => {
  ({ mf, d1, db } = await createTestD1("workbench-api"));
}, 60_000);

afterAll(async () => {
  await mf?.dispose();
});

const USER = "buyer@cswind.example";
let tick = 0;
/** Strictly increasing timestamps so `since` queries are deterministic. */
const clock = () => new Date(Date.UTC(2026, 9, 9, 12, 0, 0) + ++tick * 120_000);

function get(query = "", user: string | null = USER) {
  const headers = new Headers({ accept: "application/json" });
  if (user) headers.set("oai-authenticated-user-email", user);
  return handleGetWorkspace(new Request(`http://localhost/api/workspace${query}`, { headers }), db, clock);
}

function post(body: unknown, user: string | null = USER) {
  const headers = new Headers({ "content-type": "application/json" });
  if (user) headers.set("oai-authenticated-user-email", user);
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  return handleSync(new Request("http://localhost/api/workspace/sync", { method: "POST", headers, body: payload }), db, clock);
}

async function readJson<T>(response: Response) {
  return (await response.json()) as { success: boolean; data: T; error: string | null };
}

async function sync(changes: SyncRequest["changes"]) {
  const response = await post({ changes });
  expect(response.status).toBe(200);
  return (await readJson<SyncResult>(response)).data;
}

const changeLogCount = async () => db.$count(schema.changeLog);

describe("GET /api/workspace", () => {
  test("rejects anonymous requests", async () => {
    const response = await get("", null);
    expect(response.status).toBe(401);
    expect(await readJson(response)).toMatchObject({ success: false, data: null });
  });

  test("returns the seeded workspace with row versions", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { data } = await readJson<WorkspaceRead>(response);
    expect(data.snapshot.projects).toHaveLength(defaultProjects.length);
    expect(data.snapshot.deliveries).toHaveLength(defaultDeliveries.length);
    expect(data.snapshot.supplierPlans).toEqual([]);
    expect(data.versions.projects?.["project-1700"]).toBe(1);
    expect(data.snapshot.projects?.find((project) => project.id === "project-1700")).toEqual(
      defaultProjects.find((project) => project.id === "project-1700"),
    );
  });

  test("rejects a malformed since", async () => {
    expect((await get("?since=yesterday")).status).toBe(400);
  });
});

describe("POST /api/workspace/sync validation", () => {
  test("rejects anonymous requests", async () => {
    expect((await post({ changes: {} }, null)).status).toBe(401);
  });

  test.each([
    ["non-JSON body", "{nope", /JSON/],
    ["unknown collection", { changes: { invoices: { upserts: [], deletes: [] } } }, /Invalid changes/],
    ["money that is not a number", { changes: { projects: { upserts: [{ ...fullWorkspace.projects[0], budget: "lots", baseVersion: 0 }] } } }, /budget/],
    ["missing required field", { changes: { todoItems: { upserts: [{ id: "t", baseVersion: 0 }] } } }, /todoItems/],
    ["negative base version", { changes: { todoItems: { deletes: [{ id: "t", baseVersion: -1 }] } } }, /baseVersion/],
  ])("rejects %s", async (_label, body, message) => {
    const response = await post(body);
    expect(response.status).toBe(400);
    expect((await readJson(response)).error).toMatch(message);
  });

  test("caps rows per request", async () => {
    const deletes = Array.from({ length: MAX_ROWS_PER_SYNC + 1 }, (_, index) => ({ id: `t-${index}`, baseVersion: 1 }));
    const response = await post({ changes: { todoItems: { deletes } } });
    expect(response.status).toBe(400);
    expect((await readJson(response)).error).toMatch(/At most/);
  });

  test("rejects oversized bodies", async () => {
    const response = await post({ changes: {}, padding: "x".repeat(1_100_000) });
    expect(response.status).toBe(413);
  });
});

describe("POST /api/workspace/sync writes", () => {
  test("inserts a new row as version 1 and logs it", async () => {
    const before = await changeLogCount();
    const todo = { ...fullWorkspace.todoItems[0], id: "todo-api-1" };
    const result = await sync({ todoItems: { upserts: [{ ...todo, baseVersion: 0 }], deletes: [] } });

    expect(result.applied.todoItems).toEqual([{ id: "todo-api-1", version: 1, deleted: false }]);
    expect(result.conflicts).toEqual({});
    const [row] = await db.select().from(schema.todoItems).where(eq(schema.todoItems.id, "todo-api-1"));
    expect(row).toMatchObject({ ...todo, version: 1, updatedBy: USER, deletedAt: null });
    expect(await changeLogCount()).toBe(before + 1);
  });

  test("updates a seeded row when the base version matches", async () => {
    const project = { ...defaultProjects.find((item) => item.id === "project-1700")!, budget: 185000.556 };
    const result = await sync({ projects: { upserts: [{ ...project, baseVersion: 1 }], deletes: [] } });
    expect(result.applied.projects).toEqual([{ id: "project-1700", version: 2, deleted: false }]);

    const raw = await d1.prepare("SELECT budget FROM projects WHERE id = 'project-1700'").first<{ budget: number }>();
    expect(raw?.budget).toBe(18500056);
  });

  test("reports a conflict for a stale base version and leaves the row alone", async () => {
    const before = await changeLogCount();
    const stale = { ...defaultProjects.find((item) => item.id === "project-1700")!, name: "Stale edit" };
    const result = await sync({ projects: { upserts: [{ ...stale, baseVersion: 1 }], deletes: [] } });

    expect(result.applied).toEqual({});
    expect(result.conflicts.projects).toEqual([
      expect.objectContaining({ id: "project-1700", version: 2, deleted: false, item: expect.objectContaining({ budget: 185000.56 }) }),
    ]);
    const [row] = await db.select().from(schema.projects).where(eq(schema.projects.id, "project-1700"));
    expect(row.name).toBe("Panther Grove Phase 2 - 5T");
    expect(await changeLogCount()).toBe(before);
  });

  test("lets exactly one of two concurrent edits win", async () => {
    const todo = { ...fullWorkspace.todoItems[0], id: "todo-race" };
    await sync({ todoItems: { upserts: [{ ...todo, baseVersion: 0 }], deletes: [] } });
    const before = await changeLogCount();

    const [first, second] = await Promise.all(
      ["A", "B"].map((title) => post({ changes: { todoItems: { upserts: [{ ...todo, title, baseVersion: 1 }] } } })),
    );
    const results = await Promise.all([first, second].map(async (response) => (await readJson<SyncResult>(response)).data));

    expect(results.filter((result) => result.applied.todoItems?.length)).toHaveLength(1);
    expect(results.filter((result) => result.conflicts.todoItems?.length)).toHaveLength(1);
    expect(await changeLogCount()).toBe(before + 1);
  });

  test("soft-deletes, hides the row, and reports deletions incrementally", async () => {
    const { serverTime } = (await readJson<WorkspaceRead>(await get())).data;
    const deliveryId = defaultDeliveries[0].id;
    const result = await sync({ deliveries: { upserts: [], deletes: [{ id: deliveryId, baseVersion: 1 }] } });
    expect(result.applied.deliveries).toEqual([{ id: deliveryId, version: 2, deleted: true }]);

    const full = (await readJson<WorkspaceRead>(await get())).data;
    expect(full.snapshot.deliveries?.some((delivery) => delivery.id === deliveryId)).toBe(false);

    const incremental = (await readJson<WorkspaceRead>(await get(`?since=${encodeURIComponent(serverTime)}`))).data;
    expect(incremental.deletedIds.deliveries).toEqual([deliveryId]);
    // Rows changed before serverTime (the earlier project edit) are not repeated.
    expect(incremental.snapshot.projects).toEqual([]);
    expect(incremental.snapshot.deliveries).toEqual([]);

    const again = await sync({ deliveries: { upserts: [], deletes: [{ id: deliveryId, baseVersion: 1 }] } });
    expect(again).toMatchObject({ applied: {}, conflicts: {} });
  });

  test("reports an edit to a row someone else deleted", async () => {
    const delivery = { ...defaultDeliveries[0], qty: 99 };
    const result = await sync({ deliveries: { upserts: [{ ...delivery, baseVersion: 1 }], deletes: [] } });
    expect(result.conflicts.deliveries).toEqual([{ id: delivery.id, version: 2, deleted: true, item: null }]);
  });
});

describe("supplier plan sync", () => {
  const [plan] = fullWorkspace.supplierPlans;

  test("stores a new plan with its batches and allocations", async () => {
    const result = await sync({ supplierPlans: { upserts: [{ ...plan, baseVersion: 0 }], deletes: [] } });
    expect(result.applied.supplierPlans).toEqual([{ id: plan.id, version: 1, deleted: false }]);

    const { data } = await readJson<WorkspaceRead>(await get());
    expect(data.snapshot.supplierPlans).toEqual([plan]);
  });

  test("replaces child rows on update", async () => {
    const edited = { ...plan, batches: [plan.batches[1]], materialAllocations: [plan.materialAllocations[1]], requestSent: false };
    await sync({ supplierPlans: { upserts: [{ ...edited, baseVersion: 1 }], deletes: [] } });

    const { data } = await readJson<WorkspaceRead>(await get());
    expect(data.snapshot.supplierPlans).toEqual([edited]);
    expect(await db.$count(schema.supplierPlanBatches)).toBe(1);
    expect(await db.$count(schema.supplierMaterialAllocations)).toBe(1);
  });

  test("keeps child rows when a stale plan update conflicts", async () => {
    const result = await sync({ supplierPlans: { upserts: [{ ...plan, baseVersion: 1 }], deletes: [] } });
    expect(result.conflicts.supplierPlans?.[0]).toMatchObject({ id: plan.id, version: 2, item: { batches: [plan.batches[1]] } });
    expect(await db.$count(schema.supplierPlanBatches)).toBe(1);
  });
});

describe("concurrency guard", () => {
  test("a change landing between read and write becomes a conflict without a log entry", async () => {
    const todo = { ...fullWorkspace.todoItems[0], id: "todo-guard" };
    await sync({ todoItems: { upserts: [{ ...todo, baseVersion: 0 }], deletes: [] } });
    const before = await changeLogCount();

    // Same database, but another user's edit is committed right before our batch runs.
    const racingDb = Object.assign(Object.create(Object.getPrototypeOf(db)), db, {
      $client: {
        prepare: (query: string) => d1.prepare(query),
        batch: async (statements: Parameters<D1Database["batch"]>[0]) => {
          await d1.prepare("UPDATE todo_items SET version = version + 1, title = 'theirs' WHERE id = ?").bind(todo.id).run();
          return d1.batch(statements);
        },
      },
    });
    const response = await handleSync(
      new Request("http://localhost/api/workspace/sync", {
        method: "POST",
        headers: { "oai-authenticated-user-email": USER },
        body: JSON.stringify({ changes: { todoItems: { upserts: [{ ...todo, title: "mine", baseVersion: 1 }] } } }),
      }),
      racingDb,
      clock,
    );
    const { data } = await readJson<SyncResult>(response);

    expect(data.applied).toEqual({});
    expect(data.conflicts.todoItems).toEqual([expect.objectContaining({ id: todo.id, version: 2, item: expect.objectContaining({ title: "theirs" }) })]);
    expect(await changeLogCount()).toBe(before);
  });
});

describe("incremental reads", () => {
  test("include rows saved at the returned serverTime", async () => {
    const todo = { ...fullWorkspace.todoItems[0], id: "todo-since" };
    const { serverTime } = await sync({ todoItems: { upserts: [{ ...todo, baseVersion: 0 }], deletes: [] } });
    const { data } = await readJson<WorkspaceRead>(await get(`?since=${encodeURIComponent(serverTime)}`));
    expect(data.snapshot.todoItems?.map((item) => item.id)).toContain("todo-since");
    expect(data.versions.todoItems?.["todo-since"]).toBe(1);
  });
});
