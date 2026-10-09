import { formatScheduleWeek, formatShortDate } from "@/lib/dates";
import { getDeliveryCategory, getIncotermMode, getLegacyMaterialNote, getOriginCountry, getPosition, getProjectedTotalCost, getRouteStage, usesSupplierEta } from "@/lib/delivery";
import { formatMoney } from "@/lib/format";
import type { Workbench } from "@/hooks/useWorkbench";

type DeliveryScheduleProps = {
  wb: Workbench;
};

export function DeliverySchedule({ wb }: DeliveryScheduleProps) {
  const { bomItems, category, setCategory, query, setQuery, activeWorkspace, projectRows, categories, filteredRows, riskRows, range, startEditDelivery, deleteDelivery } = wb;

  return (
    <>
      <section className="risk-strip" hidden={activeWorkspace !== "delivery"}>
        <div className="section-title">
          <h2>Main Risk Deliveries</h2>
        </div>
        <div className="risk-cards">
          {projectRows.length ? (
            (riskRows.length ? riskRows : projectRows.slice(0, 2)).map((row) => (
              <article className="risk-card" key={row.id}>
                <div>
                  <i className={`status ${row.risk.tone}`}>{row.risk.level}</i>
                  <strong>{getDeliveryCategory(row)}</strong>
                  <small>{row.po} · Batch {row.batch} · {row.manufacturer}</small>
                </div>
                <dl>
                  <div>
                    <dt>{usesSupplierEta(row) ? "Supplier ETA" : "Pickup"}</dt>
                    <dd>{formatScheduleWeek(row.supplierSchedule)}</dd>
                  </div>
                  <div>
                    <dt>Need</dt>
                    <dd>{formatScheduleWeek(row.productionNeed)}</dd>
                  </div>
                  <div>
                    <dt>ETA</dt>
                    <dd>{formatScheduleWeek(row.risk.theoreticalDelivery)}</dd>
                  </div>
                  <div>
                    <dt>Cost</dt>
                    <dd>{formatMoney(getProjectedTotalCost(row, bomItems, projectRows))}</dd>
                  </div>
                </dl>
              </article>
            ))
          ) : (
            <div className="empty-state">This project has no deliveries yet. Click Add delivery to enter the first PO / batch schedule.</div>
          )}
        </div>
      </section>
      <section className="gantt-panel" hidden={activeWorkspace !== "delivery"}>
        <div className="section-title">
          <h2>Delivery Gantt</h2>
        </div>
        <div className="gantt-scale">
          <span>{formatShortDate(range.min)}</span>
          <span>{formatShortDate(range.max)}</span>
        </div>
        <div className="gantt-list">
          {projectRows.length ? (
            projectRows.map((row) => {
              const left = getPosition(row.poDate, range.min, range.totalDays);
              const supplier = getPosition(row.supplierSchedule, range.min, range.totalDays);
              const theoretical = getPosition(row.risk.theoreticalDelivery, range.min, range.totalDays);
              const need = getPosition(row.productionNeed, range.min, range.totalDays);
              const width = Math.max(3, supplier - left);
              return (
                <div className="gantt-row" key={row.id}>
                  <div className="gantt-label">
                    <strong>{getDeliveryCategory(row)}</strong>
                    <small>{row.po} · {row.batch} · {row.category}</small>
                  </div>
                  <div className="gantt-track">
                    <span className={`gantt-bar ${row.risk.score >= 3 ? "bar-risk" : "bar-ok"}`} style={{ left: `${left}%`, width: `${width}%` }} />
                    <i className="marker marker-theory" style={{ left: `${theoretical}%` }} title="Estimated arrival" />
                    <i className="marker marker-need" style={{ left: `${need}%` }} title="Production need" />
                    <em style={{ left: `${supplier}%` }}>{usesSupplierEta(row) ? "ETA" : formatScheduleWeek(row.supplierSchedule)}</em>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="empty-state">Add delivery to show PO date, pickup date, estimated arrival, and production need.</div>
          )}
        </div>
        <div className="gantt-legend">
          <span><i className="legend-bar" /> PO to pickup / supplier ETA</span>
          <span><i className="legend-theory" /> Estimated arrival</span>
          <span><i className="legend-need" /> Production need</span>
        </div>
      </section>
      <section className="schedule-panel" hidden={activeWorkspace !== "delivery"}>
        <div className="panel-header">
          <div>
            <h2>Delivery Schedule Detail</h2>
          </div>
          <div className="filters">
            <input
              aria-label="Search delivery"
              placeholder="Search category / PO / vendor"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select
              aria-label="Filter category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="schedule-table" role="table" aria-label="IM delivery schedule detail">
          <div className="schedule-row schedule-head" role="row">
            <span>Category</span>
            <span>PO / Batch</span>
            <span>Vendor</span>
            <span>Logistics / Forwarder</span>
            <span>Invoices / Receipt</span>
            <span>PO / OC</span>
            <span>Pickup / ETA for MDMP</span>
            <span>Actual ETA</span>
            <span>Production / Receive</span>
            <span>Risk</span>
            <span>Actions</span>
          </div>
          {filteredRows.length ? (
            filteredRows.map((row) => (
              <div className="schedule-row" role="row" key={row.id}>
                <span>
                  <strong>{getDeliveryCategory(row)}</strong>
                  <small>{[getLegacyMaterialNote(row), `Tower qty ${row.qty.toLocaleString()}`].filter(Boolean).join(" · ")}</small>
                </span>
                <span>
                  <strong>{row.po}</strong>
                  <small>Batch {row.batch}</small>
                </span>
                <span>
                  <strong>{row.manufacturer}</strong>
                  <small>{row.vendorCode}</small>
                </span>
                <span>
                  <strong>{row.deliveryWay}</strong>
                  <small>{row.forwarder} · {row.incoterms}</small>
                  <small>{row.manufacturerLocation || getOriginCountry(row)} · {getRouteStage(row)}</small>
                </span>
                <span>
                  <strong>{row.paymentTerms}</strong>
                  <small className="checkline">
                    <i className={usesSupplierEta(row) || row.freightFeeReceived ? "check yes" : "check no"}>{usesSupplierEta(row) ? getIncotermMode(row) : "Freight inv."}</i>
                    {getIncotermMode(row) !== "DDP" ? <i className={row.tariffInvoiceReceived ? "check yes" : "check no"}>Tariff inv.</i> : null}
                    <i className={row.manufacturerInvoiceReceived ? "check yes" : "check no"}>Vendor inv.</i>
                    <i className={row.goodsReceived ? "check yes" : "check no"}>Goods</i>
                  </small>
                  <small>{[row.freightInvoiceNumber ? `Freight #${row.freightInvoiceNumber}` : "", row.tariffInvoiceNumber ? `Tariff #${row.tariffInvoiceNumber}` : ""].filter(Boolean).join(" · ") || "No freight/tariff invoice #"}</small>
                </span>
                <span>
                  <strong>{formatScheduleWeek(row.poDate)}</strong>
                  <small>OC {formatScheduleWeek(row.orderConfirmation)}</small>
                </span>
                <span>
                  <strong>{formatScheduleWeek(row.supplierSchedule)}</strong>
                  <small>ETA for MDMP {formatScheduleWeek(row.risk.theoreticalDelivery)}</small>
                </span>
                <span>
                  <strong>{row.actualEta ? formatScheduleWeek(row.actualEta) : "-"}</strong>
                  <small>Manual ETA</small>
                </span>
                <span>
                  <strong>{formatScheduleWeek(row.productionNeed)}</strong>
                  <small>{row.actualArrival ? `Actual ${formatShortDate(row.actualArrival)} / ${formatScheduleWeek(row.actualArrival)}` : "No actual receive date"}</small>
                </span>
                <span>
                  <i className={`status ${row.risk.tone}`}>{row.risk.level}</i>
                </span>
                <span className="row-actions">
                  <button onClick={() => startEditDelivery(row)}>Edit</button>
                  <button onClick={() => deleteDelivery(row.id)}>Delete</button>
                </span>
              </div>
            ))
          ) : (
            <div className="empty-state table-empty">No deliveries match the current project and filters. Click Add delivery or adjust the search and category.</div>
          )}
        </div>
      </section>
    </>
  );
}
