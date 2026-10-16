import { useWorkbenchActions } from "./useWorkbenchActions";
import { useWorkbenchDerived } from "./useWorkbenchDerived";
import { useMemo } from "react";
import { buildThisWeek } from "@/lib/this-week";
import { useMaterialPlan } from "./useMaterialPlan";
import { useMdmp } from "./useMdmp";
import { useWorkspaceState } from "./useWorkspaceState";

export type Workbench = ReturnType<typeof useWorkbench>;

export function useWorkbench() {
  const state = useWorkspaceState();
  const derived = useWorkbenchDerived(state);
  const actions = useWorkbenchActions({ ...state, ...derived });
  const materialPlan = useMaterialPlan(state.hydrated, state.projectList);
  const mdmp = useMdmp(state.hydrated, state.projectList, state.purchasePoLines, materialPlan.settings);
  const thisWeek = useMemo(
    () =>
      buildThisWeek({
        scope: state.projectScope,
        today: new Date(),
        deliveries: derived.rowsWithRisk,
        orderPlan: materialPlan.derived?.rows ?? [],
        projectIdForPlanRow: (row) => materialPlan.derived?.projectIdByRow.get(row.project.row) ?? null,
        supplierNcrs: state.supplierNcrs,
        internalNcrs: state.internalNcrs,
        todoItems: state.todoItems,
      }),
    [state.projectScope, derived.rowsWithRisk, materialPlan.derived, state.supplierNcrs, state.internalNcrs, state.todoItems],
  );
  return { ...state, ...derived, ...actions, materialPlan, mdmp, thisWeek };
}
