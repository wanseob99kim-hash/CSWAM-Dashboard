import { addWeeks, daysBetween, toDate } from "./dates";
import type { BomItem, Delivery } from "./types";

export function getOriginCountry(delivery: Delivery) {
  const text = `${delivery.manufacturerLocation} ${delivery.incoterms} ${delivery.manufacturer} ${delivery.forwarder}`.toLowerCase();
  if (text.includes("shenzhen") || text.includes("dongguan") || text.includes("ningbo") || text.includes("china")) return "China";
  if (text.includes("los angeles") || text.includes("usa") || text.includes("plant")) return "USA";
  if (text.includes("germany") || text.includes("hamburg")) return "Germany";
  if (text.includes("mexico")) return "Mexico";
  return "TBD";
}

export function getRouteStage(delivery: Delivery) {
  if (delivery.arrivedPueblo || delivery.goodsReceived) return "Arrived Pueblo";
  if (delivery.customsCleared) return "Customs cleared";
  return "In transit";
}

export function getPortName(delivery: Delivery) {
  const text = delivery.incoterms.toLowerCase();
  if (text.includes("shenzhen")) return "Shenzhen";
  if (text.includes("dongguan")) return "Dongguan";
  if (text.includes("ningbo")) return "Ningbo";
  if (text.includes("los angeles")) return "Los Angeles";
  if (text.includes("plant")) return "Plant";
  return "TBD port";
}

export function getIncotermMode(delivery: Pick<Delivery, "incoterms">) {
  const value = delivery.incoterms.trim().toUpperCase();
  if (value.startsWith("DAP")) return "DAP";
  if (value.startsWith("DDP")) return "DDP";
  if (value.startsWith("EXW")) return "EXW";
  if (value.startsWith("FCA")) return "FCA";
  return "Other";
}

export function usesSupplierEta(delivery: Pick<Delivery, "incoterms">) {
  return ["DAP", "DDP"].includes(getIncotermMode(delivery));
}

export function getDeliveryCategory(delivery: Pick<Delivery, "category" | "material">) {
  const category = (delivery.category || "").trim();
  const material = (delivery.material || "").trim();
  return category || material || "Uncategorized";
}

export function getLegacyMaterialNote(delivery: Pick<Delivery, "category" | "material">) {
  const category = (delivery.category || "").trim();
  const material = (delivery.material || "").trim();
  return material && material !== category ? material : "";
}

export function getEstimatedArrival(delivery: Pick<Delivery, "incoterms" | "leadTimeWeeks" | "supplierSchedule">) {
  return usesSupplierEta(delivery) ? toDate(delivery.supplierSchedule) : addWeeks(delivery.supplierSchedule, delivery.leadTimeWeeks || 8);
}

export function getBomUnitCost(bomItems: BomItem[], projectId: string) {
  return bomItems
    .filter((item) => item.projectId === projectId && (item.source ?? "purchasing") === "purchasing")
    .reduce((sum, item) => sum + item.qtyPerTower * item.unitCost, 0);
}

export function getMaterialCost(delivery: Delivery, bomItems: BomItem[]) {
  const bomUnitCost = getBomUnitCost(bomItems, delivery.projectId);
  return bomUnitCost > 0 ? bomUnitCost * delivery.qty : delivery.materialCost;
}

export function getFreightFee(delivery: Delivery) {
  return usesSupplierEta(delivery) ? 0 : delivery.freightFee;
}

export function hasActualLogistics(delivery: Delivery) {
  return delivery.goodsReceived || delivery.freightFeeReceived || !!delivery.actualArrival || !!delivery.arrivedPueblo;
}

export function canAutoProjectLogistics(delivery: Delivery) {
  return delivery.deliveryWay.trim().toLowerCase() !== "air";
}

export function getPeerLogisticsRate(delivery: Delivery, deliveries: Delivery[], field: "freightFee" | "tariff") {
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

export function getProjectedFreightFee(delivery: Delivery, deliveries: Delivery[]) {
  if (usesSupplierEta(delivery)) return 0;
  if (delivery.freightFee > 0 || delivery.freightFeeReceived) return getFreightFee(delivery);
  const peerRate = getPeerLogisticsRate(delivery, deliveries, "freightFee");
  return peerRate !== null && !hasActualLogistics(delivery) ? peerRate * delivery.qty : getFreightFee(delivery);
}

export function getProjectedTariff(delivery: Delivery, deliveries: Delivery[]) {
  if (getIncotermMode(delivery) === "DDP") return 0;
  if (delivery.tariff > 0) return delivery.tariff;
  const peerRate = getPeerLogisticsRate(delivery, deliveries, "tariff");
  return peerRate !== null && !hasActualLogistics(delivery) ? peerRate * delivery.qty : delivery.tariff;
}

export function getProjectedTotalCost(delivery: Delivery, bomItems: BomItem[], deliveries: Delivery[]) {
  return getMaterialCost(delivery, bomItems) + getProjectedFreightFee(delivery, deliveries) + getProjectedTariff(delivery, deliveries);
}

export function getDeliveryStatusLabel(delivery: Delivery & { risk?: ReturnType<typeof getRisk> }) {
  if (delivery.actualArrival || delivery.goodsReceived || delivery.arrivedPueblo) return "Arrived";
  if (delivery.risk && delivery.risk.score >= 3) return "Risk";
  if (delivery.customsCleared) return "Customs cleared";
  return "Open";
}

export function getRisk(delivery: Delivery) {
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

export function getRange(rows: Array<Delivery & { risk: ReturnType<typeof getRisk> }>) {
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

export function getPosition(date: string | Date, min: Date, totalDays: number) {
  return Math.min(100, Math.max(0, (daysBetween(min, date) / totalDays) * 100));
}
