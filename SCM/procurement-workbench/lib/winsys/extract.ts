// The WINSYS extract the dashboard loads: the three PO Status exports reduced
// to what purchasing needs, small enough to upload and load as one JSON file.
import { explodeProjectBoms, type SapProjectBom, type WinsysBomFile } from "./bom";
import type { WinsysInvoice, WinsysPoLine, WinsysReceipt } from "./parse";

export const WINSYS_EXTRACT_VERSION = 2;

/** One SAP PO summed over its lines. */
export type ExtractPo = {
  po: string;
  projectName: string;
  /** USD value of the lines that are not cancelled. */
  usdAmount: number;
  poQty: number;
  receivedQty: number;
  /** USD invoiced so far (credit memos netted). */
  invoicedUsd: number;
  /** Every line of the PO is cancelled. */
  cancelled: boolean;
  lastReceipt: string | null;
};

export type ExtractInvoice = Pick<
  WinsysInvoice,
  "po" | "line" | "invoiceNo" | "invoiceDate" | "dueDate" | "qty" | "usdAmount" | "projectName" | "vendor" | "itemGroup" | "paymentTerms"
>;

export type WinsysExtract = {
  version: number;
  /** ISO date the exports were taken (from the file names, else the publish date). */
  asOf: string;
  sources: { po: string; gr: string; invoice: string };
  pos: ExtractPo[];
  /** Invoices due on or after `asOf`, line by line. */
  openInvoices: ExtractInvoice[];
  /** SAP BOMs per WINSYS project, exploded per tower and priced from PO lines (absent in older extracts). */
  bom?: SapProjectBom[];
  /** When the BOMs were collected from WINSYS. */
  bomCollectedAt?: string;
};

export function buildWinsysExtract(
  input: { poLines: WinsysPoLine[]; receipts: WinsysReceipt[]; invoices: WinsysInvoice[]; bom?: WinsysBomFile | null },
  sources: WinsysExtract["sources"],
  asOf: string,
): WinsysExtract {
  const pos = new Map<string, ExtractPo>();
  const poFor = (po: string, projectName: string) => {
    let entry = pos.get(po);
    if (!entry) {
      entry = { po, projectName, usdAmount: 0, poQty: 0, receivedQty: 0, invoicedUsd: 0, cancelled: true, lastReceipt: null };
      pos.set(po, entry);
    }
    return entry;
  };

  for (const line of input.poLines) {
    const entry = poFor(line.po, line.projectName);
    if (line.workStatus.toLowerCase() === "cancel") continue;
    entry.cancelled = false;
    entry.usdAmount += line.usdAmount;
    entry.poQty += line.poQty;
    entry.receivedQty += line.receivedQty;
  }
  for (const receipt of input.receipts) {
    const entry = pos.get(receipt.po);
    if (!entry || receipt.cancelled || !receipt.postingDate) continue;
    if (!entry.lastReceipt || receipt.postingDate > entry.lastReceipt) entry.lastReceipt = receipt.postingDate;
  }

  const openInvoices: ExtractInvoice[] = [];
  for (const invoice of input.invoices) {
    if (invoice.cancelled || !invoice.usdAmount) continue;
    const entry = pos.get(invoice.po);
    if (entry) entry.invoicedUsd += invoice.usdAmount;
    if (invoice.dueDate && invoice.dueDate >= asOf) {
      openInvoices.push({
        po: invoice.po,
        line: invoice.line,
        invoiceNo: invoice.invoiceNo,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        qty: invoice.qty,
        usdAmount: invoice.usdAmount,
        projectName: invoice.projectName,
        vendor: invoice.vendor,
        itemGroup: invoice.itemGroup,
        paymentTerms: invoice.paymentTerms,
      });
    }
  }

  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    version: WINSYS_EXTRACT_VERSION,
    asOf,
    sources,
    pos: [...pos.values()].map((entry) => ({ ...entry, usdAmount: round(entry.usdAmount), invoicedUsd: round(entry.invoicedUsd) })),
    openInvoices: openInvoices.sort((left, right) => (left.dueDate ?? "").localeCompare(right.dueDate ?? "")),
    ...(input.bom ? { bom: explodeProjectBoms(input.bom, input.poLines), bomCollectedAt: input.bom.collectedAt } : {}),
  };
}

/** Checks a downloaded extract before the app relies on it. */
export function readWinsysExtract(text: string): WinsysExtract {
  const data = JSON.parse(text) as Partial<WinsysExtract>;
  if (data.version !== WINSYS_EXTRACT_VERSION || !Array.isArray(data.pos) || !Array.isArray(data.openInvoices)) {
    throw new Error("Not a WINSYS extract this version of the dashboard can read. Publish it again with npm run plans:publish.");
  }
  return data as WinsysExtract;
}
