import { SyncStatusChip } from "@/components/workbench/sync-status";
import type { Workbench } from "@/hooks/useWorkbench";

type WorkbenchHeaderProps = {
  wb: Workbench;
};

export function WorkbenchHeader({ wb }: WorkbenchHeaderProps) {
  const { projectList, activeWorkspace, setActiveWorkspace, activeProject, startAddProject, startEditProject, startAddDelivery, deleteProject, exportCsv, importCsv, importNcrCsv } = wb;

  return (
    <header className="im-header">
      <div className="tower-accent" aria-hidden="true">
        <span />
        <i />
        <b />
      </div>
      <div>
        <p className="eyebrow">Internal Mounting Delivery Schedule</p>
        <div className="header-title-row">
          <h1>{activeProject.name}</h1>
          <span className="company-chip">CSWind America</span>
          <SyncStatusChip wb={wb} />
        </div>
        <nav className="workspace-tabs" aria-label="Workbench sections">
          <button className={activeWorkspace === "overview" ? "workspace-tab active" : "workspace-tab"} onClick={() => setActiveWorkspace("overview")}>Overview</button>
          <button className={activeWorkspace === "delivery" ? "workspace-tab active" : "workspace-tab"} onClick={() => setActiveWorkspace("delivery")}>Delivery</button>
          <button className={activeWorkspace === "supplier" ? "workspace-tab active" : "workspace-tab"} onClick={() => setActiveWorkspace("supplier")}>Supplier Schedule</button>
          <button className={activeWorkspace === "mcip" ? "workspace-tab active" : "workspace-tab"} onClick={() => setActiveWorkspace("mcip")}>MCIP</button>
          <button className={activeWorkspace === "cashflow" ? "workspace-tab active" : "workspace-tab"} onClick={() => setActiveWorkspace("cashflow")}>Cashflow</button>
          <button className={activeWorkspace === "logistics" ? "workspace-tab active" : "workspace-tab"} onClick={() => setActiveWorkspace("logistics")}>Logistics</button>
          <button className={activeWorkspace === "bom" ? "workspace-tab active" : "workspace-tab"} onClick={() => setActiveWorkspace("bom")}>BOM</button>
          <button className={activeWorkspace === "ncr" ? "workspace-tab active" : "workspace-tab"} onClick={() => setActiveWorkspace("ncr")}>NCR</button>
          <button className={activeWorkspace === "ecn" ? "workspace-tab active" : "workspace-tab"} onClick={() => setActiveWorkspace("ecn")}>ECN</button>
        </nav>
        <span>{activeProject.code} · {activeProject.phase} · {activeProject.plant}</span>
      </div>
      <div className="header-actions">
        {activeWorkspace === "overview" ? (
          <>
            <button className="secondary-action" onClick={startAddProject}>Add project</button>
            <button className="secondary-action" onClick={() => startEditProject(activeProject)}>Edit project</button>
            <button className="danger-action" disabled={projectList.length <= 1} onClick={() => deleteProject(activeProject.id)}>Delete project</button>
          </>
        ) : null}
        {activeWorkspace === "delivery" ? (
          <>
            <button className="secondary-action" title="Export schedule" aria-label="Export schedule" onClick={exportCsv}>Export</button>
            <label className="file-action">
              Import delivery
              <input accept=".csv,text/csv" aria-label="Import delivery CSV" onChange={importCsv} type="file" />
            </label>
            <button className="primary-action" onClick={startAddDelivery}>Add delivery</button>
          </>
        ) : null}
        {activeWorkspace === "ncr" ? (
          <label className="file-action">
            Import NCR
            <input accept=".csv,text/csv" aria-label="Import NCR CSV" onChange={importNcrCsv} type="file" />
          </label>
        ) : null}
      </div>
    </header>
  );
}
