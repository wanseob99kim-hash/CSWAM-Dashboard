import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import * as schema from "../../db/schema";
import { buildSeedSql, SEED_AUDIT } from "../../db/seed";
import { defaultBomItems, defaultDeliveries, defaultProjects } from "../../lib/seed-data";
import type { D1Database } from "@cloudflare/workers-types/latest";

const migrationsDir = new URL("../../drizzle/", import.meta.url);
const journal = JSON.parse(readFileSync(new URL("meta/_journal.json", migrationsDir), "utf8")) as {
  entries: Array<{ tag: string }>;
};

function statementsOf(sql: string) {
  return sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.replace(/^--.*$/gm, "").trim())
    .filter(Boolean);
}

async function runSql(d1: D1Database, sql: string) {
  for (const statement of statementsOf(sql)) await d1.prepare(statement).run();
}

let mf: Miniflare;
let d1: D1Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response(null, { status: 204 }); } }",
    d1Databases: { DB: "workbench-test" },
  });
  d1 = (await mf.getD1Database("DB")) as unknown as D1Database;
  for (const { tag } of journal.entries) {
    await runSql(d1, readFileSync(new URL(`${tag}.sql`, migrationsDir), "utf8"));
  }
  db = drizzle(d1, { schema, casing: "snake_case" });
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
