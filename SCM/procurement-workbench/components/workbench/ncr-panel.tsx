import { formatShortDate } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import type { Workbench } from "@/hooks/useWorkbench";

type NcrPanelProps = {
  wb: Workbench;
};

export function NcrPanel({ wb }: NcrPanelProps) {
  const { ncrTypeFilter, setNcrTypeFilter, ncrStatusFilter, setNcrStatusFilter, ncrSort, setNcrSort, activeWorkspace, supplierNcrDraft, setSupplierNcrDraft, internalNcrDraft, setInternalNcrDraft, activeProject, projectSupplierNcrs, projectInternalNcrs, ncrReportSummary, ncrVisibleRows, importNcrCsv, saveSupplierNcr, deleteSupplierNcr, saveInternalNcr, deleteInternalNcr, projectScope } = wb;

  return (
    <>
      <section className="zone-title ncr-zone-title" aria-label="NCR section" hidden={activeWorkspace !== "ncr"}>
        <h2>NCR</h2>
      </section>
      <section className="ncr-panel ncr-total-panel" hidden={activeWorkspace !== "ncr"}>
        <div className="panel-header">
          <div>
            <h2>Total NCR Preview</h2>
          </div>
          <div className="filters smart-filters">
            <select aria-label="NCR type filter" value={ncrTypeFilter} onChange={(event) => setNcrTypeFilter(event.target.value)}>
              <option value="All">All types</option>
              <option>Supplier</option>
              <option>Internal</option>
            </select>
            <select aria-label="NCR status filter" value={ncrStatusFilter} onChange={(event) => setNcrStatusFilter(event.target.value)}>
              <option value="All">All status</option>
              <option>Open</option>
              <option>Received</option>
            </select>
            <select aria-label="NCR sort" value={ncrSort} onChange={(event) => setNcrSort(event.target.value)}>
              <option value="status">Sort by status</option>
              <option value="project">Sort by project</option>
              <option value="costDesc">Highest cost first</option>
              <option value="etaAsc">ETA first</option>
              <option value="number">Sort by NCR number</option>
            </select>
            <label className="file-action">
              Import NCR
              <input accept=".csv,text/csv" aria-label="Import total NCR CSV" onChange={importNcrCsv} type="file" />
            </label>
          </div>
        </div>
        <div className="ncr-table">
          <div className="ncr-row ncr-total-row ncr-head">
            <span>Project</span>
            <span>Type</span>
            <span>NCR number</span>
            <span>Material</span>
            <span>Qty</span>
            <span>Status</span>
            <span>Cost</span>
            <span>ETA</span>
          </div>
          {ncrVisibleRows.length ? (
            ncrVisibleRows.map((item) => (
              <div className="ncr-row ncr-total-row" key={item.id}>
                <span><strong>{item.projectName}</strong></span>
                <span>{item.type}</span>
                <span>{item.ncrNumber}</span>
                <span>{item.material || "-"}</span>
                <span>{item.qty.toLocaleString()}</span>
                <span><i className={item.status === "Received" ? "check yes" : "check no"}>{item.status}</i></span>
                <span>{item.cost === null ? "-" : formatMoney(item.cost)}</span>
                <span>{item.eta ? formatShortDate(item.eta) : "-"}</span>
              </div>
            ))
          ) : (
            <div className="empty-state ncr-empty">No NCR records match the current filters.</div>
          )}
        </div>
      </section>
      <p className="scope-hint" hidden={activeWorkspace !== "ncr" || projectScope !== "all"}>
        Choose a project at the top to log or update supplier and internal NCRs.
      </p>
      <section className="ncr-panel ncr-report-panel" hidden={activeWorkspace !== "ncr"}>
        <div className="panel-header">
          <div>
            <h2>NCR Report</h2>
          </div>
        </div>
        <div className="report-table">
          <div className="report-row ncr-report-row report-head">
            <span>Project</span>
            <span>Supplier NCR</span>
            <span>Impact</span>
            <span>Replacement open</span>
            <span>Internal NCR</span>
            <span>Internal cost</span>
          </div>
          {ncrReportSummary.length ? (
            ncrReportSummary.map((item) => (
              <div className="report-row ncr-report-row" key={item.project.id}>
                <span>
                  <strong>{item.project.name}</strong>
                  <small>{item.project.code}</small>
                </span>
                <span>{item.supplierCount}</span>
                <span><i className={item.supplierImpact ? "check no" : "check yes"}>{item.supplierImpact}</i></span>
                <span>{item.replacementOpen}</span>
                <span>{item.internalCount} / {item.internalOpen} open</span>
                <span>{formatMoney(item.internalCost)}</span>
              </div>
            ))
          ) : (
            <div className="empty-state report-empty">No NCR records.</div>
          )}
        </div>
      </section>
      <section className="ncr-panel" hidden={activeWorkspace !== "ncr" || projectScope === "all"}>
        <div className="panel-header">
          <div>
            <h2>Supplier NCR</h2>
          </div>
        </div>
        <div className="form-grid ncr-form">
          <label>
            NCR number
            <input value={supplierNcrDraft.ncrNumber} onChange={(event) => setSupplierNcrDraft({ ...supplierNcrDraft, ncrNumber: event.target.value })} />
          </label>
          <label>
            Project name
            <input value={activeProject.name} readOnly />
          </label>
          <label>
            Material code
            <input value={supplierNcrDraft.materialCode} onChange={(event) => setSupplierNcrDraft({ ...supplierNcrDraft, materialCode: event.target.value })} />
          </label>
          <label>
            Category
            <input value={supplierNcrDraft.category} onChange={(event) => setSupplierNcrDraft({ ...supplierNcrDraft, category: event.target.value })} />
          </label>
          <label>
            Quantity
            <input type="number" value={supplierNcrDraft.qty} onChange={(event) => setSupplierNcrDraft({ ...supplierNcrDraft, qty: Number(event.target.value) })} />
          </label>
          <label className="toggle-label">
            <input checked={supplierNcrDraft.replacementReceived} type="checkbox" onChange={(event) => setSupplierNcrDraft({ ...supplierNcrDraft, replacementReceived: event.target.checked })} />
            Replacement received
          </label>
          <label className="toggle-label">
            <input checked={supplierNcrDraft.projectImpact} type="checkbox" onChange={(event) => setSupplierNcrDraft({ ...supplierNcrDraft, projectImpact: event.target.checked })} />
            Project impact
          </label>
          <div className="form-actions">
            <button className="primary-action" onClick={saveSupplierNcr}>Save supplier NCR</button>
          </div>
        </div>
        <div className="ncr-table">
          <div className="ncr-row supplier-ncr-row ncr-head">
            <span>NCR / Project</span>
            <span>Material</span>
            <span>Category</span>
            <span>Qty</span>
            <span>Replacement</span>
            <span>Impact</span>
            <span>Actions</span>
          </div>
          {projectSupplierNcrs.length ? (
            projectSupplierNcrs.map((item) => (
              <div className="ncr-row supplier-ncr-row" key={item.id}>
                <span>
                  <strong>{item.ncrNumber}</strong>
                  <small>{item.projectName}</small>
                </span>
                <span>{item.materialCode}</span>
                <span>{item.category || "-"}</span>
                <span>{item.qty.toLocaleString()}</span>
                <span><i className={item.replacementReceived ? "check yes" : "check no"}>{item.replacementReceived ? "Received" : "Open"}</i></span>
                <span><i className={item.projectImpact ? "check no" : "check yes"}>{item.projectImpact ? "Impact" : "No impact"}</i></span>
                <span className="row-actions"><button onClick={() => deleteSupplierNcr(item.id)}>Delete</button></span>
              </div>
            ))
          ) : (
            <div className="empty-state ncr-empty">No supplier NCRs yet. Supplier material issues entered above will appear here.</div>
          )}
        </div>
      </section>
      <section className="ncr-panel" hidden={activeWorkspace !== "ncr" || projectScope === "all"}>
        <div className="panel-header">
          <div>
            <h2>Internal NCR</h2>
          </div>
        </div>
        <div className="form-grid internal-ncr-form">
          <label>
            NCR number
            <input value={internalNcrDraft.ncrNumber} onChange={(event) => setInternalNcrDraft({ ...internalNcrDraft, ncrNumber: event.target.value })} />
          </label>
          <label>
            Material info
            <input value={internalNcrDraft.materialInfo} onChange={(event) => setInternalNcrDraft({ ...internalNcrDraft, materialInfo: event.target.value })} />
          </label>
          <label>
            Manufacturer
            <input value={internalNcrDraft.manufacturer} onChange={(event) => setInternalNcrDraft({ ...internalNcrDraft, manufacturer: event.target.value })} />
          </label>
          <label>
            Quantity
            <input type="number" value={internalNcrDraft.qty} onChange={(event) => setInternalNcrDraft({ ...internalNcrDraft, qty: Number(event.target.value) })} />
          </label>
          <label>
            Cost
            <input type="number" value={internalNcrDraft.cost} onChange={(event) => setInternalNcrDraft({ ...internalNcrDraft, cost: Number(event.target.value) })} />
          </label>
          <label>
            ETA
            <input type="date" value={internalNcrDraft.eta} onChange={(event) => setInternalNcrDraft({ ...internalNcrDraft, eta: event.target.value })} />
          </label>
          <label className="toggle-label">
            <input checked={internalNcrDraft.goodsReceived} type="checkbox" onChange={(event) => setInternalNcrDraft({ ...internalNcrDraft, goodsReceived: event.target.checked })} />
            Goods received
          </label>
          <div className="form-actions">
            <button className="primary-action" onClick={saveInternalNcr}>Save internal NCR</button>
          </div>
        </div>
        <div className="ncr-table">
          <div className="ncr-row internal-ncr-row ncr-head">
            <span>NCR number</span>
            <span>Material info</span>
            <span>Manufacturer</span>
            <span>Qty</span>
            <span>Cost</span>
            <span>ETA</span>
            <span>Receipt</span>
            <span>Actions</span>
          </div>
          {projectInternalNcrs.length ? (
            projectInternalNcrs.map((item) => (
              <div className="ncr-row internal-ncr-row" key={item.id}>
                <span><strong>{item.ncrNumber}</strong></span>
                <span>{item.materialInfo}</span>
                <span>{item.manufacturer || "-"}</span>
                <span>{item.qty.toLocaleString()}</span>
                <span>{formatMoney(item.cost)}</span>
                <span>{formatShortDate(item.eta)}</span>
                <span><i className={item.goodsReceived ? "check yes" : "check no"}>{item.goodsReceived ? "Received" : "Open"}</i></span>
                <span className="row-actions"><button onClick={() => deleteInternalNcr(item.id)}>Delete</button></span>
              </div>
            ))
          ) : (
            <div className="empty-state ncr-empty">No internal NCRs yet. Replenishments or reorders will show ETA, cost, and receipt status here.</div>
          )}
        </div>
      </section>
    </>
  );
}
