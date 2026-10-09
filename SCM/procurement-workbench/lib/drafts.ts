import { formatInputWeek } from "./dates";
import { createId } from "./ids";
import type { BulkDeliveryBatch, Delivery, EcnRecord, InternalNcr, Project, SupplierNcr, TodoItem } from "./types";

export function createProjectDraft(): Project {
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

export function createDeliveryDraft(projectId: string): Delivery {
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

export function createBulkDeliveryBatch(index: number, delivery: Delivery): BulkDeliveryBatch {
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

export function createBulkDeliveryBatches(delivery: Delivery, count = 3) {
  return Array.from({ length: count }, (_, index) => createBulkDeliveryBatch(index, delivery));
}

export function createSupplierNcrDraft(project: Project): SupplierNcr {
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

export function createInternalNcrDraft(projectId: string): InternalNcr {
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

export function createEcnDraft(projectId: string): EcnRecord {
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

export function createTodoDraft(projectId: string): TodoItem {
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
