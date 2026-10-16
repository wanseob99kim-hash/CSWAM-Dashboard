import { useMemo, useState } from "react";
import { MaterialPlanReview } from "@/components/workbench/material-plan-review";
import type { Workbench } from "@/hooks/useWorkbench";
import { workbenchCoverage } from "@/lib/mpp/coverage";
import type { OrderPlanRow, OrderStatus } from "@/lib/mpp/order-plan";
import { describeMppFile } from "@/lib/mpp/read-workbook";
import { formatWeek } from "@/lib/mpp/weeks";

type MaterialPlanPanelProps = {
  wb: Workbench;
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  "order-overdue": "Order overdue",
  "need-passed": "Need date passed",
  "order-soon": "Order soon",
  planned: "Planned",
  "in-progress": "Arriving per MPP",
};

const STATUS_TONE: Record<OrderStatus, string> = {
  "order-overdue": "tone-risk",
  "need-passed": "tone-risk",
  "order-soon": "tone-approval",
  planned: "tone-active",
  "in-progress": "tone-done",
};

type StatusFilter = "action" | "open" | "all";

const FILTERS: Record<StatusFilter, { label: string; statuses: OrderStatus[] }> = {
  action: { label: "Needs action", statuses: ["order-overdue", "need-passed", "order-soon"] },
  open: { label: "Not yet arriving", statuses: ["order-overdue", "need-passed", "order-soon", "planned"] },
  all: { label: "All rows", statuses: ["order-overdue", "need-passed", "order-soon", "planned", "in-progress"] },
};

function weeksLabel(weeks: number): string {
  if (weeks === 0) return "this week";
  return weeks < 0 ? `${-weeks} wk ago` : `in ${weeks} wk`;
}

export function MaterialPlanPanel({ wb }: MaterialPlanPanelProps) {
  const { activeWorkspace, materialPlan, deliveryList, projectScope, activeProject } = wb;
  const { state, currentWeek, settings, derived, viewingOlder, weekOptions, selectPlanFile } = materialPlan;
  const newestPlan = weekOptions.find((option) => option.file)?.file ?? null;
  const [filter, setFilter] = useState<StatusFilter>("action");
  const [customer, setCustomer] = useState("All");

  const projectIdByRow = useMemo(
    () => new Map((derived?.reconciliation.matches ?? []).map((match) => [match.mpp.row, match.project])),
    [derived],
  );
  const rows = useMemo(
    () =>
      (derived?.rows ?? []).filter(
        (row) =>
          FILTERS[filter].statuses.includes(row.status) &&
          (customer === "All" || row.project.customer === customer) &&
          (projectScope === "all" || derived?.projectIdByRow.get(row.project.row) === projectScope),
      ),
    [derived, filter, customer, projectScope],
  );
  const customers = useMemo(() => [...new Set((derived?.rows ?? []).map((row) => row.project.customer))].sort(), [derived]);
  const count = (status: OrderStatus) => (derived?.rows ?? []).filter((row) => row.status === status).length;
  const estimated = (derived?.rows ?? []).filter((row) => row.source === "estimated" && row.status !== "in-progress").length;

  function coverageText(row: OrderPlanRow): string {
    const project = projectIdByRow.get(row.project.row);
    if (!project) return "Not in workbench";
    const coverage = workbenchCoverage(project.id, row.material, deliveryList);
    if (!coverage) return "Tracked outside workbench";
    return coverage.pos ? `${coverage.pos} PO · ${coverage.deliveries} lines` : "No PO yet";
  }

  const hidden = activeWorkspace !== "material";

  return (
    <>
      <section className="zone-title material-zone-title" aria-label="Material plan section" hidden={hidden}>
        <h2>Material Plan</h2>
      </section>
      <section className="material-plan-panel" hidden={hidden}>
        <div className="panel-header">
          <div>
            <h2>Order plan from the MPP</h2>
            <p className="plan-subtitle">
              {state.kind === "ready"
                ? `${describeMppFile(state.file.fileName)} · uploaded ${state.file.uploadedAt.slice(0, 10)} by ${state.file.uploadedBy}`
                : "Order plan from the weekly Master Production Plan."}
              {` · today is ${formatWeek(currentWeek)}`}
            </p>
          </div>
        </div>

        {viewingOlder && newestPlan ? (
          <p className="scope-hint">
            Showing an earlier plan week; order deadlines are still counted from today.{" "}
            <button type="button" className="link-action" onClick={() => selectPlanFile(newestPlan.id)}>
              Back to {describeMppFile(newestPlan.fileName)}
            </button>
          </p>
        ) : null}
        {state.kind === "loading" ? <p className="empty-state">Reading the production plan…</p> : null}
        {state.kind === "empty" ? <p className="empty-state">No production plan available yet.</p> : null}
        {state.kind === "error" ? <p className="plan-error" role="alert">{state.message}</p> : null}

        {derived ? (
          <>
            <div className="plan-kpis">
              <button type="button" className="plan-kpi" data-tone="risk" onClick={() => setFilter("action")}>
                <strong>{count("order-overdue") + count("need-passed")}</strong>
                <span>Order deadline passed</span>
              </button>
              <button type="button" className="plan-kpi" data-tone="warning" onClick={() => setFilter("action")}>
                <strong>{count("order-soon")}</strong>
                <span>Order within {settings.dueSoonWeeks} weeks</span>
              </button>
              <button type="button" className="plan-kpi" onClick={() => setFilter("open")}>
                <strong>{count("planned")}</strong>
                <span>Planned later</span>
              </button>
              <div className="plan-kpi" data-tone="info">
                <strong>{estimated}</strong>
                <span>Need weeks estimated (no MPP material rows)</span>
              </div>
            </div>

            <div className="filters plan-filters">
              <select aria-label="Rows to show" value={filter} onChange={(event) => setFilter(event.target.value as StatusFilter)}>
                {Object.entries(FILTERS).map(([value, option]) => (
                  <option key={value} value={value}>{option.label}</option>
                ))}
              </select>
              <select aria-label="Customer" value={customer} onChange={(event) => setCustomer(event.target.value)}>
                <option value="All">All customers</option>
                {customers.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <small>{rows.length} rows</small>
            </div>

            <div className="plan-table-wrap">
              <table className="plan-table">
                <thead>
                  <tr>
                    <th scope="col">Order by</th>
                    <th scope="col">Status</th>
                    <th scope="col">Project</th>
                    <th scope="col">Material</th>
                    <th scope="col">Needed on site</th>
                    <th scope="col" className="numeric">Qty</th>
                    <th scope="col" className="numeric">Lead time</th>
                    <th scope="col">Workbench</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.key} data-status={row.status}>
                      <td>
                        <strong>{formatWeek(row.orderByWeek)}</strong>
                        <small>{weeksLabel(row.weeksToOrderBy)}</small>
                      </td>
                      <td>
                        <span className={`status ${STATUS_TONE[row.status]}`}>{STATUS_LABEL[row.status]}</span>
                      </td>
                      <td>
                        <span className="plan-project" title={row.project.title}>{row.project.title}</span>
                        <small>MPP row {row.project.row}</small>
                      </td>
                      <td>{row.material}</td>
                      <td>
                        {formatWeek(row.needWeek)}
                        <small>{row.source === "mpp" ? `MPP, through ${formatWeek(row.lastNeedWeek)}` : "Estimated from cutting start"}</small>
                      </td>
                      <td className="numeric">{row.needQty.toLocaleString()}</td>
                      <td className="numeric">{settings.leadTimeWeeks[row.material] + settings.safetyWeeks} wk</td>
                      <td>{coverageText(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.length ? (
                <p className="empty-state table-empty">
                  {projectScope !== "all" && ![...(derived.projectIdByRow.values())].includes(projectScope)
                    ? `${activeProject.name} is not in the production plan. Choose All projects to see the whole plan.`
                    : "Nothing to show for this filter."}
                </p>
              ) : null}
            </div>

            <MaterialPlanReview wb={wb} />
          </>
        ) : null}
      </section>
    </>
  );
}
