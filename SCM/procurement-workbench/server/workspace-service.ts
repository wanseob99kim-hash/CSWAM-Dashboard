// Reads and writes the shared workspace in D1. Each changed row is written with
// optimistic concurrency: a write only lands when the row still has the version
// the client last saw. See docs/d1-persistence-design.md (4.2-4.4).
import { and, eq, getTableColumns, gt, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { SQLiteAsyncDialect, type SQLiteColumn, type SQLiteTable } from "drizzle-orm/sqlite-core";
import { sqlColumnName } from "../db/columns";
import { FLAT_COLLECTIONS, fromRow, fromSupplierPlanRows, toRow, toSupplierPlanRows, type RowAudit } from "../db/mappers";
import * as schema from "../db/schema";
import type { WorkspaceSnapshot } from "../lib/storage";
import type { CollectionKey, VersionMap } from "../lib/sync";
import type { SupplierSchedulePlan } from "../lib/types";
import type { ParsedSyncRequest } from "./validation";

export type WorkspaceDb = DrizzleD1Database<typeof schema> & { $client: D1Database };
export type Clock = () => Date;

/** Rows saved slightly before a read finished may carry an older updated_at; re-send that window. */
export const SINCE_OVERLAP_MS = 60_000;
/** Stays under D1's bound-parameter limit per statement. */
const ID_CHUNK = 90;

type Row = Record<string, unknown>;

/** A statement for runBatch: raw SQL or a Drizzle query builder. */
type BatchStatement = SQL | { toSQL(): { sql: string; params: unknown[] } };

const dialect = new SQLiteAsyncDialect({ casing: "snake_case" });

/**
 * Runs statements as one atomic D1 batch. drizzle-orm 0.45 cannot batch
 * parameterized `db.run(sql)` statements, so this binds them directly.
 */
async function runBatch(db: WorkspaceDb, statements: BatchStatement[]): Promise<Array<{ meta: { changes: number } }>> {
  if (!statements.length) return [];
  const client = db.$client;
  const prepared = statements.map((statement) => {
    const query = "toSQL" in statement ? statement.toSQL() : dialect.sqlToQuery(statement);
    return client.prepare(query.sql).bind(...query.params);
  });
  return (await client.batch(prepared)) as Array<{ meta: { changes: number } }>;
}
type VersionedTable = SQLiteTable & {
  id: SQLiteColumn;
  version: SQLiteColumn;
  updatedAt: SQLiteColumn;
  deletedAt: SQLiteColumn;
};

const COLLECTION_TABLES: Record<CollectionKey, VersionedTable> = {
  ...FLAT_COLLECTIONS,
  supplierPlans: schema.supplierPlans,
};

export type WorkspaceRead = {
  snapshot: Partial<WorkspaceSnapshot>;
  versions: VersionMap;
  deletedIds: Partial<Record<CollectionKey, string[]>>;
  serverTime: string;
};

export type SyncConflict = {
  id: string;
  /** Current server version; 0 when the row does not exist. */
  version: number;
  deleted: boolean;
  item: unknown | null;
};

export type SyncResult = {
  applied: Partial<Record<CollectionKey, Array<{ id: string; version: number; deleted: boolean }>>>;
  conflicts: Partial<Record<CollectionKey, SyncConflict[]>>;
  serverTime: string;
};

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

async function selectByIds(db: WorkspaceDb, table: VersionedTable, ids: string[]): Promise<Row[]> {
  const unique = [...new Set(ids)];
  const groups = await Promise.all(
    chunk(unique, ID_CHUNK).map((group) => db.select().from(table).where(inArray(table.id, group)) as Promise<Row[]>),
  );
  return groups.flat();
}

async function selectPlanChildren(db: WorkspaceDb, planIds: string[]) {
  if (!planIds.length) return { batches: [] as Row[], allocations: [] as Row[] };
  const groups = chunk(planIds, ID_CHUNK);
  const [batches, allocations] = await Promise.all([
    Promise.all(groups.map((group) => db.select().from(schema.supplierPlanBatches).where(inArray(schema.supplierPlanBatches.planId, group)))),
    Promise.all(
      groups.map((group) =>
        db.select().from(schema.supplierMaterialAllocations).where(inArray(schema.supplierMaterialAllocations.planId, group)),
      ),
    ),
  ]);
  return { batches: batches.flat() as Row[], allocations: allocations.flat() as Row[] };
}

/** Full snapshot of live rows, or (with `since`) rows changed after it including deletions. */
export async function readWorkspace(db: WorkspaceDb, since: string | null, clock: Clock): Promise<WorkspaceRead> {
  const serverTime = clock().toISOString();
  const after = since ? new Date(Date.parse(since) - SINCE_OVERLAP_MS).toISOString() : null;

  const entries = await Promise.all(
    (Object.entries(COLLECTION_TABLES) as Array<[CollectionKey, VersionedTable]>).map(async ([key, table]) => {
      const rows = (await db
        .select()
        .from(table)
        .where(after ? gt(table.updatedAt, after) : isNull(table.deletedAt))) as Row[];
      return [key, rows] as const;
    }),
  );

  const result: WorkspaceRead = { snapshot: {}, versions: {}, deletedIds: {}, serverTime };
  for (const [key, rows] of entries) {
    const live = rows.filter((row) => row.deletedAt === null);
    const deleted = rows.filter((row) => row.deletedAt !== null).map((row) => String(row.id));
    result.versions[key] = Object.fromEntries(live.map((row) => [String(row.id), Number(row.version)]));
    if (deleted.length) result.deletedIds[key] = deleted;
    if (key === "supplierPlans") {
      const children = await selectPlanChildren(db, live.map((row) => String(row.id)));
      result.snapshot.supplierPlans = live.map((row) => fromSupplierPlanRows(row, children.batches, children.allocations));
    } else {
      (result.snapshot as Record<string, unknown>)[key] = live.map((row) => fromRow(row));
    }
  }
  return result;
}

/** `INSERT ... SELECT ... WHERE guard`, so dependent writes happen only when the guarded row write will. */
function guardedInsert(table: SQLiteTable, row: Row, guard: SQL): SQL {
  const columns = Object.entries(getTableColumns(table)).filter(([key]) => row[key] !== undefined);
  const names = sql.join(columns.map(([, column]) => sql.identifier(sqlColumnName(column))), sql`, `);
  const values = sql.join(
    columns.map(([key, column]) => sql`${row[key] === null ? null : column.mapToDriverValue(row[key])}`),
    sql`, `,
  );
  return sql`INSERT INTO ${table} (${names}) SELECT ${values} WHERE ${guard}`;
}

/** True exactly when the write below is allowed: new rows must not exist, existing rows must match the version. */
function preconditionSql(table: VersionedTable, id: string, current: Row | undefined): SQL {
  return current
    ? sql`EXISTS (SELECT 1 FROM ${table} WHERE ${table.id} = ${id} AND ${table.version} = ${Number(current.version)})`
    : sql`NOT EXISTS (SELECT 1 FROM ${table} WHERE ${table.id} = ${id})`;
}

type PlannedWrite = {
  collection: CollectionKey;
  id: string;
  version: number;
  deleted: boolean;
  /** Index of the row-write statement in the batch; its `changes` tells whether the write landed. */
  statementIndex: number;
};


export async function applySync(
  db: WorkspaceDb,
  request: ParsedSyncRequest,
  userEmail: string,
  clock: Clock,
): Promise<SyncResult> {
  const serverTime = clock().toISOString();
  const statements: BatchStatement[] = [];
  const planned: PlannedWrite[] = [];
  const conflictRows: Array<[CollectionKey, string]> = [];
  const result: SyncResult = { applied: {}, conflicts: {}, serverTime };

  for (const [collection, changes] of Object.entries(request.changes) as Array<
    [CollectionKey, { upserts: Array<Row & { id: string; baseVersion: number }>; deletes: Array<{ id: string; baseVersion: number }> }]
  >) {
    if (!changes) continue;
    const table = COLLECTION_TABLES[collection];
    const currentRows = await selectByIds(db, table, [...changes.upserts.map((item) => item.id), ...changes.deletes.map((item) => item.id)]);
    const current = new Map(currentRows.map((row) => [String(row.id), row]));

    for (const { baseVersion, ...item } of changes.upserts) {
      const existing = current.get(item.id);
      if ((existing ? Number(existing.version) : 0) !== baseVersion) {
        conflictRows.push([collection, item.id]);
        continue;
      }
      const version = baseVersion + 1;
      const audit: RowAudit = { version, updatedAt: serverTime, updatedBy: userEmail };
      const guard = preconditionSql(table, item.id, existing);
      statements.push(changeLogInsert(collection, item.id, "upsert", userEmail, serverTime, existing, item, guard));

      let row: Row;
      if (collection === "supplierPlans") {
        const rows = toSupplierPlanRows(item as unknown as SupplierSchedulePlan, audit);
        row = rows.plan;
        statements.push(sql`DELETE FROM ${schema.supplierPlanBatches} WHERE ${schema.supplierPlanBatches.planId} = ${item.id} AND ${guard}`);
        statements.push(
          sql`DELETE FROM ${schema.supplierMaterialAllocations} WHERE ${schema.supplierMaterialAllocations.planId} = ${item.id} AND ${guard}`,
        );
        rows.batches.forEach((batch) => statements.push(guardedInsert(schema.supplierPlanBatches, batch, guard)));
        rows.allocations.forEach((allocation) => statements.push(guardedInsert(schema.supplierMaterialAllocations, allocation, guard)));
      } else {
        row = toRow(table, item, { ...audit, deletedAt: null });
      }
      planned.push({ collection, id: item.id, version, deleted: false, statementIndex: statements.length });
      statements.push(upsertStatement(db, table, row, existing));
    }

    for (const { id, baseVersion } of changes.deletes) {
      const existing = current.get(id);
      if (!existing || existing.deletedAt !== null) {
        // Already gone: nothing to do, and nothing to report.
        continue;
      }
      if (Number(existing.version) !== baseVersion) {
        conflictRows.push([collection, id]);
        continue;
      }
      const version = baseVersion + 1;
      const guard = preconditionSql(table, id, existing);
      statements.push(changeLogInsert(collection, id, "delete", userEmail, serverTime, existing, null, guard));
      planned.push({ collection, id, version, deleted: true, statementIndex: statements.length });
      statements.push(
        db
          .update(table)
          .set({ deletedAt: serverTime, version, updatedAt: serverTime, updatedBy: userEmail } as never)
          .where(and(eq(table.id, id), eq(table.version, baseVersion), isNull(table.deletedAt))),
      );
    }
  }

  const outcomes = await runBatch(db, statements);
  for (const write of planned) {
    if (outcomes[write.statementIndex].meta.changes > 0) {
      (result.applied[write.collection] ??= []).push({ id: write.id, version: write.version, deleted: write.deleted });
    } else {
      // Another request changed the row between our read and this batch.
      conflictRows.push([write.collection, write.id]);
    }
  }

  await collectConflicts(db, conflictRows, result);
  return result;
}

function upsertStatement(db: WorkspaceDb, table: VersionedTable, row: Row, existing: Row | undefined) {
  const updates = Object.fromEntries(Object.entries(row).filter(([key]) => key !== "id"));
  return db
    .insert(table)
    .values(row as never)
    .onConflictDoUpdate({
      target: table.id,
      set: updates as never,
      // Version 0 never exists, so a row created concurrently by someone else is left alone.
      setWhere: eq(table.version, existing ? Number(existing.version) : 0),
    });
}

function changeLogInsert(
  collection: CollectionKey,
  rowId: string,
  action: "upsert" | "delete",
  changedBy: string,
  changedAt: string,
  before: Row | undefined,
  after: Row | null,
  guard: SQL,
): SQL {
  // For supplier plans "before" holds the plan fields only; batches live in child rows.
  const beforeItem = before ? fromRow(before) : null;
  return guardedInsert(
    schema.changeLog,
    {
      collection,
      rowId,
      action,
      changedBy,
      changedAt,
      beforeJson: beforeItem ? JSON.stringify(beforeItem) : null,
      afterJson: after ? JSON.stringify(after) : null,
    },
    guard,
  );
}

async function collectConflicts(db: WorkspaceDb, conflictRows: Array<[CollectionKey, string]>, result: SyncResult) {
  const byCollection = new Map<CollectionKey, string[]>();
  for (const [collection, id] of conflictRows) byCollection.set(collection, [...(byCollection.get(collection) ?? []), id]);

  for (const [collection, ids] of byCollection) {
    const rows = await selectByIds(db, COLLECTION_TABLES[collection], ids);
    const rowById = new Map(rows.map((row) => [String(row.id), row]));
    const planChildren =
      collection === "supplierPlans" ? await selectPlanChildren(db, rows.map((row) => String(row.id))) : null;
    result.conflicts[collection] = ids.map((id) => {
      const row = rowById.get(id);
      if (!row) return { id, version: 0, deleted: false, item: null };
      const deleted = row.deletedAt !== null;
      const item = deleted
        ? null
        : planChildren
          ? fromSupplierPlanRows(row, planChildren.batches, planChildren.allocations)
          : fromRow(row);
      return { id, version: Number(row.version), deleted, item };
    });
  }
}
