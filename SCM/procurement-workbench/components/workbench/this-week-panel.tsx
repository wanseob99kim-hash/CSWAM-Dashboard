import type { ReactNode } from "react";
import type { Workbench } from "@/hooks/useWorkbench";
import { daysBetween, formatShortDate } from "@/lib/dates";
import { formatWeek } from "@/lib/mpp/weeks";
import { expectedArrival } from "@/lib/this-week";
import type { WorkspaceTab } from "@/lib/types";

type ThisWeekPanelProps = {
  wb: Workbench;
};

const LIST_LIMIT = 8;

type CardProps = {
  title: string;
  count: number;
  emptyText: string;
  target: WorkspaceTab;
  linkLabel: string;
  onOpen: (tab: WorkspaceTab) => void;
  children: ReactNode;
};

function Card({ title, count, emptyText, target, linkLabel, onOpen, children }: CardProps) {
  return (
    <section className="week-card" aria-label={title}>
      <header>
        <h2>
          {title} <span>{count}</span>
        </h2>
        <button type="button" className="link-action" onClick={() => onOpen(target)}>
          {linkLabel}
        </button>
      </header>
      {count ? <ul className="week-list">{children}</ul> : <p className="week-empty">{emptyText}</p>}
      {count > LIST_LIMIT ? <p className="week-more">+{count - LIST_LIMIT} more</p> : null}
    </section>
  );
}

export function ThisWeekPanel({ wb }: ThisWeekPanelProps) {
  const { activeWorkspace, setActiveWorkspace, thisWeek, projectList, materialPlan } = wb;
  const projectName = (id: string) => projectList.find((project) => project.id === id)?.name ?? id;
  const overdue = thisWeek.orders.filter((row) => row.status !== "order-soon");
  const soon = thisWeek.orders.filter((row) => row.status === "order-soon");
  const openNcrs = thisWeek.openSupplierNcrs.length + thisWeek.openInternalNcrs.length;
  const planState = materialPlan.state.kind;

  const tiles: Array<{ label: string; value: number; tone: string; target: WorkspaceTab }> = [
    { label: "Orders past deadline", value: overdue.length, tone: "risk", target: "material" },
    { label: `Orders due within ${materialPlan.settings.dueSoonWeeks} weeks`, value: soon.length, tone: "warning", target: "material" },
    { label: "Deliveries to expedite", value: thisWeek.expedite.length, tone: "risk", target: "delivery" },
    { label: "Arriving in 2 weeks", value: thisWeek.arriving.length, tone: "info", target: "delivery" },
    { label: "Open NCRs", value: openNcrs, tone: "muted", target: "ncr" },
    { label: "Open to-dos", value: thisWeek.openTodos.length, tone: "muted", target: "overview" },
  ];

  return (
    <section className="this-week" hidden={activeWorkspace !== "today"}>
      <div className="week-tiles">
        {tiles.map((tile) => (
          <button type="button" key={tile.label} className="week-tile" data-tone={tile.tone} onClick={() => setActiveWorkspace(tile.target)}>
            <strong>{tile.value}</strong>
            <span>{tile.label}</span>
          </button>
        ))}
      </div>

      <div className="week-grid">
        <Card
          title="Order now"
          count={thisWeek.orders.length}
          emptyText={planState === "ready" ? "No orders due. The plan is covered." : "Load the production plan to see order deadlines."}
          target="material"
          linkLabel="Material Plan"
          onOpen={setActiveWorkspace}
        >
          {thisWeek.orders.slice(0, LIST_LIMIT).map((row) => (
            <li key={row.key} data-tone={row.status === "order-soon" ? "warning" : "risk"}>
              <strong>{formatWeek(row.orderByWeek)}</strong>
              <span>
                {row.material} · {row.project.title}
              </span>
              <small>
                needed {formatWeek(row.needWeek)} · {row.needQty.toLocaleString()} {row.source === "estimated" ? "(estimated)" : ""}
              </small>
            </li>
          ))}
        </Card>

        <Card
          title="Chase suppliers"
          count={thisWeek.expedite.length}
          emptyText="Every open delivery covers its production need."
          target="delivery"
          linkLabel="Delivery"
          onOpen={setActiveWorkspace}
        >
          {thisWeek.expedite.slice(0, LIST_LIMIT).map((delivery) => (
            <li key={delivery.id} data-tone="risk">
              <strong>{daysBetween(delivery.productionNeed, expectedArrival(delivery))} d late</strong>
              <span>
                {delivery.category || delivery.material} · {delivery.manufacturer || "Supplier"} · PO {delivery.po || "-"}
              </span>
              <small>
                {projectName(delivery.projectId)} · need {formatShortDate(delivery.productionNeed)}, ETA {formatShortDate(expectedArrival(delivery))}
              </small>
            </li>
          ))}
        </Card>

        <Card
          title="Arriving soon"
          count={thisWeek.arriving.length}
          emptyText="Nothing due on site in the next two weeks."
          target="delivery"
          linkLabel="Delivery"
          onOpen={setActiveWorkspace}
        >
          {thisWeek.arriving.slice(0, LIST_LIMIT).map((delivery) => (
            <li key={delivery.id} data-tone={delivery.daysUntil < 0 ? "warning" : undefined}>
              <strong>{formatShortDate(delivery.arrivalDate)}</strong>
              <span>
                {delivery.category || delivery.material} · {delivery.batch} · PO {delivery.po || "-"}
              </span>
              <small>
                {projectName(delivery.projectId)} · {delivery.forwarder || delivery.deliveryWay}
                {delivery.daysUntil < 0 ? ` · ${-delivery.daysUntil} d overdue` : ""}
              </small>
            </li>
          ))}
        </Card>

        <Card title="Open NCRs" count={openNcrs} emptyText="No open nonconformance." target="ncr" linkLabel="NCR" onOpen={setActiveWorkspace}>
          {thisWeek.openSupplierNcrs.slice(0, LIST_LIMIT).map((ncr) => (
            <li key={ncr.id} data-tone={ncr.projectImpact ? "risk" : undefined}>
              <strong>{ncr.ncrNumber}</strong>
              <span>
                Supplier · {ncr.materialCode} · {ncr.category}
              </span>
              <small>
                {projectName(ncr.projectId)} · replacement pending{ncr.projectImpact ? " · project impact" : ""}
              </small>
            </li>
          ))}
          {thisWeek.openInternalNcrs.slice(0, Math.max(0, LIST_LIMIT - thisWeek.openSupplierNcrs.length)).map((ncr) => (
            <li key={ncr.id}>
              <strong>{ncr.ncrNumber}</strong>
              <span>
                Internal · {ncr.materialInfo} · {ncr.manufacturer}
              </span>
              <small>
                {projectName(ncr.projectId)} · ETA {ncr.eta ? formatShortDate(ncr.eta) : "-"}
              </small>
            </li>
          ))}
        </Card>

        <Card
          title="To-dos"
          count={thisWeek.openTodos.length}
          emptyText="No open to-dos."
          target="overview"
          linkLabel="Project Overview"
          onOpen={setActiveWorkspace}
        >
          {thisWeek.openTodos.slice(0, LIST_LIMIT).map((todo) => (
            <li key={todo.id} data-tone={todo.priority === "Urgent" ? "risk" : todo.priority === "High" ? "warning" : undefined}>
              <strong>{todo.priority}</strong>
              <span>{todo.title}</span>
              <small>
                {projectName(todo.projectId)} · {todo.mode}
                {todo.dueWeek ? ` · due ${todo.dueWeek}` : ""}
              </small>
            </li>
          ))}
        </Card>
      </div>
    </section>
  );
}
