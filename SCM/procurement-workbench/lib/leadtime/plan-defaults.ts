// Material Plan lead times suggested by the lead-time workbook's DDP routes.
import type { MppMaterial } from "../mpp/parse";
import type { LeadTimeTable } from "./parse";

const PRODUCT_PATTERNS: Array<[Exclude<MppMaterial, "Internal">, RegExp]> = [
  ["Steel plate", /\b(steel|plate)\b/i],
  ["Flange", /\bflange/i],
  ["Door frame", /\bdoor\s*(segment|frame)\b/i],
];

const median = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
};

/**
 * Steel plate, flange, and door frame take the longest DDP of their routes (the
 * plan should cover the slowest approved supplier); internal parts take the
 * median DDP of every other route. Materials without a route are left out.
 */
export function suggestedPlanLeadTimes(table: LeadTimeTable): Partial<Record<MppMaterial, number>> {
  const suggestion: Partial<Record<MppMaterial, number>> = {};
  const internal: number[] = [];
  for (const route of table.routes) {
    if (route.ddpWeeks === null) continue;
    const material = PRODUCT_PATTERNS.find(([, pattern]) => pattern.test(route.product))?.[0];
    if (material) suggestion[material] = Math.max(suggestion[material] ?? 0, route.ddpWeeks);
    else internal.push(route.ddpWeeks);
  }
  if (internal.length) suggestion.Internal = median(internal);
  return suggestion;
}
