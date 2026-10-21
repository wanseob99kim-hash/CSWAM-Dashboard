import { describe, expect, test } from "vitest";
import { mcipFallbacks, sectionsPerTower } from "../../lib/mcip";
import { pipelineFor, pipelineKey } from "../../lib/pipeline/match";
import { materialPerSection, mergePipelineProjects, parsePipelineRows, parseProjectMasterRows, PipelineFormatError, readPipelineFile } from "../../lib/pipeline/parse";
import type { Project } from "../../lib/types";
import type { SapProjectBom } from "../../lib/winsys/bom";

// The "MPP Invoicing" header rows (Oct 2026 spellings), trimmed to the columns read.
const HEADER = [
  ["Customer", "Project Name", "No of Sec", "Rev/Sec (k USD)", "Plate/Sec", "Steel Handling/Sec", "Door Frame/Sec", "D/F Handling/Sec", "Flange/Sec", "Flange Handling/Sec", "Paint/Sec", "Welding Bracket/Sec", "WB Handling/Sec", "Internal/Sec", "Internal Handling/Sec", "Material Total/Sec"],
  ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
];
const row = (customer: string, project: string, sections: number, values: number[], total = 0) => [customer, project, sections, 172, ...values, total];

const rows = [
  ["MPP Invoicing"],
  ...HEADER,
  row("Vestas", "Goodnight II", 3, [78000, 300, 0, 0, 12000, 177, 4833, 400, 0, 21000, 721]),
  row("Vestas", "2026 Panther Grove II", 5, [81000, 400, 2000, 100, 18000, 583, 4880, 500, 0, 15000, 56]),
  row("Nordex-Accio", "2026 North Hills 15T", 5, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 78770),
  ["", "Total"],
  row("Vestas", "Second table", 1, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
];

const project = (overrides: Partial<Project>): Project => ({ id: "p", name: "", code: "", phase: "", productionWindow: "", plant: "", budget: 0, ...overrides });

describe("Sales Pipeline budgets", () => {
  const projects = parsePipelineRows(rows);

  test("reads one row per project up to the first total, with handling added to each material", () => {
    expect(projects.map((item) => item.project)).toEqual(["Goodnight II", "2026 Panther Grove II", "2026 North Hills 15T"]);
    expect(projects[0]).toMatchObject({ customer: "Vestas", sectionsPerTower: 3, revenuePerSection: 172000 });
    expect(projects[0].perSection).toMatchObject({ steel: 78300, flange: 12177, weldingBracket: 400, internal: 21721, paint: 4833 });
  });

  test("material per section leaves paint out and falls back to the material total", () => {
    expect(materialPerSection(projects[0])).toBe(78300 + 12177 + 400 + 21721);
    expect(materialPerSection(projects[2])).toBe(78770);
  });

  test("rejects a sheet without the header", () => {
    expect(() => parsePipelineRows([["x"]])).toThrow(PipelineFormatError);
    expect(() => readPipelineFile("{}")).toThrow(/Sales Pipeline/);
  });

  test("matches pipeline rows to workbench project names", () => {
    expect(pipelineKey("2026 Panther Grove II")).toBe("panther grove ii");
    expect(pipelineKey("Panther Grove Phase 2 - 100T")).toBe("panther grove ii");
    expect(pipelineKey("2027 Highland126S")).toBe("highland");
    expect(pipelineFor({ name: "Panther Grove Phase 2 - 5T" }, projects)?.project).toBe("2026 Panther Grove II");
    expect(pipelineFor({ name: "Vestas Goodnight II 59T" }, projects)?.project).toBe("Goodnight II");
    expect(pipelineFor({ name: "Roman1 149T" }, projects)).toBeNull();
  });

  test("builds the MCIP budget from towers × sections × material per section, and cost from the SAP BOM", () => {
    const bom: SapProjectBom = {
      projectId: "1597",
      projectName: "Goodnight II 59T",
      sections: ["TOP", "MID", "BOT"],
      items: [
        { material: "A", description: "", itemGroup: "Steel Plate", vendor: "", qtyPerTower: 3, unit: "PC", unitPriceUsd: 100000, po: "1", incoterms: "" },
        { material: "B", description: "", itemGroup: "Flange", vendor: "", qtyPerTower: 2, unit: "EA", unitPriceUsd: null, po: null, incoterms: "" },
      ],
    };
    const goodnight = project({ name: "Goodnight II 59T", code: "1597", phase: "59T / 3 sec" });
    expect(mcipFallbacks(goodnight, projects, [bom])).toEqual({
      towers: 59,
      sectionsPerTower: 3,
      pipelineBudget: (78300 + 12177 + 400 + 21721) * 3 * 59,
      pipelineProject: "Goodnight II",
      bomPerTower: 300000,
    });
    expect(mcipFallbacks(project({ name: "Roman1 149T", phase: "149T / 4 sec" }), projects, [])).toMatchObject({ towers: 149, pipelineBudget: null, bomPerTower: null });
  });

  test("reads sections per tower from the phase or the name", () => {
    expect(sectionsPerTower({ name: "x", phase: "59T / 3 sec" })).toBe(3);
    expect(sectionsPerTower({ name: "Heritage Prairie 137T X 5S", phase: "" })).toBe(5);
    expect(sectionsPerTower({ name: "x", phase: "" })).toBeNull();
  });
});

describe("pipeline name keys", () => {
  test("keep model codes apart while dropping quantities", () => {
    expect(pipelineKey("2027 Nordex TS130-00 Forecast")).toBe("ts130 forecast");
    expect(pipelineKey("TS130-00 Forecast 20T")).toBe("ts130 forecast");
    expect(pipelineKey("2027 Nordex TS114-03 Forecast")).not.toBe(pipelineKey("TS130-00 Forecast 20T"));
    expect(pipelineKey("2027 Roman 1 149T")).toBe(pipelineKey("Roman1 149T"));
    expect(pipelineKey("2026 Highland 37S")).toBe("highland");
  });
});

describe("Project master sheet", () => {
  const master = [
    ["", "", "Yes"],
    ["", "Year intake", "Project Name", "Customer", "# of section", "ASP_Plate", "Steel Handling", "ASP_Flange", "Flange_Handling", "ASP_Paint", "ASP_Internal", "Internal Hanling ", "Material Total"],
    ["", "", "2027 Roman 1 149T", "Vestas", 4, 323000, 4000, 45700, 300, 20000, 85000, 0, 491300],
    ["", "", "2027 Longspur 53T", "Vestas", 5, "", "", "", "", "", "", "", 670000],
    ["", "", "2026 Xcel-Rush Creek", "Vestas", 0, "", "", "", "", "", "", "", ""],
  ];

  test("converts per-tower prices to per section and skips rows without sections", () => {
    const rows = parseProjectMasterRows(master);
    expect(rows.map((row) => row.project)).toEqual(["2027 Roman 1 149T", "2027 Longspur 53T"]);
    expect(rows[0].perSection).toMatchObject({ steel: 327000 / 4, flange: 46000 / 4, internal: 85000 / 4, paint: 5000 });
    expect(materialPerSection(rows[0])).toBe((327000 + 46000 + 85000) / 4);
    expect(materialPerSection(rows[1])).toBe(134000);
  });

  test("MPP Invoicing rows win over Project master rows of the same project", () => {
    const invoicing = parsePipelineRows(rows);
    const merged = mergePipelineProjects(invoicing, [{ ...invoicing[0], perSection: { ...invoicing[0].perSection, steel: 1 } }, ...parseProjectMasterRows(master)]);
    expect(merged.filter((row) => row.project === "Goodnight II")).toHaveLength(1);
    expect(merged.find((row) => row.project === "Goodnight II")?.perSection.steel).toBe(78300);
    expect(merged.map((row) => row.project)).toContain("2027 Roman 1 149T");
  });
});
