import { useMemo, useState } from "react";
import type { Workbench } from "@/hooks/useWorkbench";
import { formatMoney } from "@/lib/format";
import { monthKey } from "@/lib/mdmp/analysis";
import { describeMppFile } from "@/lib/mpp/read-workbook";
import { formatWeek } from "@/lib/mpp/weeks";
import { formatPaymentTerms, parsePaymentTerms } from "@/lib/payment-terms";
import { upcomingInvoices, winsysProjectMatcher } from "@/lib/winsys/analysis";

type MdmpCashflowProps = {
  wb: Workbench;
};

const MONTHS_AHEAD = 12;
const DETAIL_LIMIT = 80;
const monthLabel = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const dayLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: "UTC" });

type PaymentRow = {
  key: string;
  due: Date;
  /** "invoiced": WINSYS invoice with its due date; "forecast": MDMP shipment not invoiced yet. */
  kind: "invoiced" | "forecast";
  when: string;
  project: string;
  material: string;
  detail: string;
  terms: string;
  qty: string;
  amount: number | null;
};

type MonthRow = { key: string; label: string; invoiced: number; forecast: number; unpriced: number };

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Vendor payments ahead: invoices already booked in WINSYS (due dates from
 * WINSYS), plus MDMP shipments not invoiced yet — EXW/FCA/FOB invoiced at
 * pickup, DAP/DDP at arrival, due by the line's payment terms.
 */
export function MdmpCashflow({ wb }: MdmpCashflowProps) {
  const { activeWorkspace, mdmp, projectScope, projectList, setActiveWorkspace } = wb;
  const { derived, winsys } = mdmp;
  const [showForecastOnly, setShowForecastOnly] = useState(false);
  const today = useMemo(() => new Date(), []);
  const extract = winsys.kind === "ready" ? winsys.data : null;

  const rows = useMemo(() => {
    const out: PaymentRow[] = [];
    const todayIso = isoDate(today);
    if (extract) {
      const projectFor = winsysProjectMatcher(projectList);
      for (const invoice of upcomingInvoices(extract, todayIso)) {
        if (projectScope !== "all" && projectFor(invoice.projectName) !== projectScope) continue;
        out.push({
          key: `inv-${invoice.invoiceNo}-${invoice.po}-${invoice.line}`,
          due: new Date(`${invoice.dueDate}T00:00:00Z`),
          kind: "invoiced",
          when: `invoiced ${invoice.invoiceDate ?? "-"}`,
          project: invoice.projectName || "Non-project",
          material: invoice.itemGroup || "-",
          detail: `${invoice.vendor} · PO ${invoice.po}/${invoice.line}`,
          terms: invoice.paymentTerms.replace(/^\[[^\]]*\]\s*/, ""),
          qty: invoice.qty.toLocaleString(),
          amount: invoice.usdAmount,
        });
      }
    }
    for (const event of derived?.cash ?? []) {
      if (!event.dueDate || event.dueDate < today) continue;
      if (projectScope !== "all" && derived?.projectIdBySheet.get(event.project.sheet) !== projectScope) continue;
      if (event.forecastAmount !== null && event.forecastAmount < 0.5) continue; // fully invoiced already
      out.push({
        key: event.key,
        due: event.dueDate,
        kind: "forecast",
        when: `${formatWeek(event.invoiceWeek)} at ${event.basis === "pickup" ? `pickup (${event.line.incoterms})` : `delivery (${event.line.incoterms || "-"})`}`,
        project: event.project.sheet,
        material: event.line.group,
        detail: `${event.line.manufacturer}${event.line.poNumbers.length ? ` · PO ${event.line.poNumbers.join(", ")}` : ""}`,
        terms: formatPaymentTerms(parsePaymentTerms(event.line.paymentTerms)),
        qty: `${event.qty.toLocaleString()} ${event.line.unit}`,
        amount: event.forecastAmount,
      });
    }
    return out.sort((left, right) => left.due.getTime() - right.due.getTime());
  }, [derived, extract, projectList, projectScope, today]);

  const months = useMemo(() => {
    const byMonth = new Map<string, MonthRow>();
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    for (let offset = 0; offset < MONTHS_AHEAD; offset += 1) {
      const date = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + offset, 1));
      byMonth.set(monthKey(date), { key: monthKey(date), label: monthLabel.format(date), invoiced: 0, forecast: 0, unpriced: 0 });
    }
    for (const row of rows) {
      const month = byMonth.get(monthKey(row.due));
      if (!month) continue;
      if (row.amount === null) month.unpriced += 1;
      else if (row.kind === "invoiced") month.invoiced += row.amount;
      else month.forecast += row.amount;
    }
    return [...byMonth.values()];
  }, [rows, today]);

  const unpriced = rows.filter((row) => row.amount === null).length;
  const detail = rows.filter((row) => !showForecastOnly || row.kind === "forecast").slice(0, DETAIL_LIMIT);
  const hidden = activeWorkspace !== "cashflow";

  if (!derived && !extract) {
    return (
      <section className="material-plan-panel" hidden={hidden}>
        <h2>Vendor payment forecast</h2>
        <p className="plan-hint">Publish the MDMP and the WINSYS exports (npm run plans:publish) to forecast vendor payments.</p>
      </section>
    );
  }

  return (
    <section className="material-plan-panel" hidden={hidden} aria-labelledby="mdmp-cash-title">
      <div className="panel-header">
        <div>
          <h2 id="mdmp-cash-title">Vendor payment forecast</h2>
          <p className="plan-subtitle">
            Invoiced: WINSYS invoices with their due dates{extract ? ` (exports of ${extract.asOf})` : " (WINSYS not published)"}. Forecast: MDMP shipments not invoiced yet —
            EXW, FCA, and FOB invoiced at pickup, DAP and DDP at arrival, due by the payment terms.
          </p>
        </div>
      </div>
      {unpriced ? (
        <p className="scope-hint">
          {unpriced} forecast payments have no price: their PO is not in {extract ? "the WINSYS export" : "any uploaded PO detail"}.{" "}
          {extract ? null : (
            <button type="button" className="link-action" onClick={() => setActiveWorkspace("supplier")}>
              Upload SAP PO detail
            </button>
          )}
        </p>
      ) : null}

      <div className="plan-table-wrap">
        <table className="plan-table">
          <thead>
            <tr>
              <th scope="col">Due month</th>
              <th scope="col" className="numeric">Invoiced (WINSYS)</th>
              <th scope="col" className="numeric">Forecast (MDMP)</th>
              <th scope="col" className="numeric">Total USD</th>
            </tr>
          </thead>
          <tbody>
            {months.map((month) => (
              <tr key={month.key}>
                <td>{month.label}</td>
                <td className="numeric">{month.invoiced ? formatMoney(month.invoiced) : "-"}</td>
                <td className="numeric">
                  {month.forecast ? formatMoney(month.forecast) : "-"}
                  {month.unpriced ? <small>+{month.unpriced} not priced</small> : null}
                </td>
                <td className="numeric">{month.invoiced + month.forecast ? formatMoney(month.invoiced + month.forecast) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {projectScope === "all" && extract ? (
        <p className="plan-hint">With All projects, invoiced payments include every AM purchase in WINSYS (consumables, CAPEX, non-project).</p>
      ) : null}

      <div className="plan-lines-head">
        <h3>Upcoming payments</h3>
        <label className="plan-toggle">
          <input type="checkbox" checked={showForecastOnly} onChange={(event) => setShowForecastOnly(event.target.checked)} />
          Forecast only
        </label>
      </div>
      <div className="plan-table-wrap">
        <table className="plan-table">
          <thead>
            <tr>
              <th scope="col">Due</th>
              <th scope="col">Source</th>
              <th scope="col">Project</th>
              <th scope="col">Material · vendor</th>
              <th scope="col">Terms</th>
              <th scope="col" className="numeric">Qty</th>
              <th scope="col" className="numeric">Amount</th>
            </tr>
          </thead>
          <tbody>
            {detail.map((row) => (
              <tr key={row.key}>
                <td>{dayLabel.format(row.due)}</td>
                <td>
                  <span className={`status ${row.kind === "invoiced" ? "tone-active" : "tone-approval"}`}>{row.kind === "invoiced" ? "Invoiced" : "Forecast"}</span>
                  <small>{row.when}</small>
                </td>
                <td>{row.project}</td>
                <td>
                  {row.material}
                  <small>{row.detail}</small>
                </td>
                <td>{row.terms}</td>
                <td className="numeric">{row.qty}</td>
                <td className="numeric">{row.amount === null ? "-" : formatMoney(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!detail.length ? <p className="empty-state table-empty">No upcoming vendor payments.</p> : null}
      </div>
      {rows.length > DETAIL_LIMIT ? <p className="plan-hint">Showing the first {DETAIL_LIMIT} of {rows.length} payments by due date.</p> : null}
      {mdmp.mdmp.kind === "ready" ? <p className="plan-hint">MDMP: {describeMppFile(mdmp.mdmp.file.fileName)}</p> : null}
    </section>
  );
}
