// D1 schema for the procurement workbench. Column names are snake_case via
// Drizzle `casing: "snake_case"` (see db/index.ts and drizzle.config.ts).
// Design notes: docs/d1-persistence-design.md
import { customType, index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { fromCents, toCents } from "../lib/money";

/** Dollars in the app, integer cents in the database: exactly two decimals. */
const money = customType<{ data: number; driverData: number }>({
  dataType: () => "integer",
  toDriver: (dollars) => toCents(dollars),
  fromDriver: (cents) => fromCents(Number(cents)),
});

const flag = () => integer({ mode: "boolean" }).notNull().default(false);
const stringList = () => text({ mode: "json" }).$type<string[]>().notNull().default([]);

/** Every synced row carries these for optimistic concurrency, incremental fetch, and soft delete. */
const audit = {
  version: integer().notNull().default(1),
  updatedAt: text().notNull(),
  updatedBy: text().notNull(),
  deletedAt: text(),
};

export const projects = sqliteTable("projects", {
  id: text().primaryKey(),
  name: text().notNull(),
  code: text().notNull(),
  phase: text().notNull(),
  productionWindow: text().notNull(),
  plant: text().notNull(),
  budget: money().notNull().default(0),
  status: text(),
  ...audit,
});

export const deliveries = sqliteTable(
  "deliveries",
  {
    id: text().primaryKey(),
    projectId: text().notNull(),
    material: text().notNull(),
    category: text().notNull(),
    batch: text().notNull(),
    po: text().notNull(),
    vendorCode: text().notNull(),
    manufacturer: text().notNull(),
    manufacturerLocation: text(),
    paymentTerms: text().notNull(),
    leadTimeWeeks: real().notNull(),
    deliveryWay: text().notNull(),
    incoterms: text().notNull(),
    poDate: text().notNull(),
    orderConfirmation: text().notNull(),
    supplierSchedule: text().notNull(),
    actualEta: text(),
    actualArrival: text(),
    productionNeed: text().notNull(),
    qty: real().notNull(),
    freightFeeReceived: flag(),
    manufacturerInvoiceReceived: flag(),
    goodsReceived: flag(),
    customsCleared: flag(),
    arrivedPueblo: flag(),
    freightFee: money().notNull().default(0),
    freightInvoiceNumber: text(),
    tariff: money().notNull().default(0),
    tariffInvoiceReceived: flag(),
    tariffInvoiceNumber: text(),
    materialCost: money().notNull().default(0),
    forwarder: text().notNull(),
    ...audit,
  },
  (t) => [index("deliveries_project_idx").on(t.projectId), index("deliveries_po_idx").on(t.po)],
);

export const bomItems = sqliteTable(
  "bom_items",
  {
    id: text().primaryKey(),
    projectId: text().notNull(),
    source: text({ enum: ["purchasing", "internal"] }),
    category: text().notNull(),
    material: text().notNull(),
    vendorCode: text().notNull(),
    manufacturer: text().notNull(),
    qtyPerTower: real().notNull(),
    unitCost: money().notNull().default(0),
    componentNumber: text(),
    currency: text(),
    incoterms: text(),
    totalQty: real(),
    amountTotal: money(),
    drawingNo: text(),
    sectionInfo: text(),
    sectionCode: text(),
    kit: text(),
    oldCode: text(),
    ...audit,
  },
  (t) => [index("bom_items_project_idx").on(t.projectId)],
);

export const purchasePoLines = sqliteTable(
  "purchase_po_lines",
  {
    id: text().primaryKey(),
    projectId: text().notNull(),
    projectCode: text().notNull(),
    projectName: text().notNull(),
    po: text().notNull(),
    lineNo: text().notNull(),
    manufacturer: text().notNull(),
    vendorCode: text().notNull(),
    paymentTerms: text().notNull(),
    incoterms: text().notNull(),
    material: text().notNull(),
    materialCode: text().notNull(),
    category: text().notNull(),
    unit: text().notNull(),
    poQty: real().notNull(),
    unitPrice: money().notNull().default(0),
    amount: money().notNull().default(0),
    currency: text().notNull(),
    deliveryDate: text().notNull(),
    ...audit,
  },
  (t) => [index("purchase_po_lines_project_po_idx").on(t.projectId, t.po)],
);

export const supplierPlans = sqliteTable(
  "supplier_plans",
  {
    id: text().primaryKey(),
    projectId: text().notNull(),
    po: text().notNull(),
    manufacturer: text().notNull(),
    category: text().notNull(),
    material: text().notNull(),
    incoterms: text().notNull(),
    to: text().notNull(),
    cc: text().notNull(),
    subject: text().notNull(),
    body: text().notNull(),
    attachments: stringList(),
    forwarderEmail: text().notNull(),
    requestSent: flag(),
    pickupReminderSent: flag(),
    forwarderNoticeSent: flag(),
    ...audit,
  },
  (t) => [index("supplier_plans_project_po_idx").on(t.projectId, t.po)],
);

/** Child rows of a supplier plan; replaced together with their plan on every sync. */
export const supplierPlanBatches = sqliteTable(
  "supplier_plan_batches",
  {
    id: text().primaryKey(),
    planId: text().notNull(),
    sortOrder: integer().notNull(),
    deliveryId: text().notNull(),
    batch: text().notNull(),
    qty: real().notNull(),
    percentage: real().notNull(),
    puWeek: text().notNull(),
    needWeek: text().notNull(),
    supplierRequestWeek: text().notNull(),
    status: text({ enum: ["Draft", "Request sent", "Supplier requested", "Approved", "Rejected"] }).notNull(),
    note: text().notNull(),
    commercialInvoiceFiles: stringList(),
    packingListFiles: stringList(),
    blNumber: text().notNull(),
    forwarderEta: text().notNull(),
  },
  (t) => [index("supplier_plan_batches_plan_idx").on(t.planId)],
);

export const supplierMaterialAllocations = sqliteTable(
  "supplier_material_allocations",
  {
    planId: text().notNull(),
    poLineId: text().notNull(),
    batchId: text().notNull(),
    qty: real().notNull(),
  },
  (t) => [primaryKey({ columns: [t.planId, t.poLineId, t.batchId] })],
);

export const supplierNcrs = sqliteTable(
  "supplier_ncrs",
  {
    id: text().primaryKey(),
    projectId: text().notNull(),
    ncrNumber: text().notNull(),
    projectName: text().notNull(),
    materialCode: text().notNull(),
    category: text().notNull(),
    qty: real().notNull(),
    replacementReceived: flag(),
    projectImpact: flag(),
    ...audit,
  },
  (t) => [index("supplier_ncrs_project_idx").on(t.projectId)],
);

export const internalNcrs = sqliteTable(
  "internal_ncrs",
  {
    id: text().primaryKey(),
    projectId: text().notNull(),
    ncrNumber: text().notNull(),
    materialInfo: text().notNull(),
    manufacturer: text().notNull(),
    qty: real().notNull(),
    cost: money().notNull().default(0),
    eta: text().notNull(),
    goodsReceived: flag(),
    ...audit,
  },
  (t) => [index("internal_ncrs_project_idx").on(t.projectId)],
);

export const ecnRecords = sqliteTable(
  "ecn_records",
  {
    id: text().primaryKey(),
    projectId: text().notNull(),
    ecnNumber: text().notNull(),
    title: text().notNull(),
    category: text().notNull(),
    manufacturer: text().notNull(),
    status: text().notNull(),
    impact: text().notNull(),
    effectiveWeek: text().notNull(),
    costImpact: money().notNull().default(0),
    notes: text().notNull(),
    ...audit,
  },
  (t) => [index("ecn_records_project_idx").on(t.projectId)],
);

export const todoItems = sqliteTable(
  "todo_items",
  {
    id: text().primaryKey(),
    projectId: text().notNull(),
    title: text().notNull(),
    owner: text().notNull(),
    mode: text().notNull(),
    priority: text().notNull(),
    dueWeek: text().notNull(),
    done: flag(),
    ...audit,
  },
  (t) => [index("todo_items_project_idx").on(t.projectId)],
);

export const FILE_OWNER_TYPES = ["supplier_plan", "supplier_plan_batch", "workspace"] as const;
export const FILE_KINDS = ["attachment", "commercial_invoice", "packing_list", "mpp", "mdmp", "leadtime", "winsys", "pipeline"] as const;

/** Metadata for attachments whose bytes live in the R2 bucket bound as FILES. */
export const files = sqliteTable(
  "files",
  {
    id: text().primaryKey(),
    projectId: text().notNull(),
    ownerType: text({ enum: FILE_OWNER_TYPES }).notNull(),
    ownerId: text().notNull(),
    kind: text({ enum: FILE_KINDS }).notNull(),
    fileName: text().notNull(),
    contentType: text().notNull(),
    sizeBytes: integer().notNull(),
    r2Key: text().notNull().unique(),
    uploadedBy: text().notNull(),
    uploadedAt: text().notNull(),
    deletedAt: text(),
  },
  (t) => [index("files_owner_idx").on(t.ownerType, t.ownerId)],
);

/** Append-only audit trail written in the same batch as each synced change. */
export const changeLog = sqliteTable(
  "change_log",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    collection: text().notNull(),
    rowId: text().notNull(),
    action: text({ enum: ["upsert", "delete"] }).notNull(),
    changedBy: text().notNull(),
    changedAt: text().notNull(),
    beforeJson: text(),
    afterJson: text(),
  },
  (t) => [index("change_log_row_idx").on(t.collection, t.rowId), index("change_log_changed_at_idx").on(t.changedAt)],
);
