// Builds the demo seed migration from lib/seed-data.ts so the browser demo and
// the database seed never drift apart. Regenerate with `npm run db:seed-sql`.
import { getTableColumns, getTableName } from "drizzle-orm";
import { toSnakeCase } from "drizzle-orm/casing";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { defaultBomItems, defaultDeliveries, defaultProjects } from "../lib/seed-data";
import { bomItems, deliveries, projects } from "./schema";

export const SEED_AUDIT = {
  version: 1,
  updatedAt: "2026-10-09T00:00:00.000Z",
  updatedBy: "seed",
} as const;

const SEED_TABLES: Array<[SQLiteTable, ReadonlyArray<object>]> = [
  [projects, defaultProjects],
  [deliveries, defaultDeliveries],
  [bomItems, defaultBomItems],
];

function toSqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`cannot seed non-finite number ${value}`);
    return String(value);
  }
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replaceAll("'", "''")}'`;
}

/** One `INSERT OR IGNORE` per row; fields the domain object leaves undefined fall back to column defaults. */
export function buildInsertStatement(table: SQLiteTable, row: object): string {
  const columns = Object.entries(getTableColumns(table));
  const values: Record<string, unknown> = { ...row, ...SEED_AUDIT };
  const unknownKeys = Object.keys(row).filter((key) => !columns.some(([name]) => name === key));
  if (unknownKeys.length) throw new Error(`${getTableName(table)} has no column for: ${unknownKeys.join(", ")}`);

  const present = columns.filter(([key]) => values[key] !== undefined);
  // Columns declared without an explicit name are snake_cased by the `casing` option at query time.
  const names = present
    .map(([, column]) => `\`${column.keyAsName ? toSnakeCase(column.name) : column.name}\``)
    .join(", ");
  const literals = present
    .map(([key, column]) => toSqlLiteral(values[key] === null ? null : column.mapToDriverValue(values[key])))
    .join(", ");
  return `INSERT OR IGNORE INTO \`${getTableName(table)}\` (${names}) VALUES (${literals});`;
}

export function buildSeedSql(): string {
  const statements = SEED_TABLES.flatMap(([table, rows]) => rows.map((row) => buildInsertStatement(table, row)));
  return `-- Demo seed generated from lib/seed-data.ts by db/seed.ts. Do not edit by hand.\n${statements.join("\n--> statement-breakpoint\n")}\n`;
}
