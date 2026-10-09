import * as XLSX from "xlsx";
import { parseNumber } from "./csv";
import { normalizeScheduleValue } from "./dates";
import type { Project, PurchasePoLine } from "./types";

export function normalizePoHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function cleanPoCell(value: unknown) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).replace(/\s+/g, " ").trim();
}

export function fillForward(values: string[]) {
  let previous = "";
  return values.map((value) => {
    if (value) previous = value;
    return value || previous;
  });
}

export function findPoColumn(headers: string[], labels: string[], startAt = 0) {
  const normalizedLabels = labels.map(normalizePoHeader);
  return headers.findIndex((header, index) => index >= startAt && normalizedLabels.every((label) => normalizePoHeader(header).includes(label)));
}

export function findPoMainColumn(groups: string[], headers: string[], groupLabel: string, headerLabel: string, startAt = 0) {
  const normalizedGroup = normalizePoHeader(groupLabel);
  const normalizedHeader = normalizePoHeader(headerLabel);
  return headers.findIndex((header, index) => index >= startAt && normalizePoHeader(groups[index] ?? "").includes(normalizedGroup) && normalizePoHeader(header) === normalizedHeader);
}

export function getPoCell(cells: string[], index: number) {
  return index >= 0 ? cells[index] ?? "" : "";
}

export function normalizePoDate(value: string, fallback: string) {
  const cleanValue = value.trim();
  const dateMatch = cleanValue.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    return normalizeScheduleValue(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`, fallback);
  }
  return normalizeScheduleValue(cleanValue, fallback);
}

export function findProjectForPoLine(projectId: string, projectName: string, projects: Project[], fallbackProject: Project) {
  const normalizedId = projectId.trim().toLowerCase();
  const normalizedName = projectName.trim().toLowerCase();
  return (
    projects.find(
      (project) =>
        (!!normalizedId && (project.id.toLowerCase() === normalizedId || project.code.toLowerCase() === normalizedId)) ||
        (!!normalizedName &&
          (project.name.toLowerCase() === normalizedName ||
            project.name.toLowerCase().includes(normalizedName) ||
            normalizedName.includes(project.name.toLowerCase()) ||
            normalizedName.includes(project.code.toLowerCase()))),
    ) ?? fallbackProject
  );
}

export function makePurchasePoLineId(projectId: string, po: string, lineNo: string, materialCode: string, index: number) {
  const stableKey = [projectId, po, lineNo || materialCode || index].join("-").replace(/[^a-zA-Z0-9-]+/g, "-");
  return `POL-${stableKey}`;
}

export function parsePoDetailRows(rows: unknown[][], projects: Project[], fallbackProject: Project): PurchasePoLine[] {
  const cleanRows = rows.map((row) => row.map(cleanPoCell));
  const headerIndex = cleanRows.findIndex((row) => row.some((cell) => normalizePoHeader(cell) === "sappo") && row.some((cell) => normalizePoHeader(cell) === "vendordesc"));
  if (headerIndex < 1) return [];

  const groupHeaders = fillForward(cleanRows[headerIndex - 1] ?? []);
  const mainHeaders = cleanRows[headerIndex] ?? [];
  const subHeaders = cleanRows[headerIndex + 1] ?? [];
  const compositeHeaders = mainHeaders.map((header, index) => `${groupHeaders[index] ?? ""} ${header} ${subHeaders[index] ?? ""}`.trim());

  const columns = {
    projectName: findPoColumn(compositeHeaders, ["projectinfo", "project"], 0),
    projectDesc: findPoColumn(compositeHeaders, ["projectdesc"], 0),
    projectId: findPoColumn(compositeHeaders, ["projectinfo", "projectid"], 0),
    po: findPoColumn(compositeHeaders, ["sappo"], 0),
    lineNo: findPoColumn(compositeHeaders, ["lineno"], 0),
    poQty: findPoColumn(compositeHeaders, ["sappodoc", "poqty"], 0),
    manufacturer: findPoColumn(compositeHeaders, ["vendordesc"], 20),
    paymentTerms: findPoColumn(compositeHeaders, ["paymentterms"], 20),
    incoterms: findPoColumn(compositeHeaders, ["incoterms"], 20),
    material: findPoColumn(compositeHeaders, ["materialinfo", "materialdesc"], 25),
    deliveryDate: findPoColumn(compositeHeaders, ["deliverydate"], 25),
    materialCode: findPoMainColumn(groupHeaders, mainHeaders, "materialinfo", "material", 25),
    category: findPoColumn(compositeHeaders, ["materialgroupdesc"], 25),
    unit: findPoColumn(compositeHeaders, ["unittype"], 25),
    currency: findPoColumn(compositeHeaders, ["priceinfo", "curr"], 35),
    unitPrice: findPoColumn(compositeHeaders, ["unitprice"], 35),
    amount: findPoColumn(compositeHeaders, ["priceinfo", "amount"], 35),
    vendorCode: findPoColumn(compositeHeaders, ["vendororderinfo", "vendor"], 50),
  };

  return cleanRows.slice(headerIndex + 2).flatMap((cells, index) => {
    const po = getPoCell(cells, columns.po);
    const material = getPoCell(cells, columns.material);
    const materialCode = getPoCell(cells, columns.materialCode);
    if (!po || (!material && !materialCode)) return [];
    const projectCode = getPoCell(cells, columns.projectId);
    const projectName = getPoCell(cells, columns.projectDesc) || getPoCell(cells, columns.projectName);
    const project = findProjectForPoLine(projectCode, projectName, projects, fallbackProject);
    const lineNo = getPoCell(cells, columns.lineNo);
    return [{
      id: makePurchasePoLineId(project.id, po, lineNo, materialCode, index),
      projectId: project.id,
      projectCode: project.code || projectCode,
      projectName: project.name || projectName,
      po,
      lineNo,
      manufacturer: getPoCell(cells, columns.manufacturer),
      vendorCode: getPoCell(cells, columns.vendorCode),
      paymentTerms: getPoCell(cells, columns.paymentTerms),
      incoterms: getPoCell(cells, columns.incoterms),
      material: material || materialCode,
      materialCode,
      category: getPoCell(cells, columns.category),
      unit: getPoCell(cells, columns.unit),
      poQty: parseNumber(getPoCell(cells, columns.poQty)),
      unitPrice: parseNumber(getPoCell(cells, columns.unitPrice)),
      amount: parseNumber(getPoCell(cells, columns.amount)),
      currency: getPoCell(cells, columns.currency) || "USD",
      deliveryDate: normalizePoDate(getPoCell(cells, columns.deliveryDate), new Date().toISOString().slice(0, 10)),
    }];
  });
}

export function parsePoDetailWorkbook(data: ArrayBuffer, projects: Project[], fallbackProject: Project) {
  const workbook = XLSX.read(data, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", header: 1 }) as unknown[][];
  return parsePoDetailRows(rows, projects, fallbackProject);
}
