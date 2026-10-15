// Turns an MPP into a purchasing plan: for every project and material, when the
// material must be on site (need week) and when it must be ordered (order-by
// week = need week - lead time - safety weeks).
import { MPP_MATERIALS, type MppMaterial, type MppPlan, type MppProject, type WeeklySeries } from "./parse";
import { addWeeksTo, weekIndex, weeksBetween, type IsoWeek } from "./weeks";

export type MaterialPlanSettings = {
  /** Order-to-arrival lead time per material, in weeks. */
  leadTimeWeeks: Record<MppMaterial, number>;
  /** Extra weeks the material should arrive before it is needed. */
  safetyWeeks: number;
  /** Orders due within this many weeks are flagged as due soon. */
  dueSoonWeeks: number;
};

/** Starting assumptions; replace with supplier-confirmed lead times. */
export const DEFAULT_PLAN_SETTINGS: MaterialPlanSettings = {
  leadTimeWeeks: { "Steel plate": 12, Flange: 20, "Door frame": 16, Internal: 12 },
  safetyWeeks: 1,
  dueSoonWeeks: 4,
};

/** First arrival relative to cutting start, in weeks (median over the WK42 2026 plan). Used when a plan has too few samples. */
export const FALLBACK_ARRIVAL_OFFSETS: Record<MppMaterial, number> = {
  "Steel plate": -5,
  Flange: -2,
  "Door frame": -4,
  Internal: 2,
};

const MIN_OFFSET_SAMPLES = 5;
/** Arrivals further than this from cutting start are suspicious data. */
const OFFSET_OUTLIER_WEEKS = 16;

export type OrderStatus = "order-overdue" | "need-passed" | "order-soon" | "planned" | "in-progress";

export type OrderPlanRow = {
  key: string;
  project: MppProject;
  material: MppMaterial;
  /** "mpp" when the plan has material arrivals, "estimated" when derived from cutting start. */
  source: "mpp" | "estimated";
  needWeek: IsoWeek;
  lastNeedWeek: IsoWeek;
  needQty: number;
  orderByWeek: IsoWeek;
  /** Negative when the order-by week has passed. */
  weeksToOrderBy: number;
  status: OrderStatus;
};

export type PlanIssue = {
  project: MppProject;
  severity: "warning" | "info";
  message: string;
};

const firstWeek = (series: WeeklySeries | undefined) => (series?.length ? series[0].week : null);
const lastWeek = (series: WeeklySeries | undefined) => (series?.length ? series[series.length - 1].week : null);
const total = (series: WeeklySeries | undefined) => (series ?? []).reduce((sum, point) => sum + point.qty, 0);

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/** Weeks from cutting start to first arrival, measured on this plan (outliers ignored). */
export function measureArrivalOffsets(plan: MppPlan): Record<MppMaterial, { weeks: number; samples: number }> {
  return Object.fromEntries(
    MPP_MATERIALS.map((material) => {
      const offsets = plan.projects.flatMap((project) => {
        const cut = firstWeek(project.processes.Cutting);
        const arrival = firstWeek(project.materials[material]);
        if (!cut || !arrival) return [];
        const offset = weeksBetween(cut, arrival);
        return Math.abs(offset) <= OFFSET_OUTLIER_WEEKS ? [offset] : [];
      });
      const weeks = offsets.length >= MIN_OFFSET_SAMPLES ? median(offsets) : FALLBACK_ARRIVAL_OFFSETS[material];
      return [material, { weeks, samples: offsets.length }];
    }),
  ) as Record<MppMaterial, { weeks: number; samples: number }>;
}

function estimatedQty(project: MppProject, material: MppMaterial): number {
  const towers = project.towers ?? 0;
  if (material === "Door frame") return towers;
  return towers * (project.sectionsPerTower ?? 0);
}

function statusOf(source: OrderPlanRow["source"], current: IsoWeek, need: IsoWeek, orderBy: IsoWeek, dueSoonWeeks: number): OrderStatus {
  const weeksToNeed = weeksBetween(current, need);
  const weeksToOrderBy = weeksBetween(current, orderBy);
  // Arrivals the MPP already schedules in the past are being delivered; nothing new to order.
  if (weeksToNeed < 0) return source === "mpp" ? "in-progress" : "need-passed";
  if (weeksToOrderBy < 0) return "order-overdue";
  if (weeksToOrderBy <= dueSoonWeeks) return "order-soon";
  return "planned";
}

/** One row per project and material that has a schedule; door frames are skipped for adapter scopes. */
export function buildOrderPlan(plan: MppPlan, settings: MaterialPlanSettings, current: IsoWeek): OrderPlanRow[] {
  const offsets = measureArrivalOffsets(plan);
  const rows: OrderPlanRow[] = [];

  for (const project of plan.projects) {
    const cutStart = firstWeek(project.processes.Cutting);
    const cutEnd = lastWeek(project.processes.Cutting);
    // Without a material plan, only projects still in or ahead of cutting need estimating.
    const canEstimate = Boolean(cutStart && cutEnd && weeksBetween(current, cutEnd) >= 0);
    for (const material of MPP_MATERIALS) {
      if (material === "Door frame" && project.isAdapter) continue;
      const series = project.materials[material];
      const planned = firstWeek(series);
      if (!planned && (!canEstimate || !estimatedQty(project, material))) continue;
      const source: OrderPlanRow["source"] = planned ? "mpp" : "estimated";
      const needWeek = planned ?? (cutStart ? addWeeksTo(cutStart, offsets[material].weeks) : null);
      if (!needWeek) continue;
      const lastNeedWeek = lastWeek(series) ?? needWeek;
      const orderByWeek = addWeeksTo(needWeek, -(settings.leadTimeWeeks[material] + settings.safetyWeeks));
      rows.push({
        key: `${project.row}-${material}`,
        project,
        material,
        source,
        needWeek,
        lastNeedWeek,
        needQty: planned ? total(series) : estimatedQty(project, material),
        orderByWeek,
        weeksToOrderBy: weeksBetween(current, orderByWeek),
        status: statusOf(source, current, needWeek, orderByWeek, settings.dueSoonWeeks),
      });
    }
  }

  return rows.sort((left, right) => weekIndex(left.orderByWeek) - weekIndex(right.orderByWeek) || left.project.row - right.project.row);
}

/** Things in the plan a planner should double-check before trusting the numbers. */
export function findPlanIssues(plan: MppPlan): PlanIssue[] {
  const issues: PlanIssue[] = [];
  for (const project of plan.projects) {
    const cut = firstWeek(project.processes.Cutting);
    for (const material of MPP_MATERIALS) {
      const arrival = firstWeek(project.materials[material]);
      if (!cut || !arrival) continue;
      const offset = weeksBetween(cut, arrival);
      if (Math.abs(offset) > OFFSET_OUTLIER_WEEKS) {
        issues.push({
          project,
          severity: "warning",
          message: `${material} arrives ${Math.abs(offset)} weeks ${offset > 0 ? "after" : "before"} cutting starts. Check the dates in the plan.`,
        });
      }
    }

    const plates = total(project.materials["Steel plate"]);
    const flanges = total(project.materials.Flange);
    if (plates && flanges && flanges !== plates && project.towers && flanges === project.towers) {
      issues.push({
        project,
        severity: "info",
        message: `Flange quantity (${flanges}) matches the tower count while steel plate (${plates}) counts sections. Units differ between rows.`,
      });
    }

    const hasCutting = Boolean(cut);
    const missing = MPP_MATERIALS.filter((material) => !(material === "Door frame" && project.isAdapter) && !project.materials[material]?.length);
    if (hasCutting && missing.length) {
      issues.push({
        project,
        severity: "info",
        message: `No material plan for ${missing.join(", ")}; need weeks are estimated from cutting start.`,
      });
    }
  }
  return issues;
}
