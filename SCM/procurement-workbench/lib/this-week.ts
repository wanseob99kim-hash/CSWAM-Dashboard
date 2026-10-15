// The "This Week" view: what a buyer has to act on now, across the projects in scope.
import { daysBetween, toDate } from "./dates";
import type { getRisk } from "./delivery";
import type { OrderPlanRow } from "./mpp/order-plan";
import type { Delivery, InternalNcr, ProjectScope, SupplierNcr, TodoItem } from "./types";

export type RiskedDelivery = Delivery & { risk: ReturnType<typeof getRisk> };

/** Deliveries arriving within this many days are listed as arriving soon. */
export const ARRIVAL_WINDOW_DAYS = 14;
const EXPEDITE_SCORE = 3;
const PRIORITY_RANK: Record<string, number> = { Urgent: 0, High: 1, Normal: 2, Low: 3 };

export type ThisWeekInput = {
  scope: ProjectScope;
  today: Date;
  deliveries: readonly RiskedDelivery[];
  orderPlan: readonly OrderPlanRow[];
  /** Workbench project id for an order-plan row, when the MPP project is matched. */
  projectIdForPlanRow: (row: OrderPlanRow) => string | null;
  supplierNcrs: readonly SupplierNcr[];
  internalNcrs: readonly InternalNcr[];
  todoItems: readonly TodoItem[];
};

export type ArrivingDelivery = RiskedDelivery & { arrivalDate: Date; daysUntil: number };

export type ThisWeek = {
  /** Orders whose order-by week has passed or is within the due-soon window, earliest first. */
  orders: OrderPlanRow[];
  /** Deliveries estimated to arrive after production needs them, earliest need first. */
  expedite: RiskedDelivery[];
  arriving: ArrivingDelivery[];
  openSupplierNcrs: SupplierNcr[];
  openInternalNcrs: InternalNcr[];
  openTodos: TodoItem[];
};

const ACTION_STATUSES = new Set(["order-overdue", "need-passed", "order-soon"]);

function inScope(scope: ProjectScope, projectId: string | null): boolean {
  return scope === "all" || projectId === scope;
}

/** When the delivery is expected on site: the actual ETA if known, else the estimate. */
export function expectedArrival(delivery: RiskedDelivery): Date {
  return delivery.actualEta ? toDate(delivery.actualEta) : delivery.risk.theoreticalDelivery;
}

export function buildThisWeek(input: ThisWeekInput): ThisWeek {
  const { scope, today } = input;
  const deliveries = input.deliveries.filter((delivery) => inScope(scope, delivery.projectId));
  const open = deliveries.filter((delivery) => !delivery.actualArrival);

  return {
    orders: input.orderPlan.filter((row) => ACTION_STATUSES.has(row.status) && inScope(scope, input.projectIdForPlanRow(row))),
    expedite: open
      .filter((delivery) => delivery.risk.score >= EXPEDITE_SCORE)
      .sort((left, right) => daysBetween(left.productionNeed, right.productionNeed)),
    arriving: open
      .map((delivery) => {
        const arrivalDate = expectedArrival(delivery);
        return { ...delivery, arrivalDate, daysUntil: daysBetween(today, arrivalDate) };
      })
      .filter((delivery) => delivery.daysUntil >= -7 && delivery.daysUntil <= ARRIVAL_WINDOW_DAYS)
      .sort((left, right) => left.daysUntil - right.daysUntil),
    openSupplierNcrs: input.supplierNcrs.filter((ncr) => !ncr.replacementReceived && inScope(scope, ncr.projectId)),
    openInternalNcrs: input.internalNcrs.filter((ncr) => !ncr.goodsReceived && inScope(scope, ncr.projectId)),
    openTodos: input.todoItems
      .filter((todo) => !todo.done && inScope(scope, todo.projectId))
      .sort(
        (left, right) =>
          (PRIORITY_RANK[left.priority] ?? 9) - (PRIORITY_RANK[right.priority] ?? 9) || left.dueWeek.localeCompare(right.dueWeek),
      ),
  };
}
