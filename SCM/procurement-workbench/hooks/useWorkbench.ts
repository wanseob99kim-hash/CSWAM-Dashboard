import { useWorkbenchActions } from "./useWorkbenchActions";
import { useWorkbenchDerived } from "./useWorkbenchDerived";
import { useWorkspaceState } from "./useWorkspaceState";

export type Workbench = ReturnType<typeof useWorkbench>;

export function useWorkbench() {
  const state = useWorkspaceState();
  const derived = useWorkbenchDerived(state);
  const actions = useWorkbenchActions({ ...state, ...derived });
  return { ...state, ...derived, ...actions };
}
