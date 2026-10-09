import { useMemo } from "react";
import { getCashflowMonthKeys, getForecastDueDate, getForecastInvoiceDate, getPaymentTermDays } from "@/lib/cashflow";
import { daysBetween, getMonthKey, getMonthLabel, monthKeyToDate, toDate } from "@/lib/dates";
import { getDeliveryCategory, getDeliveryStatusLabel, getEstimatedArrival, getIncotermMode, getMaterialCost, getOriginCountry, getPortName, getProjectedFreightFee, getProjectedTariff, getRange, getRisk, usesSupplierEta } from "@/lib/delivery";
import { average, clampPercent, getProjectStatus } from "@/lib/format";
import { createSupplierSchedulePlan, renderForwarderNotice, renderPickupReminderEmail, renderSupplierEmail } from "@/lib/supplier-plan";
import type { BomItem, CashflowForecast } from "@/lib/types";
import type { WorkspaceState } from "./useWorkspaceState";

export type WorkbenchDerived = ReturnType<typeof useWorkbenchDerived>;

export function useWorkbenchDerived(state: WorkspaceState) {
  const {
    projectList, deliveryList, bomItems, supplierNcrs, internalNcrs, ecnRecords, todoItems,
    supplierPlans, purchasePoLines, activeProjectId, category, query, reportProjectId, reportWindow,
    cashflowProjectId, deliveryProjectFilter, deliveryManufacturerFilter, deliveryCategoryFilter,
    deliveryPoFilter, deliveryStatusFilter, deliverySearch, deliverySort, supplierPoFilter,
    mcipProjectFilter, mcipStatusFilter, mcipSort, ncrProjectFilter, ncrTypeFilter, ncrStatusFilter,
    ncrSort, ecnProjectFilter, ecnStatusFilter, ecnImpactFilter, ecnSort, bomManufacturerFilter,
    bomCategoryFilter, bomSearch, deliveryDraft,
  } = state;

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

  return {
    rowsWithRisk, activeProject, projectRows, projectPurchasePoLines, supplierPoOptions,
    activeSupplierPo, supplierPoRows, supplierPoLines, savedSupplierPlan, defaultSupplierPlan,
    supplierPlan, supplierEmailText, pickupReminderText, forwarderNoticeText, supplierPlanApprovedCount,
    supplierPlanDocsReadyCount, supplierPlanBlReadyCount, supplierSplitTotal, supplierPoLineTotalQty,
    supplierPoLineTotalAmount, projectTowerQty, projectBomItems, projectPurchasingBomItems,
    projectInternalBomItems, bomManufacturers, bomCategories, visiblePurchasingBomItems, getBomLineQty,
    getBomLineAmount, bomVisibleTotalQty, bomVisibleTotalAmount, projectSupplierNcrs,
    projectInternalNcrs, todoPriorityRank, projectTodoItems, openTodoCount, ecnVisibleRows,
    activeProjectStatus, projectEcnRecords, categories, filteredRows, deliveryManufacturers,
    deliveryCategories, deliveryPos, totalDeliveryRows, totalDeliveryRiskCount, totalDeliveryOpenCount,
    totalDeliveryArrivedCount, riskRows, arrivedCount, internalNcrCost, projectMaterialCost,
    projectLogisticsCost, projectTariffCost, projectTotalCost, forecastBudgetUsed,
    forecastBudgetRemaining, projectBudgetUsedPercent, projectBudgetRemainingPercent,
    projectBudgetUsedDisplay, deliveryCompletePercent, deliveryRiskPercent, openDeliveryCount,
    costMixItems, costMixTotal, costMixStops, openBatchCount, range, deliveryDraftUsesSupplierEta,
    deliveryDraftIsDdp, bulkBatchRowClassName, reportRows, reportSupplierNcrs, reportInternalNcrs,
    ncrReportSummary, totalNcrPreviewRows, ncrVisibleRows, mcipProjectRows, mcipVisibleRows, mcipTotals,
    mcipTotalPerTowerDap, mcipTotalPerTowerDdp, mcipTotalPercent, freightTariffStats, oceanLeadStats,
    cashflowForecastRows, cashflowMonthKeys, cashflowProjectSeries, cashflowTotalValues,
    cashflowMonthlyRows, cashflowTotalAmount, cashflowNextPayMonth, cashflowChartWidth,
    cashflowChartHeight, cashflowMaxValue, cashflowPalette,
  };
}
