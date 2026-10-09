import { formatScheduleWeek } from "./dates";
import { getDeliveryCategory } from "./delivery";
import type { Delivery, EmailCell, Project, PurchasePoLine, SupplierBatchStatus, SupplierMaterialAllocation, SupplierScheduleBatch, SupplierSchedulePlan } from "./types";

export function getProjectSubjectName(project: Project) {
  const plantCode = project.plant.match(/\b\d{8}\b/)?.[0];
  return plantCode ? `Vestas ${plantCode} ${project.name}` : project.name;
}

export function cleanSubjectSegment(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function buildSupplierEmailSubject(project: Project, po: string, manufacturer = "", category = "") {
  return [
    `PO_${cleanSubjectSegment(po)}`,
    cleanSubjectSegment(manufacturer),
    cleanSubjectSegment(getProjectSubjectName(project)),
    cleanSubjectSegment(category),
  ].filter(Boolean).join("_");
}

export function buildSupplierEmailTemplate() {
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

export function formatEmailCell(value: string | number, width: number, align: "left" | "right" = "left") {
  const text = String(value || "-").replace(/\s+/g, " ").trim();
  const cleanText = text.length > width ? `${text.slice(0, Math.max(0, width - 3))}...` : text;
  return align === "right" ? cleanText.padStart(width, " ") : cleanText.padEnd(width, " ");
}

export function renderEmailTableRow(cells: EmailCell[]) {
  return cells.map(([value, width, align = "left"]) => formatEmailCell(value, width, align)).join("  ");
}

export function getDefaultMaterialAllocationQty(line: PurchasePoLine, batch: SupplierScheduleBatch) {
  return Math.round((line.poQty * Number(batch.percentage || 0) / 100) * 100) / 100;
}

export function getMaterialAllocationQty(plan: SupplierSchedulePlan, line: PurchasePoLine, batch: SupplierScheduleBatch) {
  const allocation = plan.materialAllocations?.find((item) => item.poLineId === line.id && item.batchId === batch.id);
  return allocation ? Number(allocation.qty || 0) : getDefaultMaterialAllocationQty(line, batch);
}

export function createSupplierMaterialAllocations(poLines: PurchasePoLine[], batches: SupplierScheduleBatch[], existing: SupplierMaterialAllocation[] = []) {
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

export function createSupplierSchedulePlan(project: Project, po: string, rows: Delivery[], poLines: PurchasePoLine[] = []): SupplierSchedulePlan {
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

export function renderSupplierBatchTable(plan: SupplierSchedulePlan) {
  if (!plan.batches.length) return "No batch lines have been created for this PO yet.";
  const headers: EmailCell[] = [
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

export function renderSupplierEmail(plan: SupplierSchedulePlan, project: Project) {
  return plan.body
    .replaceAll("{{projectName}}", project.name)
    .replaceAll("{{po}}", plan.po)
    .replaceAll("{{manufacturer}}", plan.manufacturer)
    .replaceAll("{{category}}", plan.category)
    .replaceAll("{{material}}", plan.material)
    .replaceAll("{{incoterms}}", plan.incoterms)
    .replaceAll("{{batchTable}}", renderSupplierBatchTable(plan));
}

export function renderPickupReminderEmail(plan: SupplierSchedulePlan, project: Project) {
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

export function renderForwarderNotice(plan: SupplierSchedulePlan, project: Project) {
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
