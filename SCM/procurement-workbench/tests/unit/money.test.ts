import { describe, expect, test } from "vitest";
import { formatMoney } from "../../lib/format";
import { fromCents, roundMoney, toCents } from "../../lib/money";

describe("toCents", () => {
  test.each([
    [0, 0],
    [12.34, 1234],
    [1.005, 101],
    [-1.005, -101],
    [0.1 + 0.2, 30],
    [1234567.891, 123456789],
    [1e21, 1e23],
  ])("%d -> %d cents", (dollars, cents) => {
    expect(toCents(dollars)).toBe(cents);
  });

  test("treats non-finite values as zero", () => {
    expect(toCents(Number.NaN)).toBe(0);
    expect(toCents(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("round trip", () => {
  test("keeps at most two decimals", () => {
    expect(fromCents(toCents(19.999))).toBe(20);
    expect(roundMoney(2.675)).toBe(2.68);
  });
});

describe("formatMoney", () => {
  test("always shows two decimals", () => {
    expect(formatMoney(1234.5)).toBe("$1,234.50");
    expect(formatMoney(0)).toBe("$0.00");
    expect(formatMoney(-12.345)).toBe("-$12.35");
  });
});
