import { SyncStatusChip } from "@/components/workbench/sync-status";
import type { Workbench } from "@/hooks/useWorkbench";
import { getProjectStatus } from "@/lib/format";
import { describeMppFile } from "@/lib/mpp/read-workbook";
import type { Project } from "@/lib/types";

type TopBarProps = {
  wb: Workbench;
};

const STATUS_ORDER = ["Active", "Planning", "Watch", "On hold", "Complete"];

function groupByStatus(projects: Project[]): Array<[string, Project[]]> {
  const groups = new Map<string, Project[]>();
  for (const project of projects) {
    const status = getProjectStatus(project);
    groups.set(status, [...(groups.get(status) ?? []), project]);
  }
  return [...groups.entries()].sort(([left], [right]) => STATUS_ORDER.indexOf(left) - STATUS_ORDER.indexOf(right));
}

/** Project scope for every section, plus what the workspace is built from (MPP revision, save state). */
export function TopBar({ wb }: TopBarProps) {
  const { projectList, projectScope, selectProject, startAddProject, setActiveWorkspace, materialPlan } = wb;
  const selected = projectScope === "all" ? null : projectList.find((project) => project.id === projectScope) ?? null;
  const { state: plan, weekOptions, selectedFileId, selectPlanFile, viewingOlder } = materialPlan;

  return (
    <header className="app-topbar">
      <div className="scope-picker">
        <label htmlFor="project-scope">Project</label>
        <select id="project-scope" value={projectScope} onChange={(event) => selectProject(event.target.value)}>
          <option value="all">All projects ({projectList.length})</option>
          {groupByStatus(projectList).map(([status, projects]) => (
            <optgroup key={status} label={status}>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.code} · {project.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {selected ? (
          <span className="scope-meta">
            {selected.phase} · {selected.productionWindow}
          </span>
        ) : null}
        <button
          type="button"
          className="secondary-action"
          onClick={() => {
            setActiveWorkspace("overview");
            startAddProject();
          }}
        >
          Add project
        </button>
      </div>
      <div className="topbar-status">
        {weekOptions.length ? (
          <label className="mpp-picker" data-older={viewingOlder || undefined} title={plan.kind === "ready" ? `Production plan: ${plan.file.fileName}` : undefined}>
            <span>MPP</span>
            <select value={selectedFileId ?? ""} onChange={(event) => selectPlanFile(event.target.value)} aria-label="Production plan week">
              {weekOptions.map((option) =>
                option.file ? (
                  <option key={`${option.year}-${option.week}`} value={option.file.id}>
                    {describeMppFile(option.file.fileName)}
                  </option>
                ) : (
                  <option key={`${option.year}-${option.week}`} value="" disabled>
                    WK{option.week} {option.year} · not uploaded
                  </option>
                ),
              )}
            </select>
            {plan.kind === "loading" ? <small>Loading…</small> : null}
          </label>
        ) : plan.kind === "ready" ? (
          <button type="button" className="mpp-chip" title={`Production plan: ${plan.file.fileName}`} onClick={() => setActiveWorkspace("material")}>
            MPP {describeMppFile(plan.file.fileName)}
          </button>
        ) : null}
        <SyncStatusChip wb={wb} />
      </div>
    </header>
  );
}
