// MDMP follow-ups narrowed to the selected project, shared by This Week and the nav badges.
import type { MdmpState } from "@/hooks/useMdmp";
import type { ProjectScope } from "../types";
import type { CoverageCheck, PurchaseAction, UpcomingShipment } from "./analysis";
import { issueMatchesSheet } from "./match";
import type { MdmpIssue, MdmpProject } from "./parse";

/** Pickups due this many weeks ahead count as "arrange now". */
export const PICKUP_ALERT_WEEKS = 2;

export type MdmpFollowUps = {
  shortages: CoverageCheck[];
  /** Not-done pickups that are overdue or due within PICKUP_ALERT_WEEKS. */
  pickups: UpcomingShipment[];
  /** Not-done arrivals whose week has passed. */
  lateArrivals: UpcomingShipment[];
  actions: PurchaseAction[];
  issues: MdmpIssue[];
};

const EMPTY: MdmpFollowUps = { shortages: [], pickups: [], lateArrivals: [], actions: [], issues: [] };

export function mdmpFollowUps(derived: MdmpState["derived"], scope: ProjectScope): MdmpFollowUps {
  if (!derived) return EMPTY;
  const inScope = (project: MdmpProject) => scope === "all" || derived.projectIdBySheet.get(project.sheet) === scope;
  const projects = derived.plan.projects.filter(inScope);
  return {
    shortages: derived.coverage.filter((check) => check.status !== "covered" && inScope(check.project)),
    pickups: derived.upcoming
      .filter((item) => item.kind === "pickup" && item.weeksFromNow <= PICKUP_ALERT_WEEKS && inScope(item.project))
      .sort((left, right) => left.weeksFromNow - right.weeksFromNow),
    lateArrivals: derived.upcoming.filter((item) => item.kind === "arrival" && item.weeksFromNow < 0 && inScope(item.project)),
    actions: derived.actions.filter((action) => inScope(action.project)),
    issues:
      scope === "all"
        ? derived.openIssues
        : derived.openIssues.filter((issue) => projects.some((project) => issueMatchesSheet(issue.project, project))),
  };
}
