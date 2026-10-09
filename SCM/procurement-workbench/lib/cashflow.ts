import { addDays, addMonths, addWeeks, formatInputDate, getMonthKey, monthKeyToDate, toMidweekDate } from "./dates";
import { usesSupplierEta } from "./delivery";
import type { Delivery } from "./types";

export function getPaymentTermDays(paymentTerms: string) {
  const cleanTerms = paymentTerms.trim();
  const netMatch = cleanTerms.match(/\b(?:net|n)\s*(\d{1,3})\b/i);
  if (netMatch) return Number(netMatch[1]);
  const dayMatch = cleanTerms.match(/\b(\d{1,3})\s*(?:day|days)\b/i);
  if (dayMatch) return Number(dayMatch[1]);
  if (/deposit|advance|prepay|before ship|before shipment|due upon receipt|cod/i.test(cleanTerms)) return 0;
  return 0;
}

export function getForecastInvoiceDate(delivery: Delivery) {
  const baseSource = usesSupplierEta(delivery) ? delivery.actualArrival || delivery.actualEta || delivery.supplierSchedule : delivery.supplierSchedule;
  const baseDate = toMidweekDate(baseSource);
  const todayWeek = toMidweekDate(new Date());
  return baseDate < todayWeek ? addWeeks(formatInputDate(baseDate), 2) : baseDate;
}

export function getForecastDueDate(delivery: Delivery) {
  return addDays(getForecastInvoiceDate(delivery), getPaymentTermDays(delivery.paymentTerms));
}

export function getCashflowMonthKeys(monthKeys: string[]) {
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

export function getCashflowX(index: number, count: number, width: number) {
  const left = 58;
  const right = 20;
  const usableWidth = width - left - right;
  return left + (count <= 1 ? usableWidth / 2 : (index / (count - 1)) * usableWidth);
}

export function getCashflowY(value: number, maxValue: number, height: number) {
  const top = 20;
  const bottom = 38;
  const usableHeight = height - top - bottom;
  return top + usableHeight - (maxValue > 0 ? (value / maxValue) * usableHeight : 0);
}

export function getCashflowLinePath(values: number[], maxValue: number, width: number, height: number) {
  return values
    .map((value, index) => `${index === 0 ? "M" : "L"} ${getCashflowX(index, values.length, width).toFixed(1)} ${getCashflowY(value, maxValue, height).toFixed(1)}`)
    .join(" ");
}
