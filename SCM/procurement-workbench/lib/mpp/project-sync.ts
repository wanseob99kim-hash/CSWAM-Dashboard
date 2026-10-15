// Brings workbench projects in line with the MPP: quantity, production window,
// and status for matched projects, plus new entries for upcoming plan projects.
import type { Project } from "../types";
import { siteName, type Reconciliation } from "./match";
import type { MppProject, WeeklySeries } from "./parse";
import { isoWeekMonday, weeksBetween, type IsoWeek } from "./weeks";

export type ProjectChange = {
  projectId: string;
  kind: "add" | "update";
  name: string;
  /** Human-readable "field: before -> after" lines. */
  details: string[];
};

export type ProjectSyncResult = {
  projects: Project[];
  changes: ProjectChange[];
};

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: "UTC" });
const FRIDAY_OFFSET_MS = 4 * 24 * 60 * 60 * 1000;

const firstWeek = (series?: WeeklySeries) => series?.[0]?.week ?? null;
const lastWeek = (series?: WeeklySeries) => series?.[series.length - 1]?.week ?? null;

/** Cutting start (Monday) to the last finished tower (Green Tag, Friday). */
export function mppProductionWindow(mpp: MppProject): string | null {
  const start = firstWeek(mpp.processes.Cutting);
  const end = lastWeek(mpp.processes["Green Tag"]) ?? lastWeek(mpp.processes["IM QC Release"]) ?? lastWeek(mpp.processes.Cutting);
  if (!start || !end) return null;
  const friday = new Date(isoWeekMonday(end).getTime() + FRIDAY_OFFSET_MS);
  return `${dateFormat.format(isoWeekMonday(start))} - ${dateFormat.format(friday)}`;
}

/** Complete once the last tower is finished, Planning before cutting starts, Active in between. */
export function mppStatus(mpp: MppProject, current: IsoWeek): string | null {
  const start = firstWeek(mpp.processes.Cutting);
  const end = lastWeek(mpp.processes["Green Tag"]) ?? lastWeek(mpp.processes.Cutting);
  if (!start || !end) return null;
  if (weeksBetween(end, current) > 0) return "Complete";
  if (weeksBetween(current, start) > 0) return "Planning";
  return "Active";
}

export function mppPhase(mpp: MppProject): string | null {
  if (mpp.towers === null || mpp.sectionsPerTower === null) return null;
  return `${mpp.towers}T / ${mpp.sectionsPerTower} sec`;
}

const CUSTOMER_PREFIX = /^(?:vestas|nordex|sgre|se|ge|114m)\s+/i;

/** The site as written in the plan, e.g. "Prairie Creek II" or "TS114-03 Forecast". */
function siteLabel(mpp: MppProject): string {
  const label = mpp.title
    .replace(/^\d{3,}\s+/, "")
    .replace(CUSTOMER_PREFIX, "")
    .split(/\(\d+\)|\b\d+\s*T\b|\b\d+\s*Adapters?\b/i)[0]
    .replace(/[\s-]+$/, "")
    .trim();
  return label || siteName(mpp.title) || mpp.title;
}

/** "Highland - 126 Adapter", "Roman1 149T", in the workbench naming style. */
export function mppProjectName(mpp: MppProject): string {
  const site = siteLabel(mpp);
  if (mpp.towers === null) return site;
  return mpp.isAdapter ? `${site} - ${mpp.towers} Adapter` : `${site} ${mpp.towers}T`;
}

/** Replaces the quantity in an existing name ("Highland - 124 Adapter" -> "... 126 ..."), keeping its wording. */
function renameQuantity(name: string, towers: number): string {
  if (/\d+\s*Adapter/i.test(name)) return name.replace(/\d+(\s*Adapter)/i, `${towers}$1`);
  if (/\d+\s*T\b/.test(name)) return name.replace(/\d+(\s*T)\b/, `${towers}$1`);
  return name;
}

function change(details: string[], label: string, before: string | undefined, after: string) {
  if ((before ?? "") !== after) details.push(`${label}: ${before || "-"} -> ${after}`);
}

export function syncProjectsWithMpp(
  projects: readonly Project[],
  reconciliation: Reconciliation,
  current: IsoWeek,
  createId: (mpp: MppProject) => string,
): ProjectSyncResult {
  const changes: ProjectChange[] = [];
  const byId = new Map(reconciliation.matches.map((match) => [match.project.id, match.mpp]));

  const updated = projects.map((project) => {
    const mpp = byId.get(project.id);
    if (!mpp) return project;
    const next: Project = { ...project };
    const details: string[] = [];
    if (mpp.towers !== null && reconciliation.matches.find((match) => match.project.id === project.id)?.quantityDiffers) {
      next.name = renameQuantity(project.name, mpp.towers);
      change(details, "Name", project.name, next.name);
    }
    const phase = mppPhase(mpp);
    if (phase) {
      next.phase = phase;
      change(details, "Scope", project.phase, phase);
    }
    const window = mppProductionWindow(mpp);
    if (window) {
      next.productionWindow = window;
      change(details, "Production", project.productionWindow, window);
    }
    const status = mppStatus(mpp, current);
    if (status) {
      next.status = status;
      change(details, "Status", project.status ?? "Active", status);
    }
    if (details.length) changes.push({ projectId: project.id, kind: "update", name: next.name, details });
    return details.length ? next : project;
  });

  const added = reconciliation.missingInWorkbench.map((mpp): Project => {
    const project: Project = {
      id: createId(mpp),
      name: mppProjectName(mpp),
      // The internal project number is not in the MPP; fill it in when assigned.
      code: "TBD",
      phase: mppPhase(mpp) ?? "",
      productionWindow: mppProductionWindow(mpp) ?? "",
      plant: "",
      budget: 0,
      status: mppStatus(mpp, current) ?? "Planning",
    };
    changes.push({
      projectId: project.id,
      kind: "add",
      name: project.name,
      details: [`From MPP row ${mpp.row}: ${project.phase || "scope unknown"}, ${project.productionWindow || "no dates"}`],
    });
    return project;
  });

  return { projects: [...updated, ...added], changes };
}

