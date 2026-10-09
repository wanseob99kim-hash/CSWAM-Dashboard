// Converts between app domain objects (lib/types.ts) and D1 rows (db/schema.ts).
// Schema property names match domain field names, so mapping is mostly about
// audit columns, nulls, and the supplier-plan aggregate.
import { getTableColumns } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { WorkspaceSnapshot } from "../lib/storage";
import type { SupplierSchedulePlan } from "../lib/types";
import * as schema from "./schema";

export type RowAudit = {
  version: number;
  updatedAt: string;
  updatedBy: string;
};

type Row = Record<string, unknown>;

/** Workspace collections stored one row per item. Supplier plans are an aggregate, handled separately. */
export const FLAT_COLLECTIONS = {
  projects: schema.projects,
  deliveries: schema.deliveries,
  bomItems: schema.bomItems,
  purchasePoLines: schema.purchasePoLines,
  supplierNcrs: schema.supplierNcrs,
  internalNcrs: schema.internalNcrs,
  ecnRecords: schema.ecnRecords,
  todoItems: schema.todoItems,
} as const satisfies Record<Exclude<keyof WorkspaceSnapshot, "supplierPlans">, SQLiteTable>;

export type FlatCollection = keyof typeof FLAT_COLLECTIONS;

const AUDIT_KEYS = new Set(["version", "updatedAt", "updatedBy", "deletedAt"]);
/** Domain fields where null is a real value ("not arrived yet"), not an absent optional field. */
const NULLABLE_DOMAIN_FIELDS = new Set(["actualEta", "actualArrival"]);

/**
 * Builds a complete row: every column gets a value so an upsert never leaves a
 * stale column behind. Missing fields become the column default, else null.
 */
export function toRow(table: SQLiteTable, item: object, extra: Row = {}): Row {
  const values: Row = { ...item, ...extra };
  return Object.fromEntries(
    Object.entries(getTableColumns(table)).map(([key, column]) => {
      const value = values[key];
      if (value !== undefined) return [key, value];
      return [key, column.hasDefault ? column.default : null];
    }),
  );
}

/** Strips audit columns and turns nulls back into absent optional fields. */
export function fromRow<T>(row: Row, omit: ReadonlySet<string> = new Set()): T {
  return Object.fromEntries(
    Object.entries(row).filter(
      ([key, value]) => !AUDIT_KEYS.has(key) && !omit.has(key) && (value !== null || NULLABLE_DOMAIN_FIELDS.has(key)),
    ),
  ) as T;
}

export type SupplierPlanRows = {
  plan: Row;
  batches: Row[];
  allocations: Row[];
};

export function toSupplierPlanRows(plan: SupplierSchedulePlan, audit: RowAudit): SupplierPlanRows {
  const { batches, materialAllocations, ...planFields } = plan;
  return {
    plan: toRow(schema.supplierPlans, planFields, audit),
    batches: batches.map((batch, sortOrder) => toRow(schema.supplierPlanBatches, batch, { planId: plan.id, sortOrder })),
    allocations: materialAllocations.map((allocation) =>
      toRow(schema.supplierMaterialAllocations, allocation, { planId: plan.id }),
    ),
  };
}

const PLAN_CHILD_KEYS = new Set(["planId", "sortOrder"]);

export function fromSupplierPlanRows(plan: Row, batches: Row[], allocations: Row[]): SupplierSchedulePlan {
  const ownBatches = batches
    .filter((batch) => batch.planId === plan.id)
    .sort((left, right) => Number(left.sortOrder) - Number(right.sortOrder));
  const ownAllocations = allocations.filter((allocation) => allocation.planId === plan.id);
  return {
    ...fromRow<Omit<SupplierSchedulePlan, "batches" | "materialAllocations">>(plan),
    batches: ownBatches.map((batch) => fromRow(batch, PLAN_CHILD_KEYS)),
    materialAllocations: ownAllocations.map((allocation) => fromRow(allocation, PLAN_CHILD_KEYS)),
  };
}
