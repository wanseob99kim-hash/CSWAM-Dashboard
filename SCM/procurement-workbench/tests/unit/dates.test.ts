import { describe, expect, test } from "vitest";
import {
  addWeeks,
  daysBetween,
  formatInputDate,
  formatInputWeek,
  getMonthKey,
  normalizeScheduleValue,
  toMidweekDate,
  weekToMidweekDate,
} from "../../lib/dates";

describe("ISO week helpers", () => {
  test("maps an ISO week to its Wednesday", () => {
    expect(weekToMidweekDate("2026-W41")).toBe("2026-10-07");
    expect(weekToMidweekDate("2026-41")).toBe("2026-10-07");
    expect(weekToMidweekDate("W41/2026")).toBe("2026-10-07");
    expect(weekToMidweekDate("41-2026")).toBe("2026-10-07");
  });

  test("rejects values that are not weeks", () => {
    expect(weekToMidweekDate("2026-10-07")).toBe("");
    expect(weekToMidweekDate("2026-W54")).toBe("");
    expect(weekToMidweekDate("2026-W0")).toBe("");
  });

  test("formats a date as its ISO week, including year boundaries", () => {
    expect(formatInputWeek("2026-10-09")).toBe("2026-W41");
    expect(formatInputWeek("2027-01-01")).toBe("2026-W53");
    expect(formatInputWeek("2025-12-29")).toBe("2026-W01");
  });

  test("snaps any date to the Wednesday of its week", () => {
    expect(formatInputDate(toMidweekDate("2026-10-05"))).toBe("2026-10-07");
    expect(formatInputDate(toMidweekDate("2026-10-11"))).toBe("2026-10-07");
  });
});

describe("date arithmetic", () => {
  test("counts whole days between dates", () => {
    expect(daysBetween("2026-10-01", "2026-10-09")).toBe(8);
    expect(daysBetween("2026-10-09", "2026-10-01")).toBe(-8);
  });

  test("adds weeks without mutating the input", () => {
    expect(formatInputDate(addWeeks("2026-10-01", 8))).toBe("2026-11-26");
  });

  test("builds month keys", () => {
    expect(getMonthKey("2026-01-31")).toBe("2026-01");
  });
});

describe("normalizeScheduleValue", () => {
  test("converts week input to its midweek date", () => {
    expect(normalizeScheduleValue("2026-W41", "fallback")).toBe("2026-10-07");
  });

  test("keeps plain dates and falls back on blanks", () => {
    expect(normalizeScheduleValue("2026-10-09", "fallback")).toBe("2026-10-09");
    expect(normalizeScheduleValue("  ", "fallback")).toBe("fallback");
    expect(normalizeScheduleValue(undefined, "fallback")).toBe("fallback");
  });
});
