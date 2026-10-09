import { describe, expect, test } from "vitest";
import { buildSupplierEmailSubject, formatEmailCell, renderEmailTableRow } from "../../lib/supplier-plan";
import type { Project } from "../../lib/types";

describe("supplier email table", () => {
  test("pads cells left by default and right on request", () => {
    expect(formatEmailCell("PO-1", 6)).toBe("PO-1  ");
    expect(formatEmailCell(42, 5, "right")).toBe("   42");
  });

  test("truncates long values with an ellipsis and collapses whitespace", () => {
    expect(formatEmailCell("Very   long supplier name", 10)).toBe("Very lo...");
  });

  test("renders blanks as a dash", () => {
    expect(formatEmailCell("", 3)).toBe("-  ");
  });

  test("joins cells with two spaces", () => {
    expect(renderEmailTableRow([["A", 2], ["7", 3, "right"]])).toBe("A     7");
  });
});

describe("buildSupplierEmailSubject", () => {
  test("includes the project and PO", () => {
    const project: Project = {
      id: "project-1700",
      name: "Panther Grove Phase 2 - 5T",
      code: "1700",
      phase: "5T / 5 sec",
      productionWindow: "",
      plant: "",
      budget: 0,
    };
    const subject = buildSupplierEmailSubject(project, "4500012345", "Acme", "Bolts");
    expect(subject).toContain("4500012345");
    expect(subject).toContain("Panther Grove");
  });
});
