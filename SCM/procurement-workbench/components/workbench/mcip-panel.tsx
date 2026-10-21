import { formatMoney, formatPercent, getProjectStatus, getStatusTone } from "@/lib/format";
import { projectStatuses } from "@/lib/seed-data";
import type { Workbench } from "@/hooks/useWorkbench";

type McipPanelProps = {
  wb: Workbench;
};

export function McipPanel({ wb }: McipPanelProps) {
  const { mcipStatusFilter, setMcipStatusFilter, mcipSort, setMcipSort, activeWorkspace, mcipVisibleRows, mcipTotals, mcipTotalPerTowerDap, mcipTotalPerTowerDdp, mcipTotalPercent } = wb;

  return (
    <>
      <section className="zone-title mcip-zone-title" aria-label="MCIP section" hidden={activeWorkspace !== "mcip"}>
        <h2>MCIP</h2>
      </section>
      <section className="mcip-panel" hidden={activeWorkspace !== "mcip"}>
        <div className="panel-header">
          <div>
            <h2>Portfolio Budget Forecast</h2>
            <p className="plan-subtitle">
              Budget: typed on the project, else Sales Pipeline material price per section (plate, door frame, flange, welding bracket, internal, with handling;
              paint excluded) × sections. Material cost: delivery records, else SAP BOM per tower × towers.
            </p>
          </div>
          <div className="filters smart-filters">
            <select aria-label="MCIP status filter" value={mcipStatusFilter} onChange={(event) => setMcipStatusFilter(event.target.value)}>
              <option value="All">All status</option>
              {projectStatuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
            <select aria-label="MCIP sort" value={mcipSort} onChange={(event) => setMcipSort(event.target.value)}>
              <option value="mcipAsc">Lowest MCIP first</option>
              <option value="mcipDesc">Highest MCIP first</option>
              <option value="costDesc">Highest cost first</option>
              <option value="budgetDesc">Highest budget first</option>
              <option value="project">Sort by project</option>
            </select>
          </div>
        </div>
        <div className="mcip-summary">
          <article>
            <span>Total budget</span>
            <strong>{formatMoney(mcipTotals.budget)}</strong>
          </article>
          <article>
            <span>Total cost</span>
            <strong>{formatMoney(mcipTotals.forecastCost)}</strong>
          </article>
          <article>
            <span>MCIP amount</span>
            <strong>{formatMoney(mcipTotals.mcipAmount)}</strong>
          </article>
          <article>
            <span>MCIP / tower (DAP)</span>
            <strong>{formatMoney(mcipTotalPerTowerDap)}</strong>
          </article>
          <article>
            <span>MCIP / tower (DDP)</span>
            <strong>{formatMoney(mcipTotalPerTowerDdp)}</strong>
          </article>
          <article>
            <span>MCIP (%)</span>
            <strong>{formatPercent(mcipTotalPercent)}</strong>
          </article>
        </div>
        <div className="report-table">
          <div className="report-row mcip-row report-head">
            <span>Project</span>
            <span>Status</span>
            <span>Budget</span>
            <span>Total cost</span>
            <span>MCIP amount</span>
            <span>MCIP / tower (DAP)</span>
            <span>MCIP / tower (DDP)</span>
            <span>MCIP (%)</span>
            <span>Material cost</span>
            <span>Logistics</span>
            <span>Tariff</span>
            <span>NCR cost</span>
          </div>
          {mcipVisibleRows.map((item) => (
            <div className="report-row mcip-row" key={item.project.id}>
              <span>
                <strong>{item.project.name}</strong>
                <small>{item.project.code} · {item.project.phase}</small>
              </span>
              <span><i className={`status-chip ${getStatusTone(getProjectStatus(item.project))}`}>{getProjectStatus(item.project)}</i></span>
              <span>
                <strong>{formatMoney(item.budget)}</strong>
                <small>
                  {item.budgetSource === "manual" ? "typed on project" : item.budgetSource === "pipeline" ? `Sales Pipeline · ${item.pipelineProject}` : "no budget yet"}
                </small>
              </span>
              <span>{formatMoney(item.forecastCost)}</span>
              <span><i className={item.mcipAmount >= 0 ? "check yes" : "check no"}>{formatMoney(item.mcipAmount)}</i></span>
              <span>
                <strong>{formatMoney(item.mcipPerTowerDap)}</strong>
                <small>{item.towerQty.toLocaleString()} towers</small>
              </span>
              <span>
                <strong>{formatMoney(item.mcipPerTowerDdp)}</strong>
                <small>{item.towerQty.toLocaleString()} towers</small>
              </span>
              <span>{formatPercent(item.mcipPercent)}</span>
              <span>
                <strong>{formatMoney(item.materialCost)}</strong>
                <small>{item.materialSource === "sap-bom" ? "SAP BOM × towers" : item.materialSource === "deliveries" ? "delivery records" : "no BOM or deliveries"}</small>
              </span>
              <span>{formatMoney(item.logisticsCost)}</span>
              <span>{formatMoney(item.tariffCost)}</span>
              <span>{formatMoney(item.ncrCost)}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
