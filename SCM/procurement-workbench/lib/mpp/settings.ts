import type { StorageLike } from "../storage";
import { DEFAULT_PLAN_SETTINGS, type MaterialPlanSettings } from "./order-plan";
import { MPP_MATERIALS } from "./parse";

export const planSettingsKey = "im-material-plan-settings-v1";
const MAX_WEEKS = 104;

const weeks = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_WEEKS ? value : fallback;

/** Lead times kept on this device; anything missing or invalid falls back to the defaults. */
export function loadPlanSettings(storage: StorageLike): MaterialPlanSettings {
  let saved: Partial<MaterialPlanSettings> = {};
  try {
    saved = JSON.parse(storage.getItem(planSettingsKey) ?? "{}") ?? {};
  } catch {
    saved = {};
  }
  return {
    leadTimeWeeks: Object.fromEntries(
      MPP_MATERIALS.map((material) => [material, weeks(saved.leadTimeWeeks?.[material], DEFAULT_PLAN_SETTINGS.leadTimeWeeks[material])]),
    ) as MaterialPlanSettings["leadTimeWeeks"],
    safetyWeeks: weeks(saved.safetyWeeks, DEFAULT_PLAN_SETTINGS.safetyWeeks),
    dueSoonWeeks: weeks(saved.dueSoonWeeks, DEFAULT_PLAN_SETTINGS.dueSoonWeeks),
  };
}

export function savePlanSettings(storage: StorageLike, settings: MaterialPlanSettings): void {
  storage.setItem(planSettingsKey, JSON.stringify(settings));
}
