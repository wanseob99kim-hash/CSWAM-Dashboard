// Links MDMP project sheets to workbench projects by site name and quantity.
import { projectQuantity, siteName } from "../mpp/match";
import type { Project } from "../types";
import type { MdmpProject } from "./parse";

function score(project: Project, mdmp: MdmpProject): number {
  const site = siteName(project.name);
  if (!site) return 0;
  // The sheet tab and the "Project Name" line are typed separately; either may carry the cleaner name.
  const names = [siteName(mdmp.projectName), siteName(mdmp.sheet)].filter(Boolean);
  const nameScore = Math.max(
    0,
    ...names.map((name) => (name === site ? 3 : name.startsWith(`${site} `) || site.startsWith(`${name} `) || name.startsWith(site) || site.startsWith(name) ? 2 : 0)),
  );
  if (!nameScore) return 0;
  const quantity = projectQuantity(project);
  return nameScore + (quantity !== null && quantity === mdmp.towers ? 1 : 0);
}

/** Workbench project id per MDMP sheet name; sheets without a convincing match are left out. */
export function matchMdmpProjects(projects: readonly Project[], sheets: readonly MdmpProject[]): Map<string, string> {
  const candidates = sheets.flatMap((mdmp) =>
    projects.map((project) => ({ mdmp, project, score: score(project, mdmp) })).filter((candidate) => candidate.score >= 2),
  );
  candidates.sort((left, right) => right.score - left.score);
  const bySheet = new Map<string, string>();
  const usedProjects = new Set<string>();
  for (const { mdmp, project } of candidates) {
    if (bySheet.has(mdmp.sheet) || usedProjects.has(project.id)) continue;
    bySheet.set(mdmp.sheet, project.id);
    usedProjects.add(project.id);
  }
  return bySheet;
}

/** Whether an issue-note row ("Four Horizon", "Nordex North Hills") is about this MDMP sheet. */
export function issueMatchesSheet(issueProject: string, mdmp: MdmpProject): boolean {
  const issue = siteName(issueProject);
  if (!issue) return false;
  return [siteName(mdmp.projectName), siteName(mdmp.sheet)].some(
    (name) => name && (name === issue || name.startsWith(`${issue} `) || issue.startsWith(`${name} `) || name.startsWith(issue) || issue.startsWith(name)),
  );
}
