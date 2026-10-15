import { useWorkbenchActions } from "./useWorkbenchActions";
import { useWorkbenchDerived } from "./useWorkbenchDerived";
import { useMaterialPlan } from "./useMaterialPlan";
import { useWorkspaceState } from "./useWorkspaceState";

export type Workbench = ReturnType<typeof useWorkbench>;

export function useWorkbench() {
  const state = useWorkspaceState();
  const derived = useWorkbenchDerived(state);
  const actions = useWorkbenchActions({ ...state, ...derived });
  const materialPlan = useMaterialPlan(state.activeWorkspace === "material", state.projectList);
  return { ...state, ...derived, ...actions, materialPlan };
}
