import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import type { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { FLAT_COLLECTIONS, fromRow, fromSupplierPlanRows, toRow, toSupplierPlanRows } from "../../db/mappers";
import * as schema from "../../db/schema";
import { buildSeedSql, SEED_AUDIT } from "../../db/seed";
import { defaultBomItems, defaultDeliveries, defaultProjects } from "../../lib/seed-data";
import type { D1Database } from "@cloudflare/workers-types/latest";
import { fullWorkspace } from "../fixtures/workspace";
import { createTestD1, journal, migrationsDir, runSql, type TestD1 } from "../helpers/d1";

let mf: Miniflare;
let d1: D1Database;
let db: TestD1["db"];

beforeAll(async () => {
  ({ mf, d1, db } = await createTestD1("workbench-migrations"));
}, 60_000);

afterAll(async () => {
  await mf?.dispose();
});

/** Compares only the fields the seed object defines; optional fields left undefined come back as column defaults. */
function expectSeeded<T extends object>(rows: T[], seed: ReadonlyArray<object>) {
  expect(rows).toHaveLength(seed.length);
  for (const item of seed) {
    const row = rows.find((candidate) => (candidate as { id: string }).id === (item as { id: string }).id);
    const defined = Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined));
    expect(row).toMatchObject({ ...defined, ...SEED_AUDIT, deletedAt: null });
  }
}

describe("D1 migrations", () => {
  test("committed seed migration matches lib/seed-data.ts", () => {
    const seedTag = journal.entries.find(({ tag }) => tag.endsWith("_seed_demo"))?.tag;
    expect(seedTag, "seed migration missing from journal").toBeTruthy();
    // git may check SQL out with CRLF on Windows; compare content, not line endings.
    const committed = readFileSync(new URL(`${seedTag}.sql`, migrationsDir), "utf8").replaceAll("\r\n", "\n");
    expect(committed).toBe(buildSeedSql());
  });

  test("seeds demo projects, deliveries, and BOM", async () => {
    expectSeeded(await db.select().from(schema.projects), defaultProjects);
    expectSeeded(await db.select().from(schema.deliveries), defaultDeliveries);
    expectSeeded(await db.select().from(schema.bomItems), defaultBomItems);
  });

  test("seed is idempotent", async () => {
    await runSql(d1, buildSeedSql());
    expect(await db.$count(schema.projects)).toBe(defaultProjects.length);
    expect(await db.$count(schema.deliveries)).toBe(defaultDeliveries.length);
  });
});

describe("money columns", () => {
  test("store integer cents and read back dollars with two decimals", async () => {
    await db.insert(schema.projects).values({
      id: "project-money",
      name: "Money",
      code: "M",
      phase: "",
      productionWindow: "",
      plant: "",
      budget: 1234.567,
      updatedAt: "2026-10-09T00:00:00.000Z",
      updatedBy: "test@example.com",
    });

    const raw = await d1.prepare("SELECT budget, typeof(budget) AS kind FROM projects WHERE id = ?").bind("project-money").first();
    expect(raw).toEqual({ budget: 123457, kind: "integer" });

    const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, "project-money"));
    expect(project.budget).toBe(1234.57);
  });
});

describe("supplier plan rows", () => {
  test("round-trip JSON file lists, booleans, and defaults", async () => {
    await db.insert(schema.supplierPlans).values({
      id: "plan-1",
      projectId: "project-1700",
      po: "4500000001",
      manufacturer: "Acme",
      category: "Bolts",
      material: "M36",
      incoterms: "FCA",
      to: "supplier@example.com",
      cc: "",
      subject: "PO",
      body: "Hello",
      attachments: ["drawing.pdf", "spec 'v2'.xlsx"],
      forwarderEmail: "",
      requestSent: true,
      updatedAt: "2026-10-09T00:00:00.000Z",
      updatedBy: "test@example.com",
    });

    const [plan] = await db.select().from(schema.supplierPlans).where(eq(schema.supplierPlans.id, "plan-1"));
    expect(plan).toMatchObject({
      attachments: ["drawing.pdf", "spec 'v2'.xlsx"],
      requestSent: true,
      pickupReminderSent: false,
      version: 1,
      deletedAt: null,
    });
  });
});

describe("mappers against D1", () => {
  const audit = { version: 1, updatedAt: "2026-10-09T12:00:00.000Z", updatedBy: "buyer@example.com" };

  test.each(Object.entries(FLAT_COLLECTIONS))("%s round-trips through D1", async (key, table) => {
    const item = fullWorkspace[key as keyof typeof FLAT_COLLECTIONS][0];
    // The table is chosen at runtime, so its insert type cannot be inferred here.
    await db.insert(table).values(toRow(table, item, audit) as never);
    const rows = (await db.select().from(table)) as Array<Record<string, unknown>>;
    expect(fromRow(rows.find((row) => row.id === item.id)!)).toEqual(item);
  });

  test("supplier plan aggregate round-trips through D1", async () => {
    const [plan] = fullWorkspace.supplierPlans;
    const rows = toSupplierPlanRows(plan, audit);
    await db.batch([
      db.insert(schema.supplierPlans).values(rows.plan as typeof schema.supplierPlans.$inferInsert),
      db.insert(schema.supplierPlanBatches).values(rows.batches as Array<typeof schema.supplierPlanBatches.$inferInsert>),
      db
        .insert(schema.supplierMaterialAllocations)
        .values(rows.allocations as Array<typeof schema.supplierMaterialAllocations.$inferInsert>),
    ]);
    const [planRow] = await db.select().from(schema.supplierPlans).where(eq(schema.supplierPlans.id, plan.id));
    const restored = fromSupplierPlanRows(
      planRow,
      await db.select().from(schema.supplierPlanBatches),
      await db.select().from(schema.supplierMaterialAllocations),
    );
    expect(restored).toEqual(plan);
  });
});
