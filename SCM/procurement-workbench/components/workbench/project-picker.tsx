import { isProjectScoped, navItem } from "@/components/workbench/navigation";
import type { Workbench } from "@/hooks/useWorkbench";
import { getProjectStatus, getStatusTone } from "@/lib/format";

type ProjectPickerProps = {
  wb: Workbench;
};

/** Shown instead of a one-project section while "All projects" is selected. */
export function ProjectPicker({ wb }: ProjectPickerProps) {
  const { projectList, activeWorkspace, projectScope, selectProject, rowsWithRisk } = wb;
  if (projectScope !== "all" || !isProjectScoped(activeWorkspace)) return null;

  return (
    <section className="project-picker" aria-labelledby="project-picker-title">
      <h2 id="project-picker-title">Choose a project for {navItem(activeWorkspace).label}</h2>
      <p>This section works on one project at a time. You can also pick one from Project at the top.</p>
      <div className="project-picker-grid">
        {projectList.map((project) => {
          const rows = rowsWithRisk.filter((row) => row.projectId === project.id);
          const atRisk = rows.filter((row) => row.risk.score >= 3).length;
          const status = getProjectStatus(project);
          return (
            <button type="button" className="project-card" key={project.id} onClick={() => selectProject(project.id)}>
              <span className="project-card-head">
                <strong>{project.name}</strong>
                <em className={`project-status-pill ${getStatusTone(status)}`}>{status}</em>
              </span>
              <small>
                {project.code} · {project.phase}
              </small>
              <small>{project.productionWindow}</small>
              <span className="project-card-counts">
                {rows.length} deliveries{atRisk ? <b> · {atRisk} at risk</b> : null}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
