import { navItem } from "@/components/workbench/navigation";
import type { Workbench } from "@/hooks/useWorkbench";

type WorkbenchHeaderProps = {
  wb: Workbench;
};

/** Page title for the current section, the project scope it shows, and the section's actions. */
export function WorkbenchHeader({ wb }: WorkbenchHeaderProps) {
  const { projectList, activeWorkspace, activeProject, projectScope, startEditProject, startAddDelivery, deleteProject, exportCsv, importCsv, importNcrCsv } =
    wb;
  const item = navItem(activeWorkspace);
  const allProjects = projectScope === "all";
  const scopeLabel = allProjects ? `All ${projectList.length} projects` : `${activeProject.code} · ${activeProject.name}`;

  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{scopeLabel}</p>
        <h1>{item.label}</h1>
        <p className="page-description">{item.description}</p>
      </div>
      <div className="header-actions">
        {activeWorkspace === "overview" && !allProjects ? (
          <>
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
            <button
              className="primary-action"
              disabled={allProjects}
              title={allProjects ? "Choose a project first" : undefined}
              onClick={startAddDelivery}
            >
              Add delivery
            </button>
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
