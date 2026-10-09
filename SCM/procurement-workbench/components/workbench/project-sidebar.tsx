import { createEcnDraft, createInternalNcrDraft, createSupplierNcrDraft, createTodoDraft } from "@/lib/drafts";
import { getProjectStatus, getStatusTone } from "@/lib/format";
import type { Workbench } from "@/hooks/useWorkbench";

type ProjectSidebarProps = {
  wb: Workbench;
};

export function ProjectSidebar({ wb }: ProjectSidebarProps) {
  const { projectList, setActiveProjectId, setCategory, setQuery, setSupplierPoFilter, setSupplierNcrDraft, setInternalNcrDraft, setEcnDraft, setTodoDraft, rowsWithRisk, activeProject } = wb;

  return (
    <aside className="project-sidebar" aria-label="Project navigation">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <span className="tower-mini">
            <i />
            <b />
            <em />
          </span>
        </span>
        <div>
          <strong>CSWind America</strong>
          <small>Wind tower procurement</small>
        </div>
      </div>
      <nav className="project-nav">
        {projectList.map((project) => {
          const count = rowsWithRisk.filter((row) => row.projectId === project.id).length;
          const riskCount = rowsWithRisk.filter((row) => row.projectId === project.id && row.risk.score >= 3).length;
          return (
            <button
              className={project.id === activeProject.id ? "project-button active" : "project-button"}
              key={project.id}
              onClick={() => {
                setActiveProjectId(project.id);
                setSupplierNcrDraft(createSupplierNcrDraft(project));
                setInternalNcrDraft(createInternalNcrDraft(project.id));
                setEcnDraft(createEcnDraft(project.id));
                setTodoDraft(createTodoDraft(project.id));
                setSupplierPoFilter("");
                setCategory("All");
                setQuery("");
              }}
            >
              <span>
                <strong>{project.name}</strong>
                <small>{project.code} · {project.phase}</small>
                <em className={`project-status-pill ${getStatusTone(getProjectStatus(project))}`}>{getProjectStatus(project)}</em>
              </span>
              <i>{riskCount}/{count}</i>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
