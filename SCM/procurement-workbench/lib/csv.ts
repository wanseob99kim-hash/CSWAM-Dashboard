import { normalizeScheduleValue } from "./dates";
import { createDeliveryDraft } from "./drafts";
import type { Delivery, InternalNcr, Project, SupplierNcr } from "./types";

export const deliveryCsvFields: Array<keyof Delivery> = [
  "id",
  "projectId",
  "material",
  "category",
  "batch",
  "po",
  "vendorCode",
  "manufacturer",
  "manufacturerLocation",
  "paymentTerms",
  "leadTimeWeeks",
  "deliveryWay",
  "incoterms",
  "poDate",
  "orderConfirmation",
  "supplierSchedule",
  "actualEta",
  "actualArrival",
  "productionNeed",
  "qty",
  "freightFeeReceived",
  "manufacturerInvoiceReceived",
  "goodsReceived",
  "customsCleared",
  "arrivedPueblo",
  "freightFee",
  "freightInvoiceNumber",
  "tariff",
  "tariffInvoiceReceived",
  "tariffInvoiceNumber",
  "materialCost",
  "forwarder",
];

export function escapeCsv(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

export function parseBoolean(value: string) {
  return ["true", "yes", "y", "1", "received"].includes(value.trim().toLowerCase());
}

export function parseNumber(value: string) {
  return Number(value.replaceAll("$", "").replaceAll(",", "").trim() || 0);
}

export function parseDeliveryCsv(text: string, fallbackProjectId: string): Delivery[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line, index) => {
    const cells = splitCsvLine(line);
    const row = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex] ?? ""]));
    const projectId = getCsvValue(row, ["projectId", "project id", "project", "project code"]) || fallbackProjectId;
    const poDate = getCsvValue(row, ["poDate", "po date", "po week", "poWeek"]);
    const orderConfirmation = getCsvValue(row, ["orderConfirmation", "order confirmation", "oc date", "oc week"]);
    const supplierSchedule = getCsvValue(row, ["pickupDate", "pickup date", "pickup week", "supplierSchedule", "supplier schedule", "supplier week", "eta", "eta week"]);
    const actualEta = getCsvValue(row, ["actualEta", "actual eta", "actual ETA"]);
    const actualArrival = getCsvValue(row, ["actualArrival", "actual arrival", "arrival date", "received date"]);
    const productionNeed = getCsvValue(row, ["productionNeed", "production need", "need week", "need date"]);
    return {
      ...createDeliveryDraft(projectId),
      id: row.id || `D-import-${Date.now()}-${index}`,
      projectId,
      material: row.material || row.category || "",
      category: row.category || row.material || "",
      batch: row.batch || "B1",
      po: row.po || "",
      vendorCode: row.vendorCode || "",
      manufacturer: row.manufacturer || "",
      manufacturerLocation: row.manufacturerLocation || row["manufacturer location"] || "",
      paymentTerms: row.paymentTerms || "",
      leadTimeWeeks: Number(row.leadTimeWeeks || 8),
      deliveryWay: row.deliveryWay || "Sea",
      incoterms: row.incoterms || "",
      poDate: normalizeScheduleValue(poDate, new Date().toISOString().slice(0, 10)),
      orderConfirmation: normalizeScheduleValue(orderConfirmation || poDate, new Date().toISOString().slice(0, 10)),
      supplierSchedule: normalizeScheduleValue(supplierSchedule || productionNeed, new Date().toISOString().slice(0, 10)),
      actualEta: actualEta ? normalizeScheduleValue(actualEta, actualEta) : null,
      actualArrival: actualArrival || null,
      productionNeed: normalizeScheduleValue(productionNeed, new Date().toISOString().slice(0, 10)),
      qty: Number(row.qty || 0),
      freightFeeReceived: parseBoolean(row.freightFeeReceived || ""),
      manufacturerInvoiceReceived: parseBoolean(row.manufacturerInvoiceReceived || ""),
      goodsReceived: parseBoolean(row.goodsReceived || ""),
      customsCleared: parseBoolean(row.customsCleared || row["customs cleared"] || ""),
      arrivedPueblo: parseBoolean(row.arrivedPueblo || row["arrived pueblo"] || row.goodsReceived || ""),
      freightFee: Number(row.freightFee || 0),
      freightInvoiceNumber: row.freightInvoiceNumber || row["freight invoice number"] || "",
      tariff: Number(row.tariff || 0),
      tariffInvoiceReceived: parseBoolean(row.tariffInvoiceReceived || row["tariff invoice received"] || ""),
      tariffInvoiceNumber: row.tariffInvoiceNumber || row["tariff invoice number"] || "",
      materialCost: Number(row.materialCost || 0),
      forwarder: row.forwarder || "",
    };
  });
}

export function getCsvValue(row: Record<string, string>, names: string[]) {
  const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim().toLowerCase(), value]));
  const target = names.map((name) => name.trim().toLowerCase());
  for (const name of target) {
    if (normalized[name] != null) return normalized[name];
  }
  return "";
}

export function findProjectForImportedRow(row: Record<string, string>, projects: Project[], fallbackProject: Project) {
  const projectText = getCsvValue(row, ["projectId", "project id", "projectCode", "project code", "project", "projectName", "project name"]);
  const normalized = projectText.trim().toLowerCase();
  if (!normalized) return fallbackProject;
  return (
    projects.find(
      (project) =>
        project.id.toLowerCase() === normalized ||
        project.code.toLowerCase() === normalized ||
        project.name.toLowerCase() === normalized ||
        `${project.code} ${project.name}`.toLowerCase().includes(normalized),
    ) ?? fallbackProject
  );
}

export function parseNcrCsv(text: string, projects: Project[], fallbackProject: Project) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return { supplier: [] as SupplierNcr[], internal: [] as InternalNcr[] };
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).reduce(
    (result, line, index) => {
      const cells = splitCsvLine(line);
      const row = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex] ?? ""]));
      const project = findProjectForImportedRow(row, projects, fallbackProject);
      const ncrNumber = getCsvValue(row, ["ncrNumber", "ncr number", "ncr", "NCR No.", "NCR No"]) || `NCR-${Date.now()}-${index}`;
      const rowType = getCsvValue(row, ["type", "ncrType", "ncr type", "source"]).toLowerCase();
      const isInternal =
        rowType.includes("internal") ||
        !!getCsvValue(row, ["materialInfo", "material info"]) ||
        !!getCsvValue(row, ["cost", "internal cost", "repair cost"]);

      if (isInternal) {
        result.internal.push({
          id: getCsvValue(row, ["id"]) || `INCR-import-${Date.now()}-${index}`,
          projectId: project.id,
          ncrNumber,
          materialInfo: getCsvValue(row, ["materialInfo", "material info", "material", "materialCode", "material code", "part"]),
          manufacturer: getCsvValue(row, ["manufacturer", "supplier", "vendor"]),
          qty: parseNumber(getCsvValue(row, ["qty", "quantity"])),
          cost: parseNumber(getCsvValue(row, ["cost", "internal cost", "repair cost"])),
          eta: getCsvValue(row, ["eta", "ETA", "delivery eta", "replacement eta"]) || new Date().toISOString().slice(0, 10),
          goodsReceived: parseBoolean(getCsvValue(row, ["goodsReceived", "goods received", "received", "receipt"])),
        });
      } else {
        result.supplier.push({
          id: getCsvValue(row, ["id"]) || `SNCR-import-${Date.now()}-${index}`,
          projectId: project.id,
          projectName: project.name,
          ncrNumber,
          materialCode: getCsvValue(row, ["materialCode", "material code", "material", "part", "item"]),
          category: getCsvValue(row, ["category", "commodity", "type"]),
          qty: parseNumber(getCsvValue(row, ["qty", "quantity"])),
          replacementReceived: parseBoolean(getCsvValue(row, ["replacementReceived", "replacement received", "replacement", "received"])),
          projectImpact: parseBoolean(getCsvValue(row, ["projectImpact", "project impact", "impact"])),
        });
      }
      return result;
    },
    { supplier: [] as SupplierNcr[], internal: [] as InternalNcr[] },
  );
}
