// Reads a Material Delivery Management Plan (MDMP) workbook: one sheet per
// project plus an "Issue note" sheet.
//
// Project sheet layout (WK41 2026): meta lines in column B ("Project Name : …",
// "Tower Q'ty : 149T X 4S …"), a header row starting "Item Description" with
// Unit · Manufacturer · Vendor No. · INCOTERMS · Shipping by · Payment Terms ·
// Subtotal in columns C–I, then one column per week (year over month over ISO
// week number; the year is often missing). Below: the production plan the MDMP
// is based on ("Actual MPP": Cutting, BT Released, …), then material sections
// ("Main Material", "Internal Material", "Shipping Hardware"). In a material row
// a week cell holds "PO" (order week), "OC" (order confirmation), a pickup
// incoterm ("EXW", "FCA", "FOB": we collect it) or a number (quantity arriving
// at our site). Green fill marks done, yellow attention, red risky, blue a
// confirmed order.
import { addWeeksTo, isoWeekOf, weekIndex, weeksInYear, type IsoWeek } from "../mpp/weeks";

export type GridCell = { value: unknown; fill: string | null };
export type Grid = GridCell[][];

export type CellStatus = "done" | "attention" | "risky" | "confirmed" | null;

export type MdmpEvent = {
  week: IsoWeek;
  kind: "po" | "oc" | "pickup" | "arrival";
  /** Arrival quantity, in the line's unit. */
  qty: number;
  status: CellStatus;
  /** The marker as written ("EXW", "FCA", "FOB"), for pickups. */
  label?: string;
};

export type MdmpSection = "main" | "internal" | "shipping";

export type MdmpLine = {
  row: number;
  section: MdmpSection;
  description: string;
  /** "Steel plate", "Flange", "Fall arrest", "Kitset" … taken from the description. */
  group: string;
  poNumbers: string[];
  unit: string;
  manufacturer: string;
  vendorNo: string;
  incoterms: string;
  shippingBy: string;
  paymentTerms: string;
  subtotal: number;
  events: MdmpEvent[];
};

export type MdmpProcess = "Cutting" | "BT Released" | "WT Release" | "IM Release" | "Green Tag" | "Invoice" | "PO Date" | "Shipping";

export type MdmpProject = {
  sheet: string;
  projectName: string;
  modelNo: string;
  towerQty: string;
  towers: number | null;
  sectionsPerTower: number | null;
  processes: Partial<Record<MdmpProcess, Array<{ week: IsoWeek; qty: number }>>>;
  lines: MdmpLine[];
};

export type MdmpIssue = {
  project: string;
  category: string;
  item: string;
  vendor: string;
  released: string;
  type: string;
  description: string;
  affectedQty: number | null;
  priority: string;
  risk: string;
  owner: string;
  recoveryPlan: string;
  dueWeek: string;
  status: string;
};

export type MdmpPlan = {
  referenceDate: Date;
  projects: MdmpProject[];
  issues: MdmpIssue[];
};

export class MdmpFormatError extends Error {}

const STATUS_BY_FILL: Record<string, CellStatus> = {
  "92D050": "done",
  FFFF00: "attention",
  FF0000: "risky",
  "00B0F0": "confirmed",
};
const PICKUP_MARKERS = new Set(["EXW", "FCA", "FOB", "EXE"]);
const PROCESS_LABELS: Record<string, MdmpProcess> = {
  cutting: "Cutting",
  "bt released": "BT Released",
  "wt release": "WT Release",
  "im release": "IM Release",
  "im qc release": "IM Release",
  "green tag": "Green Tag",
  invoice: "Invoice",
  "po date": "PO Date",
  shipping: "Shipping",
};
const GROUP_NAMES: Record<string, string> = { sp: "Steel plate", fl: "Flange", df: "Door frame" };
const NON_PROJECT_SHEETS = new Set(["issue note", "checklist", "<>"]);

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value).replace(/\s+/g, " ").trim());
function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value);
  return null;
}
const statusOf = (cell: GridCell | undefined): CellStatus => (cell?.fill ? (STATUS_BY_FILL[cell.fill.toUpperCase().slice(-6)] ?? null) : null);
const cellAt = (grid: Grid, row: number, column: number): GridCell | undefined => grid[row]?.[column];
const valueAt = (grid: Grid, row: number, column: number) => cellAt(grid, row, column)?.value;

/**
 * ISO year for each week column. Uses the year labels where present; otherwise
 * finds the year from where the week numbers wrap (a 53-week year ends in 53)
 * and picks the candidate closest to the sheet's reference date.
 */
export function assignWeekYears(weeks: Array<number | null>, yearLabels: Array<number | null>, referenceDate: Date): Array<IsoWeek | null> {
  const columns = weeks.map((week, index) => ({ week, index })).filter((item): item is { week: number; index: number } => item.week !== null);
  if (!columns.length) return weeks.map(() => null);

  // Year offset of each column relative to the first: +1 after every wrap.
  const offsets: number[] = [];
  let offset = 0;
  columns.forEach((column, position) => {
    if (position > 0 && column.week < columns[position - 1].week) offset += 1;
    offsets.push(offset);
  });

  /** A week numbered past its year's end (e.g. 53 in a 52-week year) is the next year's first week. */
  const resolve = (firstYear: number, position: number): IsoWeek => {
    const year = firstYear + offsets[position];
    const { week } = columns[position];
    return week <= weeksInYear(year) ? { year, week } : addWeeksTo({ year, week: weeksInYear(year) }, week - weeksInYear(year));
  };

  const labelled = columns.findIndex((column) => (yearLabels[column.index] ?? 0) > 2000);
  let firstYear: number;
  if (labelled >= 0) {
    firstYear = (yearLabels[columns[labelled].index] as number) - offsets[labelled];
  } else {
    const reference = isoWeekOf(referenceDate);
    const lastBeforeWrap = columns.findIndex((_, position) => position + 1 < columns.length && offsets[position + 1] > offsets[position]);
    const candidates = [-2, -1, 0, 1, 2].map((shift) => reference.year + shift);
    // Where the numbering wraps, the week before it is that year's last week (52 or 53).
    const fitting = candidates.filter(
      (year) => lastBeforeWrap < 0 || columns[lastBeforeWrap].week === weeksInYear(year + offsets[lastBeforeWrap]),
    );
    // Without a wrap, a week 53 still pins the year to a 53-week one.
    const with53 = columns.findIndex((column) => column.week === 53);
    const pool = (fitting.length ? fitting : candidates).filter((year) => with53 < 0 || weeksInYear(year + offsets[with53]) === 53);
    const middle = Math.floor(columns.length / 2);
    const distance = (year: number) => Math.abs(weekIndex(resolve(year, middle)) - weekIndex(reference));
    firstYear = (pool.length ? pool : candidates).reduce((best, year) => (distance(year) < distance(best) ? year : best));
  }

  const result: Array<IsoWeek | null> = weeks.map(() => null);
  columns.forEach((column, position) => (result[column.index] = resolve(firstYear, position)));
  return result;
}

function meta(grid: Grid, headerRow: number) {
  const fields = new Map<string, string>();
  for (let row = 0; row < headerRow; row += 1) {
    const value = text(valueAt(grid, row, 1));
    const split = value.indexOf(":");
    if (split > 0) fields.set(value.slice(0, split).trim().toLowerCase(), value.slice(split + 1).trim());
  }
  return fields;
}

function groupOf(description: string, section: MdmpSection): string {
  const head = description.split(/\bPO\b|\d{6,}|\(/i)[0].trim().replace(/[\s:-]+$/, "");
  if (!head) return section === "shipping" ? "Shipping hardware" : "Unspecified";
  return GROUP_NAMES[head.toLowerCase()] ?? head;
}

function parseProjectSheet(sheet: string, grid: Grid, referenceDate: Date): MdmpProject | null {
  const headerRow = grid.findIndex((row) => text(row?.[0]?.value).toLowerCase().startsWith("item description"));
  if (headerRow < 0) return null;
  const width = Math.max(...grid.slice(headerRow, headerRow + 3).map((row) => row?.length ?? 0));
  const firstWeekColumn = 9;
  const weekNumbers: Array<number | null> = [];
  const yearLabels: Array<number | null> = [];
  for (let column = 0; column < width; column += 1) {
    const week = column >= firstWeekColumn ? numeric(valueAt(grid, headerRow + 2, column)) : null;
    weekNumbers.push(week !== null && week >= 1 && week <= 53 ? week : null);
    yearLabels.push(numeric(valueAt(grid, headerRow, column)));
  }
  const weeks = assignWeekYears(weekNumbers, yearLabels, referenceDate);

  const fields = meta(grid, headerRow);
  const projectName = fields.get("project name") || sheet;
  const towerQty = fields.get("tower q'ty") ?? "";
  const scope = /(\d+)\s*T\s*[xX]\s*(\d+)\s*S/.exec(`${towerQty} ${projectName}`) ?? /(\d+)\s*Towers?\s*[xX]\s*(\d+)\s*S/i.exec(towerQty);
  // Adapter scopes ("O'Brien 47Adapter", "Highland 126 Adapter") are one section each.
  const adapters = scope ? null : /(\d+)\s*Adapters?/i.exec(`${projectName} ${sheet}`);
  const project: MdmpProject = {
    sheet,
    projectName,
    modelNo: fields.get("model no.") ?? "",
    towerQty,
    towers: scope ? Number(scope[1]) : adapters ? Number(adapters[1]) : null,
    sectionsPerTower: scope ? Number(scope[2]) : adapters ? 1 : null,
    processes: {},
    lines: [],
  };

  let block: "processes" | MdmpSection | null = null;
  for (let row = headerRow + 3; row < grid.length; row += 1) {
    const first = text(valueAt(grid, row, 0)).toLowerCase();
    if (first.startsWith("actual mpp")) block = "processes";
    else if (first.startsWith("convert mpp")) block = null;
    else if (first.startsWith("main material")) block = "main";
    else if (first.startsWith("internal material")) block = "internal";
    else if (first.startsWith("shipping h")) block = "shipping";
    if (!block) continue;

    const description = text(valueAt(grid, row, 1));
    if (block === "processes") {
      const process = PROCESS_LABELS[description.toLowerCase()];
      if (!process || project.processes[process]) continue;
      project.processes[process] = weeks.flatMap((week, column) => {
        const qty = numeric(valueAt(grid, row, column));
        return week && qty ? [{ week, qty }] : [];
      });
      continue;
    }

    const manufacturer = text(valueAt(grid, row, 3));
    if (!description && !manufacturer) continue;
    const events: MdmpEvent[] = [];
    weeks.forEach((week, column) => {
      if (!week) return;
      const cell = cellAt(grid, row, column);
      const qty = numeric(cell?.value);
      const marker = text(cell?.value).toUpperCase();
      const status = statusOf(cell);
      if (qty && qty > 0) events.push({ week, kind: "arrival", qty, status });
      else if (marker === "PO") events.push({ week, kind: "po", qty: 0, status });
      else if (marker === "OC") events.push({ week, kind: "oc", qty: 0, status });
      else if (PICKUP_MARKERS.has(marker)) events.push({ week, kind: "pickup", qty: 0, status, label: marker === "EXE" ? "EXW" : marker });
    });
    project.lines.push({
      row: row + 1,
      section: block,
      description,
      group: groupOf(description, block),
      poNumbers: [...new Set(description.match(/\b45\d{8}\b/g) ?? [])],
      unit: text(valueAt(grid, row, 2)) || "SEC",
      manufacturer,
      vendorNo: text(valueAt(grid, row, 4)),
      incoterms: text(valueAt(grid, row, 5)).toUpperCase().replace(/^EXE$/, "EXW"),
      shippingBy: text(valueAt(grid, row, 6)),
      paymentTerms: text(valueAt(grid, row, 7)),
      subtotal: numeric(valueAt(grid, row, 8)) ?? 0,
      events,
    });
  }
  return project;
}

function parseIssueNote(grid: Grid): MdmpIssue[] {
  const headerRow = grid.findIndex((row) => row?.some((cell) => text(cell?.value).toLowerCase() === "project names"));
  if (headerRow < 0) return [];
  const headers = (grid[headerRow] ?? []).map((cell) => text(cell?.value).toLowerCase());
  const column = (name: string) => headers.findIndex((header) => header.startsWith(name));
  const get = (row: number, name: string) => {
    const index = column(name);
    return index < 0 ? "" : text(valueAt(grid, row, index));
  };
  const issues: MdmpIssue[] = [];
  for (let row = headerRow + 1; row < grid.length; row += 1) {
    const project = get(row, "project names");
    if (!project) continue;
    const releasedValue = column("date released") >= 0 ? valueAt(grid, row, column("date released")) : null;
    issues.push({
      project,
      category: get(row, "category"),
      item: get(row, "items"),
      vendor: get(row, "vendors"),
      released: releasedValue instanceof Date ? releasedValue.toISOString().slice(0, 10) : text(releasedValue),
      type: get(row, "issue type"),
      description: get(row, "issue description"),
      affectedQty: numeric(get(row, "affected")),
      priority: get(row, "priority"),
      risk: get(row, "risk"),
      owner: get(row, "issue owner"),
      recoveryPlan: get(row, "recover"),
      dueWeek: get(row, "due date"),
      status: get(row, "issue status"),
    });
  }
  return issues;
}

/** The sheet's own "as of" date (a date cell in the first rows), if any. */
function sheetDate(grid: Grid): Date | null {
  for (const row of grid.slice(0, 4)) for (const cell of row ?? []) if (cell?.value instanceof Date) return cell.value;
  return null;
}

export function parseMdmpSheets(sheets: Array<{ name: string; grid: Grid }>, fallbackDate: Date): MdmpPlan {
  const referenceDate = sheets.map((sheet) => sheetDate(sheet.grid)).find(Boolean) ?? fallbackDate;
  const projects: MdmpProject[] = [];
  let issues: MdmpIssue[] = [];
  for (const { name, grid } of sheets) {
    const key = name.trim().toLowerCase();
    if (key === "issue note") issues = parseIssueNote(grid);
    if (NON_PROJECT_SHEETS.has(key)) continue;
    const project = parseProjectSheet(name, grid, sheetDate(grid) ?? referenceDate);
    if (project?.lines.length) projects.push(project);
  }
  if (!projects.length) throw new MdmpFormatError("No project sheets with an \"Item Description\" header were found.");
  return { referenceDate, projects, issues };
}
