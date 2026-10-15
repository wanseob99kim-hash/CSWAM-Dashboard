// Pairs workbench projects with MPP projects by site name and quantity, and
// reports what the workbench is missing or has out of date.
import type { Project } from "../types";
import type { MppPlan, MppProject } from "./parse";
import { isoWeekOf, weeksBetween, type IsoWeek } from "./weeks";

const CUSTOMERS = new Set(["vestas", "nordex", "sgre", "se", "ge", "114m"]);
/** A workbench production window more than this far from the MPP cutting start is flagged. */
const WINDOW_TOLERANCE_WEEKS = 4;

export type ProjectMatch = {
  project: Project;
  mpp: MppProject;
  /** Workbench quantity differs from the plan (towers or adapters). */
  quantityDiffers: boolean;
  /** Workbench window start minus MPP cutting start, when both are known. */
  startOffsetWeeks: number | null;
};

export type Reconciliation = {
  matches: ProjectMatch[];
  /** Plan projects still to be built (cutting from `current` on) that the workbench does not track. */
  missingInWorkbench: MppProject[];
  /** Workbench projects with no plan entry. */
  notInPlan: Project[];
};

function words(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/\(\d+\)/g, " ")
    .replace(/\bphase\s*2\b/g, " ii ")
    .replace(/\bphase\s*1\b/g, " i ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** "North Hills" and "North Hill" are the same site. */
const singular = (word: string) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word);

/** Site name: the words before the first quantity ("30T", "124 Adapters"), without references or customer. */
export function siteName(title: string): string {
  const site: string[] = [];
  for (const word of words(title)) {
    if (/^\d+t$/.test(word) || /^\d+$/.test(word)) {
      if (site.length) break;
      continue;
    }
    if (!site.length && CUSTOMERS.has(word)) continue;
    site.push(singular(word));
  }
  return site.join(" ");
}

export function projectQuantity(project: Pick<Project, "name" | "phase">): number | null {
  const match = /(\d+)\s*T\b/i.exec(project.phase) ?? /(\d+)\s*(?:T\b|Adapter)/i.exec(project.name);
  return match ? Number(match[1]) : null;
}

function windowStart(project: Project): IsoWeek | null {
  const start = Date.parse(project.productionWindow.split(" - ")[0] ?? "");
  return Number.isNaN(start) ? null : isoWeekOf(new Date(start));
}

function nameScore(appSite: string, planSite: string): number {
  if (!appSite || !planSite) return 0;
  if (appSite === planSite) return 3;
  if (planSite.startsWith(`${appSite} `) || appSite.startsWith(`${planSite} `)) return 2;
  return 0;
}

export function reconcileProjects(projects: Project[], plan: MppPlan, current: IsoWeek): Reconciliation {
  // Score every pair, then assign best-first so several same-site scopes (e.g. Highland
  // adapter lots) pair by quantity instead of by list order.
  const candidates = projects.flatMap((project) => {
    const appSite = siteName(project.name);
    const quantity = projectQuantity(project);
    return plan.projects.flatMap((mpp) => {
      const score = nameScore(appSite, siteName(mpp.title));
      if (score < 2) return [];
      const quantityGap = quantity !== null && mpp.towers !== null ? Math.abs(quantity - mpp.towers) : Number.MAX_SAFE_INTEGER;
      return [{ project, mpp, score, quantity, quantityGap }];
    });
  });
  candidates.sort((left, right) => right.score - left.score || left.quantityGap - right.quantityGap);

  const matches: ProjectMatch[] = [];
  const used = new Set<MppProject>();
  const assigned = new Set<string>();
  for (const { project, mpp, quantity } of candidates) {
    if (used.has(mpp) || assigned.has(project.id)) continue;
    used.add(mpp);
    assigned.add(project.id);
    const cut = mpp.processes.Cutting?.[0]?.week ?? null;
    const start = windowStart(project);
    matches.push({
      project,
      mpp,
      quantityDiffers: quantity !== null && mpp.towers !== null && quantity !== mpp.towers,
      startOffsetWeeks: cut && start ? weeksBetween(cut, start) : null,
    });
  }

  const matchedProjects = new Set(matches.map((match) => match.project.id));
  return {
    matches,
    missingInWorkbench: plan.projects.filter((mpp) => {
      // Placeholder rows such as "Forecasting in 2027" carry no scope.
      if (used.has(mpp) || mpp.towers === null) return false;
      const cuts = mpp.processes.Cutting ?? [];
      const lastCut = cuts[cuts.length - 1]?.week;
      return Boolean(lastCut && weeksBetween(current, lastCut) >= 0);
    }),
    notInPlan: projects.filter((project) => !matchedProjects.has(project.id)),
  };
}

export function isWindowOff(match: ProjectMatch): boolean {
  return match.startOffsetWeeks !== null && Math.abs(match.startOffsetWeeks) > WINDOW_TOLERANCE_WEEKS;
}
