import * as XLSX from "xlsx";
import { MppFormatError, parseMppRows, type MppPlan } from "./parse";

const PREFERRED_SHEET = "AM";

/** Parses an uploaded MPP workbook: the "AM" sheet, or else the first sheet with a "Project" header. */
export function readMppWorkbook(data: ArrayBuffer): MppPlan {
  const workbook = XLSX.read(data, { type: "array" });
  const names = [PREFERRED_SHEET, ...workbook.SheetNames.filter((name) => name !== PREFERRED_SHEET)];
  let lastError: unknown = null;
  for (const name of names) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    try {
      return parseMppRows(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as unknown[][], name);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof MppFormatError ? lastError : new MppFormatError("This workbook does not look like an MPP.");
}

/** "WK42 MPP 2026_R0.xlsx" -> "WK42 2026 R0", for showing which revision is loaded. */
export function describeMppFile(fileName: string): string {
  const week = /WK\s*(\d{1,2})/i.exec(fileName)?.[1];
  // Not \b: "2026_R0" has no word boundary between the year and the underscore.
  const year = /(?<!\d)(20\d{2})(?!\d)/.exec(fileName)?.[1];
  const revision = /_?(R\d+)\b/i.exec(fileName)?.[1];
  return [week ? `WK${week}` : null, year, revision?.toUpperCase()].filter(Boolean).join(" ") || fileName;
}
