import { dateInputToMidweekDate, formatInputMidweekDate, formatScheduleWeek } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import type { Workbench } from "@/hooks/useWorkbench";

type EcnPanelProps = {
  wb: Workbench;
};

export function EcnPanel({ wb }: EcnPanelProps) {
  const { projectList, ecnProjectFilter, setEcnProjectFilter, ecnStatusFilter, setEcnStatusFilter, ecnImpactFilter, setEcnImpactFilter, ecnSort, setEcnSort, activeWorkspace, ecnDraft, setEcnDraft, ecnVisibleRows, saveEcn, deleteEcn } = wb;

  return (
    <>
      <section className="zone-title ecn-zone-title" aria-label="ECN section" hidden={activeWorkspace !== "ecn"}>
        <h2>ECN</h2>
      </section>
      <section className="ecn-panel" hidden={activeWorkspace !== "ecn"}>
        <div className="panel-header">
          <div>
            <h2>ECN Record</h2>
          </div>
          <div className="filters smart-filters">
            <select aria-label="ECN project filter" value={ecnProjectFilter} onChange={(event) => setEcnProjectFilter(event.target.value)}>
              <option value="All">All projects</option>
              {projectList.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
            <select aria-label="ECN status filter" value={ecnStatusFilter} onChange={(event) => setEcnStatusFilter(event.target.value)}>
              <option value="All">All status</option>
              <option>Open</option>
              <option>Under review</option>
              <option>Approved</option>
              <option>Implemented</option>
              <option>Closed</option>
            </select>
            <select aria-label="ECN impact filter" value={ecnImpactFilter} onChange={(event) => setEcnImpactFilter(event.target.value)}>
              <option value="All">All impact</option>
              <option>No impact</option>
              <option>Cost impact</option>
              <option>Schedule impact</option>
              <option>Cost & schedule impact</option>
            </select>
            <select aria-label="ECN sort" value={ecnSort} onChange={(event) => setEcnSort(event.target.value)}>
              <option value="weekDesc">Newest week first</option>
              <option value="weekAsc">Oldest week first</option>
              <option value="costDesc">Highest cost first</option>
              <option value="status">Sort by status</option>
              <option value="project">Sort by project</option>
            </select>
          </div>
        </div>
        <div className="form-grid ecn-form">
          <label>
            ECN number
            <input value={ecnDraft.ecnNumber} onChange={(event) => setEcnDraft({ ...ecnDraft, ecnNumber: event.target.value })} />
          </label>
          <label>
            Title
            <input value={ecnDraft.title} onChange={(event) => setEcnDraft({ ...ecnDraft, title: event.target.value })} />
          </label>
          <label>
            Category
            <input value={ecnDraft.category} onChange={(event) => setEcnDraft({ ...ecnDraft, category: event.target.value })} />
          </label>
          <label>
            Manufacturer
            <input value={ecnDraft.manufacturer} onChange={(event) => setEcnDraft({ ...ecnDraft, manufacturer: event.target.value })} />
          </label>
          <label>
            Status
            <select value={ecnDraft.status} onChange={(event) => setEcnDraft({ ...ecnDraft, status: event.target.value })}>
              <option>Open</option>
              <option>Under review</option>
              <option>Approved</option>
              <option>Implemented</option>
              <option>Closed</option>
            </select>
          </label>
          <label>
            Impact
            <select value={ecnDraft.impact} onChange={(event) => setEcnDraft({ ...ecnDraft, impact: event.target.value })}>
              <option>No impact</option>
              <option>Cost impact</option>
              <option>Schedule impact</option>
              <option>Cost & schedule impact</option>
            </select>
          </label>
          <label>
            Effective week
            <input type="date" value={formatInputMidweekDate(ecnDraft.effectiveWeek)} onChange={(event) => setEcnDraft({ ...ecnDraft, effectiveWeek: dateInputToMidweekDate(event.target.value, ecnDraft.effectiveWeek) })} />
          </label>
          <label>
            Cost impact
            <input type="number" value={ecnDraft.costImpact} onChange={(event) => setEcnDraft({ ...ecnDraft, costImpact: Number(event.target.value) })} />
          </label>
          <label className="wide-label">
            Notes
            <input value={ecnDraft.notes} onChange={(event) => setEcnDraft({ ...ecnDraft, notes: event.target.value })} />
          </label>
          <div className="form-actions">
            <button className="primary-action" onClick={saveEcn}>Save ECN</button>
          </div>
        </div>
        <div className="ecn-table">
          <div className="ecn-row ecn-head">
            <span>Project</span>
            <span>ECN</span>
            <span>Category / Manufacturer</span>
            <span>Status</span>
            <span>Impact</span>
            <span>Effective week</span>
            <span>Cost impact</span>
            <span>Notes</span>
            <span>Actions</span>
          </div>
          {ecnVisibleRows.length ? (
            ecnVisibleRows.map((item) => (
              <div className="ecn-row" key={item.id}>
                <span>
                  <strong>{item.projectCode}</strong>
                  <small>{item.projectName}</small>
                </span>
                <span>
                  <strong>{item.ecnNumber}</strong>
                  <small>{item.title}</small>
                </span>
                <span>
                  <strong>{item.category || "-"}</strong>
                  <small>{item.manufacturer || "-"}</small>
                </span>
                <span><i className={item.status === "Closed" || item.status === "Implemented" ? "check yes" : "check no"}>{item.status}</i></span>
                <span>{item.impact}</span>
                <span>{formatScheduleWeek(item.effectiveWeek)}</span>
                <span>{formatMoney(item.costImpact)}</span>
                <span>{item.notes || "-"}</span>
                <span className="row-actions"><button onClick={() => deleteEcn(item.id)}>Delete</button></span>
              </div>
            ))
          ) : (
            <div className="empty-state ecn-empty">No ECN records match the current filters.</div>
          )}
        </div>
      </section>
    </>
  );
}
