// What a project's MCIP (budget against forecast cost) is built from when the
// workbench has no delivery records or typed budget for it yet: towers from the
// project name, budget from the Sales Pipeline's per-section material prices,
// material cost from the SAP BOM collected from WINSYS.
import { projectQuantity } from "./mpp/match";
import { pipelineFor } from "./pipeline/match";
import { materialPerSection, type PipelineProject } from "./pipeline/parse";
import type { Project } from "./types";
import type { SapProjectBom } from "./winsys/bom";

export type BudgetSource = "manual" | "pipeline" | "none";
export type MaterialSource = "deliveries" | "sap-bom" | "none";

export type McipFallbacks = {
  towers: number;
  sectionsPerTower: number | null;
  /** Pipeline material budget for the whole project; null when the pipeline has no priced row. */
  pipelineBudget: number | null;
  pipelineProject: string | null;
  /** SAP BOM material per tower, priced from WINSYS PO lines. */
  bomPerTower: number | null;
};

/** Sections per tower from the project phase ("59T / 3 sec") or name ("137T X 5S"). */
export function sectionsPerTower(project: Pick<Project, "name" | "phase">): number | null {
  const match = /(\d+)\s*sec\b/i.exec(project.phase) ?? /\d+\s*T\s*[xX]\s*(\d+)\s*S\b/.exec(`${project.phase} ${project.name}`);
  return match ? Number(match[1]) : null;
}

export function sapBomFor(project: Pick<Project, "id" | "code" | "name">, boms: readonly SapProjectBom[]): SapProjectBom | null {
  return boms.find((bom) => bom.projectId === project.code.trim()) ?? null;
}

export function mcipFallbacks(project: Project, pipeline: readonly PipelineProject[], boms: readonly SapProjectBom[]): McipFallbacks {
  const towers = projectQuantity(project) ?? 0;
  const row = pipelineFor(project, pipeline);
  const perSection = row ? materialPerSection(row) : 0;
  const sections = sectionsPerTower(project) ?? (row && row.sectionsPerTower >= 1 ? row.sectionsPerTower : null);
  const bom = sapBomFor(project, boms);
  return {
    towers,
    sectionsPerTower: sections,
    pipelineBudget: row && perSection > 0 && sections && towers ? perSection * sections * towers : null,
    pipelineProject: row?.project ?? null,
    bomPerTower: bom ? bom.items.reduce((sum, item) => sum + (item.unitPriceUsd ?? 0) * item.qtyPerTower, 0) : null,
  };
}
