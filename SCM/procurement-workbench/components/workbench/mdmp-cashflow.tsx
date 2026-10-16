import { useMemo, useState } from "react";
import type { Workbench } from "@/hooks/useWorkbench";
import { formatMoney } from "@/lib/format";
import { monthKey, type CashEvent } from "@/lib/mdmp/analysis";
import { formatWeek } from "@/lib/mpp/weeks";
import { formatPaymentTerms, parsePaymentTerms } from "@/lib/payment-terms";

type MdmpCashflowProps = {
  wb: Workbench;
};

const MONTHS_AHEAD = 12;
const DETAIL_LIMIT = 60;
const monthLabel = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const dayLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: "UTC" });

type MonthRow = { key: string; label: string; payments: number; priced: number; amount: number; pickupBasis: number };

/**
 * Vendor payments from the MDMP: an EXW/FCA/FOB line is invoiced the week we
 * pick it up, a DAP/DDP line the week it arrives; the due date follows the
 * line's payment terms. Amounts come from SAP PO detail when uploaded.
 */
export function MdmpCashflow({ wb }: MdmpCashflowProps) {
  const { activeWorkspace, mdmp, projectScope, purchasePoLines, setActiveWorkspace } = wb;
  const { derived } = mdmp;
  const [showInvoiced, setShowInvoiced] = useState(false);
  const today = useMemo(() => new Date(), []);

  const events = useMemo(
    () =>
      (derived?.cash ?? [])
        .filter((event) => projectScope === "all" || derived?.projectIdBySheet.get(event.project.sheet) === projectScope)
        .filter((event): event is CashEvent & { dueDate: Date } => event.dueDate !== null && event.dueDate >= today)
        .sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime()),
    [derived, projectScope, today],
  );

  const months = useMemo(() => {
    const rows = new Map<string, MonthRow>();
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    for (let offset = 0; offset < MONTHS_AHEAD; offset += 1) {
      const date = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + offset, 1));
      rows.set(monthKey(date), { key: monthKey(date), label: monthLabel.format(date), payments: 0, priced: 0, amount: 0, pickupBasis: 0 });
    }
    for (const event of events) {
      const row = rows.get(monthKey(event.dueDate));
      if (!row) continue;
      row.payments += 1;
      if (event.amount !== null) {
        row.priced += 1;
        row.amount += event.amount;
      }
      if (event.basis === "pickup") row.pickupBasis += 1;
    }
    return [...rows.values()];
  }, [events, today]);

  const priced = events.filter((event) => event.amount !== null).length;
  const detail = events.filter((event) => showInvoiced || !event.done).slice(0, DETAIL_LIMIT);
  const hidden = activeWorkspace !== "cashflow";

  if (!derived) {
    return (
      <section className="material-plan-panel" hidden={hidden}>
        <h2>Payment forecast from the MDMP</h2>
        <p className="plan-hint">Publish the MDMP (npm run plans:publish) to forecast vendor payments from pickups and deliveries.</p>
      </section>
    );
  }

  return (
    <section className="material-plan-panel" hidden={hidden} aria-labelledby="mdmp-cash-title">
      <div className="panel-header">
        <div>
          <h2 id="mdmp-cash-title">Payment forecast from the MDMP</h2>
          <p className="plan-subtitle">
            EXW, FCA, and FOB lines are invoiced when we pick up; DAP and DDP lines when they arrive. Due date = payment terms from that invoice.
          </p>
        </div>
      </div>
      {priced < events.length ? (
        <p className="scope-hint">
          {priced} of {events.length} upcoming payments have a value. Upload the SAP PO detail in{" "}
          <button type="button" className="link-action" onClick={() => setActiveWorkspace("supplier")}>
            Supplier Schedule
          </button>{" "}
          to price the rest; until then they show as quantities.
          {purchasePoLines.length ? "" : " No PO detail has been uploaded yet."}
        </p>
      ) : null}

      <div className="plan-table-wrap">
        <table className="plan-table">
          <thead>
            <tr>
              <th scope="col">Due month</th>
              <th scope="col" className="numeric">Payments</th>
              <th scope="col" className="numeric">Invoiced at pickup</th>
              <th scope="col" className="numeric">Amount (USD, priced only)</th>
            </tr>
          </thead>
          <tbody>
            {months.map((row) => (
              <tr key={row.key}>
                <td>{row.label}</td>
                <td className="numeric">{row.payments}</td>
                <td className="numeric">{row.pickupBasis}</td>
                <td className="numeric">
                  {row.priced ? formatMoney(row.amount) : "-"}
                  {row.priced && row.priced < row.payments ? <small>{row.payments - row.priced} not priced</small> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="plan-lines-head">
        <h3>Upcoming payments</h3>
        <label className="plan-toggle">
          <input type="checkbox" checked={showInvoiced} onChange={(event) => setShowInvoiced(event.target.checked)} />
          Include lines already picked up or received
        </label>
      </div>
      <div className="plan-table-wrap">
        <table className="plan-table">
          <thead>
            <tr>
              <th scope="col">Due</th>
              <th scope="col">Invoice</th>
              <th scope="col">Project</th>
              <th scope="col">Material · vendor</th>
              <th scope="col">Terms</th>
              <th scope="col" className="numeric">Qty</th>
              <th scope="col" className="numeric">Amount</th>
            </tr>
          </thead>
          <tbody>
            {detail.map((event) => (
              <tr key={event.key}>
                <td>{dayLabel.format(event.dueDate)}</td>
                <td>
                  {formatWeek(event.invoiceWeek)}
                  <small>
                    {event.basis === "pickup" ? `at pickup (${event.line.incoterms})` : `at delivery (${event.line.incoterms || "-"})`}
                    {event.done ? " · done" : ""}
                  </small>
                </td>
                <td>{event.project.sheet}</td>
                <td>
                  {event.line.group}
                  <small>
                    {event.line.manufacturer}
                    {event.line.poNumbers.length ? ` · PO ${event.line.poNumbers.join(", ")}` : ""}
                  </small>
                </td>
                <td>{formatPaymentTerms(parsePaymentTerms(event.line.paymentTerms))}</td>
                <td className="numeric">
                  {event.qty.toLocaleString()} {event.line.unit}
                </td>
                <td className="numeric">{event.amount === null ? "-" : formatMoney(event.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!detail.length ? <p className="empty-state table-empty">No upcoming vendor payments.</p> : null}
      </div>
      {events.length > DETAIL_LIMIT ? <p className="plan-hint">Showing the first {DETAIL_LIMIT} payments by due date.</p> : null}
    </section>
  );
}
