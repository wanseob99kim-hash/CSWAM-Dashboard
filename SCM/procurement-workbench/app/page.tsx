"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type Project = {
  id: string;
  name: string;
  code: string;
  phase: string;
  productionWindow: string;
  plant: string;
  budget: number;
  status?: string;
};

type Delivery = {
  id: string;
  projectId: string;
  material: string;
  category: string;
  batch: string;
  po: string;
  vendorCode: string;
  manufacturer: string;
  manufacturerLocation?: string;
  paymentTerms: string;
  leadTimeWeeks: number;
  deliveryWay: string;
  incoterms: string;
  poDate: string;
  orderConfirmation: string;
  supplierSchedule: string;
  actualEta?: string | null;
  actualArrival: string | null;
  productionNeed: string;
  qty: number;
  freightFeeReceived: boolean;
  manufacturerInvoiceReceived: boolean;
  goodsReceived: boolean;
  customsCleared?: boolean;
  arrivedPueblo?: boolean;
  freightFee: number;
  freightInvoiceNumber?: string;
  tariff: number;
  tariffInvoiceReceived?: boolean;
  tariffInvoiceNumber?: string;
  materialCost: number;
  forwarder: string;
};

type BomItem = {
  id: string;
  projectId: string;
  source?: "purchasing" | "internal";
  category: string;
  material: string;
  vendorCode: string;
  manufacturer: string;
  qtyPerTower: number;
  unitCost: number;
  componentNumber?: string;
  currency?: string;
  incoterms?: string;
  totalQty?: number;
  amountTotal?: number;
  drawingNo?: string;
  sectionInfo?: string;
  sectionCode?: string;
  kit?: string;
  oldCode?: string;
};

type SupplierNcr = {
  id: string;
  projectId: string;
  ncrNumber: string;
  projectName: string;
  materialCode: string;
  category: string;
  qty: number;
  replacementReceived: boolean;
  projectImpact: boolean;
};

type InternalNcr = {
  id: string;
  projectId: string;
  ncrNumber: string;
  materialInfo: string;
  manufacturer: string;
  qty: number;
  cost: number;
  eta: string;
  goodsReceived: boolean;
};

type EcnRecord = {
  id: string;
  projectId: string;
  ecnNumber: string;
  title: string;
  category: string;
  manufacturer: string;
  status: string;
  impact: string;
  effectiveWeek: string;
  costImpact: number;
  notes: string;
};

type TodoItem = {
  id: string;
  projectId: string;
  title: string;
  owner: string;
  mode: string;
  priority: string;
  dueWeek: string;
  done: boolean;
};

type SupplierBatchStatus = "Draft" | "Request sent" | "Supplier requested" | "Approved" | "Rejected";

type SupplierScheduleBatch = {
  id: string;
  deliveryId: string;
  batch: string;
  qty: number;
  percentage: number;
  puWeek: string;
  needWeek: string;
  supplierRequestWeek: string;
  status: SupplierBatchStatus;
  note: string;
  commercialInvoiceFiles: string[];
  packingListFiles: string[];
  blNumber: string;
  forwarderEta: string;
};

type SupplierMaterialAllocation = {
  poLineId: string;
  batchId: string;
  qty: number;
};

type SupplierSchedulePlan = {
  id: string;
  projectId: string;
  po: string;
  manufacturer: string;
  category: string;
  material: string;
  incoterms: string;
  to: string;
  cc: string;
  subject: string;
  body: string;
  attachments: string[];
  forwarderEmail: string;
  batches: SupplierScheduleBatch[];
  materialAllocations: SupplierMaterialAllocation[];
  requestSent: boolean;
  pickupReminderSent: boolean;
  forwarderNoticeSent: boolean;
};

type PurchasePoLine = {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  po: string;
  lineNo: string;
  manufacturer: string;
  vendorCode: string;
  paymentTerms: string;
  incoterms: string;
  material: string;
  materialCode: string;
  category: string;
  unit: string;
  poQty: number;
  unitPrice: number;
  amount: number;
  currency: string;
  deliveryDate: string;
};

type WorkspaceTab = "overview" | "delivery" | "supplier" | "logistics" | "bom" | "cashflow" | "ncr" | "ecn" | "mcip";

type CashflowForecast = {
  id: string;
  projectId: string;
  projectName: string;
  projectCode: string;
  po: string;
  batch: string;
  manufacturer: string;
  paymentTerms: string;
  paymentDays: number;
  invoiceBasis: string;
  invoiceMonth: string;
  payMonth: string;
  payMonthKey: string;
  dueDate: Date;
  materialAmount: number;
  freightAmount: number;
  tariffAmount: number;
  amount: number;
};

type DeliveryEntryMode = "single" | "bulk";

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

type BulkDeliveryBatch = {
  id: string;
  batch: string;
  qty: number;
  deliveryWay: string;
  forwarder: string;
  supplierSchedule: string;
  actualEta: string | null;
  productionNeed: string;
  actualArrival: string | null;
  freightFeeReceived: boolean;
  manufacturerInvoiceReceived: boolean;
  goodsReceived: boolean;
  customsCleared: boolean;
  arrivedPueblo: boolean;
  freightFee: number;
  freightInvoiceNumber: string;
  tariff: number;
  tariffInvoiceReceived: boolean;
  tariffInvoiceNumber: string;
};

const defaultActiveProjectId = "project-1700";

const defaultProjects: Project[] = [
  {
    id: "project-1701",
    name: "San Juan Mesa 30T",
    code: "1701",
    phase: "30T / 4 sec",
    productionWindow: "Jul 01, 2027 - Sep 30, 2027",
    plant: "29311152 V163 4.5MW HH98 4SEC",
    budget: 0,
  },
  {
    id: "project-1700",
    name: "Panther Grove Phase 2 - 5T",
    code: "1700",
    phase: "5T / 5 sec",
    productionWindow: "Dec 01, 2026 - Dec 31, 2026",
    plant: "29311833 V163 4.5MW HH113 5SEC",
    budget: 185000,
    status: "Active",
  },
  {
    id: "project-1699",
    name: "Heritage Prairie 137T",
    code: "1699",
    phase: "137T / 5 sec",
    productionWindow: "Jan 01, 2027 - Jun 30, 2027",
    plant: "29311833 V163 4.5MW HH113 5SEC",
    budget: 0,
  },
  {
    id: "project-1651",
    name: "Highland - 124 Adapter",
    code: "1651",
    phase: "124T / 1 sec",
    productionWindow: "Jan 01, 2027 - Jun 30, 2027",
    plant: "G2-T3.0-1310",
    budget: 0,
  },
  {
    id: "project-1626",
    name: "Highland - 11 Adapter",
    code: "1626",
    phase: "11T / 1 sec",
    productionWindow: "Aug 01, 2026 - Sep 30, 2026",
    plant: "G2-T3.0-1310",
    budget: 0,
  },
  {
    id: "project-1616",
    name: "Panther Grove Phase 2 - 100T",
    code: "1616",
    phase: "100T / 5 sec",
    productionWindow: "Jul 01, 2026 - Nov 30, 2026",
    plant: "V163",
    budget: 3200000,
    status: "Active",
  },
  {
    id: "project-1602",
    name: "Wellsburg II - 18 Adapter",
    code: "1602",
    phase: "18T / 1 sec",
    productionWindow: "Jul 01, 2026 - Aug 15, 2026",
    plant: "G2-T3.0-1310",
    budget: 0,
  },
  {
    id: "project-1601",
    name: "Highland - 14 Adapter",
    code: "1601",
    phase: "14T / 1 sec",
    productionWindow: "Aug 01, 2026 - Sep 15, 2026",
    plant: "G2-T3.0-1310",
    budget: 0,
  },
  {
    id: "project-1600",
    name: "Highland - 12 Adapter",
    code: "1600",
    phase: "12T / 1 sec",
    productionWindow: "Aug 01, 2026 - Sep 15, 2026",
    plant: "G2-T3.0-1310",
    budget: 0,
  },
  {
    id: "project-1597",
    name: "Goodnight II 59T",
    code: "1597",
    phase: "59T / 3 sec",
    productionWindow: "Jun 22, 2026 - Nov 01, 2026",
    plant: "29434855",
    budget: 0,
  },
  {
    id: "project-1590",
    name: "Four Horizons 210T",
    code: "1590",
    phase: "210T / 5 sec",
    productionWindow: "Jun 19, 2026 - Dec 18, 2026",
    plant: "29304425 V163 4.5MW HH125 4SEC",
    budget: 0,
  },
  {
    id: "project-1573",
    name: "North Hills 15T",
    code: "1573",
    phase: "15T / 5 sec",
    productionWindow: "Mar 01, 2026 - May 31, 2026",
    plant: "TS111-03",
    budget: 0,
  },
];

const defaultDeliveries: Delivery[] = [
  {
    id: "DEMO-PG5-LADDER-B1",
    projectId: "project-1700",
    material: "Ladder assembly",
    category: "Ladder",
    batch: "B1",
    po: "4500104775",
    vendorCode: "PG-DEMO-001",
    manufacturer: "Proinlosa",
    manufacturerLocation: "USA",
    paymentTerms: "EOM + 60",
    leadTimeWeeks: 8,
    deliveryWay: "Truck",
    incoterms: "DDP",
    poDate: "2026-08-05",
    orderConfirmation: "2026-08-12",
    supplierSchedule: "2026-11-04",
    actualEta: null,
    actualArrival: null,
    productionNeed: "2026-12-02",
    qty: 2,
    freightFeeReceived: true,
    manufacturerInvoiceReceived: false,
    goodsReceived: false,
    customsCleared: false,
    arrivedPueblo: false,
    freightFee: 0,
    freightInvoiceNumber: "",
    tariff: 0,
    tariffInvoiceReceived: true,
    tariffInvoiceNumber: "",
    materialCost: 42000,
    forwarder: "",
  },
  {
    id: "DEMO-PG5-LADDER-B2",
    projectId: "project-1700",
    material: "Ladder assembly",
    category: "Ladder",
    batch: "B2",
    po: "4500104775",
    vendorCode: "PG-DEMO-001",
    manufacturer: "Proinlosa",
    manufacturerLocation: "USA",
    paymentTerms: "EOM + 60",
    leadTimeWeeks: 8,
    deliveryWay: "Truck",
    incoterms: "DDP",
    poDate: "2026-08-05",
    orderConfirmation: "2026-08-12",
    supplierSchedule: "2026-11-18",
    actualEta: null,
    actualArrival: null,
    productionNeed: "2026-12-09",
    qty: 3,
    freightFeeReceived: true,
    manufacturerInvoiceReceived: false,
    goodsReceived: false,
    customsCleared: false,
    arrivedPueblo: false,
    freightFee: 0,
    freightInvoiceNumber: "",
    tariff: 0,
    tariffInvoiceReceived: true,
    tariffInvoiceNumber: "",
    materialCost: 63000,
    forwarder: "",
  },
  {
    id: "DEMO-PG5-PLATFORM-B1",
    projectId: "project-1700",
    material: "Internal platform kit",
    category: "Platform",
    batch: "B1",
    po: "4500106207",
    vendorCode: "PG-DEMO-002",
    manufacturer: "Sphere",
    manufacturerLocation: "Mexico",
    paymentTerms: "Net 45",
    leadTimeWeeks: 8,
    deliveryWay: "Truck",
    incoterms: "DAP",
    poDate: "2026-08-19",
    orderConfirmation: "2026-08-26",
    supplierSchedule: "2026-11-11",
    actualEta: "2026-11-18",
    actualArrival: null,
    productionNeed: "2026-12-02",
    qty: 5,
    freightFeeReceived: true,
    manufacturerInvoiceReceived: true,
    goodsReceived: false,
    customsCleared: false,
    arrivedPueblo: false,
    freightFee: 0,
    freightInvoiceNumber: "",
    tariff: 2400,
    tariffInvoiceReceived: false,
    tariffInvoiceNumber: "",
    materialCost: 68000,
    forwarder: "",
  },
  {
    id: "DEMO-PG100-BOLT-B1",
    projectId: "project-1616",
    material: "Anchor bolt kit",
    category: "Anchor bolt",
    batch: "B1",
    po: "4500107350",
    vendorCode: "PG-DEMO-003",
    manufacturer: "Apex Steel",
    manufacturerLocation: "China",
    paymentTerms: "Net 60",
    leadTimeWeeks: 8,
    deliveryWay: "Sea",
    incoterms: "EXW Ningbo",
    poDate: "2026-07-08",
    orderConfirmation: "2026-07-15",
    supplierSchedule: "2026-09-09",
    actualEta: null,
    actualArrival: "2026-11-04",
    productionNeed: "2026-10-21",
    qty: 20,
    freightFeeReceived: true,
    manufacturerInvoiceReceived: true,
    goodsReceived: true,
    customsCleared: true,
    arrivedPueblo: true,
    freightFee: 18500,
    freightInvoiceNumber: "FR-DEMO-1001",
    tariff: 9200,
    tariffInvoiceReceived: true,
    tariffInvoiceNumber: "TR-DEMO-1001",
    materialCost: 420000,
    forwarder: "Expeditors",
  },
  {
    id: "DEMO-PG100-BOLT-B2",
    projectId: "project-1616",
    material: "Anchor bolt kit",
    category: "Anchor bolt",
    batch: "B2",
    po: "4500107350",
    vendorCode: "PG-DEMO-003",
    manufacturer: "Apex Steel",
    manufacturerLocation: "China",
    paymentTerms: "Net 60",
    leadTimeWeeks: 8,
    deliveryWay: "Sea",
    incoterms: "EXW Ningbo",
    poDate: "2026-07-08",
    orderConfirmation: "2026-07-15",
    supplierSchedule: "2026-09-23",
    actualEta: null,
    actualArrival: null,
    productionNeed: "2026-11-04",
    qty: 30,
    freightFeeReceived: false,
    manufacturerInvoiceReceived: false,
    goodsReceived: false,
    customsCleared: false,
    arrivedPueblo: false,
    freightFee: 0,
    freightInvoiceNumber: "",
    tariff: 0,
    tariffInvoiceReceived: false,
    tariffInvoiceNumber: "",
    materialCost: 630000,
    forwarder: "Expeditors",
  },
  {
    id: "DEMO-PG100-DOOR-B1",
    projectId: "project-1616",
    material: "Door frame set",
    category: "Door frame",
    batch: "B1",
    po: "4500108124",
    vendorCode: "PG-DEMO-004",
    manufacturer: "Wind Tower Components",
    manufacturerLocation: "China",
    paymentTerms: "30% deposit / 70% before ship",
    leadTimeWeeks: 8,
    deliveryWay: "Air",
    incoterms: "FCA Shanghai",
    poDate: "2026-08-05",
    orderConfirmation: "2026-08-12",
    supplierSchedule: "2026-10-07",
    actualEta: null,
    actualArrival: null,
    productionNeed: "2026-10-21",
    qty: 10,
    freightFeeReceived: false,
    manufacturerInvoiceReceived: true,
    goodsReceived: false,
    customsCleared: false,
    arrivedPueblo: false,
    freightFee: 14500,
    freightInvoiceNumber: "",
    tariff: 3800,
    tariffInvoiceReceived: false,
    tariffInvoiceNumber: "",
    materialCost: 155000,
    forwarder: "DHL Global Forwarding",
  },
];

const defaultBomItems: BomItem[] = [
  {
    id: "DEMO-BOM-PG5-LADDER",
    projectId: "project-1700",
    source: "purchasing",
    category: "Ladder",
    material: "Ladder assembly",
    vendorCode: "PG-DEMO-001",
    manufacturer: "Proinlosa",
    qtyPerTower: 1,
    unitCost: 21000,
    componentNumber: "PG5-LADDER",
    currency: "USD",
    incoterms: "DDP",
    totalQty: 5,
    amountTotal: 105000,
  },
  {
    id: "DEMO-BOM-PG5-PLATFORM",
    projectId: "project-1700",
    source: "purchasing",
    category: "Platform",
    material: "Internal platform kit",
    vendorCode: "PG-DEMO-002",
    manufacturer: "Sphere",
    qtyPerTower: 1,
    unitCost: 13600,
    componentNumber: "PG5-PLATFORM",
    currency: "USD",
    incoterms: "DAP",
    totalQty: 5,
    amountTotal: 68000,
  },
];
const defaultSupplierNcrs: SupplierNcr[] = [];
const defaultInternalNcrs: InternalNcr[] = [];
const defaultTodoItems: TodoItem[] = [];
const projectStatuses = ["Active", "Planning", "Watch", "On hold", "Complete"];
const todoModes = ["General", "Supplier follow-up", "Invoice/payment", "Logistics", "NCR/ECN", "Document", "Budget review"];
const todoPriorities = ["Normal", "High", "Urgent", "Low"];

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "2-digit",
  day: "2-digit",
});

const moneyFormatter = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 0,
  style: "currency",
});

const compactMoneyFormatter = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 1,
  notation: "compact",
  style: "currency",
});

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
});

function toDate(date: string) {
  return new Date(`${date}T00:00:00`);
}

function addWeeks(date: string, weeks: number) {
  const next = toDate(date);
  next.setDate(next.getDate() + weeks * 7);
  return next;
}

function addDays(date: string | Date, days: number) {
  const next = typeof date === "string" ? toDate(date) : new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function daysBetween(left: string | Date, right: string | Date) {
  const start = typeof left === "string" ? toDate(left) : left;
  const end = typeof right === "string" ? toDate(right) : right;
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function formatShortDate(date: string | Date) {
  const value = typeof date === "string" ? toDate(date) : date;
  return dateFormatter.format(value);
}

function formatInputDate(date: string | Date) {
  const value = typeof date === "string" ? toDate(date) : date;
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

function formatInputWeek(date: string | Date) {
  const normalizedDate = typeof date === "string" ? weekToMidweekDate(date) || date : date;
  const value = typeof normalizedDate === "string" ? toDate(normalizedDate) : normalizedDate;
  if (Number.isNaN(value.getTime())) return "";
  const utcDate = new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  const isoDay = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - isoDay);
  const weekYear = utcDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${weekYear}-W${String(week).padStart(2, "0")}`;
}

function weekToMidweekDate(weekValue: string) {
  const cleanValue = weekValue.trim();
  const isoMatch = cleanValue.match(/^(\d{4})-W?(\d{1,2})$/);
  const weekFirstMatch = cleanValue.match(/^W?(\d{1,2})[-/](\d{4})$/);
  if (!isoMatch && !weekFirstMatch) return "";
  const year = Number(isoMatch ? isoMatch[1] : weekFirstMatch?.[2]);
  const week = Number(isoMatch ? isoMatch[2] : weekFirstMatch?.[1]);
  if (!year || week < 1 || week > 53) return "";
  const jan4 = new Date(year, 0, 4);
  const jan4IsoDay = (jan4.getDay() + 6) % 7;
  const monday = new Date(year, 0, 4 - jan4IsoDay + (week - 1) * 7);
  monday.setDate(monday.getDate() + 2);
  return formatInputDate(monday);
}

function formatInputMidweekDate(date: string | Date | null | undefined) {
  if (!date) return "";
  const normalizedDate = typeof date === "string" ? weekToMidweekDate(date) || date : formatInputDate(date);
  const value = typeof normalizedDate === "string" ? toDate(normalizedDate) : normalizedDate;
  if (Number.isNaN(value.getTime())) return "";
  return formatInputDate(toMidweekDate(value));
}

function dateInputToMidweekDate(dateValue: string, fallback = "") {
  if (!dateValue) return fallback;
  const value = toDate(dateValue);
  if (Number.isNaN(value.getTime())) return fallback;
  return formatInputDate(toMidweekDate(value));
}

function normalizeScheduleValue(value: string | undefined, fallback: string) {
  const cleanValue = (value || "").trim();
  if (!cleanValue) return fallback;
  return weekToMidweekDate(cleanValue) || cleanValue;
}

function formatScheduleWeek(date: string | Date) {
  return formatInputWeek(date) || "-";
}

function toMidweekDate(date: string | Date) {
  return toDate(weekToMidweekDate(formatInputWeek(date)));
}

function formatMoney(value: number) {
  return moneyFormatter.format(value);
}

function formatCompactMoney(value: number) {
  return compactMoneyFormatter.format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, style: "percent" }).format(value);
}

function getProjectStatus(project: Pick<Project, "status">) {
  return project.status || "Active";
}

function getStatusTone(status: string) {
  const value = status.toLowerCase();
  if (value.includes("complete") || value.includes("closed") || value.includes("implemented") || value.includes("received")) return "done";
  if (value.includes("watch") || value.includes("review") || value.includes("impact")) return "watch";
  if (value.includes("hold") || value.includes("open") || value.includes("risk")) return "risk";
  if (value.includes("planning") || value.includes("approved")) return "planning";
  return "active";
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value * 100));
}

function average(values: number[]) {
  const cleanValues = values.filter((value) => Number.isFinite(value));
  if (!cleanValues.length) return null;
  return cleanValues.reduce((sum, value) => sum + value, 0) / cleanValues.length;
}

function formatDays(value: number | null) {
  return value === null ? "-" : `${Math.round(value)} days`;
}

function getOriginCountry(delivery: Delivery) {
  const text = `${delivery.manufacturerLocation} ${delivery.incoterms} ${delivery.manufacturer} ${delivery.forwarder}`.toLowerCase();
  if (text.includes("shenzhen") || text.includes("dongguan") || text.includes("ningbo") || text.includes("china")) return "China";
  if (text.includes("los angeles") || text.includes("usa") || text.includes("plant")) return "USA";
  if (text.includes("germany") || text.includes("hamburg")) return "Germany";
  if (text.includes("mexico")) return "Mexico";
  return "TBD";
}

function getRouteStage(delivery: Delivery) {
  if (delivery.arrivedPueblo || delivery.goodsReceived) return "Arrived Pueblo";
  if (delivery.customsCleared) return "Customs cleared";
  return "In transit";
}

function getPortName(delivery: Delivery) {
  const text = delivery.incoterms.toLowerCase();
  if (text.includes("shenzhen")) return "Shenzhen";
  if (text.includes("dongguan")) return "Dongguan";
  if (text.includes("ningbo")) return "Ningbo";
  if (text.includes("los angeles")) return "Los Angeles";
  if (text.includes("plant")) return "Plant";
  return "TBD port";
}

function getIncotermMode(delivery: Pick<Delivery, "incoterms">) {
  const value = delivery.incoterms.trim().toUpperCase();
  if (value.startsWith("DAP")) return "DAP";
  if (value.startsWith("DDP")) return "DDP";
  if (value.startsWith("EXW")) return "EXW";
  if (value.startsWith("FCA")) return "FCA";
  return "Other";
}

function usesSupplierEta(delivery: Pick<Delivery, "incoterms">) {
  return ["DAP", "DDP"].includes(getIncotermMode(delivery));
}

function getDeliveryCategory(delivery: Pick<Delivery, "category" | "material">) {
  const category = (delivery.category || "").trim();
  const material = (delivery.material || "").trim();
  return category || material || "Uncategorized";
}

function getLegacyMaterialNote(delivery: Pick<Delivery, "category" | "material">) {
  const category = (delivery.category || "").trim();
  const material = (delivery.material || "").trim();
  return material && material !== category ? material : "";
}

function getEstimatedArrival(delivery: Pick<Delivery, "incoterms" | "leadTimeWeeks" | "supplierSchedule">) {
  return usesSupplierEta(delivery) ? toDate(delivery.supplierSchedule) : addWeeks(delivery.supplierSchedule, delivery.leadTimeWeeks || 8);
}

function getBomUnitCost(bomItems: BomItem[], projectId: string) {
  return bomItems
    .filter((item) => item.projectId === projectId && (item.source ?? "purchasing") === "purchasing")
    .reduce((sum, item) => sum + item.qtyPerTower * item.unitCost, 0);
}

function getMaterialCost(delivery: Delivery, bomItems: BomItem[]) {
  const bomUnitCost = getBomUnitCost(bomItems, delivery.projectId);
  return bomUnitCost > 0 ? bomUnitCost * delivery.qty : delivery.materialCost;
}

function getFreightFee(delivery: Delivery) {
  return usesSupplierEta(delivery) ? 0 : delivery.freightFee;
}

function hasActualLogistics(delivery: Delivery) {
  return delivery.goodsReceived || delivery.freightFeeReceived || !!delivery.actualArrival || !!delivery.arrivedPueblo;
}

function canAutoProjectLogistics(delivery: Delivery) {
  return delivery.deliveryWay.trim().toLowerCase() !== "air";
}

function getPeerLogisticsRate(delivery: Delivery, deliveries: Delivery[], field: "freightFee" | "tariff") {
  if (!canAutoProjectLogistics(delivery)) return null;
  const peers = deliveries.filter(
    (row) =>
      row.id !== delivery.id &&
      row.projectId === delivery.projectId &&
      row.po === delivery.po &&
      row.deliveryWay === delivery.deliveryWay &&
      row.qty > 0 &&
      !usesSupplierEta(row) &&
      hasActualLogistics(row) &&
      Number(row[field] || 0) > 0,
  );
  const totalQty = peers.reduce((sum, row) => sum + row.qty, 0);
  if (!totalQty) return null;
  return peers.reduce((sum, row) => sum + Number(row[field] || 0), 0) / totalQty;
}

function getProjectedFreightFee(delivery: Delivery, deliveries: Delivery[]) {
  if (usesSupplierEta(delivery)) return 0;
  if (delivery.freightFee > 0 || delivery.freightFeeReceived) return getFreightFee(delivery);
  const peerRate = getPeerLogisticsRate(delivery, deliveries, "freightFee");
  return peerRate !== null && !hasActualLogistics(delivery) ? peerRate * delivery.qty : getFreightFee(delivery);
}

function getProjectedTariff(delivery: Delivery, deliveries: Delivery[]) {
  if (getIncotermMode(delivery) === "DDP") return 0;
  if (delivery.tariff > 0) return delivery.tariff;
  const peerRate = getPeerLogisticsRate(delivery, deliveries, "tariff");
  return peerRate !== null && !hasActualLogistics(delivery) ? peerRate * delivery.qty : delivery.tariff;
}

function getProjectedTotalCost(delivery: Delivery, bomItems: BomItem[], deliveries: Delivery[]) {
  return getMaterialCost(delivery, bomItems) + getProjectedFreightFee(delivery, deliveries) + getProjectedTariff(delivery, deliveries);
}

function getDeliveryStatusLabel(delivery: Delivery & { risk?: ReturnType<typeof getRisk> }) {
  if (delivery.actualArrival || delivery.goodsReceived || delivery.arrivedPueblo) return "Arrived";
  if (delivery.risk && delivery.risk.score >= 3) return "Risk";
  if (delivery.customsCleared) return "Customs cleared";
  return "Open";
}

function getPaymentTermDays(paymentTerms: string) {
  const cleanTerms = paymentTerms.trim();
  const netMatch = cleanTerms.match(/\b(?:net|n)\s*(\d{1,3})\b/i);
  if (netMatch) return Number(netMatch[1]);
  const dayMatch = cleanTerms.match(/\b(\d{1,3})\s*(?:day|days)\b/i);
  if (dayMatch) return Number(dayMatch[1]);
  if (/deposit|advance|prepay|before ship|before shipment|due upon receipt|cod/i.test(cleanTerms)) return 0;
  return 0;
}

function getForecastInvoiceDate(delivery: Delivery) {
  const baseSource = usesSupplierEta(delivery) ? delivery.actualArrival || delivery.actualEta || delivery.supplierSchedule : delivery.supplierSchedule;
  const baseDate = toMidweekDate(baseSource);
  const todayWeek = toMidweekDate(new Date());
  return baseDate < todayWeek ? addWeeks(formatInputDate(baseDate), 2) : baseDate;
}

function getForecastDueDate(delivery: Delivery) {
  return addDays(getForecastInvoiceDate(delivery), getPaymentTermDays(delivery.paymentTerms));
}

function getMonthKey(date: string | Date) {
  const value = typeof date === "string" ? toDate(date) : date;
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(date: string | Date) {
  const value = typeof date === "string" ? toDate(date) : date;
  return monthFormatter.format(value);
}

function monthKeyToDate(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function getCashflowMonthKeys(monthKeys: string[]) {
  if (!monthKeys.length) {
    const current = new Date();
    return Array.from({ length: 6 }, (_, index) => getMonthKey(addMonths(new Date(current.getFullYear(), current.getMonth(), 1), index)));
  }
  const sorted = [...monthKeys].sort();
  const start = monthKeyToDate(sorted[0]);
  const end = monthKeyToDate(sorted[sorted.length - 1]);
  const keys: string[] = [];
  for (let cursor = new Date(start); cursor <= end; cursor = addMonths(cursor, 1)) {
    keys.push(getMonthKey(cursor));
  }
  return keys;
}

function getCashflowX(index: number, count: number, width: number) {
  const left = 58;
  const right = 20;
  const usableWidth = width - left - right;
  return left + (count <= 1 ? usableWidth / 2 : (index / (count - 1)) * usableWidth);
}

function getCashflowY(value: number, maxValue: number, height: number) {
  const top = 20;
  const bottom = 38;
  const usableHeight = height - top - bottom;
  return top + usableHeight - (maxValue > 0 ? (value / maxValue) * usableHeight : 0);
}

function getCashflowLinePath(values: number[], maxValue: number, width: number, height: number) {
  return values
    .map((value, index) => `${index === 0 ? "M" : "L"} ${getCashflowX(index, values.length, width).toFixed(1)} ${getCashflowY(value, maxValue, height).toFixed(1)}`)
    .join(" ");
}

function getRisk(delivery: Delivery) {
  const theoreticalDelivery = getEstimatedArrival(delivery);
  const scheduleDelivery = delivery.actualEta ? toDate(delivery.actualEta) : theoreticalDelivery;
  const theoreticalDelay = daysBetween(delivery.productionNeed, scheduleDelivery);
  const actualDelay = delivery.actualArrival ? daysBetween(delivery.productionNeed, delivery.actualArrival) : null;
  const ocDelay = daysBetween(delivery.poDate, delivery.orderConfirmation);

  if (actualDelay !== null) {
    return {
      level: actualDelay > 0 ? "Late arrived" : "Arrived",
      tone: actualDelay > 0 ? "tone-risk" : "tone-done",
      score: actualDelay > 0 ? 4 : 0,
      reason: actualDelay > 0 ? `Actual arrival is ${actualDelay} days after production need.` : "Actual arrival covers production plan.",
      theoreticalDelivery,
    };
  }

  if (theoreticalDelay > 0) {
    return {
      level: "Expedite",
      tone: "tone-approval",
      score: 3,
      reason: `Estimated arrival is ${theoreticalDelay} days after production need.`,
      theoreticalDelivery,
    };
  }

  if (ocDelay > 5) {
    return {
      level: "Watch",
      tone: "tone-active",
      score: 2,
      reason: `OC took ${ocDelay} days after PO. Keep following supplier.`,
      theoreticalDelivery,
    };
  }

  return {
    level: "On track",
    tone: "tone-done",
    score: 1,
    reason: "Estimated arrival covers production plan.",
    theoreticalDelivery,
  };
}

function getRange(rows: Array<Delivery & { risk: ReturnType<typeof getRisk> }>) {
  if (!rows.length) {
    const min = new Date();
    const max = new Date();
    min.setDate(min.getDate() - 7);
    max.setDate(max.getDate() + 56);
    return { min, max, totalDays: Math.max(daysBetween(min, max), 1) };
  }

  const dates = rows.flatMap((row) => [
    toDate(row.poDate),
    row.risk.theoreticalDelivery,
    toDate(row.supplierSchedule),
    row.actualArrival ? toDate(row.actualArrival) : toDate(row.productionNeed),
    toDate(row.productionNeed),
  ]);
  const min = new Date(Math.min(...dates.map((date) => date.getTime())));
  const max = new Date(Math.max(...dates.map((date) => date.getTime())));
  min.setDate(min.getDate() - 5);
  max.setDate(max.getDate() + 7);
  return { min, max, totalDays: Math.max(daysBetween(min, max), 1) };
}

function getPosition(date: string | Date, min: Date, totalDays: number) {
  return Math.min(100, Math.max(0, (daysBetween(min, date) / totalDays) * 100));
}

const storageKey = "im-delivery-schedule-v2";
const deliveryClearKey = "im-delivery-clear-2026-08-11";
const bomClearKey = "im-bom-clear-2026-08-11";
const pantherDemoSeedKey = "im-panther-grove-demo-seed-2026-08-11";

function mergeUniqueById<T extends { id: string }>(current: T[], additions: T[]) {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...additions.filter((item) => !seen.has(item.id))];
}

const deliveryCsvFields: Array<keyof Delivery> = [
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

function createProjectDraft(): Project {
  return {
    id: `project-${Date.now()}`,
    name: "",
    code: "",
    phase: "",
    productionWindow: "",
    plant: "",
    budget: 0,
    status: "Active",
  };
}

function createDeliveryDraft(projectId: string): Delivery {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: createId("D"),
    projectId,
    material: "",
    category: "",
    batch: "B1",
    po: "",
    vendorCode: "",
    manufacturer: "",
    manufacturerLocation: "",
    paymentTerms: "",
    leadTimeWeeks: 8,
    deliveryWay: "Sea",
    incoterms: "",
    poDate: today,
    orderConfirmation: today,
    supplierSchedule: today,
    actualEta: null,
    actualArrival: null,
    productionNeed: today,
    qty: 0,
    freightFeeReceived: false,
    manufacturerInvoiceReceived: false,
    goodsReceived: false,
    customsCleared: false,
    arrivedPueblo: false,
    freightFee: 0,
    freightInvoiceNumber: "",
    tariff: 0,
    tariffInvoiceReceived: false,
    tariffInvoiceNumber: "",
    materialCost: 0,
    forwarder: "",
  };
}

function createBulkDeliveryBatch(index: number, delivery: Delivery): BulkDeliveryBatch {
  return {
    id: createId(`bulk-${index + 1}`),
    batch: `B${index + 1}`,
    qty: 0,
    deliveryWay: delivery.deliveryWay,
    forwarder: delivery.forwarder,
    supplierSchedule: delivery.supplierSchedule,
    actualEta: null,
    productionNeed: delivery.productionNeed,
    actualArrival: null,
    freightFeeReceived: false,
    manufacturerInvoiceReceived: false,
    goodsReceived: false,
    customsCleared: false,
    arrivedPueblo: false,
    freightFee: 0,
    freightInvoiceNumber: "",
    tariff: 0,
    tariffInvoiceReceived: false,
    tariffInvoiceNumber: "",
  };
}

function createBulkDeliveryBatches(delivery: Delivery, count = 3) {
  return Array.from({ length: count }, (_, index) => createBulkDeliveryBatch(index, delivery));
}

function getProjectSubjectName(project: Project) {
  const plantCode = project.plant.match(/\b\d{8}\b/)?.[0];
  return plantCode ? `Vestas ${plantCode} ${project.name}` : project.name;
}

function cleanSubjectSegment(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function buildSupplierEmailSubject(project: Project, po: string, manufacturer = "", category = "") {
  return [
    `PO_${cleanSubjectSegment(po)}`,
    cleanSubjectSegment(manufacturer),
    cleanSubjectSegment(getProjectSubjectName(project)),
    cleanSubjectSegment(category),
  ].filter(Boolean).join("_");
}

function buildSupplierEmailTemplate() {
  return [
    "Hi,",
    "",
    "I hope you are doing well.",
    "",
    "Please find attached the Purchase Order (PO) and Drawing Version for the {{projectName}}.",
    "",
    "Kindly review, sign this PO, or send an order confirmation to confirm that you can meet the delivery schedule as stated below.",
    "If you are unable to meet the delivery schedule, please inform us immediately.",
    "",
    "DELIVERY SCHEDULE",
    "{{batchTable}}",
    "",
    "Technical Requirements",
    "- Please strictly follow the TPS, ECN drawings, and drawing versions listed in the purchasing package and PO.",
    "",
    "Invoice and Packing List Requirements",
    "1. Items invoiced must have already been delivered according to the INCOTERM specified in the PO.",
    "2. If there are any changes to the PO requirements, these must be officially confirmed by receiving an updated PO from CSWind America.",
    "   - CSWind America will always follow the latest PO version sent to you.",
    "3. All packing slips must include our project name.",
    "4. Invoices and statements must clearly reference the Purchase Order number; otherwise, they will be rejected.",
    "5. Supplier details, CSWind billing company, currency, line descriptions, quantities, and prices must match exactly with our PO.",
    "   - Partial deliveries and multiple invoices for the same PO are acceptable.",
    "6. Please send your invoice and packing list together in PDF format to the mailbox indicated on the PO.",
    "",
    "Additionally, please copy the following contacts when submitting your invoice:",
    "- Cedric Li (zhenli@cswind.com)",
    "- Hoai Truc, Cao (chtruc@cswind.com)",
    "",
    "Hardcopy (paper) invoices may be sent to the postal address listed on the PO if required by local regulations.",
    "7. If the invoice date differs from the actual sending month, please update the invoice date to the current month.",
    "   - Late or mismatched invoice dates may cause delays in payment.",
    "8. All deliveries require proof of delivery, including but not limited to packing slips, Bill of Lading, proof of delivery, point of delivery, delivery note, and/or receiving order.",
    "9. Deliveries must go through CSWind America's Receiving Department and must be signed off by an authorized CSWind America employee.",
    "   - The security gate is not authorized to sign off on any deliveries.",
    "10. All proofs of delivery, including the signed packing slip, Bill of Lading, or delivery note, must be sent to:",
    "    - Cedric Li (zhenli@cswind.com)",
    "    - Hoai Truc, Cao (chtruc@cswind.com)",
    "    for final processing.",
    "11. For any service or repair orders over USD 5,000, a service report must be included with the invoice as proof of delivery.",
    "",
    "Additional Requirements (Effective Immediately)",
    "12. Packing Slip Requirement (Critical):",
    "    - Suppliers must include a packing slip inside the container/shipment.",
    "    - The packing slip content, item list, and quantities must exactly match what is physically loaded in the container.",
    "    - Packing slips should clearly show the PO number, project name, and detailed item information, including item description, quantity, and part number.",
    "",
    "In addition to the individual packing slips attached to each wooden crate or individual package, a Master Packing List is also required for the entire shipment.",
    "13. The Master Packing List must:",
    "    - Provide a complete summary of the entire shipment contents.",
    "    - Clearly list all packages/crates included in the shipment.",
    "    - Include total quantities per item and total quantities per shipment.",
    "    - Cross-reference PO number and project name.",
    "    - Match exactly the physical loading condition of the container.",
    "",
    "Placement Requirement (Critical)",
    "- The Master Packing List must be securely fastened in a highly visible location.",
    "- It is strongly recommended that the Master Packing List be firmly attached directly to the cargo itself, not loosely placed inside the container.",
    "- This is to prevent loss during transportation, container change, or cargo rehandling.",
    "- The document must be easily accessible for inspection upon arrival.",
    "- Failure to comply with this requirement may result in receiving delays, rejection, or nonconformance reporting.",
    "",
    "14. Invoice Timing According to INCOTERM:",
    "    - In all cases, please ensure that invoices are sent as soon as your delivery obligations are fulfilled under the INCOTERM, preferably within one week.",
    "    - If the invoice is delayed into the following month, please update the invoice date to the current month before sending.",
    "    - Failure to comply may result in processing delays and postponed payments.",
    "",
    "Thank you for your cooperation and for ensuring compliance with CSWind America's invoicing and delivery documentation standards.",
    "We appreciate your timely confirmation and attention to detail to maintain smooth logistics and payment processing.",
    "",
    "Best regards,",
    "",
  ].join("\n");
}

function formatEmailCell(value: string | number, width: number, align: "left" | "right" = "left") {
  const text = String(value || "-").replace(/\s+/g, " ").trim();
  const cleanText = text.length > width ? `${text.slice(0, Math.max(0, width - 3))}...` : text;
  return align === "right" ? cleanText.padStart(width, " ") : cleanText.padEnd(width, " ");
}

function renderEmailTableRow(cells: Array<[string | number, number, "left" | "right"?]>) {
  return cells.map(([value, width, align = "left"]) => formatEmailCell(value, width, align)).join("  ");
}

function getDefaultMaterialAllocationQty(line: PurchasePoLine, batch: SupplierScheduleBatch) {
  return Math.round((line.poQty * Number(batch.percentage || 0) / 100) * 100) / 100;
}

function getMaterialAllocationQty(plan: SupplierSchedulePlan, line: PurchasePoLine, batch: SupplierScheduleBatch) {
  const allocation = plan.materialAllocations?.find((item) => item.poLineId === line.id && item.batchId === batch.id);
  return allocation ? Number(allocation.qty || 0) : getDefaultMaterialAllocationQty(line, batch);
}

function createSupplierMaterialAllocations(poLines: PurchasePoLine[], batches: SupplierScheduleBatch[], existing: SupplierMaterialAllocation[] = []) {
  return poLines.flatMap((line) =>
    batches.map((batch) => {
      const saved = existing.find((item) => item.poLineId === line.id && item.batchId === batch.id);
      return {
        poLineId: line.id,
        batchId: batch.id,
        qty: saved ? Number(saved.qty || 0) : getDefaultMaterialAllocationQty(line, batch),
      };
    }),
  );
}

function createSupplierSchedulePlan(project: Project, po: string, rows: Delivery[], poLines: PurchasePoLine[] = []): SupplierSchedulePlan {
  const cleanRows = rows.filter((row) => row.po === po);
  const firstRow = cleanRows[0];
  const firstPoLine = poLines.find((line) => line.po === po);
  const totalQty = cleanRows.reduce((sum, row) => sum + Number(row.qty || 0), 0) || 1;
  const manufacturer = firstRow?.manufacturer || firstPoLine?.manufacturer || "";
  const category = firstRow ? getDeliveryCategory(firstRow) : firstPoLine?.category || "";
  const material = firstRow?.material || firstPoLine?.material || category;
  const incoterms = firstRow?.incoterms || firstPoLine?.incoterms || "";
  const deliveryBatches = cleanRows.map((row) => ({
    id: `supplier-batch-${row.id}`,
    deliveryId: row.id,
    batch: row.batch,
    qty: Number(row.qty || 0),
    percentage: Math.round((Number(row.qty || 0) / totalQty) * 1000) / 10,
    puWeek: row.supplierSchedule,
    needWeek: row.productionNeed,
    supplierRequestWeek: row.actualEta || "",
    status: "Draft" as SupplierBatchStatus,
    note: "",
    commercialInvoiceFiles: [],
    packingListFiles: [],
    blNumber: "",
    forwarderEta: row.actualEta || "",
  }));
  const batches = deliveryBatches.length
    ? deliveryBatches
    : po
      ? [{
          id: `supplier-batch-${project.id}-${po}-B1`,
          deliveryId: "",
          batch: "B1",
          qty: 0,
          percentage: 100,
          puWeek: firstPoLine?.deliveryDate || new Date().toISOString().slice(0, 10),
          needWeek: firstPoLine?.deliveryDate || new Date().toISOString().slice(0, 10),
          supplierRequestWeek: "",
          status: "Draft" as SupplierBatchStatus,
          note: "",
          commercialInvoiceFiles: [],
          packingListFiles: [],
          blNumber: "",
          forwarderEta: "",
        }]
      : [];
  return {
    id: `supplier-plan-${project.id}-${po || "new"}`,
    projectId: project.id,
    po,
    manufacturer,
    category,
    material,
    incoterms,
    to: "",
    cc: "",
    subject: buildSupplierEmailSubject(project, po, manufacturer, category),
    body: buildSupplierEmailTemplate(),
    attachments: [],
    forwarderEmail: "",
    batches,
    materialAllocations: createSupplierMaterialAllocations(poLines, batches),
    requestSent: false,
    pickupReminderSent: false,
    forwarderNoticeSent: false,
  };
}

function renderSupplierBatchTable(plan: SupplierSchedulePlan) {
  if (!plan.batches.length) return "No batch lines have been created for this PO yet.";
  const headers: Array<[string, number, "left" | "right"?]> = [
    ["Category", 18],
    ["Selected supplier", 24],
    ["D.T", 8],
    ["PO", 12],
    ["Batch", 8],
    ["Qty", 8, "right"],
    ["Split", 8, "right"],
    ["PU week", 14],
    ["Need week", 14],
  ];
  return [
    renderEmailTableRow(headers),
    renderEmailTableRow(headers.map(([, width, align]) => ["-".repeat(width), width, align])),
    ...plan.batches.map((batch) => {
      const batchQty = Number(batch.qty || 0);
      return renderEmailTableRow([
        [plan.category || "-", 18],
        [plan.manufacturer || "-", 24],
        [plan.incoterms || "-", 8],
        [plan.po || "-", 12],
        [batch.batch, 8],
        [batchQty.toLocaleString(), 8, "right"],
        [`${Number(batch.percentage || 0)}%`, 8, "right"],
        [formatScheduleWeek(batch.puWeek), 14],
        [formatScheduleWeek(batch.needWeek), 14],
      ]);
    }),
  ].join("\n");
}

function renderSupplierEmail(plan: SupplierSchedulePlan, project: Project) {
  return plan.body
    .replaceAll("{{projectName}}", project.name)
    .replaceAll("{{po}}", plan.po)
    .replaceAll("{{manufacturer}}", plan.manufacturer)
    .replaceAll("{{category}}", plan.category)
    .replaceAll("{{material}}", plan.material)
    .replaceAll("{{incoterms}}", plan.incoterms)
    .replaceAll("{{batchTable}}", renderSupplierBatchTable(plan));
}

function renderPickupReminderEmail(plan: SupplierSchedulePlan, project: Project) {
  const targetRows = plan.batches
    .filter((batch) => !batch.commercialInvoiceFiles.length || !batch.packingListFiles.length)
    .map((batch) => `${batch.batch}: PU / delivery week ${formatScheduleWeek(batch.puWeek)}`)
    .join("\n");
  return [
    `Subject: PO ${plan.po} packing list and commercial invoice request - ${project.name}`,
    "",
    "Dear supplier team,",
    "",
    "The pickup / delivery window is approaching. Please share the packing list and commercial invoice for the following batch(es):",
    "",
    targetRows || "All open batches.",
    "",
    "Best regards,",
    "CSWind America Procurement",
  ].join("\n");
}

function renderForwarderNotice(plan: SupplierSchedulePlan, project: Project) {
  const docs = plan.batches.map((batch) => {
    const ci = batch.commercialInvoiceFiles.join(", ") || "Commercial invoice pending";
    const pl = batch.packingListFiles.join(", ") || "Packing list pending";
    return `${batch.batch}: PU week ${formatScheduleWeek(batch.puWeek)} / ${ci} / ${pl}`;
  }).join("\n");
  return [
    `Subject: Pickup request for PO ${plan.po} - ${project.name}`,
    "",
    "Dear forwarder team,",
    "",
    "Please arrange pickup for the following batch(es) and provide B/L number and ETA once available.",
    "",
    docs || "Batch details pending.",
    "",
    "Best regards,",
    "CSWind America Procurement",
  ].join("\n");
}

function createSupplierNcrDraft(project: Project): SupplierNcr {
  return {
    id: `SNCR-${Date.now()}`,
    projectId: project.id,
    ncrNumber: "",
    projectName: project.name,
    materialCode: "",
    category: "",
    qty: 0,
    replacementReceived: false,
    projectImpact: false,
  };
}

function createInternalNcrDraft(projectId: string): InternalNcr {
  return {
    id: `INCR-${Date.now()}`,
    projectId,
    ncrNumber: "",
    materialInfo: "",
    manufacturer: "",
    qty: 0,
    cost: 0,
    eta: new Date().toISOString().slice(0, 10),
    goodsReceived: false,
  };
}

function createEcnDraft(projectId: string): EcnRecord {
  return {
    id: `ECN-${Date.now()}`,
    projectId,
    ecnNumber: "",
    title: "",
    category: "",
    manufacturer: "",
    status: "Open",
    impact: "No impact",
    effectiveWeek: new Date().toISOString().slice(0, 10),
    costImpact: 0,
    notes: "",
  };
}

function createTodoDraft(projectId: string): TodoItem {
  return {
    id: `TODO-${Date.now()}`,
    projectId,
    title: "",
    owner: "",
    mode: "General",
    priority: "Normal",
    dueWeek: formatInputWeek(new Date()),
    done: false,
  };
}

function escapeCsv(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function splitCsvLine(line: string) {
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

function parseBoolean(value: string) {
  return ["true", "yes", "y", "1", "received"].includes(value.trim().toLowerCase());
}

function parseNumber(value: string) {
  return Number(value.replaceAll("$", "").replaceAll(",", "").trim() || 0);
}

function parseDeliveryCsv(text: string, fallbackProjectId: string): Delivery[] {
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

function getCsvValue(row: Record<string, string>, names: string[]) {
  const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim().toLowerCase(), value]));
  const target = names.map((name) => name.trim().toLowerCase());
  for (const name of target) {
    if (normalized[name] != null) return normalized[name];
  }
  return "";
}

function normalizeBomHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function getBomValue(row: Record<string, string>, names: string[]) {
  const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeBomHeader(key), value]));
  for (const name of names) {
    const value = normalized[normalizeBomHeader(name)];
    if (value != null && String(value).trim()) return value;
  }
  return "";
}

function parseBomRows(rows: unknown[][], projectId: string, source: "purchasing" | "internal"): BomItem[] {
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

function parseBomCsv(text: string, projectId: string, source: "purchasing" | "internal") {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const rows = lines.map((line) => splitCsvLine(line));
  return parseBomRows(rows, projectId, source);
}

function parseBomWorkbook(data: ArrayBuffer, projectId: string, source: "purchasing" | "internal") {
  const workbook = XLSX.read(data, { type: "array" });
  const sheetName =
    workbook.SheetNames.find((name) => name.toLowerCase().includes(source === "purchasing" ? "purchasing" : "internal")) ??
    workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", header: 1 }) as unknown[][];
  return parseBomRows(rows, projectId, source);
}

function normalizePoHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function cleanPoCell(value: unknown) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).replace(/\s+/g, " ").trim();
}

function fillForward(values: string[]) {
  let previous = "";
  return values.map((value) => {
    if (value) previous = value;
    return value || previous;
  });
}

function findPoColumn(headers: string[], labels: string[], startAt = 0) {
  const normalizedLabels = labels.map(normalizePoHeader);
  return headers.findIndex((header, index) => index >= startAt && normalizedLabels.every((label) => normalizePoHeader(header).includes(label)));
}

function findPoMainColumn(groups: string[], headers: string[], groupLabel: string, headerLabel: string, startAt = 0) {
  const normalizedGroup = normalizePoHeader(groupLabel);
  const normalizedHeader = normalizePoHeader(headerLabel);
  return headers.findIndex((header, index) => index >= startAt && normalizePoHeader(groups[index] ?? "").includes(normalizedGroup) && normalizePoHeader(header) === normalizedHeader);
}

function getPoCell(cells: string[], index: number) {
  return index >= 0 ? cells[index] ?? "" : "";
}

function normalizePoDate(value: string, fallback: string) {
  const cleanValue = value.trim();
  const dateMatch = cleanValue.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    return normalizeScheduleValue(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`, fallback);
  }
  return normalizeScheduleValue(cleanValue, fallback);
}

function findProjectForPoLine(projectId: string, projectName: string, projects: Project[], fallbackProject: Project) {
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

function makePurchasePoLineId(projectId: string, po: string, lineNo: string, materialCode: string, index: number) {
  const stableKey = [projectId, po, lineNo || materialCode || index].join("-").replace(/[^a-zA-Z0-9-]+/g, "-");
  return `POL-${stableKey}`;
}

function parsePoDetailRows(rows: unknown[][], projects: Project[], fallbackProject: Project): PurchasePoLine[] {
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

function parsePoDetailWorkbook(data: ArrayBuffer, projects: Project[], fallbackProject: Project) {
  const workbook = XLSX.read(data, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", header: 1 }) as unknown[][];
  return parsePoDetailRows(rows, projects, fallbackProject);
}

function findProjectForImportedRow(row: Record<string, string>, projects: Project[], fallbackProject: Project) {
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

function parseNcrCsv(text: string, projects: Project[], fallbackProject: Project) {
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

export default function Home() {
  const [projectList, setProjectList] = useState<Project[]>(defaultProjects);
  const [deliveryList, setDeliveryList] = useState<Delivery[]>(defaultDeliveries);
  const [bomItems, setBomItems] = useState<BomItem[]>(defaultBomItems);
  const [supplierNcrs, setSupplierNcrs] = useState<SupplierNcr[]>(defaultSupplierNcrs);
  const [internalNcrs, setInternalNcrs] = useState<InternalNcr[]>(defaultInternalNcrs);
  const [ecnRecords, setEcnRecords] = useState<EcnRecord[]>([]);
  const [todoItems, setTodoItems] = useState<TodoItem[]>(defaultTodoItems);
  const [supplierPlans, setSupplierPlans] = useState<SupplierSchedulePlan[]>([]);
  const [purchasePoLines, setPurchasePoLines] = useState<PurchasePoLine[]>([]);
  const [activeProjectId, setActiveProjectId] = useState(defaultActiveProjectId);
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [reportProjectId, setReportProjectId] = useState("All");
  const [reportWindow, setReportWindow] = useState("All");
  const [cashflowProjectId, setCashflowProjectId] = useState("All");
  const [deliveryProjectFilter, setDeliveryProjectFilter] = useState("All");
  const [deliveryManufacturerFilter, setDeliveryManufacturerFilter] = useState("All");
  const [deliveryCategoryFilter, setDeliveryCategoryFilter] = useState("All");
  const [deliveryPoFilter, setDeliveryPoFilter] = useState("All");
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState("All");
  const [deliverySearch, setDeliverySearch] = useState("");
  const [deliverySort, setDeliverySort] = useState("risk");
  const [supplierPoFilter, setSupplierPoFilter] = useState("");
  const [mcipProjectFilter, setMcipProjectFilter] = useState("All");
  const [mcipStatusFilter, setMcipStatusFilter] = useState("All");
  const [mcipSort, setMcipSort] = useState("mcipAsc");
  const [ncrProjectFilter, setNcrProjectFilter] = useState("All");
  const [ncrTypeFilter, setNcrTypeFilter] = useState("All");
  const [ncrStatusFilter, setNcrStatusFilter] = useState("All");
  const [ncrSort, setNcrSort] = useState("status");
  const [ecnProjectFilter, setEcnProjectFilter] = useState("All");
  const [ecnStatusFilter, setEcnStatusFilter] = useState("All");
  const [ecnImpactFilter, setEcnImpactFilter] = useState("All");
  const [ecnSort, setEcnSort] = useState("weekDesc");
  const [bomManufacturerFilter, setBomManufacturerFilter] = useState("All");
  const [bomCategoryFilter, setBomCategoryFilter] = useState("All");
  const [bomSearch, setBomSearch] = useState("");
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceTab>("overview");
  const [hydrated, setHydrated] = useState(false);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [showDeliveryForm, setShowDeliveryForm] = useState(false);
  const [deliveryEntryMode, setDeliveryEntryMode] = useState<DeliveryEntryMode>("single");
  const [editingDeliveryId, setEditingDeliveryId] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [projectDraft, setProjectDraft] = useState<Project>(createProjectDraft());
  const [deliveryDraft, setDeliveryDraft] = useState<Delivery>(createDeliveryDraft(defaultProjects[0].id));
  const [bulkDeliveryBatches, setBulkDeliveryBatches] = useState<BulkDeliveryBatch[]>(createBulkDeliveryBatches(createDeliveryDraft(defaultProjects[0].id)));
  const [supplierNcrDraft, setSupplierNcrDraft] = useState<SupplierNcr>(createSupplierNcrDraft(defaultProjects[0]));
  const [internalNcrDraft, setInternalNcrDraft] = useState<InternalNcr>(createInternalNcrDraft(defaultProjects[0].id));
  const [ecnDraft, setEcnDraft] = useState<EcnRecord>(createEcnDraft(defaultProjects[0].id));
  const [todoDraft, setTodoDraft] = useState<TodoItem>(createTodoDraft(defaultProjects[0].id));

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    const shouldSeedPantherDemo = !window.localStorage.getItem(pantherDemoSeedKey);
    if (saved) {
      const parsed = JSON.parse(saved) as {
        projects?: Project[];
        deliveries?: Delivery[];
        bomItems?: BomItem[];
        supplierNcrs?: SupplierNcr[];
        internalNcrs?: InternalNcr[];
        ecnRecords?: EcnRecord[];
        todoItems?: TodoItem[];
        supplierPlans?: SupplierSchedulePlan[];
        purchasePoLines?: PurchasePoLine[];
      };
      const savedDeliveries = parsed.deliveries ?? [];
      const savedBomItems = parsed.bomItems ?? [];
      const hasPantherDeliveries = savedDeliveries.some((delivery) => ["project-1700", "project-1616"].includes(delivery.projectId));
      const hasPantherBom = savedBomItems.some((item) => ["project-1700", "project-1616"].includes(item.projectId));
      const nextProjects = shouldSeedPantherDemo ? mergeUniqueById(parsed.projects?.length ? parsed.projects : defaultProjects, defaultProjects) : parsed.projects?.length ? parsed.projects : defaultProjects;
      const nextDeliveries = shouldSeedPantherDemo && !hasPantherDeliveries ? mergeUniqueById(savedDeliveries, defaultDeliveries) : savedDeliveries;
      const nextBomItems = shouldSeedPantherDemo && !hasPantherBom ? mergeUniqueById(savedBomItems, defaultBomItems) : savedBomItems;
      setProjectList(nextProjects);
      setActiveProjectId(nextProjects.some((project) => project.id === defaultActiveProjectId) ? defaultActiveProjectId : nextProjects[0].id);
      setDeliveryList(nextDeliveries);
      setBomItems(nextBomItems);
      if (parsed.supplierNcrs?.length) {
        setSupplierNcrs(parsed.supplierNcrs);
      }
      if (parsed.internalNcrs?.length) {
        setInternalNcrs(parsed.internalNcrs);
      }
      if (parsed.ecnRecords?.length) {
        setEcnRecords(parsed.ecnRecords);
      }
      if (parsed.todoItems?.length) {
        setTodoItems(parsed.todoItems);
      }
      if (parsed.supplierPlans?.length) {
        setSupplierPlans(parsed.supplierPlans);
      }
      if (parsed.purchasePoLines?.length) {
        setPurchasePoLines(parsed.purchasePoLines);
      }
    } else {
      setProjectList(defaultProjects);
      setActiveProjectId(defaultActiveProjectId);
      setDeliveryList(defaultDeliveries);
      setBomItems(defaultBomItems);
    }
    if (!window.localStorage.getItem(deliveryClearKey)) {
      window.localStorage.setItem(deliveryClearKey, "true");
    }
    if (!window.localStorage.getItem(bomClearKey)) {
      window.localStorage.setItem(bomClearKey, "true");
    }
    if (shouldSeedPantherDemo) {
      window.localStorage.setItem(pantherDemoSeedKey, "true");
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(storageKey, JSON.stringify({ projects: projectList, deliveries: deliveryList, bomItems, supplierNcrs, internalNcrs, ecnRecords, todoItems, supplierPlans, purchasePoLines }));
  }, [bomItems, deliveryList, ecnRecords, hydrated, internalNcrs, projectList, purchasePoLines, supplierNcrs, supplierPlans, todoItems]);

  const rowsWithRisk = useMemo(
    () =>
      deliveryList.map((delivery) => ({
        ...delivery,
        risk: getRisk(delivery),
      })),
    [deliveryList],
  );

  const activeProject = projectList.find((project) => project.id === activeProjectId) ?? projectList[0];
  const projectRows = rowsWithRisk.filter((row) => row.projectId === activeProject.id);
  const projectPurchasePoLines = purchasePoLines.filter((line) => line.projectId === activeProject.id);
  const supplierPoOptions = Array.from(new Set([...projectRows.map((row) => row.po), ...projectPurchasePoLines.map((line) => line.po)].filter(Boolean))).sort();
  const activeSupplierPo = supplierPoOptions.includes(supplierPoFilter) ? supplierPoFilter : supplierPoOptions[0] || "";
  const supplierPoRows = projectRows.filter((row) => row.po === activeSupplierPo);
  const supplierPoLines = projectPurchasePoLines.filter((line) => line.po === activeSupplierPo);
  const savedSupplierPlan = supplierPlans.find((plan) => plan.projectId === activeProject.id && plan.po === activeSupplierPo);
  const defaultSupplierPlan = createSupplierSchedulePlan(activeProject, activeSupplierPo, supplierPoRows, supplierPoLines);
  const supplierPlan = savedSupplierPlan
    ? {
        ...defaultSupplierPlan,
        ...savedSupplierPlan,
        manufacturer: savedSupplierPlan.manufacturer || defaultSupplierPlan.manufacturer,
        category: savedSupplierPlan.category || defaultSupplierPlan.category,
        material: savedSupplierPlan.material || defaultSupplierPlan.material,
        incoterms: savedSupplierPlan.incoterms || defaultSupplierPlan.incoterms,
      }
    : defaultSupplierPlan;
  const supplierEmailText = renderSupplierEmail(supplierPlan, activeProject);
  const pickupReminderText = renderPickupReminderEmail(supplierPlan, activeProject);
  const forwarderNoticeText = renderForwarderNotice(supplierPlan, activeProject);
  const supplierPlanApprovedCount = supplierPlan.batches.filter((batch) => batch.status === "Approved").length;
  const supplierPlanDocsReadyCount = supplierPlan.batches.filter((batch) => batch.commercialInvoiceFiles.length && batch.packingListFiles.length).length;
  const supplierPlanBlReadyCount = supplierPlan.batches.filter((batch) => batch.blNumber.trim()).length;
  const supplierSplitTotal = supplierPlan.batches.reduce((sum, batch) => sum + Number(batch.percentage || 0), 0);
  const supplierPoLineTotalQty = supplierPoLines.reduce((sum, line) => sum + line.poQty, 0);
  const supplierPoLineTotalAmount = supplierPoLines.reduce((sum, line) => sum + line.amount, 0);
  const projectTowerQty = projectRows.reduce((sum, row) => sum + row.qty, 0);
  const projectBomItems = bomItems.filter((item) => item.projectId === activeProject.id);
  const projectPurchasingBomItems = projectBomItems.filter((item) => (item.source ?? "purchasing") === "purchasing");
  const projectInternalBomItems = projectBomItems.filter((item) => item.source === "internal");
  const bomManufacturers = ["All", ...Array.from(new Set(projectPurchasingBomItems.map((item) => item.manufacturer).filter(Boolean))).sort()];
  const bomCategories = ["All", ...Array.from(new Set(projectPurchasingBomItems.map((item) => item.category).filter(Boolean))).sort()];
  const visiblePurchasingBomItems = projectPurchasingBomItems
    .filter((item) => bomManufacturerFilter === "All" || item.manufacturer === bomManufacturerFilter)
    .filter((item) => bomCategoryFilter === "All" || item.category === bomCategoryFilter)
    .filter((item) => {
      const text = `${item.componentNumber} ${item.material} ${item.manufacturer} ${item.vendorCode} ${item.category}`.toLowerCase();
      return text.includes(bomSearch.trim().toLowerCase());
    });
  const getBomLineQty = (item: BomItem) => item.totalQty || projectTowerQty * item.qtyPerTower;
  const getBomLineAmount = (item: BomItem) => item.amountTotal || getBomLineQty(item) * item.unitCost;
  const bomVisibleTotalQty = visiblePurchasingBomItems.reduce((sum, item) => sum + getBomLineQty(item), 0);
  const bomVisibleTotalAmount = visiblePurchasingBomItems.reduce((sum, item) => sum + getBomLineAmount(item), 0);
  const projectSupplierNcrs = supplierNcrs.filter((item) => item.projectId === activeProject.id);
  const projectInternalNcrs = internalNcrs.filter((item) => item.projectId === activeProject.id);
  const todoPriorityRank: Record<string, number> = { Urgent: 3, High: 2, Normal: 1, Low: 0 };
  const projectTodoItems = todoItems
    .filter((item) => item.projectId === activeProject.id)
    .sort((left, right) => Number(left.done) - Number(right.done) || (todoPriorityRank[right.priority] ?? 1) - (todoPriorityRank[left.priority] ?? 1));
  const openTodoCount = projectTodoItems.filter((item) => !item.done).length;
  const ecnVisibleRows = ecnRecords
    .map((item) => {
      const project = projectList.find((projectItem) => projectItem.id === item.projectId);
      return {
        ...item,
        projectName: project?.name ?? item.projectId,
        projectCode: project?.code ?? item.projectId,
      };
    })
    .filter((row) => ecnProjectFilter === "All" || row.projectId === ecnProjectFilter)
    .filter((row) => ecnStatusFilter === "All" || row.status === ecnStatusFilter)
    .filter((row) => ecnImpactFilter === "All" || row.impact === ecnImpactFilter)
    .sort((left, right) => {
      if (ecnSort === "weekDesc") return toDate(right.effectiveWeek).getTime() - toDate(left.effectiveWeek).getTime();
      if (ecnSort === "weekAsc") return toDate(left.effectiveWeek).getTime() - toDate(right.effectiveWeek).getTime();
      if (ecnSort === "costDesc") return right.costImpact - left.costImpact;
      if (ecnSort === "status") return left.status.localeCompare(right.status);
      return left.projectName.localeCompare(right.projectName);
    });
  const activeProjectStatus = getProjectStatus(activeProject);
  const projectEcnRecords = ecnRecords.filter((item) => item.projectId === activeProject.id);
  const categories = ["All", ...Array.from(new Set(projectRows.map((row) => getDeliveryCategory(row))))];
  const filteredRows = projectRows.filter((row) => {
    const categoryMatch = category === "All" || getDeliveryCategory(row) === category;
    const text = `${row.category} ${row.material} ${row.batch} ${row.po} ${row.vendorCode} ${row.manufacturer}`.toLowerCase();
    return categoryMatch && text.includes(query.toLowerCase());
  });
  const deliveryManufacturers = ["All", ...Array.from(new Set(rowsWithRisk.map((row) => row.manufacturer).filter(Boolean))).sort()];
  const deliveryCategories = ["All", ...Array.from(new Set(rowsWithRisk.map((row) => getDeliveryCategory(row)).filter(Boolean))).sort()];
  const deliveryPos = ["All", ...Array.from(new Set(rowsWithRisk.map((row) => row.po).filter(Boolean))).sort()];
  const totalDeliveryRows = rowsWithRisk
    .map((row) => {
      const project = projectList.find((item) => item.id === row.projectId);
      return {
        ...row,
        projectName: project?.name ?? row.projectId,
        projectCode: project?.code ?? row.projectId,
        projectStatus: project ? getProjectStatus(project) : "Active",
        deliveryStatus: getDeliveryStatusLabel(row),
      };
    })
    .filter((row) => deliveryProjectFilter === "All" || row.projectId === deliveryProjectFilter)
    .filter((row) => deliveryManufacturerFilter === "All" || row.manufacturer === deliveryManufacturerFilter)
    .filter((row) => deliveryCategoryFilter === "All" || getDeliveryCategory(row) === deliveryCategoryFilter)
    .filter((row) => deliveryPoFilter === "All" || row.po === deliveryPoFilter)
    .filter((row) => deliveryStatusFilter === "All" || row.deliveryStatus === deliveryStatusFilter)
    .filter((row) => {
      const text = `${row.projectName} ${row.projectCode} ${row.po} ${row.batch} ${row.manufacturer} ${row.vendorCode} ${getDeliveryCategory(row)}`.toLowerCase();
      return text.includes(deliverySearch.trim().toLowerCase());
    })
    .sort((left, right) => {
      if (deliverySort === "risk") return right.risk.score - left.risk.score || toDate(left.productionNeed).getTime() - toDate(right.productionNeed).getTime();
      if (deliverySort === "etaAsc") return getEstimatedArrival(left).getTime() - getEstimatedArrival(right).getTime();
      if (deliverySort === "project") return left.projectName.localeCompare(right.projectName);
      if (deliverySort === "manufacturer") return left.manufacturer.localeCompare(right.manufacturer);
      if (deliverySort === "category") return getDeliveryCategory(left).localeCompare(getDeliveryCategory(right));
      return left.po.localeCompare(right.po);
    });
  const totalDeliveryRiskCount = totalDeliveryRows.filter((row) => row.deliveryStatus === "Risk").length;
  const totalDeliveryOpenCount = totalDeliveryRows.filter((row) => row.deliveryStatus === "Open").length;
  const totalDeliveryArrivedCount = totalDeliveryRows.filter((row) => row.deliveryStatus === "Arrived").length;
  const riskRows = projectRows.filter((row) => row.risk.score >= 3).sort((a, b) => b.risk.score - a.risk.score);
  const arrivedCount = projectRows.filter((row) => row.actualArrival).length;
  const internalNcrCost = projectInternalNcrs.reduce((sum, item) => sum + item.cost, 0);
  const projectMaterialCost = projectRows.reduce((sum, row) => sum + getMaterialCost(row, bomItems), 0);
  const projectLogisticsCost = projectRows.reduce((sum, row) => sum + getProjectedFreightFee(row, projectRows), 0);
  const projectTariffCost = projectRows.reduce((sum, row) => sum + getProjectedTariff(row, projectRows), 0);
  const projectTotalCost = projectMaterialCost + projectLogisticsCost + projectTariffCost + internalNcrCost;
  const forecastBudgetUsed = projectTotalCost;
  const forecastBudgetRemaining = activeProject.budget - forecastBudgetUsed;
  const projectBudgetUsedPercent = activeProject.budget > 0 ? forecastBudgetUsed / activeProject.budget : 0;
  const projectBudgetRemainingPercent = activeProject.budget > 0 ? forecastBudgetRemaining / activeProject.budget : 0;
  const projectBudgetUsedDisplay = clampPercent(projectBudgetUsedPercent);
  const deliveryCompletePercent = projectRows.length > 0 ? arrivedCount / projectRows.length : 0;
  const deliveryRiskPercent = projectRows.length > 0 ? riskRows.length / projectRows.length : 0;
  const openDeliveryCount = Math.max(0, projectRows.length - arrivedCount);
  const costMixItems = [
    { label: "Material", value: projectMaterialCost, tone: "material" },
    { label: "Logistics", value: projectLogisticsCost, tone: "logistics" },
    { label: "Tariff", value: projectTariffCost, tone: "tariff" },
    { label: "NCR", value: internalNcrCost, tone: "ncr" },
  ];
  const costMixTotal = Math.max(1, costMixItems.reduce((sum, item) => sum + item.value, 0));
  const costMixStops = costMixItems.reduce(
    (result, item) => {
      const percent = (item.value / costMixTotal) * 100;
      const start = result.cursor;
      const end = result.cursor + percent;
      result.stops.push(`var(--cost-${item.tone}) ${start}% ${end}%`);
      result.cursor = end;
      return result;
    },
    { cursor: 0, stops: [] as string[] },
  ).stops;
  const openBatchCount = projectRows.filter((row) => !row.manufacturerInvoiceReceived).length;
  const range = getRange(projectRows);
  const deliveryDraftUsesSupplierEta = usesSupplierEta(deliveryDraft);
  const deliveryDraftIsDdp = getIncotermMode(deliveryDraft) === "DDP";
  const bulkBatchRowClassName = `bulk-batch-row${deliveryDraftUsesSupplierEta ? " supplier-managed" : ""}${deliveryDraftIsDdp ? " tariff-managed" : ""}`;
  const reportRows = rowsWithRisk.filter((row) => {
    const projectMatch = reportProjectId === "All" || row.projectId === reportProjectId;
    if (!projectMatch) return false;
    if (reportWindow === "All") return true;
    const days = Number(reportWindow);
    const today = new Date();
    const scheduleDate = row.risk.theoreticalDelivery;
    return scheduleDate >= today && daysBetween(today, scheduleDate) <= days;
  });
  const reportSupplierNcrs = supplierNcrs.filter((item) => reportProjectId === "All" || item.projectId === reportProjectId);
  const reportInternalNcrs = internalNcrs.filter((item) => {
    if (reportProjectId !== "All" && item.projectId !== reportProjectId) return false;
    if (reportWindow === "All") return true;
    const days = Number(reportWindow);
    const today = new Date();
    const etaDate = toDate(item.eta);
    return etaDate >= today && daysBetween(today, etaDate) <= days;
  });
  const ncrReportSummary = projectList
    .filter((project) => reportProjectId === "All" || project.id === reportProjectId)
    .map((project) => {
      const supplierItems = reportSupplierNcrs.filter((item) => item.projectId === project.id);
      const internalItems = reportInternalNcrs.filter((item) => item.projectId === project.id);
      return {
        project,
        supplierCount: supplierItems.length,
        supplierImpact: supplierItems.filter((item) => item.projectImpact).length,
        replacementOpen: supplierItems.filter((item) => !item.replacementReceived).length,
        internalCount: internalItems.length,
        internalOpen: internalItems.filter((item) => !item.goodsReceived).length,
        internalCost: internalItems.reduce((sum, item) => sum + item.cost, 0),
      };
    })
    .filter((item) => item.supplierCount || item.internalCount);
  const totalNcrPreviewRows = [
    ...supplierNcrs.map((item) => {
      const project = projectList.find((projectItem) => projectItem.id === item.projectId);
      return {
        id: `supplier-${item.id}`,
        projectId: item.projectId,
        projectName: project?.name ?? item.projectName,
        projectCode: project?.code ?? item.projectId,
        type: "Supplier",
        ncrNumber: item.ncrNumber,
        material: item.materialCode,
        qty: item.qty,
        status: item.replacementReceived ? "Received" : "Open",
        cost: null as number | null,
        eta: "",
      };
    }),
    ...internalNcrs.map((item) => {
      const project = projectList.find((projectItem) => projectItem.id === item.projectId);
      return {
        id: `internal-${item.id}`,
        projectId: item.projectId,
        projectName: project?.name ?? item.projectId,
        projectCode: project?.code ?? item.projectId,
        type: "Internal",
        ncrNumber: item.ncrNumber,
        material: item.materialInfo,
        qty: item.qty,
        status: item.goodsReceived ? "Received" : "Open",
        cost: item.cost,
        eta: item.eta,
      };
    }),
  ];
  const ncrVisibleRows = totalNcrPreviewRows
    .filter((row) => ncrProjectFilter === "All" || row.projectId === ncrProjectFilter)
    .filter((row) => ncrTypeFilter === "All" || row.type === ncrTypeFilter)
    .filter((row) => ncrStatusFilter === "All" || row.status === ncrStatusFilter)
    .sort((left, right) => {
      if (ncrSort === "status") return left.status.localeCompare(right.status) || left.projectName.localeCompare(right.projectName);
      if (ncrSort === "project") return left.projectName.localeCompare(right.projectName);
      if (ncrSort === "costDesc") return Number(right.cost || 0) - Number(left.cost || 0);
      if (ncrSort === "etaAsc") return (left.eta ? toDate(left.eta).getTime() : Number.MAX_SAFE_INTEGER) - (right.eta ? toDate(right.eta).getTime() : Number.MAX_SAFE_INTEGER);
      return left.ncrNumber.localeCompare(right.ncrNumber);
    });
  const mcipProjectRows = projectList.map((project) => {
    const deliveries = rowsWithRisk.filter((row) => row.projectId === project.id);
    const internalItems = internalNcrs.filter((item) => item.projectId === project.id);
    const towerQty = deliveries.reduce((sum, row) => sum + row.qty, 0);
    const materialCost = deliveries.reduce((sum, row) => sum + getMaterialCost(row, bomItems), 0);
    const logisticsCost = deliveries.reduce((sum, row) => sum + getProjectedFreightFee(row, rowsWithRisk), 0);
    const tariffCost = deliveries.reduce((sum, row) => sum + getProjectedTariff(row, rowsWithRisk), 0);
    const ncrCost = internalItems.reduce((sum, item) => sum + item.cost, 0);
    const forecastCost = materialCost + logisticsCost + tariffCost + ncrCost;
    const budget = Number(project.budget || 0);
    const mcipAmount = budget - forecastCost;
    const mcipAmountDap = budget - (forecastCost - tariffCost);
    return {
      project,
      budget,
      towerQty,
      materialCost,
      logisticsCost,
      tariffCost,
      ncrCost,
      forecastCost,
      mcipAmount,
      mcipAmountDap,
      mcipPerTowerDap: towerQty > 0 ? mcipAmountDap / towerQty : 0,
      mcipPerTowerDdp: towerQty > 0 ? mcipAmount / towerQty : 0,
      mcipPercent: budget > 0 ? mcipAmount / budget : 0,
    };
  });
  const mcipVisibleRows = mcipProjectRows
    .filter((row) => mcipProjectFilter === "All" || row.project.id === mcipProjectFilter)
    .filter((row) => mcipStatusFilter === "All" || getProjectStatus(row.project) === mcipStatusFilter)
    .sort((left, right) => {
      if (mcipSort === "mcipAsc") return left.mcipAmount - right.mcipAmount;
      if (mcipSort === "mcipDesc") return right.mcipAmount - left.mcipAmount;
      if (mcipSort === "costDesc") return right.forecastCost - left.forecastCost;
      if (mcipSort === "budgetDesc") return right.budget - left.budget;
      return left.project.name.localeCompare(right.project.name);
    });
  const mcipTotals = mcipVisibleRows.reduce(
    (total, row) => ({
      budget: total.budget + row.budget,
      towerQty: total.towerQty + row.towerQty,
      materialCost: total.materialCost + row.materialCost,
      logisticsCost: total.logisticsCost + row.logisticsCost,
      tariffCost: total.tariffCost + row.tariffCost,
      ncrCost: total.ncrCost + row.ncrCost,
      forecastCost: total.forecastCost + row.forecastCost,
      mcipAmount: total.mcipAmount + row.mcipAmount,
      mcipAmountDap: total.mcipAmountDap + row.mcipAmountDap,
    }),
    {
      budget: 0,
      towerQty: 0,
      materialCost: 0,
      logisticsCost: 0,
      tariffCost: 0,
      ncrCost: 0,
      forecastCost: 0,
      mcipAmount: 0,
      mcipAmountDap: 0,
    },
  );
  const mcipTotalPerTowerDap = mcipTotals.towerQty > 0 ? mcipTotals.mcipAmountDap / mcipTotals.towerQty : 0;
  const mcipTotalPerTowerDdp = mcipTotals.towerQty > 0 ? mcipTotals.mcipAmount / mcipTotals.towerQty : 0;
  const mcipTotalPercent = mcipTotals.budget > 0 ? mcipTotals.mcipAmount / mcipTotals.budget : 0;
  const freightTariffStats = Array.from(
    reportRows.reduce((map, row) => {
      const project = projectList.find((item) => item.id === row.projectId);
      const key = `${project?.name ?? row.projectId}|${row.manufacturer}|${row.category}`;
      const current = map.get(key) ?? {
        key,
        projectName: project?.name ?? row.projectId,
        manufacturer: row.manufacturer,
        category: row.category,
        count: 0,
        seaCount: 0,
        airCount: 0,
        freight: 0,
        tariff: 0,
        material: 0,
      };
      current.count += 1;
      current.seaCount += row.deliveryWay === "Sea" ? 1 : 0;
      current.airCount += row.deliveryWay === "Air" ? 1 : 0;
      current.freight += getProjectedFreightFee(row, rowsWithRisk);
      current.tariff += getProjectedTariff(row, rowsWithRisk);
      current.material += getMaterialCost(row, bomItems);
      map.set(key, current);
      return map;
    }, new Map<string, { key: string; projectName: string; manufacturer: string; category: string; count: number; seaCount: number; airCount: number; freight: number; tariff: number; material: number }>()),
  ).map(([, value]) => value);
  const oceanLeadStats = Array.from(
    reportRows
      .filter((row) => row.deliveryWay === "Sea")
      .reduce((map, row) => {
        const country = getOriginCountry(row);
        const port = getPortName(row);
        const key = `${country}|${port}`;
        const current = map.get(key) ?? {
          key,
          country,
          port,
          count: 0,
          poToSupplier: [] as number[],
          supplierToCompany: [] as number[],
        };
        current.count += 1;
        current.poToSupplier.push(daysBetween(row.poDate, row.supplierSchedule));
        if (row.actualArrival) current.supplierToCompany.push(daysBetween(row.supplierSchedule, row.actualArrival));
        map.set(key, current);
        return map;
      }, new Map<string, { key: string; country: string; port: string; count: number; poToSupplier: number[]; supplierToCompany: number[] }>()),
  ).map(([, value]) => ({
    ...value,
    avgPoToSupplier: average(value.poToSupplier),
    avgSupplierToCompany: average(value.supplierToCompany),
  }));
  const cashflowForecastRows = rowsWithRisk
    .map((row): CashflowForecast | null => {
      const project = projectList.find((item) => item.id === row.projectId);
      const materialAmount = row.manufacturerInvoiceReceived ? 0 : getMaterialCost(row, bomItems);
      const freightAmount = usesSupplierEta(row) || row.freightFeeReceived ? 0 : getProjectedFreightFee(row, rowsWithRisk);
      const tariffAmount = row.tariffInvoiceReceived ? 0 : getProjectedTariff(row, rowsWithRisk);
      const amount = materialAmount + freightAmount + tariffAmount;
      if (amount <= 0) return null;
      const invoiceDate = getForecastInvoiceDate(row);
      const dueDate = getForecastDueDate(row);
      return {
        id: row.id,
        projectId: row.projectId,
        projectName: project?.name ?? row.projectId,
        projectCode: project?.code ?? row.projectId,
        po: row.po,
        batch: row.batch,
        manufacturer: row.manufacturer,
        paymentTerms: row.paymentTerms || "Due upon receipt",
        paymentDays: getPaymentTermDays(row.paymentTerms),
        invoiceBasis: usesSupplierEta(row) ? "DAP receipt week" : "Pickup week",
        invoiceMonth: getMonthLabel(invoiceDate),
        payMonth: getMonthLabel(dueDate),
        payMonthKey: getMonthKey(dueDate),
        dueDate,
        materialAmount,
        freightAmount,
        tariffAmount,
        amount,
      };
    })
    .filter((row): row is CashflowForecast => row !== null)
    .filter((row) => cashflowProjectId === "All" || row.projectId === cashflowProjectId)
    .sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime());
  const cashflowMonthKeys = getCashflowMonthKeys(cashflowForecastRows.map((row) => row.payMonthKey));
  const cashflowProjectSeries = projectList
    .filter((project) => cashflowProjectId === "All" || project.id === cashflowProjectId)
    .map((project) => {
      const values = cashflowMonthKeys.map((monthKey) =>
        cashflowForecastRows
          .filter((row) => row.projectId === project.id && row.payMonthKey === monthKey)
          .reduce((sum, row) => sum + row.amount, 0),
      );
      return {
        project,
        values,
        total: values.reduce((sum, value) => sum + value, 0),
      };
    })
    .filter((item) => item.total > 0);
  const cashflowTotalValues = cashflowMonthKeys.map((monthKey) =>
    cashflowForecastRows
      .filter((row) => row.payMonthKey === monthKey)
      .reduce((sum, row) => sum + row.amount, 0),
  );
  const cashflowMonthlyRows = cashflowMonthKeys.map((monthKey, index) => ({
    monthKey,
    month: getMonthLabel(monthKeyToDate(monthKey)),
    total: cashflowTotalValues[index] ?? 0,
    projectValues: cashflowProjectSeries.map((series) => ({
      project: series.project,
      amount: series.values[index] ?? 0,
    })),
  }));
  const cashflowTotalAmount = cashflowTotalValues.reduce((sum, value) => sum + value, 0);
  const cashflowNextPayMonth = cashflowForecastRows[0]?.payMonth ?? "-";
  const cashflowChartWidth = 900;
  const cashflowChartHeight = 260;
  const cashflowMaxValue = Math.max(1, ...cashflowTotalValues, ...cashflowProjectSeries.flatMap((series) => series.values));
  const cashflowPalette = ["#2464c5", "#0d7d66", "#8a6f18", "#b44747", "#7352b8", "#2f7c8c", "#986036", "#4d6f32", "#7c496f", "#4c6a91", "#93683f", "#5f8b75"];

  function saveProject() {
    if (!projectDraft.name.trim()) return;
    const nextProject = {
      ...projectDraft,
      id: projectDraft.id || `project-${Date.now()}`,
      budget: Number(projectDraft.budget || 0),
      status: getProjectStatus(projectDraft),
    };
    if (editingProjectId) {
      setProjectList((current) => current.map((project) => (project.id === editingProjectId ? nextProject : project)));
      setSupplierNcrs((current) =>
        current.map((item) => (item.projectId === editingProjectId ? { ...item, projectName: nextProject.name } : item)),
      );
    } else {
      setProjectList((current) => [...current, nextProject]);
    }
    setActiveProjectId(nextProject.id);
    setProjectDraft(createProjectDraft());
    setSupplierNcrDraft(createSupplierNcrDraft(nextProject));
    setInternalNcrDraft(createInternalNcrDraft(nextProject.id));
    setTodoDraft(createTodoDraft(nextProject.id));
    setEditingProjectId(null);
    setShowProjectForm(false);
  }

  function startAddProject() {
    setEditingProjectId(null);
    setProjectDraft(createProjectDraft());
    setShowProjectForm(true);
    setShowDeliveryForm(false);
    setEditingDeliveryId(null);
  }

  function startEditProject(project: Project) {
    setEditingProjectId(project.id);
    setProjectDraft(project);
    setShowProjectForm(true);
    setShowDeliveryForm(false);
    setEditingDeliveryId(null);
  }

  function saveDelivery() {
    const cleanCategory = getDeliveryCategory(deliveryDraft);
    if (!cleanCategory) return;
    const isSupplierManaged = usesSupplierEta(deliveryDraft);
    const isDdp = getIncotermMode(deliveryDraft) === "DDP";
    const cleanDelivery = {
      ...deliveryDraft,
      material: deliveryDraft.material.trim() || cleanCategory,
      category: cleanCategory,
      forwarder: isSupplierManaged ? "" : deliveryDraft.forwarder,
      poDate: normalizeScheduleValue(deliveryDraft.poDate, deliveryDraft.poDate),
      orderConfirmation: normalizeScheduleValue(deliveryDraft.orderConfirmation, deliveryDraft.orderConfirmation),
      supplierSchedule: normalizeScheduleValue(deliveryDraft.supplierSchedule, deliveryDraft.supplierSchedule),
      actualEta: deliveryDraft.actualEta ? normalizeScheduleValue(deliveryDraft.actualEta, deliveryDraft.actualEta) : null,
      productionNeed: normalizeScheduleValue(deliveryDraft.productionNeed, deliveryDraft.productionNeed),
      actualArrival: deliveryDraft.actualArrival || null,
      freightFee: isSupplierManaged ? 0 : Number(deliveryDraft.freightFee || 0),
      freightFeeReceived: isSupplierManaged ? true : deliveryDraft.freightFeeReceived,
      freightInvoiceNumber: isSupplierManaged ? "" : deliveryDraft.freightInvoiceNumber ?? "",
      leadTimeWeeks: Number(deliveryDraft.leadTimeWeeks || 8),
      materialCost: Number(deliveryDraft.materialCost || 0),
      qty: Number(deliveryDraft.qty || 0),
      tariff: isDdp ? 0 : Number(deliveryDraft.tariff || 0),
      tariffInvoiceReceived: isDdp ? true : !!deliveryDraft.tariffInvoiceReceived,
      tariffInvoiceNumber: isDdp ? "" : deliveryDraft.tariffInvoiceNumber ?? "",
    };
    setDeliveryList((current) =>
      editingDeliveryId
        ? current.map((delivery) => (delivery.id === editingDeliveryId ? cleanDelivery : delivery))
        : [...current, { ...cleanDelivery, id: cleanDelivery.id || createId("D") }],
    );
    setDeliveryDraft(createDeliveryDraft(activeProject.id));
    setEditingDeliveryId(null);
    setShowDeliveryForm(false);
  }

  function saveBulkDeliveries() {
    const cleanCategory = getDeliveryCategory(deliveryDraft);
    if (!cleanCategory || !deliveryDraft.po.trim()) return;
    const isSupplierManaged = usesSupplierEta(deliveryDraft);
    const isDdp = getIncotermMode(deliveryDraft) === "DDP";
    const cleanRows = bulkDeliveryBatches
      .filter((batch) => batch.batch.trim() && Number(batch.qty || 0) > 0)
      .map((batch, index) => ({
        ...deliveryDraft,
        id: createId(`D-${index + 1}`),
        material: deliveryDraft.material.trim() || cleanCategory,
        category: cleanCategory,
        batch: batch.batch.trim(),
        qty: Number(batch.qty || 0),
        deliveryWay: batch.deliveryWay || deliveryDraft.deliveryWay,
        forwarder: isSupplierManaged ? "" : batch.forwarder || deliveryDraft.forwarder,
        poDate: normalizeScheduleValue(deliveryDraft.poDate, deliveryDraft.poDate),
        orderConfirmation: normalizeScheduleValue(deliveryDraft.orderConfirmation, deliveryDraft.orderConfirmation),
        supplierSchedule: normalizeScheduleValue(batch.supplierSchedule || deliveryDraft.supplierSchedule, deliveryDraft.supplierSchedule),
        actualEta: batch.actualEta ? normalizeScheduleValue(batch.actualEta, batch.actualEta) : null,
        productionNeed: normalizeScheduleValue(batch.productionNeed || deliveryDraft.productionNeed, deliveryDraft.productionNeed),
        actualArrival: batch.actualArrival || null,
        freightFee: isSupplierManaged ? 0 : Number(batch.freightFee || 0),
        tariff: isDdp ? 0 : Number(batch.tariff || 0),
        freightFeeReceived: isSupplierManaged ? true : batch.freightFeeReceived,
        freightInvoiceNumber: isSupplierManaged ? "" : batch.freightInvoiceNumber,
        tariffInvoiceReceived: isDdp ? true : batch.tariffInvoiceReceived,
        tariffInvoiceNumber: isDdp ? "" : batch.tariffInvoiceNumber,
        manufacturerInvoiceReceived: batch.manufacturerInvoiceReceived,
        goodsReceived: batch.goodsReceived,
        customsCleared: batch.customsCleared,
        arrivedPueblo: batch.arrivedPueblo,
        leadTimeWeeks: Number(deliveryDraft.leadTimeWeeks || 8),
        materialCost: Number(deliveryDraft.materialCost || 0),
      }));
    if (!cleanRows.length) return;
    setDeliveryList((current) => [...current, ...cleanRows]);
    const nextDraft = createDeliveryDraft(activeProject.id);
    setDeliveryDraft(nextDraft);
    setBulkDeliveryBatches(createBulkDeliveryBatches(nextDraft));
    setDeliveryEntryMode("single");
    setShowDeliveryForm(false);
  }

  function startAddDelivery() {
    setEditingDeliveryId(null);
    const nextDraft = createDeliveryDraft(activeProject.id);
    setDeliveryDraft(nextDraft);
    setBulkDeliveryBatches(createBulkDeliveryBatches(nextDraft));
    setDeliveryEntryMode("single");
    setShowDeliveryForm(true);
  }

  function changeDeliveryEntryMode(mode: DeliveryEntryMode) {
    setDeliveryEntryMode(mode);
    if (mode === "bulk" && !bulkDeliveryBatches.length) {
      setBulkDeliveryBatches(createBulkDeliveryBatches(deliveryDraft));
    }
  }

  function startEditDelivery(delivery: Delivery) {
    setEditingDeliveryId(delivery.id);
    setDeliveryDraft(delivery);
    setDeliveryEntryMode("single");
    setShowDeliveryForm(true);
  }

  function deleteDelivery(id: string) {
    if (!window.confirm("Delete this delivery?")) return;
    setDeliveryList((current) => current.filter((delivery) => delivery.id !== id));
  }

  function deleteProject(id: string) {
    if (projectList.length <= 1) {
      window.alert("At least one project is required.");
      return;
    }
    const project = projectList.find((item) => item.id === id);
    if (!window.confirm(`Delete ${project?.name ?? "this project"} and all related deliveries?`)) return;
    const nextProjects = projectList.filter((item) => item.id !== id);
    setDeliveryList((current) => current.filter((delivery) => delivery.projectId !== id));
    setBomItems((current) => current.filter((item) => item.projectId !== id));
    setSupplierNcrs((current) => current.filter((item) => item.projectId !== id));
    setInternalNcrs((current) => current.filter((item) => item.projectId !== id));
    setEcnRecords((current) => current.filter((item) => item.projectId !== id));
    setTodoItems((current) => current.filter((item) => item.projectId !== id));
    setProjectList(nextProjects);
    if (activeProjectId === id) {
      setActiveProjectId(nextProjects[0].id);
      setSupplierNcrDraft(createSupplierNcrDraft(nextProjects[0]));
      setInternalNcrDraft(createInternalNcrDraft(nextProjects[0].id));
      setEcnDraft(createEcnDraft(nextProjects[0].id));
      setTodoDraft(createTodoDraft(nextProjects[0].id));
    }
    setEditingProjectId(null);
    setShowProjectForm(false);
    setShowDeliveryForm(false);
    setCategory("All");
    setQuery("");
  }

  function exportCsv() {
    const rows = [
      deliveryCsvFields.join(","),
      ...deliveryList.map((delivery) => deliveryCsvFields.map((field) => escapeCsv(delivery[field])).join(",")),
    ].join("\n");
    const blob = new Blob([rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "im-delivery-schedule.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function importCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const imported = parseDeliveryCsv(String(reader.result ?? ""), activeProject.id);
      if (imported.length) setDeliveryList(imported);
      event.target.value = "";
    };
    reader.readAsText(file);
  }

  async function importBomFile(event: ChangeEvent<HTMLInputElement>, source: "purchasing" | "internal") {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const isWorkbook = /\.(xlsx|xls)$/i.test(file.name);
      const imported = isWorkbook
        ? parseBomWorkbook(await file.arrayBuffer(), activeProject.id, source)
        : parseBomCsv(await file.text(), activeProject.id, source);
      if (imported.length) {
        setBomItems((current) => [
          ...current.filter((item) => item.projectId !== activeProject.id || (item.source ?? "purchasing") !== source),
          ...imported,
        ]);
      }
    } finally {
      event.target.value = "";
    }
  }

  function importNcrCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const imported = parseNcrCsv(String(reader.result ?? ""), projectList, activeProject);
      if (imported.supplier.length) setSupplierNcrs((current) => [...current, ...imported.supplier]);
      if (imported.internal.length) setInternalNcrs((current) => [...current, ...imported.internal]);
      event.target.value = "";
    };
    reader.readAsText(file);
  }

  function clearProjectBom(source?: "purchasing" | "internal") {
    const label = source === "internal" ? "Internal BOM" : source === "purchasing" ? "BOM for purchasing" : "BOM";
    if (!window.confirm(`Clear ${label} for this project?`)) return;
    setBomItems((current) =>
      source
        ? current.filter((item) => item.projectId !== activeProject.id || (item.source ?? "purchasing") !== source)
        : current.filter((item) => item.projectId !== activeProject.id),
    );
  }

  function addTodoItem() {
    if (!todoDraft.title.trim()) return;
    setTodoItems((current) => [
      ...current,
      {
        ...todoDraft,
        id: todoDraft.id || `TODO-${Date.now()}`,
        projectId: activeProject.id,
        title: todoDraft.title.trim(),
        owner: todoDraft.owner.trim(),
      },
    ]);
    setTodoDraft(createTodoDraft(activeProject.id));
  }

  function toggleTodoItem(id: string) {
    setTodoItems((current) => current.map((item) => (item.id === id ? { ...item, done: !item.done } : item)));
  }

  function deleteTodoItem(id: string) {
    setTodoItems((current) => current.filter((item) => item.id !== id));
  }

  function saveSupplierNcr() {
    if (!supplierNcrDraft.ncrNumber.trim() || !supplierNcrDraft.materialCode.trim()) return;
    const cleanNcr = {
      ...supplierNcrDraft,
      projectId: activeProject.id,
      projectName: activeProject.name,
      qty: Number(supplierNcrDraft.qty || 0),
      id: supplierNcrDraft.id || `SNCR-${Date.now()}`,
    };
    setSupplierNcrs((current) => [...current, cleanNcr]);
    setSupplierNcrDraft(createSupplierNcrDraft(activeProject));
  }

  function deleteSupplierNcr(id: string) {
    if (!window.confirm("Delete this supplier NCR?")) return;
    setSupplierNcrs((current) => current.filter((item) => item.id !== id));
  }

  function saveInternalNcr() {
    if (!internalNcrDraft.ncrNumber.trim() || !internalNcrDraft.materialInfo.trim()) return;
    const cleanNcr = {
      ...internalNcrDraft,
      projectId: activeProject.id,
      qty: Number(internalNcrDraft.qty || 0),
      cost: Number(internalNcrDraft.cost || 0),
      id: internalNcrDraft.id || `INCR-${Date.now()}`,
    };
    setInternalNcrs((current) => [...current, cleanNcr]);
    setInternalNcrDraft(createInternalNcrDraft(activeProject.id));
  }

  function deleteInternalNcr(id: string) {
    if (!window.confirm("Delete this internal NCR?")) return;
    setInternalNcrs((current) => current.filter((item) => item.id !== id));
  }

  function saveEcn() {
    if (!ecnDraft.ecnNumber.trim() || !ecnDraft.title.trim()) return;
    const cleanEcn = {
      ...ecnDraft,
      projectId: activeProject.id,
      id: ecnDraft.id || `ECN-${Date.now()}`,
      effectiveWeek: normalizeScheduleValue(ecnDraft.effectiveWeek, ecnDraft.effectiveWeek),
      costImpact: Number(ecnDraft.costImpact || 0),
    };
    setEcnRecords((current) => [...current, cleanEcn]);
    setEcnDraft(createEcnDraft(activeProject.id));
  }

  function deleteEcn(id: string) {
    if (!window.confirm("Delete this ECN?")) return;
    setEcnRecords((current) => current.filter((item) => item.id !== id));
  }

  function updateSupplierPlan(updater: (plan: SupplierSchedulePlan) => SupplierSchedulePlan) {
    if (!activeSupplierPo) return;
    const nextPlan = updater(supplierPlan);
    setSupplierPlans((current) => {
      const exists = current.some((plan) => plan.projectId === nextPlan.projectId && plan.po === nextPlan.po);
      return exists
        ? current.map((plan) => (plan.projectId === nextPlan.projectId && plan.po === nextPlan.po ? nextPlan : plan))
        : [...current, nextPlan];
    });
  }

  function updateSupplierBatch(batchId: string, patch: Partial<SupplierScheduleBatch>) {
    updateSupplierPlan((plan) => ({
      ...plan,
      batches: plan.batches.map((batch) => (batch.id === batchId ? { ...batch, ...patch } : batch)),
      materialAllocations:
        "percentage" in patch
          ? [
              ...(plan.materialAllocations ?? []).filter((allocation) => allocation.batchId !== batchId),
              ...supplierPoLines.map((line) => {
                const nextBatch = { ...(plan.batches.find((batch) => batch.id === batchId) ?? plan.batches[0]), ...patch };
                return { poLineId: line.id, batchId, qty: getDefaultMaterialAllocationQty(line, nextBatch) };
              }),
            ]
          : plan.materialAllocations ?? [],
    }));
  }

  function updateSupplierMaterialAllocation(poLineId: string, batchId: string, qty: number) {
    updateSupplierPlan((plan) => ({
      ...plan,
      materialAllocations: [
        ...(plan.materialAllocations ?? []).filter((allocation) => allocation.poLineId !== poLineId || allocation.batchId !== batchId),
        { poLineId, batchId, qty: Math.max(0, Number(qty || 0)) },
      ],
    }));
  }

  function resetSupplierMaterialAllocations() {
    updateSupplierPlan((plan) => ({
      ...plan,
      materialAllocations: createSupplierMaterialAllocations(supplierPoLines, plan.batches),
    }));
  }

  function exportSupplierMaterialAllocations() {
    if (!supplierPoLines.length) {
      window.alert("Import PO Detail first, then export batch material allocation.");
      return;
    }
    const rows = supplierPoLines.flatMap((line) =>
      supplierPlan.batches.map((batch) => {
        const batchQty = getMaterialAllocationQty(supplierPlan, line, batch);
        const batchAmount = line.poQty ? (line.amount * batchQty) / line.poQty : 0;
        return {
          Project: activeProject.name,
          "Project code": activeProject.code,
          PO: supplierPlan.po,
          Batch: batch.batch,
          "PU week": formatScheduleWeek(batch.puWeek),
          "Need week": formatScheduleWeek(batch.needWeek),
          Manufacturer: line.manufacturer || supplierPlan.manufacturer,
          Category: line.category || supplierPlan.category,
          "Material code": line.materialCode,
          Material: line.material,
          Unit: line.unit,
          "PO qty": line.poQty,
          "Batch material qty": batchQty,
          "Remaining qty after all batches": Math.round((line.poQty - supplierPlan.batches.reduce((sum, item) => sum + getMaterialAllocationQty(supplierPlan, line, item), 0)) * 100) / 100,
          "Unit price": line.unitPrice,
          "Batch amount": Math.round(batchAmount * 100) / 100,
          Currency: line.currency,
          Incoterms: line.incoterms || supplierPlan.incoterms,
        };
      }).filter((row) => row["Batch material qty"] > 0),
    );
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Project: activeProject.name, PO: supplierPlan.po, Note: "No batch material quantity has been allocated." }]);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Batch Materials");
    const filename = `PO_${supplierPlan.po || "materials"}_batch_materials.xlsx`.replace(/[\\/:*?"<>|]+/g, "_");
    XLSX.writeFile(workbook, filename);
  }

  function applyCswindSupplierTemplate() {
    updateSupplierPlan((plan) => ({
      ...plan,
      subject: buildSupplierEmailSubject(activeProject, plan.po, plan.manufacturer, plan.category),
      body: buildSupplierEmailTemplate(),
    }));
  }

  function addSupplierBatch() {
    if (!activeSupplierPo) return;
    const usedPercentage = supplierPlan.batches.reduce((sum, batch) => sum + Number(batch.percentage || 0), 0);
    const batchNumber = supplierPlan.batches.length + 1;
    const template = supplierPlan.batches[supplierPlan.batches.length - 1];
    const newBatch = {
      id: `supplier-batch-${supplierPlan.projectId}-${supplierPlan.po}-B${batchNumber}-${Date.now()}`,
      deliveryId: "",
      batch: `B${batchNumber}`,
      qty: 0,
      percentage: Math.max(0, Math.round((100 - usedPercentage) * 10) / 10),
      puWeek: template?.puWeek || new Date().toISOString().slice(0, 10),
      needWeek: template?.needWeek || new Date().toISOString().slice(0, 10),
      supplierRequestWeek: "",
      status: "Draft" as SupplierBatchStatus,
      note: "",
      commercialInvoiceFiles: [],
      packingListFiles: [],
      blNumber: "",
      forwarderEta: "",
    };
    updateSupplierPlan((plan) => ({
      ...plan,
      batches: [...plan.batches, newBatch],
      materialAllocations: [
        ...(plan.materialAllocations ?? []),
        ...supplierPoLines.map((line) => ({ poLineId: line.id, batchId: newBatch.id, qty: getDefaultMaterialAllocationQty(line, newBatch) })),
      ],
    }));
  }

  function deleteSupplierBatch(batchId: string) {
    updateSupplierPlan((plan) => ({
      ...plan,
      batches: plan.batches.filter((batch) => batch.id !== batchId),
      materialAllocations: (plan.materialAllocations ?? []).filter((allocation) => allocation.batchId !== batchId),
    }));
  }

  function syncSupplierPlanFromDelivery() {
    if (!activeSupplierPo) return;
    const freshPlan = createSupplierSchedulePlan(activeProject, activeSupplierPo, supplierPoRows, supplierPoLines);
    updateSupplierPlan((plan) => ({
      ...freshPlan,
      to: plan.to,
      cc: plan.cc,
      subject: plan.subject,
      body: plan.body,
      attachments: plan.attachments,
      forwarderEmail: plan.forwarderEmail,
      requestSent: plan.requestSent,
      pickupReminderSent: plan.pickupReminderSent,
      forwarderNoticeSent: plan.forwarderNoticeSent,
      batches: freshPlan.batches.map((freshBatch) => {
        const existingBatch = plan.batches.find((batch) => batch.deliveryId === freshBatch.deliveryId || batch.batch === freshBatch.batch);
        return existingBatch ? { ...freshBatch, ...existingBatch, qty: freshBatch.qty, needWeek: freshBatch.needWeek } : freshBatch;
      }),
      materialAllocations: createSupplierMaterialAllocations(
        supplierPoLines,
        freshPlan.batches.map((freshBatch) => {
          const existingBatch = plan.batches.find((batch) => batch.deliveryId === freshBatch.deliveryId || batch.batch === freshBatch.batch);
          return existingBatch ? { ...freshBatch, ...existingBatch, qty: freshBatch.qty, needWeek: freshBatch.needWeek } : freshBatch;
        }),
        plan.materialAllocations,
      ),
    }));
  }

  function copyText(text: string) {
    void navigator.clipboard?.writeText(text);
  }

  async function importPoDetailFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const data = await file.arrayBuffer();
    const imported = parsePoDetailWorkbook(data, projectList, activeProject);
    if (!imported.length) {
      window.alert("No PO detail lines were found in this file.");
      event.target.value = "";
      return;
    }
    setPurchasePoLines((current) => {
      const importedIds = new Set(imported.map((line) => line.id));
      return [...current.filter((line) => !importedIds.has(line.id)), ...imported];
    });
    setSupplierPoFilter(imported.find((line) => line.projectId === activeProject.id)?.po || imported[0].po);
    event.target.value = "";
  }

  function openSupplierMailDraft() {
    const mailto = `mailto:${encodeURIComponent(supplierPlan.to)}?cc=${encodeURIComponent(supplierPlan.cc)}&subject=${encodeURIComponent(supplierPlan.subject)}&body=${encodeURIComponent(supplierEmailText)}`;
    window.location.href = mailto;
  }

  return (
    <main className="im-shell">
      <aside className="project-sidebar" aria-label="IM项目导航">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <span className="tower-mini">
              <i />
              <b />
              <em />
            </span>
          </span>
          <div>
            <strong>CSWind America</strong>
            <small>Wind tower procurement</small>
          </div>
        </div>
        <nav className="project-nav">
          {projectList.map((project) => {
            const count = rowsWithRisk.filter((row) => row.projectId === project.id).length;
            const riskCount = rowsWithRisk.filter((row) => row.projectId === project.id && row.risk.score >= 3).length;
            return (
              <button
                className={project.id === activeProject.id ? "project-button active" : "project-button"}
                key={project.id}
                onClick={() => {
                  setActiveProjectId(project.id);
                  setSupplierNcrDraft(createSupplierNcrDraft(project));
                  setInternalNcrDraft(createInternalNcrDraft(project.id));
                  setEcnDraft(createEcnDraft(project.id));
                  setTodoDraft(createTodoDraft(project.id));
                  setSupplierPoFilter("");
                  setCategory("All");
                  setQuery("");
                }}
              >
                <span>
                  <strong>{project.name}</strong>
                  <small>{project.code} · {project.phase}</small>
                  <em className={`project-status-pill ${getStatusTone(getProjectStatus(project))}`}>{getProjectStatus(project)}</em>
                </span>
                <i>{riskCount}/{count}</i>
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="im-workspace">
        <header className="im-header">
          <div className="tower-accent" aria-hidden="true">
            <span />
            <i />
            <b />
          </div>
          <div>
            <p className="eyebrow">Internal Mounting Delivery Schedule</p>
            <div className="header-title-row">
              <h1>{activeProject.name}</h1>
              <span className="company-chip">CSWind America</span>
            </div>
            <nav className="workspace-tabs" aria-label="Workbench sections">
              <button className={activeWorkspace === "overview" ? "workspace-tab active" : "workspace-tab"} onClick={() => setActiveWorkspace("overview")}>Overview</button>
              <button className={activeWorkspace === "delivery" ? "workspace-tab active" : "workspace-tab"} onClick={() => setActiveWorkspace("delivery")}>Delivery</button>
              <button className={activeWorkspace === "supplier" ? "workspace-tab active" : "workspace-tab"} onClick={() => setActiveWorkspace("supplier")}>Supplier Schedule</button>
              <button className={activeWorkspace === "mcip" ? "workspace-tab active" : "workspace-tab"} onClick={() => setActiveWorkspace("mcip")}>MCIP</button>
              <button className={activeWorkspace === "cashflow" ? "workspace-tab active" : "workspace-tab"} onClick={() => setActiveWorkspace("cashflow")}>Cashflow</button>
              <button className={activeWorkspace === "logistics" ? "workspace-tab active" : "workspace-tab"} onClick={() => setActiveWorkspace("logistics")}>Logistics</button>
              <button className={activeWorkspace === "bom" ? "workspace-tab active" : "workspace-tab"} onClick={() => setActiveWorkspace("bom")}>BOM</button>
              <button className={activeWorkspace === "ncr" ? "workspace-tab active" : "workspace-tab"} onClick={() => setActiveWorkspace("ncr")}>NCR</button>
              <button className={activeWorkspace === "ecn" ? "workspace-tab active" : "workspace-tab"} onClick={() => setActiveWorkspace("ecn")}>ECN</button>
            </nav>
            <span>{activeProject.code} · {activeProject.phase} · {activeProject.plant}</span>
          </div>
          <div className="header-actions">
            {activeWorkspace === "overview" ? (
              <>
                <button className="secondary-action" onClick={startAddProject}>Add project</button>
                <button className="secondary-action" onClick={() => startEditProject(activeProject)}>Edit project</button>
                <button className="danger-action" disabled={projectList.length <= 1} onClick={() => deleteProject(activeProject.id)}>Delete project</button>
              </>
            ) : null}
            {activeWorkspace === "delivery" ? (
              <>
                <button className="secondary-action" title="Export schedule" aria-label="Export schedule" onClick={exportCsv}>Export</button>
                <label className="file-action">
                  Import delivery
                  <input accept=".csv,text/csv" aria-label="Import delivery CSV" onChange={importCsv} type="file" />
                </label>
                <button className="primary-action" onClick={startAddDelivery}>Add delivery</button>
              </>
            ) : null}
            {activeWorkspace === "ncr" ? (
              <label className="file-action">
                Import NCR
                <input accept=".csv,text/csv" aria-label="Import NCR CSV" onChange={importNcrCsv} type="file" />
              </label>
            ) : null}
          </div>
        </header>

        {showProjectForm ? (
          <section className="editor-panel project-editor-panel" aria-label="Add project">
            <div className="section-title">
              <h2>{editingProjectId ? "Edit Project" : "Add Project"}</h2>
            </div>
            <div className="form-grid project-form">
              <label>
                Project name
                <input value={projectDraft.name} onChange={(event) => setProjectDraft({ ...projectDraft, name: event.target.value })} />
              </label>
              <label>
                Code
                <input value={projectDraft.code} onChange={(event) => setProjectDraft({ ...projectDraft, code: event.target.value })} />
              </label>
              <label>
                Phase
                <input value={projectDraft.phase} onChange={(event) => setProjectDraft({ ...projectDraft, phase: event.target.value })} />
              </label>
              <label>
                Plant
                <input value={projectDraft.plant} onChange={(event) => setProjectDraft({ ...projectDraft, plant: event.target.value })} />
              </label>
              <label>
                Production window
                <input placeholder="Aug 05 - Sep 12" value={projectDraft.productionWindow} onChange={(event) => setProjectDraft({ ...projectDraft, productionWindow: event.target.value })} />
              </label>
              <label>
                Budget
                <input type="number" value={projectDraft.budget} onChange={(event) => setProjectDraft({ ...projectDraft, budget: Number(event.target.value) })} />
              </label>
              <label>
                Running status
                <select value={getProjectStatus(projectDraft)} onChange={(event) => setProjectDraft({ ...projectDraft, status: event.target.value })}>
                  {projectStatuses.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </label>
              <div className="form-actions">
                <button
                  className="secondary-action"
                  onClick={() => {
                    setShowProjectForm(false);
                    setEditingProjectId(null);
                    setProjectDraft(createProjectDraft());
                  }}
                >
                  Cancel
                </button>
                <button className="primary-action" onClick={saveProject}>{editingProjectId ? "Save changes" : "Save project"}</button>
              </div>
            </div>
          </section>
        ) : null}

        <section className="zone-title delivery-zone-title" aria-label="Delivery section" hidden={activeWorkspace !== "delivery"}>
          <h2>Delivery</h2>
        </section>

        {showDeliveryForm && activeWorkspace === "delivery" ? (
          <section className="editor-panel delivery-editor-panel" aria-label="Add or edit delivery">
            <div className="section-title">
              <h2>{editingDeliveryId ? "Edit Delivery" : "Add Delivery"}</h2>
            </div>
            <div className="form-grid delivery-form">
              {!editingDeliveryId ? (
                <div className="entry-mode-toggle" aria-label="Delivery entry mode">
                  <button
                    className={deliveryEntryMode === "single" ? "active" : ""}
                    onClick={() => changeDeliveryEntryMode("single")}
                  >
                    Single batch
                  </button>
                  <button
                    className={deliveryEntryMode === "bulk" ? "active" : ""}
                    onClick={() => changeDeliveryEntryMode("bulk")}
                  >
                    PO batches
                  </button>
                  <span>{deliveryEntryMode === "bulk" ? "Use one PO header, then add as many batch rows as needed." : "Use this for one PO batch only."}</span>
                </div>
              ) : null}
              <div className="form-section-label">PO & Category</div>
              <label>
                Project
                <select value={deliveryDraft.projectId} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, projectId: event.target.value })}>
                  {projectList.map((project) => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Category
                <input value={deliveryDraft.category} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, category: event.target.value })} />
              </label>
              {deliveryEntryMode === "single" ? (
                <label>
                  Batch
                  <input value={deliveryDraft.batch} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, batch: event.target.value })} />
                </label>
              ) : null}
              <label>
                PO
                <input value={deliveryDraft.po} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, po: event.target.value })} />
              </label>
              <label>
                Vendor code
                <input value={deliveryDraft.vendorCode} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, vendorCode: event.target.value })} />
              </label>
              <label>
                Manufacturer
                <input value={deliveryDraft.manufacturer} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, manufacturer: event.target.value })} />
              </label>
              <label>
                Manufacturer location
                <input placeholder="Shenzhen, China" value={deliveryDraft.manufacturerLocation ?? ""} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, manufacturerLocation: event.target.value })} />
              </label>
              <label>
                Payment terms
                <input value={deliveryDraft.paymentTerms} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, paymentTerms: event.target.value })} />
              </label>
              <div className="form-section-label">Logistics, freight & tariff</div>
              {deliveryEntryMode === "single" ? (
                <>
                  <label>
                    Delivery way
                    <select value={deliveryDraft.deliveryWay} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, deliveryWay: event.target.value })}>
                      <option>Air</option>
                      <option>Sea</option>
                      <option>Truck</option>
                      <option>Rail</option>
                    </select>
                  </label>
                  {!deliveryDraftUsesSupplierEta ? (
                    <label>
                      Forwarder
                      <input value={deliveryDraft.forwarder} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, forwarder: event.target.value })} />
                    </label>
                  ) : null}
                </>
              ) : null}
              {!deliveryDraftUsesSupplierEta && deliveryEntryMode === "single" ? (
                <>
                  <label>
                    Freight fee
                    <input type="number" value={deliveryDraft.freightFee} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, freightFee: Number(event.target.value) })} />
                  </label>
                  <label>
                    Freight invoice number
                    <input value={deliveryDraft.freightInvoiceNumber ?? ""} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, freightInvoiceNumber: event.target.value })} />
                  </label>
                  <label className="toggle-label">
                    <input checked={deliveryDraft.freightFeeReceived} type="checkbox" onChange={(event) => setDeliveryDraft({ ...deliveryDraft, freightFeeReceived: event.target.checked })} />
                    Freight invoice received
                  </label>
                </>
              ) : null}
              {deliveryEntryMode === "single" && !deliveryDraftIsDdp ? (
                <>
                  <label>
                    Tariff
                    <input type="number" value={deliveryDraft.tariff} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, tariff: Number(event.target.value) })} />
                  </label>
                  <label>
                    Tariff invoice number
                    <input value={deliveryDraft.tariffInvoiceNumber ?? ""} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, tariffInvoiceNumber: event.target.value })} />
                  </label>
                  <label className="toggle-label">
                    <input checked={!!deliveryDraft.tariffInvoiceReceived} type="checkbox" onChange={(event) => setDeliveryDraft({ ...deliveryDraft, tariffInvoiceReceived: event.target.checked })} />
                    Tariff invoice received
                  </label>
                </>
              ) : null}
              <label>
                Incoterms
                <select
                  value={getIncotermMode(deliveryDraft)}
                  onChange={(event) => {
                    const incoterms = event.target.value;
                    const isSupplierManaged = ["DAP", "DDP"].includes(incoterms);
                    const isDdp = incoterms === "DDP";
                    setDeliveryDraft({
                      ...deliveryDraft,
                      incoterms,
                      forwarder: isSupplierManaged ? "" : deliveryDraft.forwarder,
                      freightFee: isSupplierManaged ? 0 : deliveryDraft.freightFee,
                      freightFeeReceived: isSupplierManaged ? true : deliveryDraft.freightFeeReceived,
                      freightInvoiceNumber: isSupplierManaged ? "" : deliveryDraft.freightInvoiceNumber,
                      tariff: isDdp ? 0 : deliveryDraft.tariff,
                      tariffInvoiceReceived: isDdp ? true : deliveryDraft.tariffInvoiceReceived,
                      tariffInvoiceNumber: isDdp ? "" : deliveryDraft.tariffInvoiceNumber,
                    });
                  }}
                >
                  <option>DAP</option>
                  <option>DDP</option>
                  <option>EXW</option>
                  <option>FCA</option>
                  <option>Other</option>
                </select>
              </label>
              {!deliveryDraftUsesSupplierEta ? (
                <label>
                  Transit lead time weeks
                  <input type="number" value={deliveryDraft.leadTimeWeeks} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, leadTimeWeeks: Number(event.target.value) })} />
                </label>
              ) : null}
              <div className="form-section-label">Schedule</div>
              <label>
                PO week
                <input type="date" value={formatInputMidweekDate(deliveryDraft.poDate)} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, poDate: dateInputToMidweekDate(event.target.value, deliveryDraft.poDate) })} />
              </label>
              <label>
                OC week
                <input type="date" value={formatInputMidweekDate(deliveryDraft.orderConfirmation)} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, orderConfirmation: dateInputToMidweekDate(event.target.value, deliveryDraft.orderConfirmation) })} />
              </label>
              {deliveryEntryMode === "single" ? (
                <label>
                  {deliveryDraftUsesSupplierEta ? "Supplier ETA week" : "Pickup week"}
                  <input type="date" value={formatInputMidweekDate(deliveryDraft.supplierSchedule)} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, supplierSchedule: dateInputToMidweekDate(event.target.value, deliveryDraft.supplierSchedule) })} />
                </label>
              ) : null}
              {!deliveryDraftUsesSupplierEta && deliveryEntryMode === "single" ? (
                <label>
                  Estimated arrival week
                  <input readOnly value={formatScheduleWeek(getEstimatedArrival(deliveryDraft))} />
                </label>
              ) : null}
              {deliveryEntryMode === "single" ? (
                <>
                  <label>
                    Actual ETA week
                    <input type="date" value={formatInputMidweekDate(deliveryDraft.actualEta)} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, actualEta: dateInputToMidweekDate(event.target.value) || null })} />
                  </label>
                  <label>
                    Production need week
                    <input type="date" value={formatInputMidweekDate(deliveryDraft.productionNeed)} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, productionNeed: dateInputToMidweekDate(event.target.value, deliveryDraft.productionNeed) })} />
                  </label>
                  <label>
                    Actual receive date
                    <input type="date" value={deliveryDraft.actualArrival ?? ""} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, actualArrival: event.target.value || null })} />
                  </label>
                  <label>
                    Actual receive week
                    <input readOnly value={deliveryDraft.actualArrival ? formatScheduleWeek(deliveryDraft.actualArrival) : ""} />
                  </label>
                </>
              ) : null}
              {deliveryEntryMode === "single" ? (
                <label>
                  Tower qty
                  <input type="number" value={deliveryDraft.qty} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, qty: Number(event.target.value) })} />
                </label>
              ) : null}
              <label>
                Material cost
                <input type="number" value={deliveryDraft.materialCost} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, materialCost: Number(event.target.value) })} />
              </label>
              <div className="form-section-label">Status</div>
              {deliveryEntryMode === "single" ? (
                <>
                  <label className="toggle-label">
                    <input checked={deliveryDraft.manufacturerInvoiceReceived} type="checkbox" onChange={(event) => setDeliveryDraft({ ...deliveryDraft, manufacturerInvoiceReceived: event.target.checked })} />
                    Vendor invoice received
                  </label>
                  <label className="toggle-label">
                    <input checked={deliveryDraft.goodsReceived} type="checkbox" onChange={(event) => setDeliveryDraft({ ...deliveryDraft, goodsReceived: event.target.checked })} />
                    Goods received
                  </label>
                  <label className="toggle-label">
                    <input checked={!!deliveryDraft.customsCleared} type="checkbox" onChange={(event) => setDeliveryDraft({ ...deliveryDraft, customsCleared: event.target.checked })} />
                    Customs cleared
                  </label>
                  <label className="toggle-label">
                    <input checked={!!deliveryDraft.arrivedPueblo} type="checkbox" onChange={(event) => setDeliveryDraft({ ...deliveryDraft, arrivedPueblo: event.target.checked })} />
                    Arrived Pueblo
                  </label>
                </>
              ) : null}
              {deliveryEntryMode === "bulk" ? (
                <div className="bulk-batch-editor">
                  <div className="bulk-batch-header">
                    <strong>Batch deliveries</strong>
                    <button
                      className="secondary-action"
                      onClick={() => setBulkDeliveryBatches((current) => [...current, createBulkDeliveryBatch(current.length, deliveryDraft)])}
                    >
                      Add batch row
                    </button>
                  </div>
                  <div className="bulk-batch-table">
                    <div className={`${bulkBatchRowClassName} bulk-batch-head`}>
                      <span>Batch</span>
                      <span>Tower qty</span>
                      <span>Delivery way</span>
                      {!deliveryDraftUsesSupplierEta ? <span>Forwarder</span> : null}
                      <span>{deliveryDraftUsesSupplierEta ? "Supplier ETA week" : "Pickup week"}</span>
                      <span>Actual ETA week</span>
                      <span>Production need week</span>
                      <span>Actual receive date</span>
                      <span>Actual receive week</span>
                      {!deliveryDraftUsesSupplierEta ? (
                        <>
                          <span>Freight fee</span>
                          <span>Freight invoice #</span>
                        </>
                      ) : null}
                      {!deliveryDraftIsDdp ? (
                        <>
                          <span>Tariff</span>
                          <span>Tariff invoice #</span>
                        </>
                      ) : null}
                      {!deliveryDraftUsesSupplierEta ? <span>Freight invoice</span> : null}
                      {!deliveryDraftIsDdp ? <span>Tariff invoice</span> : null}
                      <span>Vendor invoice</span>
                      <span>Goods</span>
                      <span>Actions</span>
                    </div>
                    {bulkDeliveryBatches.map((batch) => (
                      <div className={bulkBatchRowClassName} key={batch.id}>
                        <input value={batch.batch} onChange={(event) => setBulkDeliveryBatches((current) => current.map((item) => (item.id === batch.id ? { ...item, batch: event.target.value } : item)))} />
                        <input type="number" value={batch.qty} onChange={(event) => setBulkDeliveryBatches((current) => current.map((item) => (item.id === batch.id ? { ...item, qty: Number(event.target.value) } : item)))} />
                        <select value={batch.deliveryWay} onChange={(event) => setBulkDeliveryBatches((current) => current.map((item) => (item.id === batch.id ? { ...item, deliveryWay: event.target.value } : item)))}>
                          <option>Air</option>
                          <option>Sea</option>
                          <option>Truck</option>
                          <option>Rail</option>
                        </select>
                        {!deliveryDraftUsesSupplierEta ? <input value={batch.forwarder} onChange={(event) => setBulkDeliveryBatches((current) => current.map((item) => (item.id === batch.id ? { ...item, forwarder: event.target.value } : item)))} /> : null}
                        <input type="date" value={formatInputMidweekDate(batch.supplierSchedule)} onChange={(event) => setBulkDeliveryBatches((current) => current.map((item) => (item.id === batch.id ? { ...item, supplierSchedule: dateInputToMidweekDate(event.target.value, item.supplierSchedule) } : item)))} />
                        <input type="date" value={formatInputMidweekDate(batch.actualEta)} onChange={(event) => setBulkDeliveryBatches((current) => current.map((item) => (item.id === batch.id ? { ...item, actualEta: dateInputToMidweekDate(event.target.value) || null } : item)))} />
                        <input type="date" value={formatInputMidweekDate(batch.productionNeed)} onChange={(event) => setBulkDeliveryBatches((current) => current.map((item) => (item.id === batch.id ? { ...item, productionNeed: dateInputToMidweekDate(event.target.value, item.productionNeed) } : item)))} />
                        <input type="date" value={batch.actualArrival ?? ""} onChange={(event) => setBulkDeliveryBatches((current) => current.map((item) => (item.id === batch.id ? { ...item, actualArrival: event.target.value || null } : item)))} />
                        <span className="bulk-batch-week">{batch.actualArrival ? formatScheduleWeek(batch.actualArrival) : "-"}</span>
                        {!deliveryDraftUsesSupplierEta ? (
                          <>
                            <input type="number" value={batch.freightFee} onChange={(event) => setBulkDeliveryBatches((current) => current.map((item) => (item.id === batch.id ? { ...item, freightFee: Number(event.target.value) } : item)))} />
                            <input value={batch.freightInvoiceNumber} onChange={(event) => setBulkDeliveryBatches((current) => current.map((item) => (item.id === batch.id ? { ...item, freightInvoiceNumber: event.target.value } : item)))} />
                          </>
                        ) : null}
                        {!deliveryDraftIsDdp ? (
                          <>
                            <input type="number" value={batch.tariff} onChange={(event) => setBulkDeliveryBatches((current) => current.map((item) => (item.id === batch.id ? { ...item, tariff: Number(event.target.value) } : item)))} />
                            <input value={batch.tariffInvoiceNumber} onChange={(event) => setBulkDeliveryBatches((current) => current.map((item) => (item.id === batch.id ? { ...item, tariffInvoiceNumber: event.target.value } : item)))} />
                          </>
                        ) : null}
                        {!deliveryDraftUsesSupplierEta ? (
                          <label className="mini-toggle">
                            <input checked={batch.freightFeeReceived} type="checkbox" onChange={(event) => setBulkDeliveryBatches((current) => current.map((item) => (item.id === batch.id ? { ...item, freightFeeReceived: event.target.checked } : item)))} />
                          </label>
                        ) : null}
                        {!deliveryDraftIsDdp ? (
                          <label className="mini-toggle">
                            <input checked={batch.tariffInvoiceReceived} type="checkbox" onChange={(event) => setBulkDeliveryBatches((current) => current.map((item) => (item.id === batch.id ? { ...item, tariffInvoiceReceived: event.target.checked } : item)))} />
                          </label>
                        ) : null}
                        <label className="mini-toggle">
                          <input checked={batch.manufacturerInvoiceReceived} type="checkbox" onChange={(event) => setBulkDeliveryBatches((current) => current.map((item) => (item.id === batch.id ? { ...item, manufacturerInvoiceReceived: event.target.checked } : item)))} />
                        </label>
                        <label className="mini-toggle">
                          <input checked={batch.goodsReceived} type="checkbox" onChange={(event) => setBulkDeliveryBatches((current) => current.map((item) => (item.id === batch.id ? { ...item, goodsReceived: event.target.checked, arrivedPueblo: event.target.checked ? true : item.arrivedPueblo } : item)))} />
                        </label>
                        <span className="row-actions">
                          <button
                            disabled={bulkDeliveryBatches.length <= 1}
                            onClick={() => setBulkDeliveryBatches((current) => current.filter((item) => item.id !== batch.id))}
                          >
                            Delete
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="form-actions">
                <button className="secondary-action" onClick={() => setShowDeliveryForm(false)}>Cancel</button>
                <button className="primary-action" onClick={deliveryEntryMode === "bulk" ? saveBulkDeliveries : saveDelivery}>{deliveryEntryMode === "bulk" ? "Save PO batches" : editingDeliveryId ? "Save changes" : "Save delivery"}</button>
              </div>
            </div>
          </section>
        ) : null}

        <section className="portfolio-delivery-panel" hidden={activeWorkspace !== "delivery"}>
          <div className="panel-header">
            <div>
              <h2>Total Delivery Table</h2>
            </div>
            <div className="filters smart-filters">
              <select aria-label="Delivery project filter" value={deliveryProjectFilter} onChange={(event) => setDeliveryProjectFilter(event.target.value)}>
                <option value="All">All projects</option>
                {projectList.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
              <select aria-label="Delivery manufacturer filter" value={deliveryManufacturerFilter} onChange={(event) => setDeliveryManufacturerFilter(event.target.value)}>
                {deliveryManufacturers.map((manufacturer) => (
                  <option key={manufacturer} value={manufacturer}>{manufacturer === "All" ? "All manufacturers" : manufacturer}</option>
                ))}
              </select>
              <select aria-label="Delivery category filter" value={deliveryCategoryFilter} onChange={(event) => setDeliveryCategoryFilter(event.target.value)}>
                {deliveryCategories.map((categoryName) => (
                  <option key={categoryName} value={categoryName}>{categoryName === "All" ? "All categories" : categoryName}</option>
                ))}
              </select>
              <select aria-label="Delivery PO filter" value={deliveryPoFilter} onChange={(event) => setDeliveryPoFilter(event.target.value)}>
                {deliveryPos.map((po) => (
                  <option key={po} value={po}>{po === "All" ? "All PO" : po}</option>
                ))}
              </select>
              <select aria-label="Delivery status filter" value={deliveryStatusFilter} onChange={(event) => setDeliveryStatusFilter(event.target.value)}>
                <option value="All">All status</option>
                <option>Risk</option>
                <option>Open</option>
                <option>Customs cleared</option>
                <option>Arrived</option>
              </select>
              <input
                aria-label="Search delivery table"
                placeholder="Search PO / batch / vendor"
                value={deliverySearch}
                onChange={(event) => setDeliverySearch(event.target.value)}
              />
              <select aria-label="Delivery sort" value={deliverySort} onChange={(event) => setDeliverySort(event.target.value)}>
                <option value="risk">Sort by risk</option>
                <option value="etaAsc">Sort by ETA</option>
                <option value="project">Sort by project</option>
                <option value="manufacturer">Sort by manufacturer</option>
                <option value="category">Sort by category</option>
                <option value="po">Sort by PO</option>
              </select>
            </div>
          </div>
          <div className="table-kpis">
            <article><span>Visible batches</span><strong>{totalDeliveryRows.length}</strong></article>
            <article><span>Risk</span><strong>{totalDeliveryRiskCount}</strong></article>
            <article><span>Open</span><strong>{totalDeliveryOpenCount}</strong></article>
            <article><span>Arrived</span><strong>{totalDeliveryArrivedCount}</strong></article>
          </div>
          <div className="report-table">
            <div className="report-row portfolio-delivery-row report-head">
              <span>Project</span>
              <span>PO / Batch</span>
              <span>Manufacturer</span>
              <span>Category</span>
              <span>Status</span>
              <span>Pickup / ETA</span>
              <span>Need</span>
              <span>Cost</span>
              <span>Mode</span>
              <span>Action</span>
            </div>
            {totalDeliveryRows.length ? (
              totalDeliveryRows.map((row) => (
                <div className="report-row portfolio-delivery-row" key={`portfolio-${row.id}`}>
                  <span>
                    <strong>{row.projectCode}</strong>
                    <small>{row.projectName} · {row.projectStatus}</small>
                  </span>
                  <span>
                    <strong>{row.po}</strong>
                    <small>Batch {row.batch}</small>
                  </span>
                  <span>{row.manufacturer}</span>
                  <span>{getDeliveryCategory(row)}</span>
                  <span><i className={`status-chip ${getStatusTone(row.deliveryStatus)}`}>{row.deliveryStatus}</i></span>
                  <span>
                    <strong>{formatScheduleWeek(row.supplierSchedule)}</strong>
                    <small>{usesSupplierEta(row) ? "Supplier ETA" : `ETA ${formatScheduleWeek(row.risk.theoreticalDelivery)}`}</small>
                  </span>
                  <span>{formatScheduleWeek(row.productionNeed)}</span>
                  <span>{formatMoney(getProjectedTotalCost(row, bomItems, rowsWithRisk))}</span>
                  <span>
                    <strong>{row.deliveryWay}</strong>
                    <small>{getIncotermMode(row)}</small>
                  </span>
                  <span className="row-actions">
                    <button onClick={() => deleteDelivery(row.id)}>Delete</button>
                  </span>
                </div>
              ))
            ) : (
              <div className="empty-state report-empty">No deliveries match the current filters.</div>
            )}
          </div>
        </section>

        <section className="zone-title supplier-zone-title" aria-label="Supplier schedule section" hidden={activeWorkspace !== "supplier"}>
          <h2>Supplier Schedule</h2>
        </section>

        <section className="supplier-panel" hidden={activeWorkspace !== "supplier"}>
          <div className="panel-header">
            <div>
              <h2>PO split and supplier request</h2>
              <p>Prepare vendor schedule emails, approve supplier requests, then track PL / CI and forwarder pickup.</p>
            </div>
            <div className="filters smart-filters">
              <select aria-label="Supplier PO" value={activeSupplierPo} onChange={(event) => setSupplierPoFilter(event.target.value)}>
                {supplierPoOptions.length ? supplierPoOptions.map((po) => (
                  <option key={po} value={po}>PO {po}</option>
                )) : <option value="">No PO available</option>}
              </select>
              <label className="secondary-action file-action">
                Import PO Detail
                <input accept=".xlsx,.xls" aria-label="Import PO Detail" onChange={importPoDetailFile} type="file" />
              </label>
              <button className="secondary-action" disabled={!activeSupplierPo} onClick={syncSupplierPlanFromDelivery}>Sync from delivery</button>
            </div>
          </div>

          {activeSupplierPo ? (
            <>
              <div className="supplier-kpis">
                <article><span>PO</span><strong>{supplierPlan.po}</strong><small>{supplierPlan.manufacturer || "Manufacturer TBD"}</small></article>
                <article><span>Batch split</span><strong>{supplierPlan.batches.length}</strong><small>{supplierPlanApprovedCount} approved / {supplierSplitTotal.toFixed(1)}%</small></article>
                <article><span>PO material</span><strong>{supplierPoLines.length}</strong><small>{supplierPoLineTotalQty.toLocaleString()} qty</small></article>
                <article><span>PO amount</span><strong>{formatMoney(supplierPoLineTotalAmount)}</strong><small>{supplierPoLines[0]?.currency || "USD"}</small></article>
                <article><span>Documents</span><strong>{supplierPlanDocsReadyCount}/{supplierPlan.batches.length}</strong><small>PL / CI ready</small></article>
              </div>

              <div className="supplier-grid">
                <section className="supplier-card supplier-email-card">
                  <div className="section-title compact-title">
                    <h2>Email template</h2>
                    <button className="secondary-action" onClick={applyCswindSupplierTemplate}>Use CSWind template</button>
                  </div>
                  <div className="supplier-email-form">
                    <label>
                      To
                      <input value={supplierPlan.to} onChange={(event) => updateSupplierPlan((plan) => ({ ...plan, to: event.target.value }))} />
                    </label>
                    <label>
                      CC
                      <input value={supplierPlan.cc} onChange={(event) => updateSupplierPlan((plan) => ({ ...plan, cc: event.target.value }))} />
                    </label>
                    <label className="wide-field">
                      Subject
                      <input value={supplierPlan.subject} onChange={(event) => updateSupplierPlan((plan) => ({ ...plan, subject: event.target.value }))} />
                    </label>
                    <label className="wide-field">
                      Template body
                      <textarea value={supplierPlan.body} onChange={(event) => updateSupplierPlan((plan) => ({ ...plan, body: event.target.value }))} />
                    </label>
                    <label className="wide-field">
                      Attachments
                      <input type="file" multiple onChange={(event) => updateSupplierPlan((plan) => ({ ...plan, attachments: Array.from(event.target.files ?? []).map((file) => file.name) }))} />
                      <small>{supplierPlan.attachments.length ? supplierPlan.attachments.join(" / ") : "Attachment names are saved for tracking; actual email attachment needs Outlook/Gmail integration."}</small>
                    </label>
                  </div>
                  <div className="supplier-email-preview">
                    <div className="email-preview-head">
                      <span>Generated email</span>
                      <strong>{supplierPlan.subject}</strong>
                    </div>
                    <pre>{supplierEmailText}</pre>
                  </div>
                  <div className="form-actions">
                    <button className="secondary-action" onClick={() => copyText(supplierEmailText)}>Copy email</button>
                    <button className="secondary-action" onClick={() => updateSupplierPlan((plan) => ({ ...plan, requestSent: true, batches: plan.batches.map((batch) => ({ ...batch, status: batch.status === "Draft" ? "Request sent" : batch.status })) }))}>Mark sent</button>
                    <button className="primary-action" onClick={openSupplierMailDraft}>Open mail draft</button>
                  </div>
                </section>

                <section className="supplier-card supplier-batch-card">
                  <div className="section-title compact-title">
                    <h2>Batch schedule approval</h2>
                    <button className="secondary-action" onClick={addSupplierBatch}>Add batch</button>
                  </div>
                  <div className="supplier-batch-list">
                    <div className="supplier-batch-row supplier-batch-head">
                      <span>Batch</span>
                      <span>Qty / %</span>
                      <span>PU week</span>
                      <span>Need week</span>
                      <span>Supplier request</span>
                      <span>Status</span>
                      <span>Note</span>
                      <span></span>
                    </div>
                    {supplierPlan.batches.map((batch) => (
                      <div className="supplier-batch-row" key={batch.id}>
                        <span>
                          <strong>{batch.batch}</strong>
                          <small>{supplierPlan.category}</small>
                        </span>
                        <span className="split-inputs">
                          <input type="number" value={batch.qty} onChange={(event) => updateSupplierBatch(batch.id, { qty: Number(event.target.value) })} />
                          <input type="number" value={batch.percentage} onChange={(event) => updateSupplierBatch(batch.id, { percentage: Number(event.target.value) })} />
                        </span>
                        <input type="date" value={formatInputMidweekDate(batch.puWeek)} onChange={(event) => updateSupplierBatch(batch.id, { puWeek: dateInputToMidweekDate(event.target.value, batch.puWeek) })} />
                        <input type="date" value={formatInputMidweekDate(batch.needWeek)} onChange={(event) => updateSupplierBatch(batch.id, { needWeek: dateInputToMidweekDate(event.target.value, batch.needWeek) })} />
                        <input type="date" value={formatInputMidweekDate(batch.supplierRequestWeek)} onChange={(event) => updateSupplierBatch(batch.id, { supplierRequestWeek: dateInputToMidweekDate(event.target.value) })} />
                        <span className="supplier-status-stack">
                          <select value={batch.status} onChange={(event) => updateSupplierBatch(batch.id, { status: event.target.value as SupplierBatchStatus })}>
                            <option>Draft</option>
                            <option>Request sent</option>
                            <option>Supplier requested</option>
                            <option>Approved</option>
                            <option>Rejected</option>
                          </select>
                          <button onClick={() => updateSupplierBatch(batch.id, { status: "Approved", puWeek: batch.supplierRequestWeek || batch.puWeek })}>Approve</button>
                        </span>
                        <input value={batch.note} onChange={(event) => updateSupplierBatch(batch.id, { note: event.target.value })} />
                        <button className="tiny-action" disabled={supplierPlan.batches.length <= 1} onClick={() => deleteSupplierBatch(batch.id)}>Delete</button>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <section className="supplier-card supplier-material-card">
                <div className="section-title compact-title">
                  <div>
                    <h2>PO material batch allocation</h2>
                    <small>{supplierPoLines.length ? "Edit each batch quantity. Use 0 when a material is not included in that batch." : "Import PO Detail to allocate material quantities by batch."}</small>
                  </div>
                  <div className="material-allocation-actions">
                    <button className="secondary-action" disabled={!supplierPoLines.length} onClick={resetSupplierMaterialAllocations}>Apply split %</button>
                    <button className="primary-action" disabled={!supplierPoLines.length} onClick={exportSupplierMaterialAllocations}>Export Excel</button>
                  </div>
                </div>
                {supplierPoLines.length ? (
                  <div className="supplier-material-scroll">
                    <table className="supplier-material-table">
                      <thead>
                        <tr>
                          <th>Line</th>
                          <th>Material</th>
                          <th>Manufacturer</th>
                          <th>PO Qty</th>
                          <th>Unit price</th>
                          <th>Amount</th>
                          {supplierPlan.batches.map((batch) => (
                            <th key={`head-${batch.id}`}>{batch.batch} {Number(batch.percentage || 0).toFixed(1)}%</th>
                          ))}
                          <th>Allocated</th>
                          <th>Remaining</th>
                        </tr>
                      </thead>
                      <tbody>
                        {supplierPoLines.map((line) => {
                          const allocatedQty = supplierPlan.batches.reduce((sum, batch) => sum + getMaterialAllocationQty(supplierPlan, line, batch), 0);
                          const remainingQty = Math.round((line.poQty - allocatedQty) * 100) / 100;
                          return (
                            <tr key={line.id}>
                              <td>{line.lineNo}</td>
                              <td>
                                <strong>{line.material}</strong>
                                <small>{line.materialCode} / {line.category}</small>
                              </td>
                              <td>{line.manufacturer}</td>
                              <td>{line.poQty.toLocaleString()} {line.unit}</td>
                              <td>{formatMoney(line.unitPrice)}</td>
                              <td>{formatMoney(line.amount)}</td>
                              {supplierPlan.batches.map((batch) => (
                                <td key={`${line.id}-${batch.id}`}>
                                  <input
                                    aria-label={`${line.material} ${batch.batch} quantity`}
                                    min="0"
                                    step="0.01"
                                    type="number"
                                    value={getMaterialAllocationQty(supplierPlan, line, batch)}
                                    onChange={(event) => updateSupplierMaterialAllocation(line.id, batch.id, Number(event.target.value))}
                                  />
                                  <small>{line.unit}</small>
                                </td>
                              ))}
                              <td>
                                <strong>{allocatedQty.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                                <small>{line.unit}</small>
                              </td>
                              <td className={Math.abs(remainingQty) > 0.01 ? "allocation-warning" : "allocation-ok"}>
                                <strong>{remainingQty.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                                <small>{line.unit}</small>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-state">Upload the PO Detail List to preview each material line, assign it into batches, and export the final batch material list.</div>
                )}
              </section>

              <div className="supplier-grid lower">
                <section className="supplier-card">
                  <div className="section-title compact-title">
                    <h2>Pickup reminder and supplier documents</h2>
                  </div>
                  <div className="supplier-doc-table">
                    {supplierPlan.batches.map((batch) => (
                      <div className="supplier-doc-row" key={`doc-${batch.id}`}>
                        <span>
                          <strong>{batch.batch}</strong>
                          <small>PU week {formatScheduleWeek(batch.puWeek)}</small>
                        </span>
                        <label>
                          Commercial invoice
                          <input type="file" multiple onChange={(event) => updateSupplierBatch(batch.id, { commercialInvoiceFiles: Array.from(event.target.files ?? []).map((file) => file.name) })} />
                          <small>{batch.commercialInvoiceFiles.join(" / ") || "Pending"}</small>
                        </label>
                        <label>
                          Packing list
                          <input type="file" multiple onChange={(event) => updateSupplierBatch(batch.id, { packingListFiles: Array.from(event.target.files ?? []).map((file) => file.name) })} />
                          <small>{batch.packingListFiles.join(" / ") || "Pending"}</small>
                        </label>
                      </div>
                    ))}
                  </div>
                  <div className="supplier-email-preview compact">
                    <strong>Pickup reminder draft</strong>
                    <textarea readOnly value={pickupReminderText} />
                  </div>
                  <div className="form-actions">
                    <button className="secondary-action" onClick={() => copyText(pickupReminderText)}>Copy reminder</button>
                    <button className="secondary-action" onClick={() => updateSupplierPlan((plan) => ({ ...plan, pickupReminderSent: true }))}>Mark reminder sent</button>
                  </div>
                </section>

                <section className="supplier-card">
                  <div className="section-title compact-title">
                    <h2>Forwarder handoff</h2>
                  </div>
                  <label className="supplier-forwarder-email">
                    Forwarder email
                    <input value={supplierPlan.forwarderEmail} onChange={(event) => updateSupplierPlan((plan) => ({ ...plan, forwarderEmail: event.target.value }))} />
                  </label>
                  <div className="supplier-forwarder-table">
                    {supplierPlan.batches.map((batch) => (
                      <div className="supplier-forwarder-row" key={`forwarder-${batch.id}`}>
                        <span>
                          <strong>{batch.batch}</strong>
                          <small>{[...batch.commercialInvoiceFiles, ...batch.packingListFiles].join(" / ") || "Documents pending"}</small>
                        </span>
                        <label>
                          B/L number
                          <input value={batch.blNumber} onChange={(event) => updateSupplierBatch(batch.id, { blNumber: event.target.value })} />
                        </label>
                        <label>
                          ETA
                          <input type="date" value={formatInputMidweekDate(batch.forwarderEta)} onChange={(event) => updateSupplierBatch(batch.id, { forwarderEta: dateInputToMidweekDate(event.target.value) })} />
                        </label>
                      </div>
                    ))}
                  </div>
                  <div className="supplier-email-preview compact">
                    <strong>Forwarder notice draft</strong>
                    <textarea readOnly value={forwarderNoticeText} />
                  </div>
                  <div className="form-actions">
                    <button className="secondary-action" onClick={() => copyText(forwarderNoticeText)}>Copy forwarder notice</button>
                    <button className="secondary-action" onClick={() => updateSupplierPlan((plan) => ({ ...plan, forwarderNoticeSent: true }))}>Mark notice sent</button>
                  </div>
                </section>
              </div>
            </>
          ) : (
            <div className="empty-state">Add delivery records with PO numbers first, then use this workflow to split PO batches and prepare supplier schedule requests.</div>
          )}
        </section>

        <section className="overview-panel" hidden={activeWorkspace !== "overview"}>
          <div className="overview-kpi-strip" aria-label="Project control summary">
            <article>
              <span>Production window</span>
              <strong>{activeProject.productionWindow}</strong>
              <small>Production plan baseline</small>
            </article>
            <article>
              <span>Total deliveries</span>
              <strong>{projectRows.length}</strong>
              <small>{arrivedCount} received / {riskRows.length} risk deliveries</small>
            </article>
            <article>
              <span>NCR control</span>
              <strong>{projectSupplierNcrs.length + projectInternalNcrs.length}</strong>
              <small>{projectInternalNcrs.filter((item) => !item.goodsReceived).length} open internal items</small>
            </article>
            <article>
              <span>ECN control</span>
              <strong>{projectEcnRecords.length}</strong>
              <small>{projectEcnRecords.filter((item) => !["Implemented", "Closed"].includes(item.status)).length} open changes</small>
            </article>
            <article>
              <span>To do</span>
              <strong>{openTodoCount}</strong>
              <small>{projectTodoItems.length - openTodoCount} completed</small>
            </article>
          </div>
          <div className="overview-grid">
            <article className="overview-card todo-card">
              <div className="section-title compact-title">
                <h2>To Do List</h2>
              </div>
              <div className="todo-form">
                <input
                  aria-label="Todo item"
                  placeholder="Add follow-up item"
                  value={todoDraft.title}
                  onChange={(event) => setTodoDraft({ ...todoDraft, title: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") addTodoItem();
                  }}
                />
                <input
                  aria-label="Todo owner"
                  placeholder="Owner"
                  value={todoDraft.owner}
                  onChange={(event) => setTodoDraft({ ...todoDraft, owner: event.target.value })}
                />
                <select aria-label="Todo mode" value={todoDraft.mode} onChange={(event) => setTodoDraft({ ...todoDraft, mode: event.target.value })}>
                  {todoModes.map((mode) => (
                    <option key={mode}>{mode}</option>
                  ))}
                </select>
                <select aria-label="Todo priority" value={todoDraft.priority} onChange={(event) => setTodoDraft({ ...todoDraft, priority: event.target.value })}>
                  {todoPriorities.map((priority) => (
                    <option key={priority}>{priority}</option>
                  ))}
                </select>
                <input aria-label="Todo due week" type="week" value={todoDraft.dueWeek} onChange={(event) => setTodoDraft({ ...todoDraft, dueWeek: event.target.value })} />
                <button className="primary-action" onClick={addTodoItem}>Add</button>
              </div>
              <div className="todo-list">
                {projectTodoItems.length ? (
                  projectTodoItems.map((item) => (
                    <div className={item.done ? "todo-row done" : "todo-row"} key={item.id}>
                      <button className="todo-check" aria-label={item.done ? "Mark as open" : "Mark as done"} onClick={() => toggleTodoItem(item.id)}>
                        {item.done ? "OK" : ""}
                      </button>
                      <span>
                        <strong>{item.title}</strong>
                        <small>{item.owner || "No owner"} | {item.mode || "General"} | {item.dueWeek || "No due week"}</small>
                      </span>
                      <i className={`todo-priority ${String(item.priority || "Normal").toLowerCase()}`}>{item.priority || "Normal"}</i>
                      <button className="todo-delete" aria-label="Delete todo" onClick={() => deleteTodoItem(item.id)}>Delete</button>
                    </div>
                  ))
                ) : (
                  <div className="empty-state todo-empty">No project tasks yet.</div>
                )}
              </div>
            </article>
            <article className="overview-card project-detail-card">
              <div className="section-title compact-title">
                <h2>Project Snapshot</h2>
              </div>
              <dl className="detail-list">
                <div>
                  <dt>Running status</dt>
                  <dd><i className={`status-chip ${getStatusTone(activeProjectStatus)}`}>{activeProjectStatus}</i></dd>
                </div>
                <div>
                  <dt>Tower quantity</dt>
                  <dd>{projectTowerQty.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Open invoice batches</dt>
                  <dd>{openBatchCount}</dd>
                </div>
              </dl>
            </article>

            <article className="overview-card budget-detail-card">
              <div className="section-title compact-title">
                <h2>Budget Detail</h2>
              </div>
              <div className="budget-visual">
                <div className="budget-ring" style={{ background: `conic-gradient(var(--green) 0 ${projectBudgetUsedDisplay}%, #e9f1ee ${projectBudgetUsedDisplay}% 100%)` }}>
                  <span>{formatPercent(projectBudgetUsedPercent)}</span>
                  <small>used</small>
                </div>
                <div className="budget-meter">
                  <span style={{ width: `${projectBudgetUsedDisplay}%` }} />
                </div>
              </div>
              <dl className="detail-list two-column">
                <div>
                  <dt>Total budget</dt>
                  <dd>{formatMoney(activeProject.budget)}</dd>
                </div>
                <div>
                  <dt>Total cost</dt>
                  <dd>{formatMoney(projectTotalCost)}</dd>
                </div>
                <div>
                  <dt>Remaining budget</dt>
                  <dd className={forecastBudgetRemaining >= 0 ? "budget-good" : "budget-risk"}>{formatMoney(forecastBudgetRemaining)}</dd>
                </div>
                <div>
                  <dt>Used / Remaining</dt>
                  <dd>{formatPercent(projectBudgetUsedPercent)} / {formatPercent(projectBudgetRemainingPercent)}</dd>
                </div>
              </dl>
            </article>

            <article className="overview-card delivery-health-card">
              <div className="section-title compact-title">
                <h2>Delivery Health</h2>
              </div>
              <div className="health-visual">
                <div className="health-ring" style={{ background: `conic-gradient(var(--green) 0 ${clampPercent(deliveryCompletePercent)}%, var(--red) ${clampPercent(deliveryCompletePercent)}% ${clampPercent(deliveryCompletePercent + deliveryRiskPercent)}%, #e9f1ee ${clampPercent(deliveryCompletePercent + deliveryRiskPercent)}% 100%)` }}>
                  <span>{formatPercent(deliveryCompletePercent)}</span>
                  <small>received</small>
                </div>
                <div className="health-bars">
                  {[
                    { label: "Received", value: arrivedCount, percent: deliveryCompletePercent, tone: "done" },
                    { label: "Open", value: openDeliveryCount, percent: projectRows.length ? openDeliveryCount / projectRows.length : 0, tone: "open" },
                    { label: "Risk", value: riskRows.length, percent: deliveryRiskPercent, tone: "risk" },
                  ].map((item) => (
                    <div className="health-line" key={item.label}>
                      <span><strong>{item.label}</strong><small>{item.value} batches</small></span>
                      <i className={`health-track ${item.tone}`}><b style={{ width: `${clampPercent(item.percent)}%` }} /></i>
                    </div>
                  ))}
                </div>
              </div>
            </article>

            <article className="overview-card cost-summary-card">
              <div className="section-title compact-title">
                <h2>Cost Summary</h2>
              </div>
              <div className="cost-visual">
                <div className="cost-ring" style={{ background: `conic-gradient(${costMixStops.join(", ") || "#e9f1ee 0 100%"})` }}>
                  <span>{formatMoney(projectTotalCost)}</span>
                  <small>total cost</small>
                </div>
                <div className="cost-stack">
                  {costMixItems.map((item) => (
                    <div className="cost-line" key={item.label}>
                      <span>
                        <i className={`cost-dot ${item.tone}`} />
                        {item.label}
                      </span>
                      <strong>{formatMoney(item.value)}</strong>
                      <em>{formatPercent(item.value / costMixTotal)}</em>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          </div>
        </section>

        <section className="zone-title mcip-zone-title" aria-label="MCIP section" hidden={activeWorkspace !== "mcip"}>
          <h2>MCIP</h2>
        </section>

        <section className="mcip-panel" hidden={activeWorkspace !== "mcip"}>
          <div className="panel-header">
            <div>
              <h2>Portfolio Budget Forecast</h2>
            </div>
            <div className="filters smart-filters">
              <select aria-label="MCIP project filter" value={mcipProjectFilter} onChange={(event) => setMcipProjectFilter(event.target.value)}>
                <option value="All">All projects</option>
                {projectList.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
              <select aria-label="MCIP status filter" value={mcipStatusFilter} onChange={(event) => setMcipStatusFilter(event.target.value)}>
                <option value="All">All status</option>
                {projectStatuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
              <select aria-label="MCIP sort" value={mcipSort} onChange={(event) => setMcipSort(event.target.value)}>
                <option value="mcipAsc">Lowest MCIP first</option>
                <option value="mcipDesc">Highest MCIP first</option>
                <option value="costDesc">Highest cost first</option>
                <option value="budgetDesc">Highest budget first</option>
                <option value="project">Sort by project</option>
              </select>
            </div>
          </div>
          <div className="mcip-summary">
            <article>
              <span>Total budget</span>
              <strong>{formatMoney(mcipTotals.budget)}</strong>
            </article>
            <article>
              <span>Total cost</span>
              <strong>{formatMoney(mcipTotals.forecastCost)}</strong>
            </article>
            <article>
              <span>MCIP amount</span>
              <strong>{formatMoney(mcipTotals.mcipAmount)}</strong>
            </article>
            <article>
              <span>MCIP / tower (DAP)</span>
              <strong>{formatMoney(mcipTotalPerTowerDap)}</strong>
            </article>
            <article>
              <span>MCIP / tower (DDP)</span>
              <strong>{formatMoney(mcipTotalPerTowerDdp)}</strong>
            </article>
            <article>
              <span>MCIP (%)</span>
              <strong>{formatPercent(mcipTotalPercent)}</strong>
            </article>
          </div>
          <div className="report-table">
            <div className="report-row mcip-row report-head">
              <span>Project</span>
              <span>Status</span>
              <span>Budget</span>
              <span>Total cost</span>
              <span>MCIP amount</span>
              <span>MCIP / tower (DAP)</span>
              <span>MCIP / tower (DDP)</span>
              <span>MCIP (%)</span>
              <span>Material cost</span>
              <span>Logistics</span>
              <span>Tariff</span>
              <span>NCR cost</span>
            </div>
            {mcipVisibleRows.map((item) => (
              <div className="report-row mcip-row" key={item.project.id}>
                <span>
                  <strong>{item.project.name}</strong>
                  <small>{item.project.code} · {item.project.phase}</small>
                </span>
                <span><i className={`status-chip ${getStatusTone(getProjectStatus(item.project))}`}>{getProjectStatus(item.project)}</i></span>
                <span>{formatMoney(item.budget)}</span>
                <span>{formatMoney(item.forecastCost)}</span>
                <span><i className={item.mcipAmount >= 0 ? "check yes" : "check no"}>{formatMoney(item.mcipAmount)}</i></span>
                <span>
                  <strong>{formatMoney(item.mcipPerTowerDap)}</strong>
                  <small>{item.towerQty.toLocaleString()} towers</small>
                </span>
                <span>
                  <strong>{formatMoney(item.mcipPerTowerDdp)}</strong>
                  <small>{item.towerQty.toLocaleString()} towers</small>
                </span>
                <span>{formatPercent(item.mcipPercent)}</span>
                <span>{formatMoney(item.materialCost)}</span>
                <span>{formatMoney(item.logisticsCost)}</span>
                <span>{formatMoney(item.tariffCost)}</span>
                <span>{formatMoney(item.ncrCost)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="zone-title cashflow-zone-title" aria-label="Cashflow section" hidden={activeWorkspace !== "cashflow"}>
          <h2>Cashflow</h2>
        </section>

        <section className="cashflow-panel" hidden={activeWorkspace !== "cashflow"}>
          <div className="panel-header">
            <div>
              <h2>Monthly Payment Forecast</h2>
            </div>
            <div className="filters">
              <select aria-label="Cashflow project" value={cashflowProjectId} onChange={(event) => setCashflowProjectId(event.target.value)}>
                <option value="All">All projects</option>
                {projectList.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="cashflow-summary">
            <article>
              <span>Forecast payable</span>
              <strong>{formatMoney(cashflowTotalAmount)}</strong>
            </article>
            <article>
              <span>Open forecast lines</span>
              <strong>{cashflowForecastRows.length}</strong>
            </article>
            <article>
              <span>Next pay month</span>
              <strong>{cashflowNextPayMonth}</strong>
            </article>
            <article>
              <span>Projects in forecast</span>
              <strong>{cashflowProjectSeries.length}</strong>
            </article>
          </div>

          <div className="cashflow-chart-card">
            <div className="section-title compact-title">
              <h2>Payment Curve</h2>
            </div>
            <div className="cashflow-chart-wrap">
              <svg className="cashflow-chart" role="img" viewBox={`0 0 ${cashflowChartWidth} ${cashflowChartHeight}`}>
                {[0, 0.25, 0.5, 0.75, 1].map((step) => {
                  const value = cashflowMaxValue * step;
                  const y = getCashflowY(value, cashflowMaxValue, cashflowChartHeight);
                  return (
                    <g key={`grid-${step}`}>
                      <line className="cashflow-gridline" x1="58" x2={cashflowChartWidth - 20} y1={y} y2={y} />
                      <text className="cashflow-y-label" x="48" y={y + 4}>{formatCompactMoney(value)}</text>
                    </g>
                  );
                })}
                {cashflowMonthKeys.map((monthKey, index) => {
                  const x = getCashflowX(index, cashflowMonthKeys.length, cashflowChartWidth);
                  const labelStep = cashflowMonthKeys.length > 8 ? 2 : 1;
                  return index % labelStep === 0 ? (
                    <text className="cashflow-x-label" key={`label-${monthKey}`} x={x} y={cashflowChartHeight - 10}>{getMonthLabel(monthKeyToDate(monthKey))}</text>
                  ) : null;
                })}
                <path className="cashflow-total-line" d={getCashflowLinePath(cashflowTotalValues, cashflowMaxValue, cashflowChartWidth, cashflowChartHeight)} />
                {cashflowProjectSeries.map((series, index) => (
                  <path
                    className="cashflow-project-line"
                    d={getCashflowLinePath(series.values, cashflowMaxValue, cashflowChartWidth, cashflowChartHeight)}
                    key={series.project.id}
                    style={{ stroke: cashflowPalette[index % cashflowPalette.length] }}
                  />
                ))}
              </svg>
            </div>
            <div className="cashflow-legend">
              <span><i className="total-dot" />Total</span>
              {cashflowProjectSeries.map((series, index) => (
                <span key={`legend-${series.project.id}`}>
                  <i style={{ background: cashflowPalette[index % cashflowPalette.length] }} />
                  {series.project.code}
                </span>
              ))}
            </div>
          </div>

          <div className="cashflow-grid">
            <div className="cashflow-card">
              <div className="section-title compact-title">
                <h2>Monthly Report</h2>
              </div>
              <div className="cashflow-table">
                <div className="cashflow-row cashflow-month-row cashflow-head">
                  <span>Pay month</span>
                  <span>Total</span>
                  <span>Project split</span>
                </div>
                {cashflowMonthlyRows.some((row) => row.total > 0) ? (
                  cashflowMonthlyRows
                    .filter((row) => row.total > 0)
                    .map((row) => (
                      <div className="cashflow-row cashflow-month-row" key={row.monthKey}>
                        <span><strong>{row.month}</strong></span>
                        <span>{formatMoney(row.total)}</span>
                        <span className="cashflow-chipline">
                          {row.projectValues
                            .filter((item) => item.amount > 0)
                            .map((item) => (
                              <i key={`${row.monthKey}-${item.project.id}`}>{item.project.code}: {formatMoney(item.amount)}</i>
                            ))}
                        </span>
                      </div>
                    ))
                ) : (
                  <div className="empty-state cashflow-empty">No open invoice forecast.</div>
                )}
              </div>
            </div>

            <div className="cashflow-card">
              <div className="section-title compact-title">
                <h2>PO / Batch Forecast Detail</h2>
              </div>
              <div className="cashflow-table">
                <div className="cashflow-row cashflow-detail-row cashflow-head">
                  <span>PO</span>
                  <span>IM</span>
                  <span>Payment terms</span>
                  <span>Manufacturer</span>
                  <span>Batch</span>
                  <span>Invoice month</span>
                  <span>Pay month</span>
                  <span>Material</span>
                  <span>Freight</span>
                  <span>Tariff</span>
                  <span>Total</span>
                </div>
                {cashflowForecastRows.length ? (
                  cashflowForecastRows.map((row) => (
                    <div className="cashflow-row cashflow-detail-row" key={`cashflow-${row.id}`}>
                      <span><strong>{row.po}</strong></span>
                      <span>
                        <strong>{row.projectCode}</strong>
                        <small>{row.projectName}</small>
                      </span>
                      <span>
                        <strong>{row.paymentTerms}</strong>
                        <small>{row.paymentDays} days</small>
                      </span>
                      <span>{row.manufacturer}</span>
                      <span>
                        <strong>{row.batch}</strong>
                        <small>{row.invoiceBasis}</small>
                      </span>
                      <span>{row.invoiceMonth}</span>
                      <span>{row.payMonth}</span>
                      <span>{row.materialAmount > 0 ? formatMoney(row.materialAmount) : "Received"}</span>
                      <span>{row.freightAmount > 0 ? formatMoney(row.freightAmount) : "Received"}</span>
                      <span>{row.tariffAmount > 0 ? formatMoney(row.tariffAmount) : "Received"}</span>
                      <span><strong>{formatMoney(row.amount)}</strong></span>
                    </div>
                  ))
                ) : (
                  <div className="empty-state cashflow-detail-empty">All matching invoice components are already received.</div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="zone-title logistics-zone-title" aria-label="Logistics section" hidden={activeWorkspace !== "logistics"}>
          <h2>Logistics</h2>
        </section>

        <section className="report-panel" hidden={activeWorkspace !== "logistics"}>
          <div className="panel-header">
            <div>
              <h2>Logistics</h2>
            </div>
            <div className="filters">
              <select aria-label="Report project" value={reportProjectId} onChange={(event) => setReportProjectId(event.target.value)}>
                <option value="All">All projects</option>
                {projectList.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
              <select aria-label="Report time window" value={reportWindow} onChange={(event) => setReportWindow(event.target.value)}>
                <option value="All">All time</option>
                <option value="30">Next 30 days</option>
                <option value="60">Next 60 days</option>
                <option value="90">Next 90 days</option>
              </select>
            </div>
          </div>

          <div className="report-grid">
            <div className="report-card">
              <div className="section-title compact-title">
                <h2>Tariff & Freight</h2>
              </div>
              <div className="report-table">
                <div className="report-row freight-report-row report-head">
                  <span>Project / Supplier</span>
                  <span>Category</span>
                  <span>Shipments</span>
                  <span>Freight</span>
                  <span>Tariff</span>
                  <span>Total logistics</span>
                </div>
                {freightTariffStats.length ? (
                  freightTariffStats.map((item) => (
                    <div className="report-row freight-report-row" key={item.key}>
                      <span>
                        <strong>{item.projectName}</strong>
                        <small>{item.manufacturer}</small>
                      </span>
                      <span>{item.category}</span>
                      <span>{item.count} <small>{item.seaCount} sea / {item.airCount} air</small></span>
                      <span>{formatMoney(item.freight)}</span>
                      <span>{formatMoney(item.tariff)}</span>
                      <span>{formatMoney(item.freight + item.tariff)}</span>
                    </div>
                  ))
                ) : (
                  <div className="empty-state report-empty">当前筛选范围内没有 freight/tariff 数据。</div>
                )}
              </div>
            </div>

            <div className="report-card">
              <div className="section-title compact-title">
                <h2>Ocean Lead Time</h2>
              </div>
              <div className="report-table">
                <div className="report-row ocean-report-row report-head">
                  <span>Origin country</span>
                  <span>Port</span>
                  <span>Sea shipments</span>
                  <span>PO → pickup</span>
                  <span>Pickup → actual arrival</span>
                </div>
                {oceanLeadStats.length ? (
                  oceanLeadStats.map((item) => (
                    <div className="report-row ocean-report-row" key={item.key}>
                      <span><strong>{item.country}</strong></span>
                      <span>{item.port}</span>
                      <span>{item.count}</span>
                      <span>{formatDays(item.avgPoToSupplier)}</span>
                      <span>{formatDays(item.avgSupplierToCompany)}</span>
                    </div>
                  ))
                ) : (
                  <div className="empty-state report-empty">当前筛选范围内没有海运记录。</div>
                )}
              </div>
            </div>

          </div>
        </section>

        <section className="zone-title bom-zone-title" aria-label="BOM section" hidden={activeWorkspace !== "bom"}>
          <h2>BOM</h2>
        </section>

        <section className="bom-panel bom-purchasing-panel" hidden={activeWorkspace !== "bom"}>
          <div className="panel-header">
            <div>
              <h2>BOM for Purchasing</h2>
              <p>Upload purchasing BOM and review supplier, quantity, unit price, and amount by project.</p>
            </div>
            <div className="filters smart-filters">
              <select aria-label="BOM supplier filter" value={bomManufacturerFilter} onChange={(event) => setBomManufacturerFilter(event.target.value)}>
                {bomManufacturers.map((manufacturer) => (
                  <option key={manufacturer} value={manufacturer}>{manufacturer === "All" ? "All suppliers" : manufacturer}</option>
                ))}
              </select>
              <select aria-label="BOM category filter" value={bomCategoryFilter} onChange={(event) => setBomCategoryFilter(event.target.value)}>
                {bomCategories.map((categoryName) => (
                  <option key={categoryName} value={categoryName}>{categoryName === "All" ? "All categories" : categoryName}</option>
                ))}
              </select>
              <input
                aria-label="Search BOM"
                placeholder="Search component / supplier"
                value={bomSearch}
                onChange={(event) => setBomSearch(event.target.value)}
              />
            </div>
          </div>
          <div className="bom-toolbar">
            <article>
              <span>Visible lines</span>
              <strong>{visiblePurchasingBomItems.length.toLocaleString()}</strong>
              <small>{projectPurchasingBomItems.length.toLocaleString()} total BOM lines</small>
            </article>
            <article>
              <span>Visible quantity</span>
              <strong>{formatNumber(bomVisibleTotalQty)}</strong>
              <small>PO qty or tower qty basis</small>
            </article>
            <article>
              <span>Visible amount</span>
              <strong>{formatMoney(bomVisibleTotalAmount)}</strong>
              <small>Amount/5TW or qty x unit price</small>
            </article>
            <div className="bom-toolbar-actions">
              <label className="file-action">
                Upload BOM
                <input accept=".xlsx,.xls,.csv,text/csv" aria-label="Upload BOM for purchasing" onChange={(event) => importBomFile(event, "purchasing")} type="file" />
              </label>
              <button className="secondary-action" onClick={() => clearProjectBom("purchasing")} disabled={!projectPurchasingBomItems.length}>Clear BOM</button>
            </div>
          </div>
          <div className="bom-table">
            <div className="bom-row bom-purchasing-row bom-head">
              <span>Component / Material</span>
              <span>Supplier</span>
              <span>Category</span>
              <span>Qty / tower</span>
              <span>PO qty</span>
              <span>Unit price</span>
              <span>Amount</span>
            </div>
            {visiblePurchasingBomItems.length ? (
              visiblePurchasingBomItems.map((item) => (
                <div className="bom-row bom-purchasing-row" key={item.id}>
                  <span>
                    <strong>{item.componentNumber || item.material}</strong>
                    <small>{item.material}</small>
                  </span>
                  <span>
                    <strong>{item.manufacturer || "-"}</strong>
                    <small>{item.vendorCode || "No vendor code"}</small>
                  </span>
                  <span>
                    <strong>{item.category || "-"}</strong>
                    <small>{[item.currency, item.incoterms].filter(Boolean).join(" | ") || "No terms"}</small>
                  </span>
                  <span>{formatNumber(item.qtyPerTower)}</span>
                  <span>{formatNumber(getBomLineQty(item))}</span>
                  <span>{formatMoney(item.unitCost)}</span>
                  <span>
                    <strong>{formatMoney(getBomLineAmount(item))}</strong>
                    <small>{item.amountTotal ? "BOM amount" : "Calculated"}</small>
                  </span>
                </div>
              ))
            ) : (
              <div className="empty-state bom-empty">Upload BOM for purchasing, or adjust supplier/category/search filters.</div>
            )}
          </div>
        </section>

        <section className="bom-panel" hidden>
          <div className="panel-header">
            <div>
              <h2>BOM</h2>
              <p>Upload BOM for purchasing and Internal BOM independently for this project.</p>
            </div>
          </div>
          <div className="bom-layout">
            <div className="bom-upload-grid">
              <article className="bom-upload-card">
                <span>BOM for purchasing</span>
                <strong>{projectPurchasingBomItems.length.toLocaleString()} lines</strong>
                <small>Feeds material cost calculation.</small>
                <div className="bom-upload-actions">
                  <label className="file-action">
                    Upload
                    <input accept=".xlsx,.xls,.csv,text/csv" aria-label="Upload BOM for purchasing" onChange={(event) => importBomFile(event, "purchasing")} type="file" />
                  </label>
                  <button className="secondary-action" onClick={() => clearProjectBom("purchasing")} disabled={!projectPurchasingBomItems.length}>Clear</button>
                </div>
              </article>
              <article className="bom-upload-card">
                <span>Internal BOM</span>
                <strong>{projectInternalBomItems.length.toLocaleString()} lines</strong>
                <small>Separate reference list, not included in cost.</small>
                <div className="bom-upload-actions">
                  <label className="file-action">
                    Upload
                    <input accept=".xlsx,.xls,.csv,text/csv" aria-label="Upload Internal BOM" onChange={(event) => importBomFile(event, "internal")} type="file" />
                  </label>
                  <button className="secondary-action" onClick={() => clearProjectBom("internal")} disabled={!projectInternalBomItems.length}>Clear</button>
                </div>
              </article>
            </div>
            <div className="bom-card">
              <div className="section-title compact-title">
                <h2>Batch Material Totals</h2>
              </div>
              <div className="bom-table">
                <div className="bom-row bom-head">
                  <span>Batch</span>
                  <span>Tower qty</span>
                  <span>Material total</span>
                  <span>Total incl. freight/tariff</span>
                </div>
                {projectRows.length ? (
                  projectRows.map((row) => (
                    <div className="bom-row" key={`bom-batch-${row.id}`}>
                      <span>
                        <strong>{row.batch}</strong>
                        <small>{row.po}</small>
                      </span>
                      <span>{row.qty.toLocaleString()}</span>
                      <span>{formatMoney(getMaterialCost(row, bomItems))}</span>
                      <span>{formatMoney(getProjectedTotalCost(row, bomItems, projectRows))}</span>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">先新增 delivery batch，并在 Qty 填入 tower 数量。</div>
                )}
              </div>
            </div>
            <div className="bom-card">
              <div className="section-title compact-title">
                <h2>BOM for Purchasing Detail</h2>
              </div>
              <div className="bom-table">
                <div className="bom-row bom-material-row bom-head">
                  <span>Component / Material</span>
                  <span>Vendor</span>
                  <span>Qty / tower</span>
                  <span>Project total</span>
                </div>
                {projectPurchasingBomItems.length ? (
                  projectPurchasingBomItems.map((item) => (
                    <div className="bom-row bom-material-row" key={item.id}>
                      <span>
                        <strong>{item.componentNumber || item.material}</strong>
                        <small>{item.material}</small>
                      </span>
                      <span>
                        <strong>{item.manufacturer || "-"}</strong>
                        <small>{[item.vendorCode, item.currency, item.incoterms].filter(Boolean).join(" · ") || "No vendor code"}</small>
                      </span>
                      <span>{formatNumber(item.qtyPerTower)}</span>
                      <span>
                        <strong>{formatMoney(projectTowerQty * item.qtyPerTower * item.unitCost)}</strong>
                        <small>{formatNumber(projectTowerQty * item.qtyPerTower)} pcs · {formatMoney(item.unitCost)} / unit</small>
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">上传 BOM CSV 后，这里会显示每个 category 和物料的用量、单价、项目总价。</div>
                )}
              </div>
            </div>
            <div className="bom-card">
              <div className="section-title compact-title">
                <h2>Internal BOM Detail</h2>
              </div>
              <div className="bom-table">
                <div className="bom-row internal-bom-row bom-head">
                  <span>Section</span>
                  <span>Component</span>
                  <span>Supplier</span>
                  <span>Qty / tower</span>
                  <span>Old code</span>
                </div>
                {projectInternalBomItems.length ? (
                  projectInternalBomItems.map((item) => (
                    <div className="bom-row internal-bom-row" key={item.id}>
                      <span>
                        <strong>{item.sectionInfo || "-"}</strong>
                        <small>{item.sectionCode || "No section code"}</small>
                      </span>
                      <span>
                        <strong>{item.componentNumber || "-"}</strong>
                        <small>{item.material}</small>
                      </span>
                      <span>{item.manufacturer || "-"}</span>
                      <span>{formatNumber(item.qtyPerTower)}</span>
                      <span>{item.oldCode || "-"}</span>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">Upload Internal BOM to preview sections, components, suppliers, and internal quantities.</div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="zone-title ncr-zone-title" aria-label="NCR section" hidden={activeWorkspace !== "ncr"}>
          <h2>NCR</h2>
        </section>

        <section className="ncr-panel ncr-total-panel" hidden={activeWorkspace !== "ncr"}>
          <div className="panel-header">
            <div>
              <h2>Total NCR Preview</h2>
            </div>
            <div className="filters smart-filters">
              <select aria-label="NCR project filter" value={ncrProjectFilter} onChange={(event) => setNcrProjectFilter(event.target.value)}>
                <option value="All">All projects</option>
                {projectList.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
              <select aria-label="NCR type filter" value={ncrTypeFilter} onChange={(event) => setNcrTypeFilter(event.target.value)}>
                <option value="All">All types</option>
                <option>Supplier</option>
                <option>Internal</option>
              </select>
              <select aria-label="NCR status filter" value={ncrStatusFilter} onChange={(event) => setNcrStatusFilter(event.target.value)}>
                <option value="All">All status</option>
                <option>Open</option>
                <option>Received</option>
              </select>
              <select aria-label="NCR sort" value={ncrSort} onChange={(event) => setNcrSort(event.target.value)}>
                <option value="status">Sort by status</option>
                <option value="project">Sort by project</option>
                <option value="costDesc">Highest cost first</option>
                <option value="etaAsc">ETA first</option>
                <option value="number">Sort by NCR number</option>
              </select>
              <label className="file-action">
                Import NCR
                <input accept=".csv,text/csv" aria-label="Import total NCR CSV" onChange={importNcrCsv} type="file" />
              </label>
            </div>
          </div>
          <div className="ncr-table">
            <div className="ncr-row ncr-total-row ncr-head">
              <span>Project</span>
              <span>Type</span>
              <span>NCR number</span>
              <span>Material</span>
              <span>Qty</span>
              <span>Status</span>
              <span>Cost</span>
              <span>ETA</span>
            </div>
            {ncrVisibleRows.length ? (
              ncrVisibleRows.map((item) => (
                <div className="ncr-row ncr-total-row" key={item.id}>
                  <span><strong>{item.projectName}</strong></span>
                  <span>{item.type}</span>
                  <span>{item.ncrNumber}</span>
                  <span>{item.material || "-"}</span>
                  <span>{item.qty.toLocaleString()}</span>
                  <span><i className={item.status === "Received" ? "check yes" : "check no"}>{item.status}</i></span>
                  <span>{item.cost === null ? "-" : formatMoney(item.cost)}</span>
                  <span>{item.eta ? formatShortDate(item.eta) : "-"}</span>
                </div>
              ))
            ) : (
              <div className="empty-state ncr-empty">No NCR records match the current filters.</div>
            )}
          </div>
        </section>

        <section className="ncr-panel ncr-report-panel" hidden={activeWorkspace !== "ncr"}>
          <div className="panel-header">
            <div>
              <h2>NCR Report</h2>
            </div>
          </div>
          <div className="report-table">
            <div className="report-row ncr-report-row report-head">
              <span>Project</span>
              <span>Supplier NCR</span>
              <span>Impact</span>
              <span>Replacement open</span>
              <span>Internal NCR</span>
              <span>Internal cost</span>
            </div>
            {ncrReportSummary.length ? (
              ncrReportSummary.map((item) => (
                <div className="report-row ncr-report-row" key={item.project.id}>
                  <span>
                    <strong>{item.project.name}</strong>
                    <small>{item.project.code}</small>
                  </span>
                  <span>{item.supplierCount}</span>
                  <span><i className={item.supplierImpact ? "check no" : "check yes"}>{item.supplierImpact}</i></span>
                  <span>{item.replacementOpen}</span>
                  <span>{item.internalCount} / {item.internalOpen} open</span>
                  <span>{formatMoney(item.internalCost)}</span>
                </div>
              ))
            ) : (
              <div className="empty-state report-empty">No NCR records.</div>
            )}
          </div>
        </section>

        <section className="ncr-panel" hidden={activeWorkspace !== "ncr"}>
          <div className="panel-header">
            <div>
              <h2>Supplier NCR</h2>
            </div>
          </div>
          <div className="form-grid ncr-form">
            <label>
              NCR number
              <input value={supplierNcrDraft.ncrNumber} onChange={(event) => setSupplierNcrDraft({ ...supplierNcrDraft, ncrNumber: event.target.value })} />
            </label>
            <label>
              Project name
              <input value={activeProject.name} readOnly />
            </label>
            <label>
              Material code
              <input value={supplierNcrDraft.materialCode} onChange={(event) => setSupplierNcrDraft({ ...supplierNcrDraft, materialCode: event.target.value })} />
            </label>
            <label>
              Category
              <input value={supplierNcrDraft.category} onChange={(event) => setSupplierNcrDraft({ ...supplierNcrDraft, category: event.target.value })} />
            </label>
            <label>
              Quantity
              <input type="number" value={supplierNcrDraft.qty} onChange={(event) => setSupplierNcrDraft({ ...supplierNcrDraft, qty: Number(event.target.value) })} />
            </label>
            <label className="toggle-label">
              <input checked={supplierNcrDraft.replacementReceived} type="checkbox" onChange={(event) => setSupplierNcrDraft({ ...supplierNcrDraft, replacementReceived: event.target.checked })} />
              Replacement received
            </label>
            <label className="toggle-label">
              <input checked={supplierNcrDraft.projectImpact} type="checkbox" onChange={(event) => setSupplierNcrDraft({ ...supplierNcrDraft, projectImpact: event.target.checked })} />
              Project impact
            </label>
            <div className="form-actions">
              <button className="primary-action" onClick={saveSupplierNcr}>Save supplier NCR</button>
            </div>
          </div>
          <div className="ncr-table">
            <div className="ncr-row supplier-ncr-row ncr-head">
              <span>NCR / Project</span>
              <span>Material</span>
              <span>Category</span>
              <span>Qty</span>
              <span>Replacement</span>
              <span>Impact</span>
              <span>Actions</span>
            </div>
            {projectSupplierNcrs.length ? (
              projectSupplierNcrs.map((item) => (
                <div className="ncr-row supplier-ncr-row" key={item.id}>
                  <span>
                    <strong>{item.ncrNumber}</strong>
                    <small>{item.projectName}</small>
                  </span>
                  <span>{item.materialCode}</span>
                  <span>{item.category || "-"}</span>
                  <span>{item.qty.toLocaleString()}</span>
                  <span><i className={item.replacementReceived ? "check yes" : "check no"}>{item.replacementReceived ? "Received" : "Open"}</i></span>
                  <span><i className={item.projectImpact ? "check no" : "check yes"}>{item.projectImpact ? "Impact" : "No impact"}</i></span>
                  <span className="row-actions"><button onClick={() => deleteSupplierNcr(item.id)}>Delete</button></span>
                </div>
              ))
            ) : (
              <div className="empty-state ncr-empty">还没有 Supplier NCR。上方录入厂家物料问题后会显示在这里。</div>
            )}
          </div>
        </section>

        <section className="ncr-panel" hidden={activeWorkspace !== "ncr"}>
          <div className="panel-header">
            <div>
              <h2>Internal NCR</h2>
            </div>
          </div>
          <div className="form-grid internal-ncr-form">
            <label>
              NCR number
              <input value={internalNcrDraft.ncrNumber} onChange={(event) => setInternalNcrDraft({ ...internalNcrDraft, ncrNumber: event.target.value })} />
            </label>
            <label>
              Material info
              <input value={internalNcrDraft.materialInfo} onChange={(event) => setInternalNcrDraft({ ...internalNcrDraft, materialInfo: event.target.value })} />
            </label>
            <label>
              Manufacturer
              <input value={internalNcrDraft.manufacturer} onChange={(event) => setInternalNcrDraft({ ...internalNcrDraft, manufacturer: event.target.value })} />
            </label>
            <label>
              Quantity
              <input type="number" value={internalNcrDraft.qty} onChange={(event) => setInternalNcrDraft({ ...internalNcrDraft, qty: Number(event.target.value) })} />
            </label>
            <label>
              Cost
              <input type="number" value={internalNcrDraft.cost} onChange={(event) => setInternalNcrDraft({ ...internalNcrDraft, cost: Number(event.target.value) })} />
            </label>
            <label>
              ETA
              <input type="date" value={internalNcrDraft.eta} onChange={(event) => setInternalNcrDraft({ ...internalNcrDraft, eta: event.target.value })} />
            </label>
            <label className="toggle-label">
              <input checked={internalNcrDraft.goodsReceived} type="checkbox" onChange={(event) => setInternalNcrDraft({ ...internalNcrDraft, goodsReceived: event.target.checked })} />
              Goods received
            </label>
            <div className="form-actions">
              <button className="primary-action" onClick={saveInternalNcr}>Save internal NCR</button>
            </div>
          </div>
          <div className="ncr-table">
            <div className="ncr-row internal-ncr-row ncr-head">
              <span>NCR number</span>
              <span>Material info</span>
              <span>Manufacturer</span>
              <span>Qty</span>
              <span>Cost</span>
              <span>ETA</span>
              <span>Receipt</span>
              <span>Actions</span>
            </div>
            {projectInternalNcrs.length ? (
              projectInternalNcrs.map((item) => (
                <div className="ncr-row internal-ncr-row" key={item.id}>
                  <span><strong>{item.ncrNumber}</strong></span>
                  <span>{item.materialInfo}</span>
                  <span>{item.manufacturer || "-"}</span>
                  <span>{item.qty.toLocaleString()}</span>
                  <span>{formatMoney(item.cost)}</span>
                  <span>{formatShortDate(item.eta)}</span>
                  <span><i className={item.goodsReceived ? "check yes" : "check no"}>{item.goodsReceived ? "Received" : "Open"}</i></span>
                  <span className="row-actions"><button onClick={() => deleteInternalNcr(item.id)}>Delete</button></span>
                </div>
              ))
            ) : (
              <div className="empty-state ncr-empty">还没有 Internal NCR。录入补料或重新下单后会显示 ETA、成本和收货状态。</div>
            )}
          </div>
        </section>

        <section className="zone-title ecn-zone-title" aria-label="ECN section" hidden={activeWorkspace !== "ecn"}>
          <h2>ECN</h2>
        </section>

        <section className="ecn-panel" hidden={activeWorkspace !== "ecn"}>
          <div className="panel-header">
            <div>
              <h2>ECN Record</h2>
            </div>
            <div className="filters smart-filters">
              <select aria-label="ECN project filter" value={ecnProjectFilter} onChange={(event) => setEcnProjectFilter(event.target.value)}>
                <option value="All">All projects</option>
                {projectList.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
              <select aria-label="ECN status filter" value={ecnStatusFilter} onChange={(event) => setEcnStatusFilter(event.target.value)}>
                <option value="All">All status</option>
                <option>Open</option>
                <option>Under review</option>
                <option>Approved</option>
                <option>Implemented</option>
                <option>Closed</option>
              </select>
              <select aria-label="ECN impact filter" value={ecnImpactFilter} onChange={(event) => setEcnImpactFilter(event.target.value)}>
                <option value="All">All impact</option>
                <option>No impact</option>
                <option>Cost impact</option>
                <option>Schedule impact</option>
                <option>Cost & schedule impact</option>
              </select>
              <select aria-label="ECN sort" value={ecnSort} onChange={(event) => setEcnSort(event.target.value)}>
                <option value="weekDesc">Newest week first</option>
                <option value="weekAsc">Oldest week first</option>
                <option value="costDesc">Highest cost first</option>
                <option value="status">Sort by status</option>
                <option value="project">Sort by project</option>
              </select>
            </div>
          </div>
          <div className="form-grid ecn-form">
            <label>
              ECN number
              <input value={ecnDraft.ecnNumber} onChange={(event) => setEcnDraft({ ...ecnDraft, ecnNumber: event.target.value })} />
            </label>
            <label>
              Title
              <input value={ecnDraft.title} onChange={(event) => setEcnDraft({ ...ecnDraft, title: event.target.value })} />
            </label>
            <label>
              Category
              <input value={ecnDraft.category} onChange={(event) => setEcnDraft({ ...ecnDraft, category: event.target.value })} />
            </label>
            <label>
              Manufacturer
              <input value={ecnDraft.manufacturer} onChange={(event) => setEcnDraft({ ...ecnDraft, manufacturer: event.target.value })} />
            </label>
            <label>
              Status
              <select value={ecnDraft.status} onChange={(event) => setEcnDraft({ ...ecnDraft, status: event.target.value })}>
                <option>Open</option>
                <option>Under review</option>
                <option>Approved</option>
                <option>Implemented</option>
                <option>Closed</option>
              </select>
            </label>
            <label>
              Impact
              <select value={ecnDraft.impact} onChange={(event) => setEcnDraft({ ...ecnDraft, impact: event.target.value })}>
                <option>No impact</option>
                <option>Cost impact</option>
                <option>Schedule impact</option>
                <option>Cost & schedule impact</option>
              </select>
            </label>
            <label>
              Effective week
              <input type="date" value={formatInputMidweekDate(ecnDraft.effectiveWeek)} onChange={(event) => setEcnDraft({ ...ecnDraft, effectiveWeek: dateInputToMidweekDate(event.target.value, ecnDraft.effectiveWeek) })} />
            </label>
            <label>
              Cost impact
              <input type="number" value={ecnDraft.costImpact} onChange={(event) => setEcnDraft({ ...ecnDraft, costImpact: Number(event.target.value) })} />
            </label>
            <label className="wide-label">
              Notes
              <input value={ecnDraft.notes} onChange={(event) => setEcnDraft({ ...ecnDraft, notes: event.target.value })} />
            </label>
            <div className="form-actions">
              <button className="primary-action" onClick={saveEcn}>Save ECN</button>
            </div>
          </div>
          <div className="ecn-table">
            <div className="ecn-row ecn-head">
              <span>Project</span>
              <span>ECN</span>
              <span>Category / Manufacturer</span>
              <span>Status</span>
              <span>Impact</span>
              <span>Effective week</span>
              <span>Cost impact</span>
              <span>Notes</span>
              <span>Actions</span>
            </div>
            {ecnVisibleRows.length ? (
              ecnVisibleRows.map((item) => (
                <div className="ecn-row" key={item.id}>
                  <span>
                    <strong>{item.projectCode}</strong>
                    <small>{item.projectName}</small>
                  </span>
                  <span>
                    <strong>{item.ecnNumber}</strong>
                    <small>{item.title}</small>
                  </span>
                  <span>
                    <strong>{item.category || "-"}</strong>
                    <small>{item.manufacturer || "-"}</small>
                  </span>
                  <span><i className={item.status === "Closed" || item.status === "Implemented" ? "check yes" : "check no"}>{item.status}</i></span>
                  <span>{item.impact}</span>
                  <span>{formatScheduleWeek(item.effectiveWeek)}</span>
                  <span>{formatMoney(item.costImpact)}</span>
                  <span>{item.notes || "-"}</span>
                  <span className="row-actions"><button onClick={() => deleteEcn(item.id)}>Delete</button></span>
                </div>
              ))
            ) : (
              <div className="empty-state ecn-empty">No ECN records match the current filters.</div>
            )}
          </div>
        </section>

        <section className="risk-strip" hidden={activeWorkspace !== "delivery"}>
          <div className="section-title">
            <h2>Main Risk Deliveries</h2>
          </div>
          <div className="risk-cards">
            {projectRows.length ? (
              (riskRows.length ? riskRows : projectRows.slice(0, 2)).map((row) => (
                <article className="risk-card" key={row.id}>
                  <div>
                    <i className={`status ${row.risk.tone}`}>{row.risk.level}</i>
                    <strong>{getDeliveryCategory(row)}</strong>
                    <small>{row.po} · Batch {row.batch} · {row.manufacturer}</small>
                  </div>
                  <dl>
                    <div>
                      <dt>{usesSupplierEta(row) ? "Supplier ETA" : "Pickup"}</dt>
                      <dd>{formatScheduleWeek(row.supplierSchedule)}</dd>
                    </div>
                    <div>
                      <dt>Need</dt>
                      <dd>{formatScheduleWeek(row.productionNeed)}</dd>
                    </div>
                    <div>
                      <dt>ETA</dt>
                      <dd>{formatScheduleWeek(row.risk.theoreticalDelivery)}</dd>
                    </div>
                    <div>
                      <dt>Cost</dt>
                      <dd>{formatMoney(getProjectedTotalCost(row, bomItems, projectRows))}</dd>
                    </div>
                  </dl>
                </article>
              ))
            ) : (
              <div className="empty-state">这个项目还没有 delivery。点击 Add delivery 录入第一条 PO / batch schedule。</div>
            )}
          </div>
        </section>

        <section className="gantt-panel" hidden={activeWorkspace !== "delivery"}>
          <div className="section-title">
            <h2>Delivery Gantt</h2>
          </div>
          <div className="gantt-scale">
            <span>{formatShortDate(range.min)}</span>
            <span>{formatShortDate(range.max)}</span>
          </div>
          <div className="gantt-list">
            {projectRows.length ? (
              projectRows.map((row) => {
                const left = getPosition(row.poDate, range.min, range.totalDays);
                const supplier = getPosition(row.supplierSchedule, range.min, range.totalDays);
                const theoretical = getPosition(row.risk.theoreticalDelivery, range.min, range.totalDays);
                const need = getPosition(row.productionNeed, range.min, range.totalDays);
                const width = Math.max(3, supplier - left);
                return (
                  <div className="gantt-row" key={row.id}>
                    <div className="gantt-label">
                      <strong>{getDeliveryCategory(row)}</strong>
                      <small>{row.po} · {row.batch} · {row.category}</small>
                    </div>
                    <div className="gantt-track">
                      <span className={`gantt-bar ${row.risk.score >= 3 ? "bar-risk" : "bar-ok"}`} style={{ left: `${left}%`, width: `${width}%` }} />
                      <i className="marker marker-theory" style={{ left: `${theoretical}%` }} title="Estimated arrival" />
                      <i className="marker marker-need" style={{ left: `${need}%` }} title="Production need" />
                      <em style={{ left: `${supplier}%` }}>{usesSupplierEta(row) ? "ETA" : formatScheduleWeek(row.supplierSchedule)}</em>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="empty-state">Add delivery to show PO date, pickup date, estimated arrival, and production need.</div>
            )}
          </div>
          <div className="gantt-legend">
            <span><i className="legend-bar" /> PO to pickup / supplier ETA</span>
            <span><i className="legend-theory" /> Estimated arrival</span>
            <span><i className="legend-need" /> Production need</span>
          </div>
        </section>

        <section className="schedule-panel" hidden={activeWorkspace !== "delivery"}>
          <div className="panel-header">
            <div>
              <h2>Delivery Schedule Detail</h2>
            </div>
            <div className="filters">
              <input
                aria-label="Search delivery"
                placeholder="Search category / PO / vendor"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <select
                aria-label="Filter category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                {categories.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="schedule-table" role="table" aria-label="IM delivery schedule detail">
            <div className="schedule-row schedule-head" role="row">
              <span>Category</span>
              <span>PO / Batch</span>
              <span>Vendor</span>
              <span>Logistics / Forwarder</span>
              <span>Invoices / Receipt</span>
              <span>PO / OC</span>
              <span>Pickup / ETA for MDMP</span>
              <span>Actual ETA</span>
              <span>Production / Receive</span>
              <span>Risk</span>
              <span>Actions</span>
            </div>
            {filteredRows.length ? (
              filteredRows.map((row) => (
                <div className="schedule-row" role="row" key={row.id}>
                  <span>
                    <strong>{getDeliveryCategory(row)}</strong>
                    <small>{[getLegacyMaterialNote(row), `Tower qty ${row.qty.toLocaleString()}`].filter(Boolean).join(" · ")}</small>
                  </span>
                  <span>
                    <strong>{row.po}</strong>
                    <small>Batch {row.batch}</small>
                  </span>
                  <span>
                    <strong>{row.manufacturer}</strong>
                    <small>{row.vendorCode}</small>
                  </span>
                  <span>
                    <strong>{row.deliveryWay}</strong>
                    <small>{row.forwarder} · {row.incoterms}</small>
                    <small>{row.manufacturerLocation || getOriginCountry(row)} · {getRouteStage(row)}</small>
                  </span>
                  <span>
                    <strong>{row.paymentTerms}</strong>
                    <small className="checkline">
                      <i className={usesSupplierEta(row) || row.freightFeeReceived ? "check yes" : "check no"}>{usesSupplierEta(row) ? getIncotermMode(row) : "Freight inv."}</i>
                      {getIncotermMode(row) !== "DDP" ? <i className={row.tariffInvoiceReceived ? "check yes" : "check no"}>Tariff inv.</i> : null}
                      <i className={row.manufacturerInvoiceReceived ? "check yes" : "check no"}>Vendor inv.</i>
                      <i className={row.goodsReceived ? "check yes" : "check no"}>Goods</i>
                    </small>
                    <small>{[row.freightInvoiceNumber ? `Freight #${row.freightInvoiceNumber}` : "", row.tariffInvoiceNumber ? `Tariff #${row.tariffInvoiceNumber}` : ""].filter(Boolean).join(" · ") || "No freight/tariff invoice #"}</small>
                  </span>
                  <span>
                    <strong>{formatScheduleWeek(row.poDate)}</strong>
                    <small>OC {formatScheduleWeek(row.orderConfirmation)}</small>
                  </span>
                  <span>
                    <strong>{formatScheduleWeek(row.supplierSchedule)}</strong>
                    <small>ETA for MDMP {formatScheduleWeek(row.risk.theoreticalDelivery)}</small>
                  </span>
                  <span>
                    <strong>{row.actualEta ? formatScheduleWeek(row.actualEta) : "-"}</strong>
                    <small>Manual ETA</small>
                  </span>
                  <span>
                    <strong>{formatScheduleWeek(row.productionNeed)}</strong>
                    <small>{row.actualArrival ? `Actual ${formatShortDate(row.actualArrival)} / ${formatScheduleWeek(row.actualArrival)}` : "No actual receive date"}</small>
                  </span>
                  <span>
                    <i className={`status ${row.risk.tone}`}>{row.risk.level}</i>
                  </span>
                  <span className="row-actions">
                    <button onClick={() => startEditDelivery(row)}>Edit</button>
                    <button onClick={() => deleteDelivery(row.id)}>Delete</button>
                  </span>
                </div>
              ))
            ) : (
              <div className="empty-state table-empty">没有符合当前项目/筛选条件的 delivery。可以点击 Add delivery 新增，或调整搜索和 category。</div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
