export const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "2-digit",
  day: "2-digit",
});

export const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
});

export function toDate(date: string) {
  return new Date(`${date}T00:00:00`);
}

export function addWeeks(date: string, weeks: number) {
  const next = toDate(date);
  next.setDate(next.getDate() + weeks * 7);
  return next;
}

export function addDays(date: string | Date, days: number) {
  const next = typeof date === "string" ? toDate(date) : new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function daysBetween(left: string | Date, right: string | Date) {
  const start = typeof left === "string" ? toDate(left) : left;
  const end = typeof right === "string" ? toDate(right) : right;
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

export function formatShortDate(date: string | Date) {
  const value = typeof date === "string" ? toDate(date) : date;
  return dateFormatter.format(value);
}

export function formatInputDate(date: string | Date) {
  const value = typeof date === "string" ? toDate(date) : date;
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

export function formatInputWeek(date: string | Date) {
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

export function weekToMidweekDate(weekValue: string) {
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

export function formatInputMidweekDate(date: string | Date | null | undefined) {
  if (!date) return "";
  const normalizedDate = typeof date === "string" ? weekToMidweekDate(date) || date : formatInputDate(date);
  const value = typeof normalizedDate === "string" ? toDate(normalizedDate) : normalizedDate;
  if (Number.isNaN(value.getTime())) return "";
  return formatInputDate(toMidweekDate(value));
}

export function dateInputToMidweekDate(dateValue: string, fallback = "") {
  if (!dateValue) return fallback;
  const value = toDate(dateValue);
  if (Number.isNaN(value.getTime())) return fallback;
  return formatInputDate(toMidweekDate(value));
}

export function normalizeScheduleValue(value: string | undefined, fallback: string) {
  const cleanValue = (value || "").trim();
  if (!cleanValue) return fallback;
  return weekToMidweekDate(cleanValue) || cleanValue;
}

export function formatScheduleWeek(date: string | Date) {
  return formatInputWeek(date) || "-";
}

export function toMidweekDate(date: string | Date) {
  return toDate(weekToMidweekDate(formatInputWeek(date)));
}

export function formatDays(value: number | null) {
  return value === null ? "-" : `${Math.round(value)} days`;
}

export function getMonthKey(date: string | Date) {
  const value = typeof date === "string" ? toDate(date) : date;
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

export function getMonthLabel(date: string | Date) {
  const value = typeof date === "string" ? toDate(date) : date;
  return monthFormatter.format(value);
}

export function monthKeyToDate(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

export function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}
