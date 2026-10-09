// Local D1 (Miniflare) with all committed Drizzle migrations applied.
import { readFileSync } from "node:fs";
import type { D1Database } from "@cloudflare/workers-types/latest";
import { drizzle } from "drizzle-orm/d1";
import { Miniflare } from "miniflare";
import * as schema from "../../db/schema";

export const migrationsDir = new URL("../../drizzle/", import.meta.url);
export const journal = JSON.parse(readFileSync(new URL("meta/_journal.json", migrationsDir), "utf8")) as {
  entries: Array<{ tag: string }>;
};

function statementsOf(sql: string) {
  return sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.replace(/^--.*$/gm, "").trim())
    .filter(Boolean);
}

export async function runSql(d1: D1Database, sql: string) {
  for (const statement of statementsOf(sql)) await d1.prepare(statement).run();
}

export type TestD1 = {
  mf: Miniflare;
  d1: D1Database;
  db: ReturnType<typeof drizzle<typeof schema>>;
};

export async function createTestD1(name: string): Promise<TestD1> {
  const mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response(null, { status: 204 }); } }",
    d1Databases: { DB: name },
  });
  const d1 = (await mf.getD1Database("DB")) as unknown as D1Database;
  for (const { tag } of journal.entries) {
    await runSql(d1, readFileSync(new URL(`${tag}.sql`, migrationsDir), "utf8"));
  }
  return { mf, d1, db: drizzle(d1, { schema, casing: "snake_case" }) };
}
