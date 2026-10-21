// Reads the "MPP Invoicing" sheet of the Sales Pipeline workbook
// (Finance/Raw data/Sales Pipeline/CSAM_Pipeline2026_*.xlsx): one row per
// project with the customer's per-section prices for each material, which is
// what the project's material budget is built from. The same reading as
// Finance/feeding/pipeline_compare.py.

export type PipelinePerSection = {
  steel: number;
  doorFrame: number;
  flange: number;
  weldingBracket: number;
  internal: number;
  paint: number;
};

export type PipelineProject = {
  customer: string;
  project: string;
  sectionsPerTower: number;
  /** Revenue per section, USD. */
  revenuePerSection: number;
  /** USD per section, material price plus its handling. */
  perSection: PipelinePerSection;
  /** "Material Total/Sec": some rows (Nordex) fill only this; it also holds logistics. */
  materialTotalPerSection: number;
};

export class PipelineFormatError extends Error {}

const SHEET = /MPP\s*Invo/i; // the workbook spells it "MPP Invocing"
const HEADER_SCAN_ROWS = 10;
const MAX_BLANK_ROWS = 10;

/** Column names per value; pipeline versions spell them differently (Jan "ASP_Plate", Oct "Plate/Sec"). */
const COLUMNS: Record<keyof PipelinePerSection, string[][]> = {
  steel: [["ASP_Plate", "Plate/Sec"], ["Steel Handling", "Steel Handling/Sec"]],
  doorFrame: [["ASP_Door Frame", "Door Frame/Sec"], ["D/F Handling", "D/F Handling/Sec"]],
  flange: [["ASP_Flange", "Flange/Sec"], ["Flange_Handling", "Flange Handling/Sec"]],
  weldingBracket: [["ASP_Welding Bracket", "Welding Bracket/Sec"], ["WB Handling", "WB Handling/Sec"]],
  internal: [["ASP_Internal", "Internal/Sec"], ["Internal Hanling", "Internal Handling/Sec"]],
  paint: [["ASP_Paint", "Paint/Sec"], ["ASP_Zinc Wire", "Zinc Wire/Sec"], ["Paint_Zinc Handling", "Paint_Zinc Handling/Sec"]],
};

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value).replace(/\s+/g, " ").trim());
const numberOf = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(text(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

export function pipelineSheetName(sheetNames: string[]): string | null {
  return sheetNames.find((name) => SHEET.test(name)) ?? null;
}

export function parsePipelineRows(rows: unknown[][]): PipelineProject[] {
  const head = rows.slice(0, HEADER_SCAN_ROWS).findIndex((row) => text(row?.[0]) === "Customer" && text(row?.[1]) === "Project Name");
  if (head < 0) throw new PipelineFormatError("'Customer / Project Name' header not found in the MPP Invoicing sheet.");
  // Labels sit on the header row and the row below it; the first spelling found wins.
  const labels = new Map<string, number>();
  for (const row of rows.slice(head, head + 2)) {
    (row ?? []).forEach((value, column) => {
      const label = text(value);
      if (label && !labels.has(label)) labels.set(label, column);
    });
  }
  const find = (pattern: RegExp) => [...labels.entries()].find(([label]) => pattern.test(label))?.[1];
  const sectionsColumn = find(/^No of Sec$/i);
  const revenueColumn = find(/^Rev.*(K USD.*Sec|Sec.*K USD)/i);
  const materialTotalColumn = find(/^Material Total\/Sec$/i);
  const columns = Object.fromEntries(
    Object.entries(COLUMNS).map(([key, groups]) => [key, groups.map((names) => names.map((name) => labels.get(name)).find((column) => column !== undefined))]),
  ) as Record<keyof PipelinePerSection, Array<number | undefined>>;
  if (columns.steel[0] === undefined || columns.flange[0] === undefined) {
    throw new PipelineFormatError("Plate/Sec and Flange/Sec columns not found in the MPP Invoicing sheet.");
  }

  const projects: PipelineProject[] = [];
  let blanks = 0;
  for (const row of rows.slice(head + 1)) {
    const project = text(row?.[1]);
    if (project.toLowerCase() === "total") break; // a second table follows the first total
    if (!project || project === "Project Name") {
      blanks += 1;
      if (blanks > MAX_BLANK_ROWS) break;
      continue;
    }
    blanks = 0;
    const cell = (column: number | undefined) => (column === undefined ? 0 : numberOf(row?.[column]));
    const perSection = Object.fromEntries(
      Object.entries(columns).map(([key, list]) => [key, list.reduce<number>((sum, column) => sum + cell(column), 0)]),
    ) as PipelinePerSection;
    projects.push({
      customer: text(row?.[0]),
      project,
      sectionsPerTower: cell(sectionsColumn),
      revenuePerSection: cell(revenueColumn) * 1000,
      perSection,
      materialTotalPerSection: cell(materialTotalColumn),
    });
  }
  return projects;
}

/** Material the MCIP compares against: everything the SAP BOM buys (paint is bought outside it). */
export function materialPerSection(row: Pick<PipelineProject, "perSection" | "materialTotalPerSection">): number {
  const { steel, doorFrame, flange, weldingBracket, internal } = row.perSection;
  const parts = steel + doorFrame + flange + weldingBracket + internal;
  // Rows priced only as a total (no per-material split) fall back to that total.
  return parts > 0 ? parts : (row.materialTotalPerSection ?? 0);
}

export type PipelineFile = { version: 1; source: string; projects: PipelineProject[] };

export function readPipelineFile(text: string): PipelineFile {
  const data = JSON.parse(text) as Partial<PipelineFile>;
  if (data.version !== 1 || !Array.isArray(data.projects)) throw new Error("Not a Sales Pipeline budget file. Publish it again with npm run plans:publish.");
  return data as PipelineFile;
}
