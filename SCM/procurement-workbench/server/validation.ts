// Request validation for /api/workspace/sync. Item schemas are derived from the
// Drizzle tables so validation cannot drift from storage.
import { getTableColumns } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { FLAT_COLLECTIONS } from "../db/mappers";
import * as schema from "../db/schema";

/** Upserts plus deletes allowed in one sync request; clients split bigger imports. */
export const MAX_ROWS_PER_SYNC = 200;
export const MAX_SYNC_BODY_BYTES = 1_000_000;
const MAX_FILE_NAMES = 50;
const MAX_PLAN_CHILDREN = 200;

const AUDIT_FIELDS = { version: true, updatedAt: true, updatedBy: true, deletedAt: true } as const;
const id = z.string().trim().min(1).max(200);
const baseVersion = z.number().int().min(0);
const money = z.number().finite();

/**
 * drizzle-zod accepts anything for custom (money) and JSON columns, so those get
 * explicit rules. Nullable or defaulted columns stay optional.
 */
function columnOverrides(table: SQLiteTable) {
  const overrides: Record<string, z.ZodType> = {};
  for (const [key, column] of Object.entries(getTableColumns(table))) {
    let rule: z.ZodType | null = null;
    if (column.columnType === "SQLiteCustomColumn") rule = money;
    if (column.columnType === "SQLiteTextJson") rule = z.array(z.string().max(255)).max(MAX_FILE_NAMES);
    if (!rule) continue;
    overrides[key] = column.notNull && !column.hasDefault ? rule : rule.nullish();
  }
  return overrides;
}

function itemSchema(table: SQLiteTable) {
  return createInsertSchema(table, columnOverrides(table)).extend({ id });
}

function flatItemSchema(table: SQLiteTable) {
  return itemSchema(table).omit(AUDIT_FIELDS);
}

const batchSchema = itemSchema(schema.supplierPlanBatches).omit({ planId: true, sortOrder: true });
const allocationSchema = createInsertSchema(schema.supplierMaterialAllocations).omit({ planId: true });
const supplierPlanSchema = itemSchema(schema.supplierPlans)
  .omit(AUDIT_FIELDS)
  .extend({
    batches: z.array(batchSchema).max(MAX_PLAN_CHILDREN),
    materialAllocations: z.array(allocationSchema).max(MAX_PLAN_CHILDREN),
  });

function collectionSchema<T extends z.ZodObject>(item: T) {
  return z.object({
    upserts: z.array(item.extend({ baseVersion })).default([]),
    deletes: z.array(z.object({ id, baseVersion })).default([]),
  });
}

const flatCollectionSchemas = Object.fromEntries(
  Object.entries(FLAT_COLLECTIONS).map(([key, table]) => [key, collectionSchema(flatItemSchema(table)).optional()]),
) as { [K in keyof typeof FLAT_COLLECTIONS]: z.ZodOptional<ReturnType<typeof collectionSchema>> };

export const syncRequestSchema = z
  .object({
    changes: z
      .object({
        ...flatCollectionSchemas,
        supplierPlans: collectionSchema(supplierPlanSchema).optional(),
      })
      .strict(),
  })
  .superRefine((request, context) => {
    const rows = Object.values(request.changes).reduce(
      (sum, collection) => sum + (collection ? collection.upserts.length + collection.deletes.length : 0),
      0,
    );
    if (rows > MAX_ROWS_PER_SYNC) {
      context.addIssue({ code: "custom", message: `At most ${MAX_ROWS_PER_SYNC} rows per sync; got ${rows}.` });
    }
  });

export type ParsedSyncRequest = z.infer<typeof syncRequestSchema>;

/** ISO-8601 timestamp produced by Date#toISOString, as returned in serverTime. */
export const sinceSchema = z.iso.datetime();
