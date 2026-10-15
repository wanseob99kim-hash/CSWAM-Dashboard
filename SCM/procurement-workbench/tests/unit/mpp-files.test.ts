import { describe, expect, test } from "vitest";
import { mppFileVersion, pickLatestMppFile } from "../../lib/mpp/files";
import { describeMppFile } from "../../lib/mpp/read-workbook";

describe("mppFileVersion", () => {
  test("reads week, year, and revision from the file name", () => {
    expect(mppFileVersion("2026/WK42 MPP 2026_R0.xlsx")).toEqual({ year: 2026, week: 42, revision: 0 });
    expect(mppFileVersion("WK3 MPP 2027 R12.xlsx")).toEqual({ year: 2027, week: 3, revision: 12 });
    expect(mppFileVersion("2027/plan.xlsx")).toEqual({ year: 2027, week: null, revision: null });
  });

  test("describes the loaded revision", () => {
    expect(describeMppFile("WK42 MPP 2026_R0.xlsx")).toBe("WK42 2026 R0");
  });
});

describe("pickLatestMppFile", () => {
  const file = (path: string, modifiedMs = 0) => ({ path, modifiedMs });

  test("prefers the latest year, then week, then revision", () => {
    const picked = pickLatestMppFile([
      file("2026/WK42 MPP 2026_R0.xlsx", 5),
      file("2026/WK42 MPP 2026_R1.xlsx", 1),
      file("2026/WK41 MPP 2026_R3.xlsx", 9),
      file("2025/WK52 MPP 2025_R0.xlsx", 10),
    ]);
    expect(picked?.path).toBe("2026/WK42 MPP 2026_R1.xlsx");
  });

  test("falls back to the newest file when names do not say", () => {
    expect(pickLatestMppFile([file("a.xlsx", 1), file("b.xlsx", 2)])?.path).toBe("b.xlsx");
  });

  test("ignores lock files and non-spreadsheets", () => {
    expect(pickLatestMppFile([file("2026/~$WK43 MPP 2026_R0.xlsx"), file("2026/notes.pdf"), file("2026/WK42 MPP 2026_R0.xlsx")])?.path).toBe(
      "2026/WK42 MPP 2026_R0.xlsx",
    );
    expect(pickLatestMppFile([file("readme.txt")])).toBeNull();
  });
});
