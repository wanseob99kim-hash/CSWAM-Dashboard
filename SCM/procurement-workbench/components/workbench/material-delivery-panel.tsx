import { useMemo, useState } from "react";
import type { Workbench } from "@/hooks/useWorkbench";
import { isPickupTerm, lineShipments } from "@/lib/mdmp/analysis";
import { issueMatchesSheet } from "@/lib/mdmp/match";
import { describeDrift } from "@/lib/mdmp/mpp-sync";
import type { MdmpLine, MdmpProject } from "@/lib/mdmp/parse";
import { describeMppFile } from "@/lib/mpp/read-workbook";
import { formatWeek, weeksBetween } from "@/lib/mpp/weeks";
import { formatPaymentTerms, parsePaymentTerms } from "@/lib/payment-terms";

type MaterialDeliveryPanelProps = {
  wb: Workbench;
};

const SECTION_LABEL: Record<MdmpLine["section"], string> = { main: "Main material", internal: "Internal material", shipping: "Shipping hardware" };

function weeksText(weeks: number): string {
  if (weeks === 0) return "this week";
  return weeks < 0 ? `${-weeks} wk overdue` : `in ${weeks} wk`;
}

/** Received quantity and the worst cell status for one PO line. */
function lineSummary(line: MdmpLine) {
  const arrivals = line.events.filter((event) => event.kind === "arrival");
  const received = arrivals.filter((event) => event.status === "done").reduce((sum, event) => sum + event.qty, 0);
  const risky = line.events.some((event) => event.status === "risky");
  const attention = line.events.some((event) => event.status === "attention");
  return { received, risky, attention };
}

export function MaterialDeliveryPanel({ wb }: MaterialDeliveryPanelProps) {
  const { activeWorkspace, mdmp, projectScope, projectList, setActiveWorkspace, materialPlan } = wb;
  const mppLabel = materialPlan.state.kind === "ready" ? `MPP ${describeMppFile(materialPlan.state.file.fileName)}` : null;
  const { derived, currentWeek, leadTimes } = mdmp;
  const [section, setSection] = useState<"all" | MdmpLine["section"]>("all");
  const hidden = activeWorkspace !== "mdmp";

  const inScope = useMemo(
    () => (project: MdmpProject) => projectScope === "all" || derived?.projectIdBySheet.get(project.sheet) === projectScope,
    [derived, projectScope],
  );
  const projects = useMemo(() => (derived?.plan.projects ?? []).filter(inScope), [derived, inScope]);
  const actions = (derived?.actions ?? []).filter((action) => inScope(action.project));
  const shortages = (derived?.coverage ?? []).filter((check) => check.status !== "covered" && inScope(check.project));
  const upcoming = (derived?.upcoming ?? []).filter((item) => inScope(item.project));
  const issues = (derived?.openIssues ?? []).filter(
    (issue) => projectScope === "all" || projects.some((project) => issueMatchesSheet(issue.project, project)),
  );
  const drift = (derived?.drift ?? []).filter((item) => inScope(item.project));
  const overdue = upcoming.filter((item) => item.weeksFromNow < 0);
  const unmatched = (derived?.plan.projects ?? []).filter((project) => !derived?.projectIdBySheet.has(project.sheet));
  const scopeName = projectScope === "all" ? null : projectList.find((project) => project.id === projectScope)?.name;

  return (
    <>
      <section className="zone-title" aria-label="Material delivery section" hidden={hidden}>
        <h2>Material Delivery</h2>
      </section>
      <section className="material-plan-panel" hidden={hidden}>
        <div className="panel-header">
          <div>
            <h2>Material delivery plan (MDMP)</h2>
            <p className="plan-subtitle">
              {mdmp.mdmp.kind === "ready"
                ? `${describeMppFile(mdmp.mdmp.file.fileName)} · as of ${mdmp.mdmp.data.referenceDate.toISOString().slice(0, 10)} · lead times: ${
                    leadTimes.kind === "ready" ? describeMppFile(leadTimes.file.fileName) : "Material Plan settings"
                  } · today is ${formatWeek(currentWeek)}`
                : "Publish the MDMP with npm run plans:publish to see PO lines, pickups, and shortages."}
            </p>
          </div>
        </div>
        {mdmp.mdmp.kind === "loading" ? <p className="empty-state">Reading the MDMP…</p> : null}
        {mdmp.mdmp.kind === "empty" ? <p className="empty-state">No MDMP published yet.</p> : null}
        {mdmp.mdmp.kind === "error" ? <p className="plan-error" role="alert">{mdmp.mdmp.message}</p> : null}

        {derived ? (
          <>
            {scopeName && !projects.length ? (
              <p className="scope-hint">{scopeName} has no sheet in this MDMP. Choose All projects to see every sheet.</p>
            ) : null}
            <div className="plan-kpis">
              <div className="plan-kpi" data-tone="risk">
                <strong>{shortages.length}</strong>
                <span>Material shortages vs production</span>
              </div>
              <div className="plan-kpi" data-tone="risk">
                <strong>{overdue.length}</strong>
                <span>Pickups or arrivals overdue (not marked done)</span>
              </div>
              <div className="plan-kpi" data-tone="warning">
                <strong>{upcoming.filter((item) => item.kind === "pickup" && item.weeksFromNow >= 0 && item.weeksFromNow <= 2).length}</strong>
                <span>Pickups to arrange in 2 weeks</span>
              </div>
              <div className="plan-kpi" data-tone="info">
                <strong>{actions.length}</strong>
                <span>Lines needing a PO or OC</span>
              </div>
              <div className="plan-kpi">
                <strong>{issues.length}</strong>
                <span>Open issues</span>
              </div>
            </div>

            <section className="plan-card" aria-labelledby="mdmp-shortages">
              <h3 id="mdmp-shortages">Shortage check: arrivals vs production need</h3>
              <p className="plan-hint">
                Cumulative arrivals against production need (main material vs cutting, internal material vs IM release, shipping hardware vs shipping), taken from{" "}
                {mppLabel ? `${mppLabel} where the project is in it, else the MDMP's own plan` : "the MDMP's own plan (no MPP loaded)"}. Groups ordered on a different quantity basis are not compared.
              </p>
              {shortages.length ? (
                <div className="plan-table-wrap">
                  <table className="plan-table">
                    <thead>
                      <tr>
                        <th scope="col">Status</th>
                        <th scope="col">Project</th>
                        <th scope="col">Material</th>
                        <th scope="col" className="numeric">Needed</th>
                        <th scope="col" className="numeric">Ordered</th>
                        <th scope="col" className="numeric">Received</th>
                        <th scope="col">Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shortages.map((check) => (
                        <tr key={`${check.project.sheet}-${check.section}-${check.group}`} data-status="order-overdue">
                          <td>
                            <span className="status tone-risk">{check.status === "short" ? "Short" : "Under-ordered"}</span>
                          </td>
                          <td>
                            {check.project.sheet}
                            <small>need from {derived.mppBySheet.has(check.project.sheet) ? "MPP" : "MDMP"}</small>
                          </td>
                          <td>
                            {check.group}
                            <small>{SECTION_LABEL[check.section]} vs {check.process}</small>
                          </td>
                          <td className="numeric">{check.required.toLocaleString()} {check.basis}</td>
                          <td className="numeric">{check.ordered.toLocaleString()}</td>
                          <td className="numeric">{check.received.toLocaleString()}</td>
                          <td>
                            {check.status === "short" && check.shortWeek
                              ? `Short from ${formatWeek(check.shortWeek)} by ${check.shortQty}`
                              : `${check.shortQty.toLocaleString()} not on any PO line`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="plan-hint">Arrivals cover production for every compared material.</p>
              )}
            </section>

            {drift.length ? (
              <section className="plan-card" aria-labelledby="mdmp-drift">
                <h3 id="mdmp-drift">MDMP schedule differs from {mppLabel ?? "the MPP"}</h3>
                <p className="plan-hint">
                  The MDMP&apos;s production rows are older than the MPP for these projects. Shortages above use the MPP; ask the MDMP owner to refresh these sheets.
                </p>
                <ul className="plan-list">
                  {drift.map((item) => (
                    <li key={`${item.project.sheet}-${item.process}`} data-tone="warning">
                      <strong>{item.project.sheet}</strong> · {item.process}
                      <small>
                        MDMP from {item.mdmpStart ? formatWeek(item.mdmpStart) : "-"}: {describeDrift(item)}
                      </small>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <div className="plan-review">
              <section className="plan-card" aria-labelledby="mdmp-shipments">
                <h3 id="mdmp-shipments">Pickups and arrivals (next 3 weeks and overdue)</h3>
                <ul className="plan-list">
                  {upcoming.map((item) => (
                    <li key={item.key} data-tone={item.weeksFromNow < 0 ? "warning" : item.kind === "pickup" ? "info" : undefined}>
                      <strong>
                        {item.kind === "pickup" ? `Pick up (${item.line.incoterms})` : "Arrival"} {formatWeek(item.week)}
                      </strong>{" "}
                      · {weeksText(item.weeksFromNow)} · {item.project.sheet} · {item.line.group} · {item.line.manufacturer} · {item.qty.toLocaleString()} {item.line.unit}
                      {item.kind === "pickup" && item.pickupInferred ? " · pickup week estimated from transit" : ""}
                    </li>
                  ))}
                  {!upcoming.length ? <li>Nothing to collect or receive in the next three weeks.</li> : null}
                </ul>
              </section>

              <section className="plan-card" aria-labelledby="mdmp-actions">
                <h3 id="mdmp-actions">PO and OC follow-up</h3>
                <ul className="plan-list">
                  {actions.map((action) => (
                    <li key={action.key} data-tone={action.kind === "place-po" && action.weeksFromNow < 0 ? "warning" : "info"}>
                      <strong>{action.kind === "place-po" ? `Place PO by ${formatWeek(action.week)}` : `No OC recorded (PO ${formatWeek(action.week)})`}</strong> ·{" "}
                      {action.project.sheet} · {action.line.group} · {action.line.manufacturer}
                      {action.firstArrival ? ` · first arrival ${formatWeek(action.firstArrival)}` : ""} · lead time {action.lead.ddpWeeks} wk ({action.lead.source})
                    </li>
                  ))}
                  {!actions.length ? <li>Every line with quantity has a PO and an order confirmation.</li> : null}
                </ul>
              </section>

              <section className="plan-card" aria-labelledby="mdmp-issues">
                <h3 id="mdmp-issues">Open issues (MDMP issue note)</h3>
                <ul className="plan-list">
                  {issues.map((issue, index) => (
                    <li key={`${issue.project}-${index}`} data-tone={/high/i.test(issue.priority) ? "warning" : undefined}>
                      <strong>{issue.project}</strong> · {issue.item} · {issue.vendor} · {issue.type} · due {issue.dueWeek || "-"}
                      <small>
                        {issue.description} {issue.recoveryPlan ? `Plan: ${issue.recoveryPlan}` : ""} ({issue.owner})
                      </small>
                    </li>
                  ))}
                  {!issues.length ? <li>No open issues.</li> : null}
                </ul>
              </section>
            </div>

            <section className="plan-card" aria-labelledby="mdmp-lines">
              <div className="plan-lines-head">
                <h3 id="mdmp-lines">PO lines</h3>
                <select aria-label="Material section" value={section} onChange={(event) => setSection(event.target.value as typeof section)}>
                  <option value="all">All materials</option>
                  <option value="main">Main material</option>
                  <option value="internal">Internal material</option>
                  <option value="shipping">Shipping hardware</option>
                </select>
              </div>
              {projects.map((project) => (
                <details key={project.sheet} className="plan-project-lines" open={projects.length === 1}>
                  <summary>
                    <strong>{project.sheet}</strong> · {project.lines.length} lines
                    {derived.projectIdBySheet.has(project.sheet) ? "" : " · not in workbench"}
                  </summary>
                  <div className="plan-table-wrap">
                    <table className="plan-table">
                      <thead>
                        <tr>
                          <th scope="col">Material</th>
                          <th scope="col">PO</th>
                          <th scope="col">Vendor</th>
                          <th scope="col">Terms</th>
                          <th scope="col" className="numeric">Received / ordered</th>
                          <th scope="col">Next</th>
                          <th scope="col">Lead time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {project.lines
                          .filter((line) => section === "all" || line.section === section)
                          .map((line) => {
                            const summary = lineSummary(line);
                            const lead = derived.leadTimeFor(line);
                            const next = lineShipments(line, lead)
                              .flatMap((shipment) => [
                                ...(shipment.pickupWeek && shipment.pickupStatus !== "done" && shipment.arrivalStatus !== "done"
                                  ? [{ label: `Pick up ${formatWeek(shipment.pickupWeek)}`, week: shipment.pickupWeek }]
                                  : []),
                                ...(shipment.arrivalStatus !== "done" ? [{ label: `Arrive ${formatWeek(shipment.arrivalWeek)} (${shipment.qty})`, week: shipment.arrivalWeek }] : []),
                              ])
                              .sort((left, right) => weeksBetween(right.week, left.week))[0];
                            return (
                              <tr key={line.row} data-status={summary.risky ? "order-overdue" : summary.attention ? "order-soon" : undefined}>
                                <td>
                                  {line.group}
                                  <small>{SECTION_LABEL[line.section]}</small>
                                </td>
                                <td>{line.poNumbers.join(", ") || "No PO"}</td>
                                <td>
                                  {line.manufacturer}
                                  <small>
                                    {line.incoterms || "-"} · {line.shippingBy || "-"}
                                  </small>
                                </td>
                                <td>
                                  {formatPaymentTerms(parsePaymentTerms(line.paymentTerms))}
                                  <small>{isPickupTerm(line.incoterms) ? "Invoiced at pickup" : "Invoiced at delivery"}</small>
                                </td>
                                <td className="numeric">
                                  {summary.received.toLocaleString()} / {line.subtotal.toLocaleString()} {line.unit}
                                </td>
                                <td>{next ? next.label : summary.received >= line.subtotal && line.subtotal > 0 ? "Complete" : "-"}</td>
                                <td>
                                  {lead.ddpWeeks} wk
                                  <small>{lead.source}</small>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </details>
              ))}
            </section>

            {unmatched.length && projectScope === "all" ? (
              <p className="plan-hint">
                MDMP sheets with no workbench project: {unmatched.map((project) => project.sheet).join(", ")}.{" "}
                <button type="button" className="link-action" onClick={() => setActiveWorkspace("material")}>
                  Update projects from the MPP
                </button>
              </p>
            ) : null}
          </>
        ) : null}
      </section>
    </>
  );
}
