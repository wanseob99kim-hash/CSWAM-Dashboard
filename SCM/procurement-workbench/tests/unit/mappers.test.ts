import { getTableColumns } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { FLAT_COLLECTIONS, fromRow, fromSupplierPlanRows, toRow, toSupplierPlanRows } from "../../db/mappers";
import * as schema from "../../db/schema";
import { fullWorkspace } from "../fixtures/workspace";

const audit = { version: 3, updatedAt: "2026-10-09T12:00:00.000Z", updatedBy: "buyer@example.com" };

describe("schema covers the domain model", () => {
  test.each(Object.entries(FLAT_COLLECTIONS))("%s has a column for every domain field", (key, table) => {
    const columns = Object.keys(getTableColumns(table));
    const item = fullWorkspace[key as keyof typeof FLAT_COLLECTIONS][0];
    expect(Object.keys(item).filter((field) => !columns.includes(field))).toEqual([]);
  });

  test("supplier plan, batch, and allocation tables cover their fields", () => {
    const [plan] = fullWorkspace.supplierPlans;
    const { batches, materialAllocations, ...planFields } = plan;
    const missing = (table: Parameters<typeof getTableColumns>[0], item: object) =>
      Object.keys(item).filter((field) => !(field in getTableColumns(table)));
    expect(missing(schema.supplierPlans, planFields)).toEqual([]);
    expect(missing(schema.supplierPlanBatches, batches[0])).toEqual([]);
    expect(missing(schema.supplierMaterialAllocations, materialAllocations[0])).toEqual([]);
  });
});

describe("toRow", () => {
  test("fills every column, using defaults or null for missing fields", () => {
    const row = toRow(schema.projects, { id: "p", name: "P", code: "", phase: "", productionWindow: "", plant: "" }, audit);
    expect(row).toEqual({
      id: "p",
      name: "P",
      code: "",
      phase: "",
      productionWindow: "",
      plant: "",
      budget: 0,
      status: null,
      ...audit,
      deletedAt: null,
    });
  });

  test("drops fields that have no column", () => {
    expect(toRow(schema.todoItems, { ...fullWorkspace.todoItems[0], extra: "x" }, audit)).not.toHaveProperty("extra");
  });
});

describe("fromRow", () => {
  test("strips audit columns and absent optionals but keeps meaningful nulls", () => {
    const delivery = fromRow<Record<string, unknown>>({
      id: "D",
      actualArrival: null,
      actualEta: null,
      manufacturerLocation: null,
      ...audit,
      deletedAt: null,
    });
    expect(delivery).toEqual({ id: "D", actualArrival: null, actualEta: null });
  });

  test.each(Object.entries(FLAT_COLLECTIONS))("%s round-trips through a row", (key, table) => {
    const item = fullWorkspace[key as keyof typeof FLAT_COLLECTIONS][0];
    expect(fromRow(toRow(table, item, audit))).toEqual(item);
  });
});

describe("supplier plan aggregate", () => {
  test("splits into ordered child rows and reassembles", () => {
    const [plan] = fullWorkspace.supplierPlans;
    const rows = toSupplierPlanRows(plan, audit);
    expect(rows.batches.map((batch) => [batch.id, batch.planId, batch.sortOrder])).toEqual([
      ["batch-f1", "plan-f1", 0],
      ["batch-f2", "plan-f1", 1],
    ]);
    expect(rows.allocations.every((allocation) => allocation.planId === "plan-f1")).toBe(true);

    const shuffledBatches = [...rows.batches].reverse();
    const otherPlanBatch = { ...rows.batches[0], id: "other", planId: "plan-other" };
    expect(fromSupplierPlanRows(rows.plan, [...shuffledBatches, otherPlanBatch], rows.allocations)).toEqual(plan);
  });
});
