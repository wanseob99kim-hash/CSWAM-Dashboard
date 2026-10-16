import * as XLSX from "xlsx";
import { parseLeadTimeSheets, type LeadTimeTable } from "./parse";

export class LeadTimeFormatError extends Error {}

export function readLeadTimeWorkbook(data: ArrayBuffer): LeadTimeTable {
  const workbook = XLSX.read(data, { type: "array" });
  const table = parseLeadTimeSheets(
    workbook.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: null }) as unknown[][] })),
  );
  if (!table.routes.length && !table.suppliers.length) {
    throw new LeadTimeFormatError("No supplier lead-time table (Supplier · … · DDP, or Supplier · Abbr. · Lead time) was found.");
  }
  return table;
}
