import { describe, expect, test } from "vitest";
import { mppFileVersion, pickLatestMppFile, mppWeekOptions } from "../../lib/mpp/files";
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

describe("mppWeekOptions", () => {
  const file = (fileName: string, uploadedAt = "2026-10-01T00:00:00Z") => ({ fileName, uploadedAt });

  test("offers every week of the newest year, marking weeks without a file", () => {
    const options = mppWeekOptions([file("WK42 MPP 2026_R0.xlsx"), file("WK40 MPP 2026_R1.xlsx")]);
    expect(options).toHaveLength(42);
    expect(options[0]).toMatchObject({ year: 2026, week: 42, file: { fileName: "WK42 MPP 2026_R0.xlsx" } });
    expect(options[1]).toEqual({ year: 2026, week: 41, file: null });
    expect(options[2].file?.fileName).toBe("WK40 MPP 2026_R1.xlsx");
    expect(options.at(-1)).toEqual({ year: 2026, week: 1, file: null });
  });

  test("keeps the highest revision per week, then the latest upload, and lists earlier years after", () => {
    const options = mppWeekOptions([
      file("WK3 MPP 2026_R0.xlsx", "2026-01-20T00:00:00Z"),
      file("WK3 MPP 2026_R1.xlsx", "2026-01-19T00:00:00Z"),
      file("WK52 MPP 2025_R0.xlsx"),
      file("notes.txt"),
    ]);
    expect(options.map((option) => [option.year, option.week, option.file?.fileName ?? null])).toEqual([
      [2026, 3, "WK3 MPP 2026_R1.xlsx"],
      [2026, 2, null],
      [2026, 1, null],
      [2025, 52, "WK52 MPP 2025_R0.xlsx"],
    ]);
  });

  test("is empty when no file names a week", () => {
    expect(mppWeekOptions([file("plan.xlsx")])).toEqual([]);
  });
});
