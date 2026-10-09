export type Project = {
  id: string;
  name: string;
  code: string;
  phase: string;
  productionWindow: string;
  plant: string;
  budget: number;
  status?: string;
};

export type Delivery = {
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

export type BomItem = {
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

export type SupplierNcr = {
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

export type InternalNcr = {
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

export type EcnRecord = {
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

export type TodoItem = {
  id: string;
  projectId: string;
  title: string;
  owner: string;
  mode: string;
  priority: string;
  dueWeek: string;
  done: boolean;
};

export type SupplierBatchStatus = "Draft" | "Request sent" | "Supplier requested" | "Approved" | "Rejected";

export type SupplierScheduleBatch = {
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

export type SupplierMaterialAllocation = {
  poLineId: string;
  batchId: string;
  qty: number;
};

export type SupplierSchedulePlan = {
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

export type PurchasePoLine = {
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

export type WorkspaceTab = "overview" | "delivery" | "supplier" | "logistics" | "bom" | "cashflow" | "ncr" | "ecn" | "mcip";

export type CashflowForecast = {
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

export type DeliveryEntryMode = "single" | "bulk";

export type BulkDeliveryBatch = {
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

export type EmailCell = [value: string | number, width: number, align?: "left" | "right"];
