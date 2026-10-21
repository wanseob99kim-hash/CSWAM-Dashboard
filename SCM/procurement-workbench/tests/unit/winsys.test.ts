import { describe, expect, test } from "vitest";
import type { CashEvent } from "../../lib/mdmp/analysis";
import type { MdmpLine, MdmpProject } from "../../lib/mdmp/parse";
import type { Project } from "../../lib/types";
import { cancelledMdmpPos, receiptGaps, splitInvoiced, unknownMdmpPos, winsysPoAmounts, winsysProjectMatcher } from "../../lib/winsys/analysis";
import { buildWinsysExtract, readWinsysExtract, type WinsysExtract } from "../../lib/winsys/extract";
import { headerPaths, parseGrDetail, parseInvoiceDetail, parsePoDetail, WinsysFormatError } from "../../lib/winsys/parse";

// The PO Detail export's three header rows, trimmed to the columns the parser reads.
const PO_HEADER = [
  ["No.", "Work\r\nStatus", "Type", "Project Info", "", "PO Info", "", "", "", "", "Vendor Order Info", "", "", "Material info", "", "", "Price Info", "", "", "", ""],
  ["", "", "", "Project Desc.", "Project ID", "SAP\r\nPO", "Line\r\nNo", "SAP PO Doc", "GR", "Invoice", "Vendor Desc.", "Payment Terms", "Incoterms", "Delivery\r\nDate", "Material\r\nGroup Desc.", "Unit\r\nType", "Order", "", "", "Exchange", ""],
  ["", "", "", "", "", "", "", "PO\r\nQty", "Order\r\nQty", "Order\r\nQty", "", "", "", "", "", "", "Curr", "Unit\r\nPrice", "Amount", "Curr", "Amount"],
];
const poRow = (po: string, line: number, status: string, qty: number, received: number, invoiced: number, amount: number, usd = amount) => [
  "1", status, "Main", "Four Horizons 210T", "1590", po, line, qty, received, invoiced, "Leeco Steel, LLC", "[T/T] Invoice date + 30 days", "DAP", "2026.09.29", "Steel Plate", "PC", "USD", amount / qty, amount, "USD", usd,
];

const GR_HEADER = [
  ["No.", "Status", "Cancel Y/N", "Project Info", "G/R Info", "", "", "", "PO Info", ""],
  ["", "", "", "Project Desc.", "GR", "Posting Date", "Delivery Note", "Qty", "SAP PO", "Line No"],
  ["", "", "", "", "", "", "", "", "", ""],
];
const grRow = (po: string, line: number, date: string, qty: number, cancel = "N") => ["1", "Save", cancel, "Four Horizons 210T", "GR-1", date, "DN-1", qty, po, line];

const INVOICE_HEADER = [
  ["No.", "Type", "Cancel Y/N", "Invoice", "Project Info", "Invoice Price", "", "", "", "Invoice Header Info", "", "", "", "Invoice Info", "PO Info", "", "Vendor Bank Info"],
  ["", "", "", "", "Project Desc.", "Order", "", "", "Exchange", "Vendor Desc.", "Invoice Date", "Net Due Date", "Posting Date", "Payment Terms", "SAP PO", "Line No", "Bank Account"],
  ["", "", "", "", "", "Qty", "Amount", "Curr", "Amount", "", "", "", "", "", "", "", ""],
];

describe("WINSYS export parsing", () => {
  test("reads invoices with their due dates and signed credit memos, ignoring bank details", () => {
    const invoices = parseInvoiceDetail([
      ...INVOICE_HEADER,
      ["1", "Invoice", "N", "INV-1", "Heritage Prairie 137T", 4, 66465.84, "USD", 66465.84, "Leeco Steel, LLC", "2026.10.19", "2027.02.18", "2026.10.19", "[T/T] EOM + 115 days", "4500110094", 40, "123456"],
      ["2", "Credit Memo", "N", "INV-2", "Heritage Prairie 137T", -1, -21708.55, "USD", -21708.55, "Leeco Steel, LLC", "2026.08.28", "2026.11.18", "2026.08.28", "", "4500110094", 40, "123456"],
    ]);
    expect(invoices.map((item) => [item.invoiceNo, item.usdAmount, item.invoiceDate, item.dueDate])).toEqual([
      ["INV-1", 66465.84, "2026-10-19", "2027-02-18"],
      ["INV-2", -21708.55, "2026-08-28", "2026-11-18"],
    ]);
    expect(JSON.stringify(invoices)).not.toContain("123456");
  });

  test("joins the three header rows into group > item > sub-item paths", () => {
    const paths = headerPaths(PO_HEADER);
    expect(paths[1]).toBe("Work Status");
    expect(paths[5]).toBe("PO Info > SAP PO");
    expect(paths[7]).toBe("PO Info > SAP PO Doc > PO Qty");
    expect(paths[8]).toBe("PO Info > GR > Order Qty");
    expect(paths[17]).toBe("Price Info > Order > Unit Price");
    expect(paths[20]).toBe("Price Info > Exchange > Amount");
  });

  test("reads PO lines and skips the totals row", () => {
    const lines = parsePoDetail([...PO_HEADER, poRow("4500106335", 10, "Process", 210, 100, 80, 4_794_547.8), ["", "", "", "", "", "", "", 210]]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      po: "4500106335",
      line: 10,
      workStatus: "Process",
      projectName: "Four Horizons 210T",
      poQty: 210,
      receivedQty: 100,
      invoicedQty: 80,
      usdAmount: 4_794_547.8,
      paymentTerms: "[T/T] Invoice date + 30 days",
      deliveryDate: "2026-09-29",
      itemGroup: "Steel Plate",
    });
  });

  test("rejects an export without the PO columns", () => {
    expect(() => parsePoDetail([["No."], [""], [""]])).toThrow(WinsysFormatError);
  });

  test("reads goods receipts with their posting dates", () => {
    const receipts = parseGrDetail([...GR_HEADER, grRow("4500106335", 10, "2026.10.20", 5), grRow("4500106335", 10, "2026.10.21", 2, "Y")]);
    expect(receipts.map((receipt) => [receipt.postingDate, receipt.qty, receipt.cancelled])).toEqual([
      ["2026-10-20", 5, false],
      ["2026-10-21", 2, true],
    ]);
  });
});

const invoice = (po: string, line: number, usdAmount: number, dueDate: string, cancelled = false) => ({
  po,
  line,
  invoiceNo: `INV-${po}-${dueDate}`,
  invoiceDate: "2026-10-01",
  postingDate: "2026-10-01",
  dueDate,
  qty: 1,
  currency: "USD",
  amount: usdAmount,
  usdAmount,
  cancelled,
  projectId: "1590",
  projectName: "Four Horizons 210T",
  vendor: "Leeco Steel, LLC",
  itemGroup: "Steel Plate",
  paymentTerms: "[T/T] Invoice date + 30 days",
});

function sampleExtract(): WinsysExtract {
  const poLines = [
    ...parsePoDetail([...PO_HEADER, poRow("4500000001", 10, "Process", 40, 30, 20, 4000)]),
    ...parsePoDetail([...PO_HEADER, poRow("4500000009", 10, "Cancel", 10, 0, 0, 1000)]),
  ];
  return buildWinsysExtract(
    {
      poLines,
      receipts: parseGrDetail([...GR_HEADER, grRow("4500000001", 10, "2026.10.01", 10), grRow("4500000001", 10, "2026.10.01", 20), grRow("4500000001", 10, "2026.10.05", 1, "Y")]),
      invoices: [invoice("4500000001", 10, 1500, "2026-09-01"), invoice("4500000001", 10, 500, "2026-11-30"), invoice("4500000001", 10, 900, "2026-12-01", true)],
    },
    { po: "po.xlsx", gr: "gr.xlsx", invoice: "inv.xlsx" },
    "2026-10-20",
  );
}

describe("WINSYS extract", () => {
  test("sums each PO, nets its invoices, keeps its last receipt, and lists invoices not yet due", () => {
    const extract = sampleExtract();
    expect(extract.pos).toEqual([
      { po: "4500000001", projectName: "Four Horizons 210T", usdAmount: 4000, poQty: 40, receivedQty: 30, invoicedUsd: 2000, cancelled: false, lastReceipt: "2026-10-01" },
      { po: "4500000009", projectName: "Four Horizons 210T", usdAmount: 0, poQty: 0, receivedQty: 0, invoicedUsd: 0, cancelled: true, lastReceipt: null },
    ]);
    // Due 2026-09-01 is before the extract date (already paid); the cancelled invoice is left out.
    expect(extract.openInvoices.map((item) => item.dueDate)).toEqual(["2026-11-30"]);
    expect(readWinsysExtract(JSON.stringify(extract)).asOf).toBe("2026-10-20");
    expect(() => readWinsysExtract("{}")).toThrow(/WINSYS extract/);
  });

  test("gives PO values without cancelled lines", () => {
    expect(winsysPoAmounts(sampleExtract())).toEqual([{ po: "4500000001", amount: 4000 }]);
  });
});

function mdmpLine(overrides: Partial<MdmpLine>): MdmpLine {
  return {
    row: 9,
    section: "main",
    description: "SP PO 4500000001",
    group: "Steel plate",
    poNumbers: ["4500000001"],
    unit: "SEC",
    manufacturer: "Leeco",
    vendorNo: "",
    incoterms: "DAP",
    shippingBy: "Truck",
    paymentTerms: "Invoice + 30 days",
    subtotal: 40,
    events: [],
    ...overrides,
  };
}

const project = (lines: MdmpLine[]): MdmpProject => ({ sheet: "Four Horizons", projectName: "Four Horizons 210T", modelNo: "", towerQty: "", towers: 210, sectionsPerTower: 5, processes: {}, lines });

describe("WINSYS against the MDMP", () => {
  test("takes invoiced value off the earliest shipments", () => {
    const line = mdmpLine({});
    const mdmp = project([line]);
    const event = (index: number, day: number, amount: number): CashEvent => ({
      key: `e${index}`,
      project: mdmp,
      line,
      basis: "arrival",
      invoiceWeek: { year: 2026, week: 40 + index },
      invoiceDate: new Date(Date.UTC(2026, 9, day)),
      dueDate: new Date(Date.UTC(2026, 10, day)),
      qty: 10,
      amount,
      done: false,
    });
    const split = splitInvoiced([event(2, 20, 1000), event(1, 10, 1000), event(3, 30, 1000)], [mdmp], sampleExtract());
    // 2,000 invoiced: the two earliest shipments (days 10 and 20) are fully invoiced.
    expect(split.map((item) => [item.key, item.invoicedAmount, item.forecastAmount])).toEqual([
      ["e2", 1000, 0],
      ["e1", 1000, 0],
      ["e3", 0, 1000],
    ]);
  });

  test("lists lines whose MDMP done marks disagree with SAP receipts, and cancelled or unknown POs", () => {
    // SAP received 30 of 40 (75%); the MDMP marks nothing done.
    const open = mdmpLine({ events: [{ week: { year: 2026, week: 42 }, kind: "arrival", qty: 40, status: null }] });
    const cancelled = mdmpLine({ row: 10, poNumbers: ["4500000009"] });
    const unknown = mdmpLine({ row: 11, poNumbers: ["4500099999"] });
    const mdmp = project([open, cancelled, unknown]);
    const extract = sampleExtract();

    const [gap] = receiptGaps([mdmp], extract);
    expect(gap).toMatchObject({ sapReceived: 0.75, mdmpDone: 0, lastReceipt: "2026-10-01" });
    expect(cancelledMdmpPos([mdmp], extract).map((item) => item.po)).toEqual(["4500000009"]);
    expect(unknownMdmpPos([mdmp], extract)).toEqual(["4500099999"]);

    const done = mdmpLine({ events: [{ week: { year: 2026, week: 42 }, kind: "arrival", qty: 30, status: "done" }] });
    expect(receiptGaps([project([done])], extract)).toEqual([]);
  });

  test("matches WINSYS project names to workbench projects", () => {
    const projects: Project[] = [
      { id: "fh", name: "Vestas Four Horizons 210T", code: "1590", phase: "", productionWindow: "", plant: "", budget: 0 },
      { id: "pg5", name: "Panther Grove Phase 2 - 5T", code: "", phase: "", productionWindow: "", plant: "", budget: 0 },
      { id: "pg100", name: "Panther Grove Phase 2 - 100T", code: "", phase: "", productionWindow: "", plant: "", budget: 0 },
    ];
    const match = winsysProjectMatcher(projects);
    expect(match("Four Horizons 210T")).toBe("fh");
    expect(match("Panther Grove Phase 2 - 100T")).toBe("pg100");
    expect(match("Non project related")).toBeNull();
  });
});
