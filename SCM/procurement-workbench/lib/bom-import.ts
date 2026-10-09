import * as XLSX from "xlsx";
import { parseNumber, splitCsvLine } from "./csv";
import type { BomItem } from "./types";

export function normalizeBomHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function getBomValue(row: Record<string, string>, names: string[]) {
  const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeBomHeader(key), value]));
  for (const name of names) {
    const value = normalized[normalizeBomHeader(name)];
    if (value != null && String(value).trim()) return value;
  }
  return "";
}

export function parseBomRows(rows: unknown[][], projectId: string, source: "purchasing" | "internal"): BomItem[] {
  const cleanRows = rows
    .map((row) => row.map((cell) => (cell == null ? "" : String(cell).trim())))
    .filter((row) => row.some((cell) => cell));
  if (cleanRows.length < 2) return [];
  const headers = cleanRows[0];
  return cleanRows.slice(1).map((cells, index) => {
    const row = Object.fromEntries(headers.map((header, cellIndex) => [header || `Column ${cellIndex + 1}`, cells[cellIndex] ?? ""]));
    if (source === "internal") {
      const componentNumber = getBomValue(row, ["Component number", "Component", "Part number"]);
      const material = getBomValue(row, ["Object Description", "Object description", "Description", "Material"]) || componentNumber;
      return {
        id: `IBOM-${Date.now()}-${index}`,
        projectId,
        source,
        category: getBomValue(row, ["Category"]) || "Internal BOM",
        material,
        vendorCode: "",
        manufacturer: getBomValue(row, ["Supplier", "Vendor", "Manufacturer"]),
        qtyPerTower: parseNumber(getBomValue(row, ["Comp. Qty (CUn)", "Comp Qty CUn", "Qty /TW", "Qty per tower", "Qty"])),
        unitCost: 0,
        componentNumber,
        sectionInfo: getBomValue(row, ["Section info", "Section"]),
        sectionCode: getBomValue(row, ["Section code"]),
        kit: getBomValue(row, ["Kit"]),
        oldCode: getBomValue(row, ["old code", "Old code"]),
      };
    }

    const componentNumber = getBomValue(row, ["Component number", "Component", "Part number"]);
    const material = getBomValue(row, ["Object description", "Object Description", "Description", "Material"]) || componentNumber;
    return {
      id: `PBOM-${Date.now()}-${index}`,
      projectId,
      source,
      category: getBomValue(row, ["Category"]) || "Purchasing BOM",
      material,
      vendorCode: getBomValue(row, ["Vendor code", "VendorCode", "Vendor"]),
      manufacturer: getBomValue(row, ["Supplier", "Manufacturer", "Vendor name"]),
      qtyPerTower: parseNumber(getBomValue(row, ["Qty /TW", "Qty/TW", "Qty per tower", "QtyPerTower", "Quantity per tower"])),
      unitCost: parseNumber(getBomValue(row, ["Unit price", "Unit cost", "UnitCost", "Price", "Cost"])),
      componentNumber,
      currency: getBomValue(row, ["Cur", "Currency"]),
      incoterms: getBomValue(row, ["DT", "Incoterms", "Delivery terms"]),
      totalQty: parseNumber(getBomValue(row, ["PO Qty", "Qty 5TW", "Total qty", "Total quantity"])),
      amountTotal: parseNumber(getBomValue(row, ["Amount/5TW", "Amount", "Total amount"])),
      drawingNo: getBomValue(row, ["Drawing No", "Drawing number"]),
    };
  }).filter((item) => item.material.trim() && item.qtyPerTower > 0);
}

export function parseBomCsv(text: string, projectId: string, source: "purchasing" | "internal") {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const rows = lines.map((line) => splitCsvLine(line));
  return parseBomRows(rows, projectId, source);
}

export function parseBomWorkbook(data: ArrayBuffer, projectId: string, source: "purchasing" | "internal") {
  const workbook = XLSX.read(data, { type: "array" });
  const sheetName =
    workbook.SheetNames.find((name) => name.toLowerCase().includes(source === "purchasing" ? "purchasing" : "internal")) ??
    workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", header: 1 }) as unknown[][];
  return parseBomRows(rows, projectId, source);
}
