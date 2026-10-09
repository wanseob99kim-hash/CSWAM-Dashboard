import { formatDays } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import type { Workbench } from "@/hooks/useWorkbench";

type LogisticsPanelProps = {
  wb: Workbench;
};

export function LogisticsPanel({ wb }: LogisticsPanelProps) {
  const { projectList, reportProjectId, setReportProjectId, reportWindow, setReportWindow, activeWorkspace, freightTariffStats, oceanLeadStats } = wb;

  return (
    <>
      <section className="zone-title logistics-zone-title" aria-label="Logistics section" hidden={activeWorkspace !== "logistics"}>
        <h2>Logistics</h2>
      </section>
      <section className="report-panel" hidden={activeWorkspace !== "logistics"}>
        <div className="panel-header">
          <div>
            <h2>Logistics</h2>
          </div>
          <div className="filters">
            <select aria-label="Report project" value={reportProjectId} onChange={(event) => setReportProjectId(event.target.value)}>
              <option value="All">All projects</option>
              {projectList.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
            <select aria-label="Report time window" value={reportWindow} onChange={(event) => setReportWindow(event.target.value)}>
              <option value="All">All time</option>
              <option value="30">Next 30 days</option>
              <option value="60">Next 60 days</option>
              <option value="90">Next 90 days</option>
            </select>
          </div>
        </div>

        <div className="report-grid">
          <div className="report-card">
            <div className="section-title compact-title">
              <h2>Tariff & Freight</h2>
            </div>
            <div className="report-table">
              <div className="report-row freight-report-row report-head">
                <span>Project / Supplier</span>
                <span>Category</span>
                <span>Shipments</span>
                <span>Freight</span>
                <span>Tariff</span>
                <span>Total logistics</span>
              </div>
              {freightTariffStats.length ? (
                freightTariffStats.map((item) => (
                  <div className="report-row freight-report-row" key={item.key}>
                    <span>
                      <strong>{item.projectName}</strong>
                      <small>{item.manufacturer}</small>
                    </span>
                    <span>{item.category}</span>
                    <span>{item.count} <small>{item.seaCount} sea / {item.airCount} air</small></span>
                    <span>{formatMoney(item.freight)}</span>
                    <span>{formatMoney(item.tariff)}</span>
                    <span>{formatMoney(item.freight + item.tariff)}</span>
                  </div>
                ))
              ) : (
                <div className="empty-state report-empty">No freight or tariff data in the current filter.</div>
              )}
            </div>
          </div>

          <div className="report-card">
            <div className="section-title compact-title">
              <h2>Ocean Lead Time</h2>
            </div>
            <div className="report-table">
              <div className="report-row ocean-report-row report-head">
                <span>Origin country</span>
                <span>Port</span>
                <span>Sea shipments</span>
                <span>PO → pickup</span>
                <span>Pickup → actual arrival</span>
              </div>
              {oceanLeadStats.length ? (
                oceanLeadStats.map((item) => (
                  <div className="report-row ocean-report-row" key={item.key}>
                    <span><strong>{item.country}</strong></span>
                    <span>{item.port}</span>
                    <span>{item.count}</span>
                    <span>{formatDays(item.avgPoToSupplier)}</span>
                    <span>{formatDays(item.avgSupplierToCompany)}</span>
                  </div>
                ))
              ) : (
                <div className="empty-state report-empty">No ocean shipments in the current filter.</div>
              )}
            </div>
          </div>

        </div>
      </section>
    </>
  );
}
