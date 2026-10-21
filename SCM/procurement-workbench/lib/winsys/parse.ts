// Reads the Excel exports of WINSYS > Purchasing > PO Status > "PO X GR X
// Invoice" (PO Detail List, G/R Detail List, Invoice Detail List).
//
// Each export has a three-row header: a group ("PO Info"), an item ("GR") and
// sometimes a sub-item ("Order Qty"); blank cells continue the cell to their
// left. Columns are found by that path, not by position, so added columns do
// not break the import. The last row is a totals row without a PO number.

export type WinsysPoLine = {
  po: string;
  line: number;
  /** "Process", "Create" or "Cancel" in WINSYS. */
  workStatus: string;
  type: string;
  projectId: string;
  projectName: string;
  vendor: string;
  vendorCode: string;
  itemGroup: string;
  material: string;
  materialDesc: string;
  unit: string;
  poQty: number;
  receivedQty: number;
  invoicedQty: number;
  currency: string;
  unitPrice: number;
  amount: number;
  /** Amount converted to USD (WINSYS "Exchange > Amount"). */
  usdAmount: number;
  paymentTerms: string;
  incoterms: string;
  deliveryDate: string | null;
};

export type WinsysReceipt = {
  po: string;
  line: number;
  grNo: string;
  postingDate: string | null;
  qty: number;
  deliveryNote: string;
  cancelled: boolean;
  projectId: string;
  projectName: string;
  vendor: string;
  itemGroup: string;
};

export type WinsysInvoice = {
  po: string;
  line: number;
  invoiceNo: string;
  invoiceDate: string | null;
  postingDate: string | null;
  /** Payment due date WINSYS calculated from the payment terms. */
  dueDate: string | null;
  qty: number;
  currency: string;
  amount: number;
  usdAmount: number;
  cancelled: boolean;
  projectId: string;
  projectName: string;
  vendor: string;
  itemGroup: string;
  paymentTerms: string;
};

export class WinsysFormatError extends Error {}

type Rows = unknown[][];

const clean = (value: unknown) => (value === null || value === undefined ? "" : String(value).replace(/\s+/g, " ").trim());

function numberOf(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = clean(value).replace(/,/g, "");
  const parsed = Number(text);
  return text && Number.isFinite(parsed) ? parsed : 0;
}

/** "2026.10.20", "2026-10-20 18:23:47" or an Excel date → "2026-10-20". */
function dateOf(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const match = /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/.exec(clean(value));
  return match ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}` : null;
}

/** "Group > Item > Sub-item" for every column of the three header rows. */
export function headerPaths(rows: Rows): string[] {
  const width = Math.max(...rows.slice(0, 3).map((row) => row?.length ?? 0));
  const groups: string[] = [];
  const items: string[] = [];
  let group = "";
  let item = "";
  for (let column = 0; column < width; column += 1) {
    const top = clean(rows[0]?.[column]);
    const middle = clean(rows[1]?.[column]);
    const bottom = clean(rows[2]?.[column]);
    if (top) {
      group = top;
      item = "";
    }
    // A blank middle cell continues the item to its left only where a sub-item sits below.
    if (middle) item = middle;
    else if (!bottom) item = "";
    groups.push(group);
    items.push(top && !middle && !bottom ? "" : item);
  }
  return groups.map((value, column) => [value, items[column], clean(rows[2]?.[column])].filter(Boolean).join(" > "));
}

type Columns<K extends string> = Record<K, number>;

/** Column index per key; `required` keys must exist or the file is rejected. */
function locate<K extends string>(paths: string[], wanted: Record<K, string>, required: NoInfer<K>[], label: string): Columns<K> {
  const lower = paths.map((path) => path.toLowerCase());
  const columns = {} as Columns<K>;
  for (const key of Object.keys(wanted) as K[]) columns[key] = lower.indexOf(wanted[key].toLowerCase());
  const missing = required.filter((key) => columns[key] < 0).map((key) => wanted[key]);
  if (missing.length) throw new WinsysFormatError(`${label}: columns not found: ${missing.join(", ")}`);
  return columns;
}

function dataRows(rows: Rows, poColumn: number): Rows {
  return rows.slice(3).filter((row) => /^\d{6,}$/.test(clean(row?.[poColumn])));
}

const PO_COLUMNS = {
  workStatus: "Work Status",
  type: "Type",
  projectName: "Project Info > Project Desc.",
  projectId: "Project Info > Project ID",
  po: "PO Info > SAP PO",
  line: "PO Info > Line No",
  poQty: "PO Info > SAP PO Doc > PO Qty",
  receivedQty: "PO Info > GR > Order Qty",
  invoicedQty: "PO Info > Invoice > Order Qty",
  vendor: "Vendor Order Info > Vendor Desc.",
  vendorCode: "Vendor Order Info > Vendor",
  paymentTerms: "Vendor Order Info > Payment Terms",
  incoterms: "Vendor Order Info > Incoterms",
  deliveryDate: "Material info > Delivery Date",
  material: "Material info > Material",
  materialDesc: "Material info > Material Desc.",
  itemGroup: "Material info > Material Group Desc.",
  unit: "Material info > Unit Type",
  currency: "Price Info > Order > Curr",
  unitPrice: "Price Info > Order > Unit Price",
  amount: "Price Info > Order > Amount",
  usdAmount: "Price Info > Exchange > Amount",
};

export function parsePoDetail(rows: Rows): WinsysPoLine[] {
  const at = locate(headerPaths(rows), PO_COLUMNS, ["po", "line", "poQty", "amount"], "PO Detail List");
  const get = (row: unknown[], key: keyof typeof PO_COLUMNS) => (at[key] < 0 ? "" : row[at[key]]);
  return dataRows(rows, at.po).map((row) => ({
    po: clean(get(row, "po")),
    line: numberOf(get(row, "line")),
    workStatus: clean(get(row, "workStatus")),
    type: clean(get(row, "type")),
    projectId: clean(get(row, "projectId")),
    projectName: clean(get(row, "projectName")),
    vendor: clean(get(row, "vendor")),
    vendorCode: clean(get(row, "vendorCode")),
    itemGroup: clean(get(row, "itemGroup")),
    material: clean(get(row, "material")),
    materialDesc: clean(get(row, "materialDesc")),
    unit: clean(get(row, "unit")),
    poQty: numberOf(get(row, "poQty")),
    receivedQty: numberOf(get(row, "receivedQty")),
    invoicedQty: numberOf(get(row, "invoicedQty")),
    currency: clean(get(row, "currency")) || "USD",
    unitPrice: numberOf(get(row, "unitPrice")),
    amount: numberOf(get(row, "amount")),
    usdAmount: at.usdAmount < 0 ? numberOf(get(row, "amount")) : numberOf(get(row, "usdAmount")),
    paymentTerms: clean(get(row, "paymentTerms")),
    incoterms: clean(get(row, "incoterms")),
    deliveryDate: dateOf(get(row, "deliveryDate")),
  }));
}

const GR_COLUMNS = {
  cancel: "Cancel Y/N",
  projectName: "Project Info > Project Desc.",
  projectId: "Project Info > Project ID",
  grNo: "G/R Info > GR",
  postingDate: "G/R Info > Posting Date",
  deliveryNote: "G/R Info > Delivery Note",
  qty: "G/R Info > Qty",
  itemGroup: "Material info > Material Group Desc.",
  vendor: "Vendor Order Info > Vendor Desc.",
  po: "PO Info > SAP PO",
  line: "PO Info > Line No",
};

export function parseGrDetail(rows: Rows): WinsysReceipt[] {
  const at = locate(headerPaths(rows), GR_COLUMNS, ["po", "line", "postingDate", "qty"], "G/R Detail List");
  const get = (row: unknown[], key: keyof typeof GR_COLUMNS) => (at[key] < 0 ? "" : row[at[key]]);
  return dataRows(rows, at.po).map((row) => ({
    po: clean(get(row, "po")),
    line: numberOf(get(row, "line")),
    grNo: clean(get(row, "grNo")),
    postingDate: dateOf(get(row, "postingDate")),
    qty: numberOf(get(row, "qty")),
    deliveryNote: clean(get(row, "deliveryNote")),
    cancelled: clean(get(row, "cancel")).toUpperCase() === "Y",
    projectId: clean(get(row, "projectId")),
    projectName: clean(get(row, "projectName")),
    vendor: clean(get(row, "vendor")),
    itemGroup: clean(get(row, "itemGroup")),
  }));
}

const INVOICE_COLUMNS = {
  type: "Type",
  cancel: "Cancel Y/N",
  invoiceNo: "Invoice",
  projectName: "Project Info > Project Desc.",
  projectId: "Project Info > Project ID",
  qty: "Invoice Price > Order > Qty",
  amount: "Invoice Price > Order > Amount",
  currency: "Invoice Price > Order > Curr",
  usdAmount: "Invoice Price > Exchange > Amount",
  itemGroup: "Material info > Material Group Desc.",
  vendor: "Invoice Header Info > Vendor Desc.",
  invoiceDate: "Invoice Header Info > Invoice Date",
  dueDate: "Invoice Header Info > Net Due Date",
  postingDate: "Invoice Header Info > Posting Date",
  paymentTerms: "Invoice Info > Payment Terms",
  po: "PO Info > SAP PO",
  line: "PO Info > Line No",
};

/**
 * Invoice lines, including sub debits (extra charges) and credit memos, whose
 * amounts WINSYS already signs. Bank details in the export are not read.
 */
export function parseInvoiceDetail(rows: Rows): WinsysInvoice[] {
  const at = locate(headerPaths(rows), INVOICE_COLUMNS, ["po", "line", "amount", "dueDate"], "Invoice Detail List");
  const get = (row: unknown[], key: keyof typeof INVOICE_COLUMNS) => (at[key] < 0 ? "" : row[at[key]]);
  return dataRows(rows, at.po).map((row) => ({
    po: clean(get(row, "po")),
    line: numberOf(get(row, "line")),
    invoiceNo: clean(get(row, "invoiceNo")),
    invoiceDate: dateOf(get(row, "invoiceDate")),
    postingDate: dateOf(get(row, "postingDate")),
    dueDate: dateOf(get(row, "dueDate")),
    qty: numberOf(get(row, "qty")),
    currency: clean(get(row, "currency")) || "USD",
    amount: numberOf(get(row, "amount")),
    usdAmount: at.usdAmount < 0 ? numberOf(get(row, "amount")) : numberOf(get(row, "usdAmount")),
    cancelled: clean(get(row, "cancel")).toUpperCase() === "Y",
    projectId: clean(get(row, "projectId")),
    projectName: clean(get(row, "projectName")),
    vendor: clean(get(row, "vendor")),
    itemGroup: clean(get(row, "itemGroup")),
    paymentTerms: clean(get(row, "paymentTerms")),
  }));
}
