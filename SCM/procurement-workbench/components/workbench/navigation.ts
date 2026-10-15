import type { WorkspaceTab } from "@/lib/types";

export type NavItem = {
  tab: WorkspaceTab;
  label: string;
  /** Shown under the page title. */
  description: string;
  /** The section works on one project at a time; with "All projects" it asks for one first. */
  projectScoped?: boolean;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

/** Sections in the order material flows: plan, buy, receive, control. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Today",
    items: [{ tab: "today", label: "This Week", description: "What needs ordering, chasing, or closing now." }],
  },
  {
    label: "Plan",
    items: [{ tab: "material", label: "Material Plan", description: "Order-by weeks from the Master Production Plan." }],
  },
  {
    label: "Buy",
    items: [
      { tab: "supplier", label: "Supplier Schedule", description: "PO split, supplier requests, and documents.", projectScoped: true },
      { tab: "bom", label: "BOM", description: "Purchasing and internal bills of material.", projectScoped: true },
      { tab: "mcip", label: "MCIP Budget", description: "Budget forecast by project." },
    ],
  },
  {
    label: "Receive",
    items: [
      { tab: "delivery", label: "Delivery", description: "Deliveries, ETAs, and production need dates." },
      { tab: "logistics", label: "Logistics", description: "Freight, tariff, and ocean lead time." },
    ],
  },
  {
    label: "Control",
    items: [
      { tab: "ncr", label: "NCR", description: "Supplier and internal nonconformance." },
      { tab: "ecn", label: "ECN", description: "Engineering changes and their impact." },
      { tab: "cashflow", label: "Cashflow", description: "Payment forecast from delivery and terms." },
    ],
  },
  {
    label: "Project",
    items: [{ tab: "overview", label: "Project Overview", description: "Budget, cost, delivery health, and to-dos.", projectScoped: true }],
  },
];

const ITEMS = new Map(NAV_GROUPS.flatMap((group) => group.items.map((item) => [item.tab, item] as const)));

export function navItem(tab: WorkspaceTab): NavItem {
  return ITEMS.get(tab) ?? NAV_GROUPS[0].items[0];
}

export function isProjectScoped(tab: WorkspaceTab): boolean {
  return Boolean(ITEMS.get(tab)?.projectScoped);
}
