// What the WINSYS extract adds to the MDMP view: PO values, what has already
// been invoiced (paid on WINSYS due dates) versus still to come (forecast from
// MDMP pickups and arrivals), receipts SAP has but the MDMP does not show, and
// POs the MDMP still lists after they were cancelled.
import { type CashEvent, poValueByLine } from "../mdmp/analysis";
import type { MdmpLine, MdmpProject } from "../mdmp/parse";
import { projectQuantity, siteName } from "../mpp/match";
import type { Project } from "../types";
import type { ExtractInvoice, ExtractPo, WinsysExtract } from "./extract";

/** USD value per PO, cancelled lines left out; the input poValueByLine expects. */
export function winsysPoAmounts(extract: WinsysExtract): Array<{ po: string; amount: number }> {
  return extract.pos.filter((po) => !po.cancelled).map((po) => ({ po: po.po, amount: po.usdAmount }));
}

export type CashSplit = CashEvent & {
  /** Part of this shipment's value already invoiced in WINSYS (paid on WINSYS due dates instead). */
  invoicedAmount: number;
  /** Value still to be invoiced: the forecast part. Null when the line has no price. */
  forecastAmount: number | null;
};

/**
 * Takes what WINSYS has invoiced on each MDMP line's POs off its earliest
 * shipments, so invoiced value is not forecast a second time.
 */
export function splitInvoiced(events: CashEvent[], projects: MdmpProject[], extract: WinsysExtract): CashSplit[] {
  const invoicedByLine = poValueByLine(
    projects,
    extract.pos.filter((po) => po.invoicedUsd > 0).map((po) => ({ po: po.po, amount: po.invoicedUsd })),
  );
  const remaining = new Map<MdmpLine, number>(invoicedByLine);
  const ordered = [...events].sort((left, right) => left.invoiceDate.getTime() - right.invoiceDate.getTime());
  const split = new Map<CashEvent, CashSplit>();
  for (const event of ordered) {
    if (event.amount === null) {
      split.set(event, { ...event, invoicedAmount: 0, forecastAmount: null });
      continue;
    }
    const left = remaining.get(event.line) ?? 0;
    const invoicedAmount = Math.min(left, event.amount);
    remaining.set(event.line, left - invoicedAmount);
    split.set(event, { ...event, invoicedAmount, forecastAmount: event.amount - invoicedAmount });
  }
  return events.map((event) => split.get(event)!);
}

/** Workbench project for a WINSYS project name ("Four Horizons 210T"), by site name and quantity. */
export function winsysProjectMatcher(projects: readonly Project[]): (projectName: string) => string | null {
  const cache = new Map<string, string | null>();
  return (projectName) => {
    if (cache.has(projectName)) return cache.get(projectName)!;
    const site = siteName(projectName);
    const quantity = /(\d+)\s*(?:T\b|A\b|Adapter)/i.exec(projectName)?.[1];
    const candidates = site
      ? projects.filter((project) => {
          const name = siteName(project.name);
          return name && (name === site || name.startsWith(`${site} `) || site.startsWith(`${name} `));
        })
      : [];
    const match = candidates.find((project) => quantity && projectQuantity(project) === Number(quantity)) ?? (candidates.length === 1 ? candidates[0] : null);
    cache.set(projectName, match?.id ?? null);
    return match?.id ?? null;
  };
}

/** Invoices due on or after `from` (ISO date), earliest first. */
export function upcomingInvoices(extract: WinsysExtract, from: string): ExtractInvoice[] {
  return extract.openInvoices.filter((invoice) => invoice.dueDate && invoice.dueDate >= from);
}

export type ReceiptGap = {
  project: MdmpProject;
  line: MdmpLine;
  /** Share of the PO quantity SAP has received (0–1). */
  sapReceived: number;
  /** Share of the line's quantity the MDMP marks as arrived (green). */
  mdmpDone: number;
  lastReceipt: string | null;
};

/** Gap between SAP receipts and the MDMP's done marks above which a line is listed. */
const RECEIPT_GAP = 0.2;

/** MDMP lines whose done arrivals disagree with SAP goods receipts on their POs. */
export function receiptGaps(projects: MdmpProject[], extract: WinsysExtract): ReceiptGap[] {
  const byPo = new Map(extract.pos.filter((po) => !po.cancelled).map((po) => [po.po, po]));

  const gaps: ReceiptGap[] = [];
  for (const project of projects) {
    for (const line of project.lines) {
      const totals = line.poNumbers.map((po) => byPo.get(po)).filter((po): po is ExtractPo => Boolean(po));
      const ordered = totals.reduce((sum, po) => sum + po.poQty, 0);
      if (!ordered || line.subtotal <= 0) continue;
      const sapReceived = totals.reduce((sum, po) => sum + po.receivedQty, 0) / ordered;
      const arrivals = line.events.filter((event) => event.kind === "arrival");
      const mdmpDone = arrivals.filter((event) => event.status === "done").reduce((sum, event) => sum + event.qty, 0) / line.subtotal;
      if (Math.abs(sapReceived - mdmpDone) <= RECEIPT_GAP) continue;
      const dates = totals.map((po) => po.lastReceipt).filter((date): date is string => Boolean(date)).sort();
      gaps.push({ project, line, sapReceived, mdmpDone, lastReceipt: dates.at(-1) ?? null });
    }
  }
  return gaps.sort((left, right) => Math.abs(right.sapReceived - right.mdmpDone) - Math.abs(left.sapReceived - left.mdmpDone));
}

export type CancelledPo = { project: MdmpProject; line: MdmpLine; po: string };

/** POs written on MDMP lines whose every WINSYS line is cancelled. */
export function cancelledMdmpPos(projects: MdmpProject[], extract: WinsysExtract): CancelledPo[] {
  const state = new Map(extract.pos.map((po) => [po.po, po.cancelled]));
  return projects.flatMap((project) =>
    project.lines.flatMap((line) => line.poNumbers.filter((po) => state.get(po) === true).map((po) => ({ project, line, po }))),
  );
}

/** MDMP PO numbers WINSYS does not have at all (older than the export, or mistyped). */
export function unknownMdmpPos(projects: MdmpProject[], extract: WinsysExtract): string[] {
  const known = new Set(extract.pos.map((po) => po.po));
  return [...new Set(projects.flatMap((project) => project.lines.flatMap((line) => line.poNumbers)))].filter((po) => !known.has(po)).sort();
}
