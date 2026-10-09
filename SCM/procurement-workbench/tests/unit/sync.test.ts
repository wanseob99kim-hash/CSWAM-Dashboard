import { describe, expect, test } from "vitest";
import { buildSyncRequest, diffCollection, diffWorkspace, hasChanges, isDeepEqual } from "../../lib/sync";
import { fullWorkspace } from "../fixtures/workspace";

describe("isDeepEqual", () => {
  test("ignores key order and treats undefined as missing", () => {
    expect(isDeepEqual({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
    expect(isDeepEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
  });

  test("detects differences in values, arrays, and types", () => {
    expect(isDeepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(isDeepEqual([1, 2], [2, 1])).toBe(false);
    expect(isDeepEqual([], {})).toBe(false);
    expect(isDeepEqual(null, {})).toBe(false);
    expect(isDeepEqual({ a: null }, { a: undefined })).toBe(false);
  });
});

describe("diffCollection", () => {
  const a = { id: "a", value: 1 };
  const b = { id: "b", value: 2 };

  test("returns nothing for the same list or an equal copy", () => {
    const list = [a, b];
    expect(diffCollection(list, list)).toEqual({ upserts: [], deletes: [] });
    expect(diffCollection(list, [{ ...b }, { ...a }])).toEqual({ upserts: [], deletes: [] });
  });

  test("finds added, changed, and removed rows", () => {
    const changed = { ...a, value: 10 };
    const added = { id: "c", value: 3 };
    expect(diffCollection([a, b], [changed, added])).toEqual({ upserts: [changed, added], deletes: ["b"] });
  });

  test("keeps the last row when ids repeat", () => {
    const later = { id: "a", value: 99 };
    expect(diffCollection([], [a, later]).upserts).toEqual([later]);
  });
});

describe("diffWorkspace", () => {
  test("reports only collections that changed", () => {
    expect(hasChanges(diffWorkspace(fullWorkspace, fullWorkspace))).toBe(false);

    const next = {
      ...fullWorkspace,
      todoItems: fullWorkspace.todoItems.map((todo) => ({ ...todo, done: true })),
      ecnRecords: [],
    };
    const changes = diffWorkspace(fullWorkspace, next);
    expect(Object.keys(changes).sort()).toEqual(["ecnRecords", "todoItems"]);
    expect(changes.todoItems?.upserts[0].done).toBe(true);
    expect(changes.ecnRecords).toEqual({ upserts: [], deletes: ["ECN-f1"] });
  });

  test("treats a nested batch edit as an upsert of the whole supplier plan", () => {
    const [plan] = fullWorkspace.supplierPlans;
    const editedPlan = { ...plan, batches: plan.batches.map((batch) => ({ ...batch, note: "moved" })) };
    const changes = diffWorkspace(fullWorkspace, { ...fullWorkspace, supplierPlans: [editedPlan] });
    expect(changes.supplierPlans?.upserts).toEqual([editedPlan]);
  });
});

describe("buildSyncRequest", () => {
  test("attaches known versions and 0 for rows new to the server", () => {
    const changes = {
      todoItems: { upserts: [fullWorkspace.todoItems[0], { ...fullWorkspace.todoItems[0], id: "todo-new" }], deletes: ["todo-old"] },
    };
    const request = buildSyncRequest(changes, { todoItems: { "todo-f1": 4, "todo-old": 2 } });
    expect(request.changes.todoItems?.upserts.map(({ id, baseVersion }) => [id, baseVersion])).toEqual([
      ["todo-f1", 4],
      ["todo-new", 0],
    ]);
    expect(request.changes.todoItems?.deletes).toEqual([{ id: "todo-old", baseVersion: 2 }]);
    expect(Object.keys(request.changes)).toEqual(["todoItems"]);
  });
});
