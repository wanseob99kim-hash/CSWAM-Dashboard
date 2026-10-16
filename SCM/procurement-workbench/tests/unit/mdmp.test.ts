import { describe, expect, test } from "vitest";
import { findLeadTime, parseLeadTimeSheets } from "../../lib/leadtime/parse";
import { suggestedPlanLeadTimes } from "../../lib/leadtime/plan-defaults";
import { cashEvents, coverageChecks, lineLeadTime, lineShipments, poValueByLine, purchaseActions, upcomingShipments } from "../../lib/mdmp/analysis";
import { issueMatchesSheet, matchMdmpProjects } from "../../lib/mdmp/match";
import { describeDrift, matchMdmpToMpp, scheduleDrift, withMppProcesses } from "../../lib/mdmp/mpp-sync";
import { assignWeekYears, MdmpFormatError, parseMdmpSheets, type Grid, type MdmpLine } from "../../lib/mdmp/parse";
import { DEFAULT_PLAN_SETTINGS } from "../../lib/mpp/order-plan";
import type { MppPlan, MppProject } from "../../lib/mpp/parse";
import { formatWeek, type IsoWeek } from "../../lib/mpp/weeks";
import { formatPaymentTerms, parsePaymentTerms, paymentDueDate } from "../../lib/payment-terms";
import type { Project, PurchasePoLine } from "../../lib/types";

const GREEN = "FF92D050";
const iso = (date: Date) => date.toISOString().slice(0, 10);
const week = (year: number, number: number): IsoWeek => ({ year, week: number });

// A project sheet laid out like the real MDMP: meta lines in column B, header
// row "Item Description", then month and ISO week rows; week columns from J.
// Weeks run 2026 W50..W53 then 2027 W01..W06 with no year labels.
const WEEKS = [50, 51, 52, 53, 1, 2, 3, 4, 5, 6];
const FIRST_WEEK_COLUMN = 9;
const columnOf = (weekNumber: number) => FIRST_WEEK_COLUMN + WEEKS.indexOf(weekNumber);

function row(cells: unknown[], weekCells: Record<number, unknown> = {}, fills: Record<number, string> = {}) {
  const out = cells.map((value) => ({ value, fill: null as string | null }));
  while (out.length < FIRST_WEEK_COLUMN + WEEKS.length) out.push({ value: null, fill: null });
  for (const [weekNumber, value] of Object.entries(weekCells)) out[columnOf(Number(weekNumber))] = { value, fill: fills[Number(weekNumber)] ?? null };
  return out;
}

function projectSheet(): Grid {
  return [
    row([null, "Project Name : Test Site", new Date(Date.UTC(2026, 11, 9))]),
    row([null, "Tower Q'ty : 10T X 4S"]),
    row([null, "Model No. : N163"]),
    row(["Item Description", null, "Unit", "Manufacturer", "Vendor No.", "INCOTERMS", "Shipping by", "Payment Terms", "Subtotal"]),
    row([], { 50: "Dec", 1: "Jan" }),
    row([], Object.fromEntries(WEEKS.map((number) => [number, number]))),
    row(["Actual MPP", "Cutting"], { 52: 20, 1: 20 }),
    row(["Main Material"]),
    row([null, "SP PO 4500000001", "SEC", "Nucor", "V1", "EXW", "Truck", "EOM+30days", 40], { 50: "PO", 51: "OC", 53: "EXW", 1: 20, 3: 20 }, { 50: GREEN, 51: GREEN }),
    row(["Internal Material"]),
    row([null, "Platform", "SET", "Barga", "V2", "DAP", "Ocean", "Invoice + 30days", 10], { 6: 10 }),
    row([null, "Fall arrest PO 4500000002", "SET", "Ficont", "V3", "FCA", "Truck", "NET 60", 10], { 50: "PO", 2: 10 }, { 50: GREEN }),
  ];
}

const issueSheet: Grid = [
  [{ value: "Project Names", fill: null }, { value: "Category", fill: null }, { value: "Issue Status", fill: null }],
  [{ value: "Test Site", fill: null }, { value: "Steel", fill: null }, { value: "Open", fill: null }],
];

const plan = () => parseMdmpSheets([{ name: "Test Site", grid: projectSheet() }, { name: "Issue note", grid: issueSheet }], new Date(Date.UTC(2026, 0, 1)));
const leadTimeFor = (line: MdmpLine) => lineLeadTime(null, line, DEFAULT_PLAN_SETTINGS);

describe("payment terms", () => {
  test("reads EOM, invoice, and NET terms as written in the MDMP and SAP", () => {
    expect(parsePaymentTerms("EOM+110days")).toEqual({ basis: "eom", days: 110 });
    expect(parsePaymentTerms("EOM + 120 days")).toEqual({ basis: "eom", days: 120 });
    expect(parsePaymentTerms("Inoice+30days")).toEqual({ basis: "invoice", days: 30 });
    expect(parsePaymentTerms("NET 60")).toEqual({ basis: "invoice", days: 60 });
    expect(parsePaymentTerms("Due upon receipt")).toEqual({ basis: "invoice", days: 0 });
    expect(parsePaymentTerms("")).toBeNull();
    expect(parsePaymentTerms("TBD")).toBeNull();
  });

  test("counts EOM terms from the last day of the invoice month", () => {
    const invoice = new Date(Date.UTC(2026, 9, 14));
    expect(iso(paymentDueDate(invoice, { basis: "eom", days: 30 }))).toBe("2026-11-30");
    expect(iso(paymentDueDate(invoice, { basis: "invoice", days: 30 }))).toBe("2026-11-13");
    expect(formatPaymentTerms({ basis: "eom", days: 110 })).toBe("EOM + 110 days");
    expect(formatPaymentTerms(null)).toBe("Unknown terms");
  });
});

describe("assignWeekYears", () => {
  test("uses a year label when one is present", () => {
    const weeks = assignWeekYears([null, 52, 1, 2], [null, 2025, null, null], new Date(Date.UTC(2030, 0, 1)));
    expect(weeks.map((item) => (item ? formatWeek(item) : null))).toEqual([null, formatWeek(week(2025, 52)), formatWeek(week(2026, 1)), formatWeek(week(2026, 2))]);
  });

  test("without labels, a wrap after week 53 pins a 53-week year", () => {
    const weeks = assignWeekYears([52, 53, 1], [null, null, null], new Date(Date.UTC(2027, 3, 1)));
    expect(weeks).toEqual([week(2026, 52), week(2026, 53), week(2027, 1)]);
  });

  test("without a wrap, picks the year closest to the reference date", () => {
    const weeks = assignWeekYears([10, 11], [null, null], new Date(Date.UTC(2026, 2, 1)));
    expect(weeks).toEqual([week(2026, 10), week(2026, 11)]);
  });
});

describe("parseMdmpSheets", () => {
  test("reads project meta, processes, PO lines, markers, and fill status", () => {
    const result = plan();
    expect(result.projects).toHaveLength(1);
    const [project] = result.projects;
    expect(project).toMatchObject({ sheet: "Test Site", projectName: "Test Site", towers: 10, sectionsPerTower: 4, modelNo: "N163" });
    expect(project.processes.Cutting).toEqual([{ week: week(2026, 52), qty: 20 }, { week: week(2027, 1), qty: 20 }]);

    const [steel, platform, fallArrest] = project.lines;
    expect(steel).toMatchObject({ section: "main", group: "Steel plate", poNumbers: ["4500000001"], incoterms: "EXW", paymentTerms: "EOM+30days", subtotal: 40 });
    expect(steel.events.map((event) => [event.kind, formatWeek(event.week), event.status])).toEqual([
      ["po", formatWeek(week(2026, 50)), "done"],
      ["oc", formatWeek(week(2026, 51)), "done"],
      ["pickup", formatWeek(week(2026, 53)), null],
      ["arrival", formatWeek(week(2027, 1)), null],
      ["arrival", formatWeek(week(2027, 3)), null],
    ]);
    expect(platform).toMatchObject({ section: "internal", group: "Platform", incoterms: "DAP" });
    expect(fallArrest.group).toBe("Fall arrest");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ project: "Test Site", category: "Steel", status: "Open" });
  });

  test("rejects a workbook without project sheets", () => {
    expect(() => parseMdmpSheets([{ name: "Issue note", grid: issueSheet }], new Date())).toThrow(MdmpFormatError);
  });
});

describe("MDMP analysis", () => {
  test("pairs pickup markers with arrivals and infers the rest from the observed transit", () => {
    const [steel] = plan().projects[0].lines;
    const shipments = lineShipments(steel, leadTimeFor(steel));
    expect(shipments.map((item) => [item.pickupWeek && formatWeek(item.pickupWeek), formatWeek(item.arrivalWeek), item.pickupInferred])).toEqual([
      [formatWeek(week(2026, 53)), formatWeek(week(2027, 1)), false],
      [formatWeek(week(2027, 2)), formatWeek(week(2027, 3)), true],
    ]);
  });

  test("invoices pickup terms at pickup and DAP at arrival, priced from PO detail", () => {
    const result = plan();
    const poLines = [{ po: "4500000001", amount: 4000 }] as PurchasePoLine[];
    const values = poValueByLine(result.projects, poLines);
    const events = cashEvents(result.projects, leadTimeFor, values);
    const summary = events.map((event) => [event.line.group, event.basis, formatWeek(event.invoiceWeek), event.dueDate && iso(event.dueDate), event.amount]);
    expect(summary).toEqual([
      // EXW, EOM + 30: invoiced Wed 2026-12-30, due 2026-12-31 + 30 days.
      ["Steel plate", "pickup", formatWeek(week(2026, 53)), "2027-01-30", 2000],
      ["Steel plate", "pickup", formatWeek(week(2027, 2)), "2027-03-02", 2000],
      // DAP, invoice + 30: invoiced on arrival Wed 2027-02-10.
      ["Platform", "arrival", formatWeek(week(2027, 6)), "2027-03-12", null],
      // FCA by truck, no marker: pickup = arrival - 1 week.
      ["Fall arrest", "pickup", formatWeek(week(2027, 1)), "2027-03-07", null],
    ]);
  });

  test("flags the first week arrivals fall behind cutting", () => {
    const [project] = plan().projects;
    const steel = coverageChecks(project, week(2026, 50)).find((check) => check.group === "Steel plate");
    expect(steel).toMatchObject({ basis: "sections", required: 40, ordered: 40, status: "short", shortWeek: week(2026, 52), shortQty: 20 });
  });

  test("asks for a PO by first arrival minus lead time, and an OC when it is missing", () => {
    const [project] = plan().projects;
    const actions = purchaseActions([project], leadTimeFor, week(2026, 51), 1);
    expect(actions.map((action) => [action.line.group, action.kind, formatWeek(action.week)])).toEqual([
      // Internal default 12 weeks + 1 safety week before 2027 W06.
      ["Platform", "place-po", formatWeek(week(2026, 46))],
      ["Fall arrest", "confirm-oc", formatWeek(week(2026, 50))],
    ]);
  });

  test("lists open pickups and arrivals in the window", () => {
    const [project] = plan().projects;
    const upcoming = upcomingShipments([project], leadTimeFor, week(2026, 52), 2);
    expect(upcoming.map((item) => [item.line.group, item.kind, item.weeksFromNow])).toEqual([
      ["Steel plate", "pickup", 1],
      ["Steel plate", "arrival", 2],
      ["Fall arrest", "pickup", 2],
    ]);
  });
});

describe("lead-time workbook", () => {
  const table = parseLeadTimeSheets([
    {
      name: "US only",
      rows: [
        ["Customer", "Supplier", "Product", "Target", "EXW", "Ocean", "DDP"],
        ["CSWAM", "Nucor", "Steel", null, 15, 2, 17],
        ["", "Frisa", "Flanges", null, 17, 4, 21],
        ["", "Seohan", "Flanges", null, 10, 4, 14],
        ["", "Millerbernd", "Door Segment", null, 18, 2, 20],
        ["", "Proinlosa", "Platform", null, 10, 6, 16],
        ["", "", "Ladder", null, 12, 6, 18],
        ["", "Ficont", "Fall arrest", null, 10, 6, 16],
      ],
    },
    { name: "Sheet2", rows: [["Supplier", "Abbr.", "Product", "Lead time"], ["Barga Industries", "BARGA", "Platform", 14]] },
    { name: "Sheet1", rows: [["Item", "CSWAM"], ["Mechanical Parts", 22], ["Fall Arrest", 14]] },
  ]);

  test("reads routes, suppliers, and CSWAM categories", () => {
    expect(table.routes).toHaveLength(7);
    expect(table.routes[5]).toMatchObject({ supplier: "Proinlosa", product: "Ladder", ddpWeeks: 18 });
    expect(table.suppliers).toEqual([{ supplier: "Barga Industries", abbreviation: "BARGA", product: "Platform", exwWeeks: 14 }]);
    expect(table.categories).toEqual({ "Mechanical Parts": 22, "Fall Arrest": 14 });
  });

  test("matches a route by supplier and product, else the supplier EXW plus transit", () => {
    expect(findLeadTime(table, "Proinlosa S.A.", "Ladder", "Ocean")).toMatchObject({ ddpWeeks: 18 });
    expect(findLeadTime(table, "Barga", "Platform", "Ocean")).toMatchObject({ exwWeeks: 14, transitWeeks: 10, ddpWeeks: 24 });
    expect(findLeadTime(table, "Unknown Co", "Platform", "Truck")).toBeNull();
  });

  test("line lead time falls back to the CSWAM category, then the plan setting", () => {
    const [, , fallArrest] = plan().projects[0].lines;
    const unknownVendor = { ...fallArrest, manufacturer: "Someone else" };
    expect(lineLeadTime(table, unknownVendor, DEFAULT_PLAN_SETTINGS)).toMatchObject({ ddpWeeks: 14, source: "Lead time file: CSWAM Fall Arrest" });
    expect(lineLeadTime(null, unknownVendor, DEFAULT_PLAN_SETTINGS)).toMatchObject({ ddpWeeks: DEFAULT_PLAN_SETTINGS.leadTimeWeeks.Internal });
  });

  test("suggests Material Plan lead times: longest route per main material, median for internal", () => {
    expect(suggestedPlanLeadTimes(table)).toEqual({ "Steel plate": 17, Flange: 21, "Door frame": 20, Internal: 16 });
  });
});

describe("MDMP project matching", () => {
  const project = (id: string, name: string): Project => ({ id, name, code: "", phase: "", productionWindow: "", plant: "", budget: 0 });

  test("links sheets to projects by site name and leaves unknown sheets out", () => {
    const [mdmp] = plan().projects;
    const other = { ...mdmp, sheet: "Elsewhere", projectName: "Elsewhere" };
    const matches = matchMdmpProjects([project("a", "Other Wind"), project("b", "Test Site 10T")], [mdmp, other]);
    expect([...matches]).toEqual([["Test Site", "b"]]);
  });

  test("ties issue-note rows to their sheet", () => {
    const [mdmp] = plan().projects;
    expect(issueMatchesSheet("Test Site", mdmp)).toBe(true);
    expect(issueMatchesSheet("Elsewhere", mdmp)).toBe(false);
  });
});

describe("MDMP vs MPP", () => {
  const mppProject = (row: number, title: string, towers: number, cutting: Array<[IsoWeek, number]>): MppProject => ({
    row,
    title,
    customer: "",
    reference: null,
    tonsPerTower: null,
    towers,
    sectionsPerTower: 4,
    isAdapter: false,
    materials: {},
    processes: { Cutting: cutting.map(([week, qty]) => ({ week, qty })) },
  });
  const mppPlan = (projects: MppProject[]) => ({ sheetName: "AM", projects }) as unknown as MppPlan;

  test("matches sheets by site name, preferring the same tower count", () => {
    const [mdmp] = plan().projects;
    const matches = matchMdmpToMpp([mdmp], mppPlan([mppProject(5, "Test Site 20T X 4S", 20, []), mppProject(9, "Test Site 10T X 4S", 10, [])]));
    expect(matches.get("Test Site")?.row).toBe(9);
  });

  test("uses the MPP cutting plan for shortages and reports where the MDMP differs", () => {
    const [mdmp] = plan().projects;
    // The MPP moved cutting later: 2027 W02 and W03 instead of 2026 W52 and 2027 W01 (2026 has 53 weeks).
    const mpp = mppProject(9, "Test Site 10T X 4S", 10, [[week(2027, 2), 20], [week(2027, 3), 20]]);
    const matches = matchMdmpToMpp([mdmp], mppPlan([mpp]));

    const synced = withMppProcesses(mdmp, matches.get(mdmp.sheet));
    expect(synced.processes.Cutting).toEqual(mpp.processes.Cutting);
    expect(mdmp.processes.Cutting?.[0].week).toEqual(week(2026, 52)); // the original is untouched
    const steel = coverageChecks(synced, week(2026, 50)).find((check) => check.group === "Steel plate");
    // Arrivals 20 in W01 and 20 in W03 now cover cutting in W02 and W03.
    expect(steel).toMatchObject({ status: "covered", shortWeek: null });

    const [drift] = scheduleDrift([mdmp], matches);
    expect(drift).toMatchObject({ process: "Cutting", mdmpTotal: 40, mppTotal: 40, weeksChanged: 4 });
    expect(describeDrift(drift)).toBe(`starts 3 wk later in the MPP (${formatWeek(week(2027, 2))}) · 4 weeks differ`);
  });

  test("keeps the MDMP plan when the sheet has no MPP project", () => {
    const [mdmp] = plan().projects;
    expect(withMppProcesses(mdmp, undefined)).toBe(mdmp);
    expect(scheduleDrift([mdmp], new Map())).toEqual([]);
  });
});
