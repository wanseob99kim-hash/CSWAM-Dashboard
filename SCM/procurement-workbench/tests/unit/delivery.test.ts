import { describe, expect, test } from "vitest";
import { getPaymentTermDays } from "../../lib/cashflow";
import { formatInputDate } from "../../lib/dates";
import { getEstimatedArrival, getIncotermMode, getRisk, usesSupplierEta } from "../../lib/delivery";
import { createDeliveryDraft } from "../../lib/drafts";
import type { Delivery } from "../../lib/types";

function delivery(overrides: Partial<Delivery>): Delivery {
  return { ...createDeliveryDraft("project-test"), ...overrides };
}

describe("incoterms", () => {
  test("classifies incoterm prefixes", () => {
    expect(getIncotermMode({ incoterms: " dap Pueblo" })).toBe("DAP");
    expect(getIncotermMode({ incoterms: "DDP" })).toBe("DDP");
    expect(getIncotermMode({ incoterms: "FCA Busan" })).toBe("FCA");
    expect(getIncotermMode({ incoterms: "CIF" })).toBe("Other");
  });

  test("uses the supplier schedule as ETA only for delivered terms", () => {
    expect(usesSupplierEta({ incoterms: "DAP" })).toBe(true);
    expect(usesSupplierEta({ incoterms: "EXW" })).toBe(false);
  });

  test("adds lead time to pickup for non-delivered terms", () => {
    const fca = { incoterms: "FCA", leadTimeWeeks: 8, supplierSchedule: "2026-10-01" };
    expect(formatInputDate(getEstimatedArrival(fca))).toBe("2026-11-26");
    expect(formatInputDate(getEstimatedArrival({ ...fca, incoterms: "DAP" }))).toBe("2026-10-01");
  });

  test("defaults missing lead time to 8 weeks", () => {
    const arrival = getEstimatedArrival({ incoterms: "FCA", leadTimeWeeks: 0, supplierSchedule: "2026-10-01" });
    expect(formatInputDate(arrival)).toBe("2026-11-26");
  });
});

describe("getRisk", () => {
  const onTime = {
    incoterms: "FCA",
    leadTimeWeeks: 8,
    supplierSchedule: "2026-10-01",
    productionNeed: "2026-12-01",
    poDate: "2026-09-01",
    orderConfirmation: "2026-09-03",
  };

  test("is on track when the estimate covers production need", () => {
    expect(getRisk(delivery(onTime))).toMatchObject({ level: "On track", score: 1 });
  });

  test("flags expedite when the estimate lands after production need", () => {
    const risk = getRisk(delivery({ ...onTime, productionNeed: "2026-11-20" }));
    expect(risk).toMatchObject({ level: "Expedite", score: 3 });
    expect(risk.reason).toContain("6 days");
  });

  test("prefers an actual ETA over the theoretical estimate", () => {
    const risk = getRisk(delivery({ ...onTime, actualEta: "2026-12-10" }));
    expect(risk).toMatchObject({ level: "Expedite" });
    expect(risk.reason).toContain("9 days");
  });

  test("watches suppliers that confirm the order more than 5 days after PO", () => {
    expect(getRisk(delivery({ ...onTime, orderConfirmation: "2026-09-10" }))).toMatchObject({ level: "Watch", score: 2 });
  });

  test("uses the actual arrival once goods arrive", () => {
    expect(getRisk(delivery({ ...onTime, actualArrival: "2026-12-05" }))).toMatchObject({ level: "Late arrived", score: 4 });
    expect(getRisk(delivery({ ...onTime, actualArrival: "2026-11-30" }))).toMatchObject({ level: "Arrived", score: 0 });
  });
});

describe("getPaymentTermDays", () => {
  test.each([
    ["Net 60", 60],
    ["N30", 30],
    ["45 days after invoice", 45],
    ["T/T 30% deposit", 0],
    ["", 0],
  ])("%s -> %i days", (terms, days) => {
    expect(getPaymentTermDays(terms)).toBe(days);
  });
});
