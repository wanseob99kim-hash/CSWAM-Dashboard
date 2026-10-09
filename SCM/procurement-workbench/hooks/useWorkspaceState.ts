import { useEffect, useState } from "react";
import { createBulkDeliveryBatches, createDeliveryDraft, createEcnDraft, createInternalNcrDraft, createProjectDraft, createSupplierNcrDraft, createTodoDraft } from "@/lib/drafts";
import { defaultActiveProjectId, defaultBomItems, defaultDeliveries, defaultInternalNcrs, defaultProjects, defaultSupplierNcrs, defaultTodoItems } from "@/lib/seed-data";
import { loadWorkspace, saveWorkspace } from "@/lib/storage";
import type { BomItem, BulkDeliveryBatch, Delivery, DeliveryEntryMode, EcnRecord, InternalNcr, Project, PurchasePoLine, SupplierNcr, SupplierSchedulePlan, TodoItem, WorkspaceTab } from "@/lib/types";

export type WorkspaceState = ReturnType<typeof useWorkspaceState>;

export function useWorkspaceState() {
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
    const workspace = loadWorkspace(window.localStorage);
    // Hydrating from localStorage has to happen after mount so the server and first
    // client render match; these one-time updates are the intended sync.
    /* eslint-disable react-hooks/set-state-in-effect */
    setProjectList(workspace.projects);
    setActiveProjectId(workspace.activeProjectId);
    setDeliveryList(workspace.deliveries);
    setBomItems(workspace.bomItems);
    if (workspace.supplierNcrs) setSupplierNcrs(workspace.supplierNcrs);
    if (workspace.internalNcrs) setInternalNcrs(workspace.internalNcrs);
    if (workspace.ecnRecords) setEcnRecords(workspace.ecnRecords);
    if (workspace.todoItems) setTodoItems(workspace.todoItems);
    if (workspace.supplierPlans) setSupplierPlans(workspace.supplierPlans);
    if (workspace.purchasePoLines) setPurchasePoLines(workspace.purchasePoLines);
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveWorkspace(window.localStorage, {
      projects: projectList,
      deliveries: deliveryList,
      bomItems,
      supplierNcrs,
      internalNcrs,
      ecnRecords,
      todoItems,
      supplierPlans,
      purchasePoLines,
    });
  }, [bomItems, deliveryList, ecnRecords, hydrated, internalNcrs, projectList, purchasePoLines, supplierNcrs, supplierPlans, todoItems]);

  return {
    projectList, setProjectList, deliveryList, setDeliveryList, bomItems, setBomItems, supplierNcrs,
    setSupplierNcrs, internalNcrs, setInternalNcrs, ecnRecords, setEcnRecords, todoItems, setTodoItems,
    supplierPlans, setSupplierPlans, purchasePoLines, setPurchasePoLines, activeProjectId,
    setActiveProjectId, category, setCategory, query, setQuery, reportProjectId, setReportProjectId,
    reportWindow, setReportWindow, cashflowProjectId, setCashflowProjectId, deliveryProjectFilter,
    setDeliveryProjectFilter, deliveryManufacturerFilter, setDeliveryManufacturerFilter,
    deliveryCategoryFilter, setDeliveryCategoryFilter, deliveryPoFilter, setDeliveryPoFilter,
    deliveryStatusFilter, setDeliveryStatusFilter, deliverySearch, setDeliverySearch, deliverySort,
    setDeliverySort, supplierPoFilter, setSupplierPoFilter, mcipProjectFilter, setMcipProjectFilter,
    mcipStatusFilter, setMcipStatusFilter, mcipSort, setMcipSort, ncrProjectFilter, setNcrProjectFilter,
    ncrTypeFilter, setNcrTypeFilter, ncrStatusFilter, setNcrStatusFilter, ncrSort, setNcrSort,
    ecnProjectFilter, setEcnProjectFilter, ecnStatusFilter, setEcnStatusFilter, ecnImpactFilter,
    setEcnImpactFilter, ecnSort, setEcnSort, bomManufacturerFilter, setBomManufacturerFilter,
    bomCategoryFilter, setBomCategoryFilter, bomSearch, setBomSearch, activeWorkspace,
    setActiveWorkspace, hydrated, setHydrated, showProjectForm, setShowProjectForm, showDeliveryForm,
    setShowDeliveryForm, deliveryEntryMode, setDeliveryEntryMode, editingDeliveryId,
    setEditingDeliveryId, editingProjectId, setEditingProjectId, projectDraft, setProjectDraft,
    deliveryDraft, setDeliveryDraft, bulkDeliveryBatches, setBulkDeliveryBatches, supplierNcrDraft,
    setSupplierNcrDraft, internalNcrDraft, setInternalNcrDraft, ecnDraft, setEcnDraft, todoDraft,
    setTodoDraft,
  };
}
