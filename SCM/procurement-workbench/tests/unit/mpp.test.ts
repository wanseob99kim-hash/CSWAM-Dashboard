import { describe, expect, test } from "vitest";
import { workbenchCoverage } from "../../lib/mpp/coverage";
import { isWindowOff, projectQuantity, reconcileProjects, siteName } from "../../lib/mpp/match";
import { buildOrderPlan, DEFAULT_PLAN_SETTINGS, findPlanIssues, measureArrivalOffsets } from "../../lib/mpp/order-plan";
import { MppFormatError, parseMppRows } from "../../lib/mpp/parse";
import { addWeeksTo, formatWeek, isoWeekOf, weeksBetween, weeksInYear, type IsoWeek } from "../../lib/mpp/weeks";
import { createDeliveryDraft } from "../../lib/drafts";
import type { Project } from "../../lib/types";

// A small sheet laid out like the real "AM" sheet: header row with "Project" in column B,
// years over the week columns, months below, ISO week numbers below that.
const FIRST_COLUMN = 12;
const WEEKS: Array<[number, number]> = [
  ...Array.from({ length: 13 }, (_, index): [number, number] => [2026, 41 + index]), // 2026 W41..W53
  ...Array.from({ length: 30 }, (_, index): [number, number] => [2027, 1 + index]), // 2027 W01..W30
];
const column = (year: number, week: number) => FIRST_COLUMN + WEEKS.findIndex(([y, w]) => y === year && w === week);

function sheet(blocks: Array<{ tons?: number; title: string; rows: Array<[string, Array<[number, number, number]>]> }>): unknown[][] {
  const width = FIRST_COLUMN + WEEKS.length;
  const blank = () => Array<unknown>(width).fill(null);
  const header = blank();
  header[1] = "Project";
  WEEKS.forEach(([year, week], index) => {
    if (index === 0 || week === 1) header[FIRST_COLUMN + index] = year;
  });
  const months = blank();
  const weeks = blank();
  WEEKS.forEach(([, week], index) => (weeks[FIRST_COLUMN + index] = week));
  const grid: unknown[][] = [blank(), blank(), header, months, weeks];
  const totals = blank();
  totals[1] = "Total";
  totals[2] = "Cutting ";
  grid.push(totals);
  for (const block of blocks) {
    block.rows.forEach(([label, points], index) => {
      const row = blank();
      if (index === 0) {
        row[0] = block.tons ?? null;
        row[1] = block.title;
      }
      row[2] = label;
      for (const [year, week, qty] of points) row[column(year, week)] = qty;
      grid.push(row);
    });
  }
  return grid;
}

const week = (year: number, number: number): IsoWeek => ({ year, week: number });
const now = week(2026, 42);

const plan = parseMppRows(
  sheet([
    {
      tons: 62,
      title: "29311152 Vestas\nSan Juan Mesa\n30T x 4S = 120 Sec",
      rows: [
        ["Steel plate", [[2026, 45, 60], [2026, 46, 60]]],
        ["Flange", [[2026, 48, 120]]],
        ["Door frame", [[2026, 47, 30]]],
        ["Internal", [[2026, 51, 120]]],
        ["Cutting ", [[2026, 50, 60], [2026, 51, 60]]],
        ["BT Released", [[2026, 52, 120]]],
        ["Bottom", [[2026, 52, 30]]],
        ["Cutting ", [[2027, 9, 999]]], // repeated label in a section sub-row: ignored
      ],
    },
    {
      title: "Vestas Roman1 149T X 4S = 596 Sec",
      rows: [["Cutting ", [[2027, 4, 100], [2027, 20, 100]]]],
    },
    {
      title: "SE Highland (4) 126 Adapters [7.9 Ton]",
      rows: [
        ["Steel plate", [[2026, 44, 126]]],
        ["Cutting ", [[2026, 49, 126]]],
      ],
    },
    {
      title: "Nordex North Hill 15T X 5S = 75sec",
      rows: [
        ["Door frame", [[2027, 30, 15]]],
        ["Cutting ", [[2026, 43, 75]]],
      ],
    },
  ]),
);

describe("ISO weeks", () => {
  test("knows 53-week years and crosses year ends", () => {
    expect(weeksInYear(2026)).toBe(53);
    expect(weeksInYear(2027)).toBe(52);
    expect(formatWeek(addWeeksTo(week(2026, 52), 2))).toBe("2027-W01");
    expect(formatWeek(addWeeksTo(week(2027, 2), -3))).toBe("2026-W52");
    expect(weeksBetween(week(2026, 42), week(2027, 4))).toBe(15);
    expect(isoWeekOf(new Date(Date.UTC(2026, 9, 15)))).toEqual(week(2026, 42));
  });
});

describe("parseMppRows", () => {
  test("reads project blocks, materials, and processes", () => {
    expect(plan.projects).toHaveLength(4);
    const [mesa] = plan.projects;
    expect(mesa).toMatchObject({ reference: "29311152", customer: "Vestas", tonsPerTower: 62, towers: 30, sectionsPerTower: 4, isAdapter: false });
    expect(mesa.materials["Steel plate"]).toEqual([
      { week: week(2026, 45), qty: 60 },
      { week: week(2026, 46), qty: 60 },
    ]);
    expect(mesa.processes.Cutting?.map((point) => point.qty)).toEqual([60, 60]);
  });

  test("recognises adapter scopes", () => {
    expect(plan.projects[2]).toMatchObject({ towers: 126, sectionsPerTower: 1, isAdapter: true });
  });

  test("maps a week numbered past the ISO year to next year's first week", () => {
    const grid = sheet([]);
    // Relabel 2027 W30 as W53 of 2027, which ISO calls 2028 W01.
    (grid[4] as unknown[])[column(2027, 30)] = 53;
    expect(formatWeek(parseMppRows(grid).lastWeek)).toBe("2028-W01");
  });

  test("rejects sheets without the expected header", () => {
    expect(() => parseMppRows([["x"], ["y"]])).toThrow(MppFormatError);
  });
});

describe("buildOrderPlan", () => {
  const rows = buildOrderPlan(plan, DEFAULT_PLAN_SETTINGS, now);
  const row = (titlePart: string, material: string) => rows.find((item) => item.project.title.includes(titlePart) && item.material === material);

  test("uses MPP arrivals and subtracts lead time plus safety weeks", () => {
    // Flange: needed 2026 W48, lead time 20 + 1 safety week.
    expect(row("San Juan", "Flange")).toMatchObject({ source: "mpp", needQty: 120, status: "order-overdue" });
    expect(formatWeek(row("San Juan", "Flange")!.orderByWeek)).toBe("2026-W27");
  });

  test("estimates need weeks from cutting start when the plan has no material rows", () => {
    const plate = row("Roman1", "Steel plate")!;
    expect(plate.source).toBe("estimated");
    expect(plate.needQty).toBe(596);
    // Too few samples in this small plan, so the fallback offset (-5 weeks) applies.
    expect(formatWeek(plate.needWeek)).toBe("2026-W52");
    expect(formatWeek(plate.orderByWeek)).toBe("2026-W39");
    expect(plate.status).toBe("order-overdue");
    expect(row("Roman1", "Door frame")!.needQty).toBe(149);
  });

  test("flags orders due within the due-soon window", () => {
    const internal = row("Roman1", "Internal")!;
    expect(formatWeek(internal.orderByWeek)).toBe("2026-W46");
    expect(internal.status).toBe("order-soon");
  });

  test("skips door frames for adapters and sorts by order-by week", () => {
    expect(row("Highland", "Door frame")).toBeUndefined();
    const order = rows.map((item) => item.orderByWeek);
    expect(order.every((value, index) => index === 0 || weeksBetween(order[index - 1], value) >= 0)).toBe(true);
  });

  test("respects edited lead times", () => {
    const faster = buildOrderPlan(plan, { ...DEFAULT_PLAN_SETTINGS, leadTimeWeeks: { ...DEFAULT_PLAN_SETTINGS.leadTimeWeeks, Flange: 4 } }, now);
    expect(faster.find((item) => item.project.title.includes("San Juan") && item.material === "Flange")!.status).toBe("order-soon");
  });

  test("measures offsets on the plan once there are enough samples", () => {
    expect(measureArrivalOffsets(plan)["Steel plate"]).toEqual({ weeks: -5, samples: 2 });
  });
});

describe("findPlanIssues", () => {
  test("flags arrivals far from cutting start", () => {
    const warnings = findPlanIssues(plan).filter((issue) => issue.severity === "warning");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].project.title).toContain("North Hill");
    expect(warnings[0].message).toMatch(/Door frame arrives 40 weeks after/);
  });
});

describe("reconcileProjects", () => {
  const project = (id: string, name: string, phase: string, productionWindow: string): Project => ({
    id,
    name,
    code: id,
    phase,
    productionWindow,
    plant: "",
    budget: 0,
  });

  test("normalises site names", () => {
    expect(siteName("29311152 Vestas\nSan Juan Mesa\n30T x 4S")).toBe("san juan mesa");
    expect(siteName("North Hills 15T")).toBe(siteName("Nordex North Hill 15T X 5S"));
    expect(siteName("Panther Grove Phase 2 - 100T")).toBe(siteName("1833 Vestas Panther Grove II 100T X 5S"));
    expect(projectQuantity({ name: "Highland - 124 Adapter", phase: "124T / 1 sec" })).toBe(124);
  });

  test("pairs projects, flags quantity and window differences, and lists what is missing", () => {
    const projects = [
      project("p1", "San Juan Mesa 30T", "30T / 4 sec", "Jul 01, 2027 - Sep 30, 2027"),
      project("p2", "Highland - 124 Adapter", "124T / 1 sec", "Dec 01, 2026 - Mar 31, 2027"),
      project("p3", "Old Site 10T", "10T / 3 sec", "Jan 01, 2026 - Feb 01, 2026"),
    ];
    const result = reconcileProjects(projects, plan, now);

    const mesa = result.matches.find((match) => match.project.id === "p1")!;
    expect(mesa.mpp.title).toContain("San Juan Mesa");
    expect(isWindowOff(mesa)).toBe(true);

    const highland = result.matches.find((match) => match.project.id === "p2")!;
    expect(highland.quantityDiffers).toBe(true);
    expect(isWindowOff(highland)).toBe(false);

    expect(result.notInPlan.map((item) => item.id)).toEqual(["p3"]);
    expect(result.missingInWorkbench.map((item) => item.title)).toEqual(["Vestas Roman1 149T X 4S = 596 Sec", "Nordex North Hill 15T X 5S = 75sec"]);
  });
});

describe("workbenchCoverage", () => {
  test("counts door-frame and internal deliveries and POs for the project", () => {
    const deliveries = [
      { ...createDeliveryDraft("p1"), category: "Door frame", po: "PO-1" },
      { ...createDeliveryDraft("p1"), category: "Platform", po: "PO-2" },
      { ...createDeliveryDraft("p1"), category: "Ladder", po: "PO-2" },
      { ...createDeliveryDraft("p2"), category: "Ladder", po: "PO-3" },
    ];
    expect(workbenchCoverage("p1", "Door frame", deliveries)).toEqual({ deliveries: 1, pos: 1 });
    expect(workbenchCoverage("p1", "Internal", deliveries)).toEqual({ deliveries: 2, pos: 1 });
    expect(workbenchCoverage("p1", "Flange", deliveries)).toBeNull();
  });
});
