import type { Project } from "./types";

export const moneyFormatter = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 0,
  style: "currency",
});

export const compactMoneyFormatter = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 1,
  notation: "compact",
  style: "currency",
});

export function formatMoney(value: number) {
  return moneyFormatter.format(value);
}

export function formatCompactMoney(value: number) {
  return compactMoneyFormatter.format(value);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

export function formatPercent(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, style: "percent" }).format(value);
}

export function getProjectStatus(project: Pick<Project, "status">) {
  return project.status || "Active";
}

export function getStatusTone(status: string) {
  const value = status.toLowerCase();
  if (value.includes("complete") || value.includes("closed") || value.includes("implemented") || value.includes("received")) return "done";
  if (value.includes("watch") || value.includes("review") || value.includes("impact")) return "watch";
  if (value.includes("hold") || value.includes("open") || value.includes("risk")) return "risk";
  if (value.includes("planning") || value.includes("approved")) return "planning";
  return "active";
}

export function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value * 100));
}

export function average(values: number[]) {
  const cleanValues = values.filter((value) => Number.isFinite(value));
  if (!cleanValues.length) return null;
  return cleanValues.reduce((sum, value) => sum + value, 0) / cleanValues.length;
}
