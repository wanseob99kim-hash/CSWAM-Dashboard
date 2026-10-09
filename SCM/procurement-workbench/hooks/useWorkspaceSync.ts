import { useEffect, useRef, useState } from "react";
import { loadWorkspace, type WorkspaceSnapshot } from "@/lib/storage";
import { completeSnapshot } from "@/lib/sync-client";
import { SyncEngine, type SyncStatus } from "@/lib/sync-engine";
import { fetchWorkspace, postSync } from "@/lib/workspace-api";

type UseWorkspaceSyncOptions = {
  snapshot: WorkspaceSnapshot;
  /** Applies the cached workspace once on mount; every list is set, empty ones included. */
  hydrate: (snapshot: WorkspaceSnapshot, activeProjectId: string) => void;
  /**
   * Replaces workspace lists with data from the server. A list whose current value is
   * no longer `previous` holds an edit the engine has not seen yet and must be kept.
   */
  replace: (snapshot: WorkspaceSnapshot, previous: WorkspaceSnapshot) => void;
};

const CONNECTING: SyncStatus = { kind: "connecting", message: null, pendingRows: 0, conflicts: 0, importRows: 0 };

export function useWorkspaceSync({ snapshot, hydrate, replace }: UseWorkspaceSyncOptions) {
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState<SyncStatus>(CONNECTING);
  const engineRef = useRef<SyncEngine | null>(null);
  const callbacks = useRef({ hydrate, replace });

  useEffect(() => {
    callbacks.current = { hydrate, replace };
  });

  useEffect(() => {
    const cached = loadWorkspace(window.localStorage);
    // The app and the engine start from the very same lists.
    const initial = completeSnapshot(cached);
    // Hydrating from localStorage has to happen after mount so the server and first
    // client render match; these one-time updates are the intended sync.
    /* eslint-disable react-hooks/set-state-in-effect */
    callbacks.current.hydrate(initial, cached.activeProjectId);
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */

    const engine = new SyncEngine(
      {
        storage: window.localStorage,
        api: { fetchWorkspace, postSync },
        onSnapshot: (next, previous) => callbacks.current.replace(next, previous),
        onStatus: setStatus,
      },
      initial,
    );
    engineRef.current = engine;
    void engine.start();

    const refresh = () => void engine.poll();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (hydrated) engineRef.current?.localChange(snapshot);
  }, [hydrated, snapshot]);

  return {
    hydrated,
    syncStatus: status,
    saveNow: () => void engineRef.current?.flush(),
    importLocalData: () => engineRef.current?.importLocal(),
    dismissImport: () => engineRef.current?.dismissImport(),
    dismissConflicts: () => engineRef.current?.dismissConflicts(),
    discardLocalChanges: () => engineRef.current?.discardLocalChanges(),
  };
}
