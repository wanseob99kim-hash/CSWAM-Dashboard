import { describe, expect, test } from "vitest";
import { getRisk } from "../../lib/delivery";
import { createDeliveryDraft } from "../../lib/drafts";
import type { OrderPlanRow } from "../../lib/mpp/order-plan";
import { buildThisWeek, type RiskedDelivery } from "../../lib/this-week";
import type { Delivery, InternalNcr, SupplierNcr, TodoItem } from "../../lib/types";

const today = new Date("2026-10-15T12:00:00");

function delivery(id: string, projectId: string, overrides: Partial<Delivery>): RiskedDelivery {
  const base = { ...createDeliveryDraft(projectId), id, incoterms: "DAP", poDate: "2026-09-01", orderConfirmation: "2026-09-02", ...overrides };
  return { ...base, risk: getRisk(base) };
}

const deliveries = [
  // Arrives after production needs it: expedite.
  delivery("late", "p1", { supplierSchedule: "2026-11-10", productionNeed: "2026-11-01" }),
  // Arrives in time, within two weeks: arriving soon.
  delivery("soon", "p1", { supplierSchedule: "2026-10-20", productionNeed: "2026-11-20" }),
  // Another project.
  delivery("other", "p2", { supplierSchedule: "2026-10-18", productionNeed: "2026-12-01" }),
  // Already received: ignored.
  delivery("done", "p1", { supplierSchedule: "2026-10-16", productionNeed: "2026-10-10", actualArrival: "2026-10-14" }),
];

const planRow = (key: string, status: OrderPlanRow["status"]) => ({ key, status, project: { row: 1 } }) as unknown as OrderPlanRow;

const input = {
  today,
  deliveries,
  orderPlan: [planRow("a", "order-overdue"), planRow("b", "order-soon"), planRow("c", "planned"), planRow("d", "in-progress")],
  projectIdForPlanRow: () => "p1",
  supplierNcrs: [
    { id: "s1", projectId: "p1", replacementReceived: false } as SupplierNcr,
    { id: "s2", projectId: "p1", replacementReceived: true } as SupplierNcr,
  ],
  internalNcrs: [{ id: "i1", projectId: "p2", goodsReceived: false } as InternalNcr],
  todoItems: [
    { id: "t1", projectId: "p1", done: false, priority: "Normal", dueWeek: "2026-W43" } as TodoItem,
    { id: "t2", projectId: "p1", done: false, priority: "Urgent", dueWeek: "2026-W45" } as TodoItem,
    { id: "t3", projectId: "p1", done: true, priority: "Urgent", dueWeek: "2026-W40" } as TodoItem,
  ],
};

describe("buildThisWeek", () => {
  test("collects what needs action across all projects", () => {
    const week = buildThisWeek({ ...input, scope: "all" });
    expect(week.orders.map((row) => row.key)).toEqual(["a", "b"]);
    expect(week.expedite.map((item) => item.id)).toEqual(["late"]);
    expect(week.arriving.map((item) => item.id)).toEqual(["other", "soon"]);
    expect(week.arriving[0].daysUntil).toBe(3);
    expect(week.openSupplierNcrs.map((ncr) => ncr.id)).toEqual(["s1"]);
    expect(week.openInternalNcrs.map((ncr) => ncr.id)).toEqual(["i1"]);
    expect(week.openTodos.map((todo) => todo.id)).toEqual(["t2", "t1"]);
  });

  test("narrows everything to the selected project", () => {
    const week = buildThisWeek({ ...input, scope: "p2" });
    expect(week.orders).toEqual([]);
    expect(week.arriving.map((item) => item.id)).toEqual(["other"]);
    expect(week.openSupplierNcrs).toEqual([]);
    expect(week.openInternalNcrs.map((ncr) => ncr.id)).toEqual(["i1"]);
    expect(week.openTodos).toEqual([]);
  });

  test("skips plan rows that are not matched to a workbench project when one is selected", () => {
    const week = buildThisWeek({ ...input, scope: "p1", projectIdForPlanRow: () => null });
    expect(week.orders).toEqual([]);
  });
});
