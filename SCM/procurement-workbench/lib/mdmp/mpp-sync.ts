// Lines the MDMP up with the weekly MPP. The MDMP carries its own copy of the
// production plan ("Actual MPP"), refreshed less often than the MPP; shortage
// checks should follow the newest MPP, and buyers should see where the two
// disagree so the MDMP owner can update it.
import { siteName } from "../mpp/match";
import type { MppPlan, MppProcess, MppProject } from "../mpp/parse";
import { formatWeek, weekIndex, type IsoWeek } from "../mpp/weeks";
import type { MdmpProcess, MdmpProject } from "./parse";

/** Production steps the shortage check uses, with the MPP row that holds each. */
const SYNCED_PROCESSES: Array<[MdmpProcess, MppProcess]> = [
  ["Cutting", "Cutting"],
  ["IM Release", "IM QC Release"],
  ["Shipping", "Shipping"],
];

type Series = Array<{ week: IsoWeek; qty: number }>;

function sameSite(left: string, right: string): boolean {
  return Boolean(left && right && (left === right || left.startsWith(`${right} `) || right.startsWith(`${left} `) || left.startsWith(right) || right.startsWith(left)));
}

/** MPP project per MDMP sheet: same site name, preferring the same tower count; each MPP project used once. */
export function matchMdmpToMpp(sheets: readonly MdmpProject[], plan: MppPlan): Map<string, MppProject> {
  const candidates = sheets.flatMap((mdmp) => {
    const names = [siteName(mdmp.projectName), siteName(mdmp.sheet)].filter(Boolean);
    return plan.projects.flatMap((mpp) => {
      const site = siteName(mpp.title);
      if (!names.some((name) => sameSite(name, site))) return [];
      const score = (names.includes(site) ? 2 : 1) + (mpp.towers !== null && mpp.towers === mdmp.towers ? 2 : 0);
      return [{ mdmp, mpp, score }];
    });
  });
  candidates.sort((left, right) => right.score - left.score);
  const bySheet = new Map<string, MppProject>();
  const used = new Set<number>();
  for (const { mdmp, mpp } of candidates) {
    if (bySheet.has(mdmp.sheet) || used.has(mpp.row)) continue;
    bySheet.set(mdmp.sheet, mpp);
    used.add(mpp.row);
  }
  return bySheet;
}

/** The MDMP project with its production steps taken from the MPP where the MPP has them. */
export function withMppProcesses(mdmp: MdmpProject, mpp: MppProject | undefined): MdmpProject {
  if (!mpp) return mdmp;
  const processes = { ...mdmp.processes };
  for (const [mdmpProcess, mppProcess] of SYNCED_PROCESSES) {
    const series = mpp.processes[mppProcess];
    if (series?.length) processes[mdmpProcess] = series;
  }
  return { ...mdmp, processes };
}

export type ScheduleDrift = {
  project: MdmpProject;
  mpp: MppProject;
  process: MdmpProcess;
  mdmpTotal: number;
  mppTotal: number;
  mdmpStart: IsoWeek | null;
  mppStart: IsoWeek | null;
  /** Weeks whose quantity differs between the two plans. */
  weeksChanged: number;
};

const total = (series: Series) => series.reduce((sum, point) => sum + point.qty, 0);

function weeksChanged(left: Series, right: Series): number {
  const byWeek = new Map<number, number>();
  for (const point of left) byWeek.set(weekIndex(point.week), (byWeek.get(weekIndex(point.week)) ?? 0) + point.qty);
  for (const point of right) byWeek.set(weekIndex(point.week), (byWeek.get(weekIndex(point.week)) ?? 0) - point.qty);
  return [...byWeek.values()].filter((difference) => Math.abs(difference) > 0.5).length;
}

/** Where the MDMP's production plan no longer matches the MPP, per project and step. */
export function scheduleDrift(sheets: readonly MdmpProject[], matches: Map<string, MppProject>): ScheduleDrift[] {
  const drift: ScheduleDrift[] = [];
  for (const project of sheets) {
    const mpp = matches.get(project.sheet);
    if (!mpp) continue;
    for (const [mdmpProcess, mppProcess] of SYNCED_PROCESSES) {
      const mdmpSeries = project.processes[mdmpProcess] ?? [];
      const mppSeries = mpp.processes[mppProcess] ?? [];
      if (!mdmpSeries.length || !mppSeries.length) continue;
      const changed = weeksChanged(mdmpSeries, mppSeries);
      if (!changed) continue;
      drift.push({
        project,
        mpp,
        process: mdmpProcess,
        mdmpTotal: total(mdmpSeries),
        mppTotal: total(mppSeries),
        mdmpStart: mdmpSeries[0].week,
        mppStart: mppSeries[0].week,
        weeksChanged: changed,
      });
    }
  }
  return drift;
}

/** "starts 4 wk later (2026-W52)" style summary of one drift row. */
export function describeDrift(drift: ScheduleDrift): string {
  const parts: string[] = [];
  if (drift.mdmpStart && drift.mppStart) {
    const shift = weekIndex(drift.mppStart) - weekIndex(drift.mdmpStart);
    if (shift) parts.push(`starts ${Math.abs(shift)} wk ${shift > 0 ? "later" : "earlier"} in the MPP (${formatWeek(drift.mppStart)})`);
  }
  if (drift.mdmpTotal !== drift.mppTotal) parts.push(`total ${drift.mdmpTotal} → ${drift.mppTotal}`);
  parts.push(`${drift.weeksChanged} week${drift.weeksChanged === 1 ? "" : "s"} differ`);
  return parts.join(" · ");
}
