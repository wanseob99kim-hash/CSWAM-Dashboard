import * as XLSX from "xlsx";
import { parseMdmpSheets, type Grid, type MdmpPlan } from "./parse";

/** Cell values plus solid fill colours (the MDMP marks done / risky cells by colour). */
export function sheetToGrid(sheet: XLSX.WorkSheet): Grid {
  const ref = sheet["!ref"];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const grid: Grid = [];
  for (let row = 0; row <= range.e.r; row += 1) {
    const cells = [];
    for (let column = 0; column <= range.e.c; column += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })] as (XLSX.CellObject & { s?: { patternType?: string; fgColor?: { rgb?: string } } }) | undefined;
      const fill = cell?.s?.patternType === "solid" ? (cell.s.fgColor?.rgb ?? null) : null;
      cells.push({ value: cell?.v ?? null, fill });
    }
    grid.push(cells);
  }
  return grid;
}

export function readMdmpWorkbook(data: ArrayBuffer, fallbackDate = new Date()): MdmpPlan {
  const workbook = XLSX.read(data, { type: "array", cellStyles: true, cellDates: true });
  return parseMdmpSheets(
    workbook.SheetNames.map((name) => ({ name, grid: sheetToGrid(workbook.Sheets[name]) })),
    fallbackDate,
  );
}
