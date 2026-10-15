import type { ChangeEvent } from "react";
import * as XLSX from "xlsx";
import { parseBomCsv, parseBomWorkbook } from "@/lib/bom-import";
import { deliveryCsvFields, escapeCsv, parseDeliveryCsv, parseNcrCsv } from "@/lib/csv";
import { formatScheduleWeek, normalizeScheduleValue } from "@/lib/dates";
import { getDeliveryCategory, getIncotermMode, usesSupplierEta } from "@/lib/delivery";
import { createBulkDeliveryBatches, createDeliveryDraft, createEcnDraft, createInternalNcrDraft, createProjectDraft, createSupplierNcrDraft, createTodoDraft } from "@/lib/drafts";
import { getProjectStatus } from "@/lib/format";
import { createId } from "@/lib/ids";
import { parsePoDetailWorkbook } from "@/lib/po-import";
import { buildSupplierEmailSubject, buildSupplierEmailTemplate, createSupplierMaterialAllocations, createSupplierSchedulePlan, getDefaultMaterialAllocationQty, getMaterialAllocationQty } from "@/lib/supplier-plan";
import type { Delivery, DeliveryEntryMode, Project, ProjectScope, SupplierBatchStatus, SupplierScheduleBatch, SupplierSchedulePlan } from "@/lib/types";
import type { WorkbenchDerived } from "./useWorkbenchDerived";
import type { WorkspaceState } from "./useWorkspaceState";

export type WorkbenchActions = ReturnType<typeof useWorkbenchActions>;

export type WorkbenchActionInput = WorkspaceState & WorkbenchDerived;

export function useWorkbenchActions(input: WorkbenchActionInput) {
  const {
    projectList, setProjectList, deliveryList, setDeliveryList, setBomItems, setSupplierNcrs,
    setInternalNcrs, setEcnRecords, setTodoItems, setSupplierPlans, setPurchasePoLines, activeProjectId,
    setActiveProjectId, setCategory, setQuery, setSupplierPoFilter, setShowProjectForm,
    setShowDeliveryForm, setDeliveryEntryMode, editingDeliveryId, setEditingDeliveryId, editingProjectId,
    setEditingProjectId, projectDraft, setProjectDraft, deliveryDraft, setDeliveryDraft,
    bulkDeliveryBatches, setBulkDeliveryBatches, supplierNcrDraft, setSupplierNcrDraft, internalNcrDraft,
    setInternalNcrDraft, ecnDraft, setEcnDraft, todoDraft, setTodoDraft, activeProject, activeSupplierPo,
    supplierPoRows, supplierPoLines, supplierPlan, supplierEmailText,
    projectScope, setProjectScope, setDeliveryProjectFilter, setReportProjectId, setCashflowProjectId,
    setMcipProjectFilter, setNcrProjectFilter, setEcnProjectFilter,
  } = input;

  /** Sets the project for every section: "all" for the whole portfolio, or one project. */
  function selectProject(scope: ProjectScope) {
    const filter = scope === "all" ? "All" : scope;
    setProjectScope(scope);
    setDeliveryProjectFilter(filter);
    setReportProjectId(filter);
    setCashflowProjectId(filter);
    setMcipProjectFilter(filter);
    setNcrProjectFilter(filter);
    setEcnProjectFilter(filter);
    const project = scope === "all" ? null : projectList.find((item) => item.id === scope);
    if (!project) return;
    setActiveProjectId(project.id);
    setSupplierNcrDraft(createSupplierNcrDraft(project));
    setInternalNcrDraft(createInternalNcrDraft(project.id));
    setEcnDraft(createEcnDraft(project.id));
    setTodoDraft(createTodoDraft(project.id));
    setSupplierPoFilter("");
    setCategory("All");
    setQuery("");
  }

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
    setProjectScope(nextProject.id);
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
    if (projectScope === id) selectProject("all");
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
    link.download = "delivery-schedule.csv";
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
      id: createId(`supplier-batch-${supplierPlan.projectId}-${supplierPlan.po}-B${batchNumber}`),
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

  return {
    selectProject, saveProject, startAddProject, startEditProject, saveDelivery, saveBulkDeliveries, startAddDelivery,
    changeDeliveryEntryMode, startEditDelivery, deleteDelivery, deleteProject, exportCsv, importCsv,
    importBomFile, importNcrCsv, clearProjectBom, addTodoItem, toggleTodoItem, deleteTodoItem,
    saveSupplierNcr, deleteSupplierNcr, saveInternalNcr, deleteInternalNcr, saveEcn, deleteEcn,
    updateSupplierPlan, updateSupplierBatch, updateSupplierMaterialAllocation,
    resetSupplierMaterialAllocations, exportSupplierMaterialAllocations, applyCswindSupplierTemplate,
    addSupplierBatch, deleteSupplierBatch, syncSupplierPlanFromDelivery, copyText, importPoDetailFile,
    openSupplierMailDraft,
  };
}
