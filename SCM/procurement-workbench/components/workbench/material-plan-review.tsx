import type { Workbench } from "@/hooks/useWorkbench";
import { createId } from "@/lib/ids";
import { suggestedPlanLeadTimes } from "@/lib/leadtime/plan-defaults";
import { isWindowOff } from "@/lib/mpp/match";
import { syncProjectsWithMpp } from "@/lib/mpp/project-sync";
import { MPP_MATERIALS, type MppMaterial } from "@/lib/mpp/parse";
import { formatWeek } from "@/lib/mpp/weeks";

type MaterialPlanReviewProps = {
  wb: Workbench;
};

/** Lead-time settings, MPP-vs-workbench differences, and data warnings below the order plan. */
export function MaterialPlanReview({ wb }: MaterialPlanReviewProps) {
  const { materialPlan, projectList, setProjectList, mdmp } = wb;
  const { settings, updateSettings, resetSettings, derived, currentWeek } = materialPlan;
  if (!derived) return null;

  const projectSync = syncProjectsWithMpp(projectList, derived.reconciliation, currentWeek, () => createId("project"));
  const additions = projectSync.changes.filter((item) => item.kind === "add").length;
  const updates = projectSync.changes.length - additions;

  const { reconciliation, issues, offsets } = derived;
  const windowOff = reconciliation.matches.filter(isWindowOff);
  const quantityOff = reconciliation.matches.filter((match) => match.quantityDiffers);
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const notes = issues.filter((issue) => issue.severity === "info");

  const fileLeadTimes = mdmp.leadTable ? suggestedPlanLeadTimes(mdmp.leadTable) : {};
  const fileDiffers = MPP_MATERIALS.some((material) => fileLeadTimes[material] !== undefined && fileLeadTimes[material] !== settings.leadTimeWeeks[material]);
  const applyFileLeadTimes = () => updateSettings({ ...settings, leadTimeWeeks: { ...settings.leadTimeWeeks, ...fileLeadTimes } });

  const setLeadTime = (material: MppMaterial, value: number) =>
    updateSettings({ ...settings, leadTimeWeeks: { ...settings.leadTimeWeeks, [material]: value } });

  return (
    <div className="plan-review">
      <section className="plan-card" aria-labelledby="plan-lead-times">
        <h3 id="plan-lead-times">Lead times</h3>
        <p className="plan-hint">Order-by week = needed-on-site week − lead time − safety weeks. Saved on this device; confirm with suppliers.</p>
        {mdmp.leadTimes.kind === "ready" ? (
          <p className="plan-hint">
            Lead-time file {mdmp.leadTimes.file.fileName}: longest DDP route for steel, flange, and door frame; median route for internal parts.{" "}
            {fileDiffers ? (
              <button type="button" className="link-action" onClick={applyFileLeadTimes}>
                Use file values
              </button>
            ) : (
              "Settings match the file."
            )}
          </p>
        ) : null}
        <div className="plan-settings">
          {MPP_MATERIALS.map((material) => (
            <label key={material}>
              {material}
              <span>
                <input
                  type="number"
                  min={0}
                  max={104}
                  value={settings.leadTimeWeeks[material]}
                  onChange={(event) => setLeadTime(material, Math.max(0, Math.round(Number(event.target.value) || 0)))}
                />
                wk
              </span>
              {fileLeadTimes[material] !== undefined ? <small>File DDP: {fileLeadTimes[material]} wk</small> : null}
              <small>
                MPP arrival vs cutting: {offsets[material].weeks >= 0 ? "+" : ""}
                {offsets[material].weeks} wk ({offsets[material].samples} projects)
              </small>
            </label>
          ))}
          <label>
            Safety weeks
            <span>
              <input
                type="number"
                min={0}
                max={26}
                value={settings.safetyWeeks}
                onChange={(event) => updateSettings({ ...settings, safetyWeeks: Math.max(0, Math.round(Number(event.target.value) || 0)) })}
              />
              wk
            </span>
          </label>
          <label>
            Flag orders due within
            <span>
              <input
                type="number"
                min={0}
                max={26}
                value={settings.dueSoonWeeks}
                onChange={(event) => updateSettings({ ...settings, dueSoonWeeks: Math.max(0, Math.round(Number(event.target.value) || 0)) })}
              />
              wk
            </span>
          </label>
        </div>
        <button type="button" className="secondary-action" onClick={resetSettings}>Reset to defaults</button>
      </section>

      <section className="plan-card" aria-labelledby="plan-reconcile">
        <h3 id="plan-reconcile">MPP vs workbench projects</h3>
        {projectSync.changes.length ? (
          <div className="plan-sync">
            <button type="button" className="primary-action" onClick={() => setProjectList(projectSync.projects)}>
              Update projects from MPP
            </button>
            <details>
              <summary>
                {updates} to update, {additions} to add
              </summary>
              <ul className="plan-list">
                {projectSync.changes.map((item) => (
                  <li key={item.projectId} data-tone={item.kind === "add" ? "info" : "warning"}>
                    <strong>{item.kind === "add" ? "Add" : "Update"} {item.name}:</strong> {item.details.join("; ")}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        ) : (
          <p className="plan-hint">Project names, scope, production windows, and status match the MPP.</p>
        )}
        <ul className="plan-list">
          {reconciliation.missingInWorkbench.map((mpp) => (
            <li key={`missing-${mpp.row}`} data-tone="warning">
              <strong>Not in workbench:</strong> {mpp.title}
              {mpp.processes.Cutting?.[0] ? ` (cutting from ${formatWeek(mpp.processes.Cutting[0].week)})` : ""}
            </li>
          ))}
          {quantityOff.map((match) => (
            <li key={`qty-${match.project.id}`} data-tone="warning">
              <strong>Quantity differs:</strong> {match.project.name} vs MPP {match.mpp.towers} ({match.mpp.title})
            </li>
          ))}
          {windowOff.map((match) => (
            <li key={`window-${match.project.id}`} data-tone="warning">
              <strong>Production window off:</strong> {match.project.name} starts {match.project.productionWindow.split(" - ")[0]}, MPP cutting starts{" "}
              {formatWeek(match.mpp.processes.Cutting![0].week)} ({Math.abs(match.startOffsetWeeks!)} wk {match.startOffsetWeeks! > 0 ? "later" : "earlier"} in workbench)
            </li>
          ))}
          {reconciliation.notInPlan.map((project) => (
            <li key={`plan-${project.id}`} data-tone="info">
              <strong>Not in MPP:</strong> {project.name}
            </li>
          ))}
          {!reconciliation.missingInWorkbench.length && !quantityOff.length && !windowOff.length && !reconciliation.notInPlan.length ? (
            <li>Workbench projects match the plan.</li>
          ) : null}
        </ul>
      </section>

      <section className="plan-card" aria-labelledby="plan-issues">
        <h3 id="plan-issues">Check in the MPP</h3>
        <ul className="plan-list">
          {[...warnings, ...notes].map((issue, index) => (
            <li key={`${issue.project.row}-${index}`} data-tone={issue.severity}>
              <strong>Row {issue.project.row}:</strong> {issue.project.title} — {issue.message}
            </li>
          ))}
          {!issues.length ? <li>No problems found in the plan.</li> : null}
        </ul>
      </section>
    </div>
  );
}
