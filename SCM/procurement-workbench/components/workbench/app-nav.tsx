import { useState } from "react";
import { NAV_GROUPS } from "@/components/workbench/navigation";
import type { Workbench } from "@/hooks/useWorkbench";
import { mdmpFollowUps } from "@/lib/mdmp/scope";
import type { WorkspaceTab } from "@/lib/types";

type AppNavProps = {
  wb: Workbench;
};

type Badge = { count: number; tone: "risk" | "warning" | "muted" };

/** Counts that tell a buyer where to look first, for the projects in scope. */
function navBadges(wb: Workbench): Partial<Record<WorkspaceTab, Badge>> {
  const { thisWeek, materialPlan, projectScope } = wb;
  const overdue = thisWeek.orders.filter((row) => row.status !== "order-soon").length;
  const planRows = (materialPlan.derived?.rows ?? []).filter(
    (row) => projectScope === "all" || materialPlan.derived?.projectIdByRow.get(row.project.row) === projectScope,
  );
  const planOverdue = planRows.filter((row) => row.status === "order-overdue" || row.status === "need-passed").length;
  const planSoon = planRows.filter((row) => row.status === "order-soon").length;
  const openNcrs = thisWeek.openSupplierNcrs.length + thisWeek.openInternalNcrs.length;
  const delivery = mdmpFollowUps(wb.mdmp.derived, projectScope);
  const deliveryRisk = delivery.shortages.length + delivery.lateArrivals.length;
  const urgent = overdue + thisWeek.expedite.length + delivery.shortages.length;
  return {
    today: { count: urgent || thisWeek.orders.length, tone: urgent ? "risk" : "warning" },
    material: { count: planOverdue || planSoon, tone: planOverdue ? "risk" : "warning" },
    mdmp: { count: deliveryRisk || delivery.pickups.length, tone: deliveryRisk ? "risk" : "warning" },
    delivery: { count: thisWeek.expedite.length, tone: "risk" },
    ncr: { count: openNcrs, tone: "muted" },
  };
}

export function AppNav({ wb }: AppNavProps) {
  const { activeWorkspace, setActiveWorkspace } = wb;
  const [open, setOpen] = useState(false);
  const badges = navBadges(wb);

  return (
    <aside className="app-nav" data-open={open}>
      <div className="app-brand">
        <span className="brand-mark" aria-hidden="true">
          <span className="tower-mini">
            <i />
            <b />
            <em />
          </span>
        </span>
        <div>
          <strong>CSWind America</strong>
          <small>Supply chain workbench</small>
        </div>
        <button type="button" className="app-nav-toggle" aria-expanded={open} aria-controls="app-nav-menu" onClick={() => setOpen(!open)}>
          {open ? "Close" : "Menu"}
        </button>
      </div>
      <nav id="app-nav-menu" className="app-nav-menu" aria-label="Workbench sections">
        {NAV_GROUPS.map((group) => (
          <div className="app-nav-group" key={group.label}>
            <span className="app-nav-group-label">{group.label}</span>
            {group.items.map((item) => {
              const badge = badges[item.tab];
              const active = activeWorkspace === item.tab;
              return (
                <button
                  type="button"
                  key={item.tab}
                  className="app-nav-item"
                  aria-current={active ? "page" : undefined}
                  onClick={() => {
                    setActiveWorkspace(item.tab);
                    setOpen(false);
                  }}
                >
                  <span>{item.label}</span>
                  {badge && badge.count > 0 ? (
                    <em className="app-nav-badge" data-tone={badge.tone} aria-label={`${badge.count} items`}>
                      {badge.count}
                    </em>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
