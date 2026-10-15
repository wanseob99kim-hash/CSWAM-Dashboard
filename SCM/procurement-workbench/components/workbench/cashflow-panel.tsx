import { getCashflowLinePath, getCashflowX, getCashflowY } from "@/lib/cashflow";
import { getMonthLabel, monthKeyToDate } from "@/lib/dates";
import { formatCompactMoney, formatMoney } from "@/lib/format";
import type { Workbench } from "@/hooks/useWorkbench";

type CashflowPanelProps = {
  wb: Workbench;
};

export function CashflowPanel({ wb }: CashflowPanelProps) {
  const { activeWorkspace, cashflowForecastRows, cashflowMonthKeys, cashflowProjectSeries, cashflowTotalValues, cashflowMonthlyRows, cashflowTotalAmount, cashflowNextPayMonth, cashflowChartWidth, cashflowChartHeight, cashflowMaxValue, cashflowPalette } = wb;

  return (
    <>
      <section className="zone-title cashflow-zone-title" aria-label="Cashflow section" hidden={activeWorkspace !== "cashflow"}>
        <h2>Cashflow</h2>
      </section>
      <section className="cashflow-panel" hidden={activeWorkspace !== "cashflow"}>
        <div className="panel-header">
          <div>
            <h2>Monthly Payment Forecast</h2>
          </div>
          <div className="filters">
          </div>
        </div>

        <div className="cashflow-summary">
          <article>
            <span>Forecast payable</span>
            <strong>{formatMoney(cashflowTotalAmount)}</strong>
          </article>
          <article>
            <span>Open forecast lines</span>
            <strong>{cashflowForecastRows.length}</strong>
          </article>
          <article>
            <span>Next pay month</span>
            <strong>{cashflowNextPayMonth}</strong>
          </article>
          <article>
            <span>Projects in forecast</span>
            <strong>{cashflowProjectSeries.length}</strong>
          </article>
        </div>

        <div className="cashflow-chart-card">
          <div className="section-title compact-title">
            <h2>Payment Curve</h2>
          </div>
          <div className="cashflow-chart-wrap">
            <svg className="cashflow-chart" role="img" viewBox={`0 0 ${cashflowChartWidth} ${cashflowChartHeight}`}>
              {[0, 0.25, 0.5, 0.75, 1].map((step) => {
                const value = cashflowMaxValue * step;
                const y = getCashflowY(value, cashflowMaxValue, cashflowChartHeight);
                return (
                  <g key={`grid-${step}`}>
                    <line className="cashflow-gridline" x1="58" x2={cashflowChartWidth - 20} y1={y} y2={y} />
                    <text className="cashflow-y-label" x="48" y={y + 4}>{formatCompactMoney(value)}</text>
                  </g>
                );
              })}
              {cashflowMonthKeys.map((monthKey, index) => {
                const x = getCashflowX(index, cashflowMonthKeys.length, cashflowChartWidth);
                const labelStep = cashflowMonthKeys.length > 8 ? 2 : 1;
                return index % labelStep === 0 ? (
                  <text className="cashflow-x-label" key={`label-${monthKey}`} x={x} y={cashflowChartHeight - 10}>{getMonthLabel(monthKeyToDate(monthKey))}</text>
                ) : null;
              })}
              <path className="cashflow-total-line" d={getCashflowLinePath(cashflowTotalValues, cashflowMaxValue, cashflowChartWidth, cashflowChartHeight)} />
              {cashflowProjectSeries.map((series, index) => (
                <path
                  className="cashflow-project-line"
                  d={getCashflowLinePath(series.values, cashflowMaxValue, cashflowChartWidth, cashflowChartHeight)}
                  key={series.project.id}
                  style={{ stroke: cashflowPalette[index % cashflowPalette.length] }}
                />
              ))}
            </svg>
          </div>
          <div className="cashflow-legend">
            <span><i className="total-dot" />Total</span>
            {cashflowProjectSeries.map((series, index) => (
              <span key={`legend-${series.project.id}`}>
                <i style={{ background: cashflowPalette[index % cashflowPalette.length] }} />
                {series.project.code}
              </span>
            ))}
          </div>
        </div>

        <div className="cashflow-grid">
          <div className="cashflow-card">
            <div className="section-title compact-title">
              <h2>Monthly Report</h2>
            </div>
            <div className="cashflow-table">
              <div className="cashflow-row cashflow-month-row cashflow-head">
                <span>Pay month</span>
                <span>Total</span>
                <span>Project split</span>
              </div>
              {cashflowMonthlyRows.some((row) => row.total > 0) ? (
                cashflowMonthlyRows
                  .filter((row) => row.total > 0)
                  .map((row) => (
                    <div className="cashflow-row cashflow-month-row" key={row.monthKey}>
                      <span><strong>{row.month}</strong></span>
                      <span>{formatMoney(row.total)}</span>
                      <span className="cashflow-chipline">
                        {row.projectValues
                          .filter((item) => item.amount > 0)
                          .map((item) => (
                            <i key={`${row.monthKey}-${item.project.id}`}>{item.project.code}: {formatMoney(item.amount)}</i>
                          ))}
                      </span>
                    </div>
                  ))
              ) : (
                <div className="empty-state cashflow-empty">No open invoice forecast.</div>
              )}
            </div>
          </div>

          <div className="cashflow-card">
            <div className="section-title compact-title">
              <h2>PO / Batch Forecast Detail</h2>
            </div>
            <div className="cashflow-table">
              <div className="cashflow-row cashflow-detail-row cashflow-head">
                <span>PO</span>
                <span>IM</span>
                <span>Payment terms</span>
                <span>Manufacturer</span>
                <span>Batch</span>
                <span>Invoice month</span>
                <span>Pay month</span>
                <span>Material</span>
                <span>Freight</span>
                <span>Tariff</span>
                <span>Total</span>
              </div>
              {cashflowForecastRows.length ? (
                cashflowForecastRows.map((row) => (
                  <div className="cashflow-row cashflow-detail-row" key={`cashflow-${row.id}`}>
                    <span><strong>{row.po}</strong></span>
                    <span>
                      <strong>{row.projectCode}</strong>
                      <small>{row.projectName}</small>
                    </span>
                    <span>
                      <strong>{row.paymentTerms}</strong>
                      <small>{row.paymentDays} days</small>
                    </span>
                    <span>{row.manufacturer}</span>
                    <span>
                      <strong>{row.batch}</strong>
                      <small>{row.invoiceBasis}</small>
                    </span>
                    <span>{row.invoiceMonth}</span>
                    <span>{row.payMonth}</span>
                    <span>{row.materialAmount > 0 ? formatMoney(row.materialAmount) : "Received"}</span>
                    <span>{row.freightAmount > 0 ? formatMoney(row.freightAmount) : "Received"}</span>
                    <span>{row.tariffAmount > 0 ? formatMoney(row.tariffAmount) : "Received"}</span>
                    <span><strong>{formatMoney(row.amount)}</strong></span>
                  </div>
                ))
              ) : (
                <div className="empty-state cashflow-detail-empty">All matching invoice components are already received.</div>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
