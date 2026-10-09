import { formatScheduleWeek } from "@/lib/dates";
import { getDeliveryCategory, getIncotermMode, getProjectedTotalCost, usesSupplierEta } from "@/lib/delivery";
import { formatMoney, getStatusTone } from "@/lib/format";
import type { Workbench } from "@/hooks/useWorkbench";

type DeliveryPortfolioProps = {
  wb: Workbench;
};

export function DeliveryPortfolio({ wb }: DeliveryPortfolioProps) {
  const { projectList, bomItems, deliveryProjectFilter, setDeliveryProjectFilter, deliveryManufacturerFilter, setDeliveryManufacturerFilter, deliveryCategoryFilter, setDeliveryCategoryFilter, deliveryPoFilter, setDeliveryPoFilter, deliveryStatusFilter, setDeliveryStatusFilter, deliverySearch, setDeliverySearch, deliverySort, setDeliverySort, activeWorkspace, rowsWithRisk, deliveryManufacturers, deliveryCategories, deliveryPos, totalDeliveryRows, totalDeliveryRiskCount, totalDeliveryOpenCount, totalDeliveryArrivedCount, deleteDelivery } = wb;

  return (
    <section className="portfolio-delivery-panel" hidden={activeWorkspace !== "delivery"}>
      <div className="panel-header">
        <div>
          <h2>Total Delivery Table</h2>
        </div>
        <div className="filters smart-filters">
          <select aria-label="Delivery project filter" value={deliveryProjectFilter} onChange={(event) => setDeliveryProjectFilter(event.target.value)}>
            <option value="All">All projects</option>
            {projectList.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
          <select aria-label="Delivery manufacturer filter" value={deliveryManufacturerFilter} onChange={(event) => setDeliveryManufacturerFilter(event.target.value)}>
            {deliveryManufacturers.map((manufacturer) => (
              <option key={manufacturer} value={manufacturer}>{manufacturer === "All" ? "All manufacturers" : manufacturer}</option>
            ))}
          </select>
          <select aria-label="Delivery category filter" value={deliveryCategoryFilter} onChange={(event) => setDeliveryCategoryFilter(event.target.value)}>
            {deliveryCategories.map((categoryName) => (
              <option key={categoryName} value={categoryName}>{categoryName === "All" ? "All categories" : categoryName}</option>
            ))}
          </select>
          <select aria-label="Delivery PO filter" value={deliveryPoFilter} onChange={(event) => setDeliveryPoFilter(event.target.value)}>
            {deliveryPos.map((po) => (
              <option key={po} value={po}>{po === "All" ? "All PO" : po}</option>
            ))}
          </select>
          <select aria-label="Delivery status filter" value={deliveryStatusFilter} onChange={(event) => setDeliveryStatusFilter(event.target.value)}>
            <option value="All">All status</option>
            <option>Risk</option>
            <option>Open</option>
            <option>Customs cleared</option>
            <option>Arrived</option>
          </select>
          <input
            aria-label="Search delivery table"
            placeholder="Search PO / batch / vendor"
            value={deliverySearch}
            onChange={(event) => setDeliverySearch(event.target.value)}
          />
          <select aria-label="Delivery sort" value={deliverySort} onChange={(event) => setDeliverySort(event.target.value)}>
            <option value="risk">Sort by risk</option>
            <option value="etaAsc">Sort by ETA</option>
            <option value="project">Sort by project</option>
            <option value="manufacturer">Sort by manufacturer</option>
            <option value="category">Sort by category</option>
            <option value="po">Sort by PO</option>
          </select>
        </div>
      </div>
      <div className="table-kpis">
        <article><span>Visible batches</span><strong>{totalDeliveryRows.length}</strong></article>
        <article><span>Risk</span><strong>{totalDeliveryRiskCount}</strong></article>
        <article><span>Open</span><strong>{totalDeliveryOpenCount}</strong></article>
        <article><span>Arrived</span><strong>{totalDeliveryArrivedCount}</strong></article>
      </div>
      <div className="report-table">
        <div className="report-row portfolio-delivery-row report-head">
          <span>Project</span>
          <span>PO / Batch</span>
          <span>Manufacturer</span>
          <span>Category</span>
          <span>Status</span>
          <span>Pickup / ETA</span>
          <span>Need</span>
          <span>Cost</span>
          <span>Mode</span>
          <span>Action</span>
        </div>
        {totalDeliveryRows.length ? (
          totalDeliveryRows.map((row) => (
            <div className="report-row portfolio-delivery-row" key={`portfolio-${row.id}`}>
              <span>
                <strong>{row.projectCode}</strong>
                <small>{row.projectName} · {row.projectStatus}</small>
              </span>
              <span>
                <strong>{row.po}</strong>
                <small>Batch {row.batch}</small>
              </span>
              <span>{row.manufacturer}</span>
              <span>{getDeliveryCategory(row)}</span>
              <span><i className={`status-chip ${getStatusTone(row.deliveryStatus)}`}>{row.deliveryStatus}</i></span>
              <span>
                <strong>{formatScheduleWeek(row.supplierSchedule)}</strong>
                <small>{usesSupplierEta(row) ? "Supplier ETA" : `ETA ${formatScheduleWeek(row.risk.theoreticalDelivery)}`}</small>
              </span>
              <span>{formatScheduleWeek(row.productionNeed)}</span>
              <span>{formatMoney(getProjectedTotalCost(row, bomItems, rowsWithRisk))}</span>
              <span>
                <strong>{row.deliveryWay}</strong>
                <small>{getIncotermMode(row)}</small>
              </span>
              <span className="row-actions">
                <button onClick={() => deleteDelivery(row.id)}>Delete</button>
              </span>
            </div>
          ))
        ) : (
          <div className="empty-state report-empty">No deliveries match the current filters.</div>
        )}
      </div>
    </section>
  );
}
