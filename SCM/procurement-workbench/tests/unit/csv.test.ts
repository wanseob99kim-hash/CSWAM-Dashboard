import { describe, expect, test } from "vitest";
import { parseBomRows } from "../../lib/bom-import";
import { escapeCsv, parseBoolean, parseDeliveryCsv, parseNumber, splitCsvLine } from "../../lib/csv";

describe("CSV primitives", () => {
  test("splits quoted cells with commas and escaped quotes", () => {
    expect(splitCsvLine('a,"b,c","d""e",')).toEqual(["a", "b,c", 'd"e', ""]);
  });

  test("escapes values so they split back unchanged", () => {
    const values = ["plain", 'quote "inside"', "comma, here", null, 42];
    const line = values.map(escapeCsv).join(",");
    expect(splitCsvLine(line)).toEqual(["plain", 'quote "inside"', "comma, here", "", "42"]);
  });

  test("parses loose booleans and money", () => {
    expect(parseBoolean(" Yes ")).toBe(true);
    expect(parseBoolean("received")).toBe(true);
    expect(parseBoolean("no")).toBe(false);
    expect(parseNumber("$1,234.50")).toBe(1234.5);
    expect(parseNumber("")).toBe(0);
  });
});

describe("parseDeliveryCsv", () => {
  test("returns nothing without data rows", () => {
    expect(parseDeliveryCsv("id,po\n", "project-1")).toEqual([]);
  });

  test("maps headers, normalizes weeks, and falls back to the active project", () => {
    const csv = [
      "id,po,material,qty,incoterms,pickup week,need week,freightFee,goodsReceived",
      'D-1,PO-9,"Flange, top",5,DAP,2026-W41,2026-W45,1200,yes',
    ].join("\r\n");

    const [row] = parseDeliveryCsv(csv, "project-1700");
    expect(row).toMatchObject({
      id: "D-1",
      projectId: "project-1700",
      po: "PO-9",
      material: "Flange, top",
      category: "Flange, top",
      qty: 5,
      incoterms: "DAP",
      supplierSchedule: "2026-10-07",
      productionNeed: "2026-11-04",
      freightFee: 1200,
      goodsReceived: true,
      arrivedPueblo: true,
      actualArrival: null,
    });
  });
});

describe("parseBomRows", () => {
  test("reads purchasing BOM columns and drops rows without quantity", () => {
    const rows = [
      ["Category", "Object description", "Supplier", "Qty /TW", "Unit price"],
      ["Bolts", "M36 bolt", "Acme", "120", "$2.50"],
      ["Bolts", "Spare", "Acme", "0", "1"],
      [null, null, null, null, null],
    ];
    const items = parseBomRows(rows, "project-1700", "purchasing");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      projectId: "project-1700",
      source: "purchasing",
      category: "Bolts",
      material: "M36 bolt",
      manufacturer: "Acme",
      qtyPerTower: 120,
      unitCost: 2.5,
    });
  });

  test("reads internal BOM columns with a component fallback", () => {
    const rows = [
      ["Component number", "Comp. Qty (CUn)", "Section info"],
      ["C-100", "4", "S1"],
    ];
    expect(parseBomRows(rows, "project-1", "internal")[0]).toMatchObject({
      source: "internal",
      category: "Internal BOM",
      material: "C-100",
      componentNumber: "C-100",
      qtyPerTower: 4,
      sectionInfo: "S1",
    });
  });
});
