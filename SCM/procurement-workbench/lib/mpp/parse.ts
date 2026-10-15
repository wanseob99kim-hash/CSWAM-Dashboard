// Reads the "AM" sheet of a Master Production Plan workbook.
//
// Layout (as of WK42 2026): a header row with "Project" in column B and years
// over the week columns, a month row below it, then a row of ISO week numbers.
// Each project block starts with its title in column B (the number in column A
// is tons per tower) and lists one row per label in column C: material rows
// (Steel plate, Flange, Door frame, Internal) followed by process rows
// (Cutting, BT Released, ..., Shipping). Section sub-rows repeat process labels
// such as "Bottom"; only the first row of each label is used.
import { addWeeksTo, isValidWeek, weeksInYear, type IsoWeek } from "./weeks";

export const MPP_MATERIALS = ["Steel plate", "Flange", "Door frame", "Internal"] as const;
export type MppMaterial = (typeof MPP_MATERIALS)[number];

export const MPP_PROCESSES = ["Cutting", "BT Released", "WT Release", "IM QC Release", "Green Tag", "Invoice", "PO Date", "Shipping"] as const;
export type MppProcess = (typeof MPP_PROCESSES)[number];

/** Quantity per ISO week, in the units the plan uses (usually sections). */
export type WeeklySeries = Array<{ week: IsoWeek; qty: number }>;

export type MppProject = {
  /** 1-based row of the project title, for pointing users back to the sheet. */
  row: number;
  title: string;
  customer: string;
  /** Leading reference number in the title (e.g. a customer PO or plant code). */
  reference: string | null;
  tonsPerTower: number | null;
  towers: number | null;
  sectionsPerTower: number | null;
  /** Adapter-only scopes have no door frame. */
  isAdapter: boolean;
  materials: Partial<Record<MppMaterial, WeeklySeries>>;
  processes: Partial<Record<MppProcess, WeeklySeries>>;
};

export type MppPlan = {
  sheetName: string;
  firstWeek: IsoWeek;
  lastWeek: IsoWeek;
  projects: MppProject[];
};

export class MppFormatError extends Error {}

const SHEET_NAME = "AM";
const TOTALS_LABEL = "Total";

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).replace(/\s+/g, " ").trim();
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

/** Finds the header row ("Project" in column B) and maps week columns to ISO weeks. */
function readWeekColumns(rows: unknown[][]): { headerRow: number; columns: Map<number, IsoWeek> } {
  const headerRow = rows.findIndex((row) => text(row?.[1]).toLowerCase() === "project");
  if (headerRow < 0) throw new MppFormatError('No header row with "Project" in column B.');
  const yearRow = rows[headerRow] ?? [];
  const weekRow = rows[headerRow + 2] ?? [];

  const columns = new Map<number, IsoWeek>();
  let year: number | null = null;
  for (let column = 12; column < Math.max(yearRow.length, weekRow.length); column += 1) {
    const yearValue = numeric(yearRow[column]);
    if (yearValue && yearValue > 2000 && yearValue < 2100) year = yearValue;
    const week = numeric(weekRow[column]);
    if (!year || !week) continue;
    if (isValidWeek({ year, week })) columns.set(column, { year, week });
    // The plan may number one week past the ISO year end (e.g. "2027 W53"); that week is next year's W01.
    else if (week === weeksInYear(year) + 1) columns.set(column, addWeeksTo({ year, week: weeksInYear(year) }, 1));
  }
  if (!columns.size) throw new MppFormatError("No week columns found under the header row.");
  return { headerRow, columns };
}

function readSeries(row: unknown[], columns: Map<number, IsoWeek>): WeeklySeries {
  const series: WeeklySeries = [];
  for (const [column, week] of columns) {
    const qty = numeric(row[column]);
    if (qty) series.push({ week, qty });
  }
  return series;
}

function describeTitle(title: string) {
  const reference = /^(\d{3,})\b/.exec(title)?.[1] ?? null;
  const withoutReference = reference ? title.slice(reference.length).trim() : title;
  const customer = withoutReference.split(" ")[0] ?? "";
  const towerMatch = /(\d+)\s*T\s*[xX]\s*(\d+)\s*S(?:ec)?\b/i.exec(title);
  const adapterMatch = /(\d+)\s*Adapters?\b/i.exec(title);
  return {
    reference,
    customer,
    towers: towerMatch ? Number(towerMatch[1]) : adapterMatch ? Number(adapterMatch[1]) : null,
    sectionsPerTower: towerMatch ? Number(towerMatch[2]) : adapterMatch ? 1 : null,
    isAdapter: Boolean(adapterMatch),
  };
}

/** Parses the sheet as a grid of cell values (row-major, 0-based), e.g. from XLSX sheet_to_json(header: 1). */
export function parseMppRows(rows: unknown[][], sheetName = SHEET_NAME): MppPlan {
  const { headerRow, columns } = readWeekColumns(rows);
  const projects: MppProject[] = [];
  let current: MppProject | null = null;

  for (let index = headerRow + 3; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const title = text(row[1]);
    if (title && title !== TOTALS_LABEL) {
      current = {
        row: index + 1,
        title,
        tonsPerTower: numeric(row[0]),
        materials: {},
        processes: {},
        ...describeTitle(title),
      };
      projects.push(current);
    } else if (title === TOTALS_LABEL) {
      current = null;
    }
    if (!current) continue;

    const label = text(row[2]);
    if ((MPP_MATERIALS as readonly string[]).includes(label)) {
      current.materials[label as MppMaterial] ??= readSeries(row, columns);
    } else if ((MPP_PROCESSES as readonly string[]).includes(label)) {
      current.processes[label as MppProcess] ??= readSeries(row, columns);
    }
  }

  const weeks = [...columns.values()];
  return { sheetName, firstWeek: weeks[0], lastWeek: weeks[weeks.length - 1], projects };
}
