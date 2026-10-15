// ISO-8601 weeks as plain values. MPP plans are weekly, so all planning math
// (need week, order-by week, "weeks from now") happens on week indexes.

export type IsoWeek = { year: number; week: number };

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/** Monday of the ISO week, at UTC midnight. */
export function isoWeekMonday({ year, week }: IsoWeek): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Weekday = (jan4.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(Date.UTC(year, 0, 4 - jan4Weekday + (week - 1) * 7));
}

export function isoWeekOf(date: Date): IsoWeek {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - weekday + 3); // Thursday decides the ISO year
  const year = day.getUTCFullYear();
  const week = 1 + Math.round((day.getTime() - isoWeekMonday({ year, week: 1 }).getTime()) / MS_PER_WEEK);
  return { year, week };
}

/** Weeks in an ISO year: 52 or 53. */
export function weeksInYear(year: number): number {
  return isoWeekOf(new Date(Date.UTC(year, 11, 28))).week;
}

export function isValidWeek({ year, week }: IsoWeek): boolean {
  return Number.isInteger(year) && Number.isInteger(week) && week >= 1 && week <= weeksInYear(year);
}

/** Sequential index (weeks since an epoch Monday), so differences are plain subtraction. */
export function weekIndex(week: IsoWeek): number {
  return Math.round(isoWeekMonday(week).getTime() / MS_PER_WEEK);
}

export function weekFromIndex(index: number): IsoWeek {
  return isoWeekOf(new Date(index * MS_PER_WEEK));
}

export function addWeeksTo(week: IsoWeek, weeks: number): IsoWeek {
  return weekFromIndex(weekIndex(week) + weeks);
}

export function weeksBetween(from: IsoWeek, to: IsoWeek): number {
  return weekIndex(to) - weekIndex(from);
}

export function formatWeek({ year, week }: IsoWeek): string {
  return `${year}-W${String(week).padStart(2, "0")}`;
}
