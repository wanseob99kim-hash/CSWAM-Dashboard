import type { Workbench } from "@/hooks/useWorkbench";
import type { SyncStatus } from "@/lib/sync-engine";

type SyncStatusProps = {
  wb: Workbench;
};

function chipLabel(status: SyncStatus): string {
  switch (status.kind) {
    case "connecting":
      return "Connecting…";
    case "saving":
      return "Saving…";
    case "saved":
      return status.pendingRows ? "Unsaved changes" : "Saved";
    case "offline":
      return status.pendingRows ? `Offline · ${status.pendingRows} pending` : "Offline";
    case "local-only":
      return "This device only";
    case "error":
      return "Not saved";
  }
}

const rows = (count: number) => `${count} ${count === 1 ? "row" : "rows"}`;

export function SyncStatusChip({ wb }: SyncStatusProps) {
  const { syncStatus } = wb;
  return (
    <span className="sync-chip" data-state={syncStatus.kind} role="status" aria-live="polite" title={syncStatus.message ?? undefined}>
      <i aria-hidden="true" />
      {chipLabel(syncStatus)}
    </span>
  );
}

export function SyncNotices({ wb }: SyncStatusProps) {
  const { syncStatus, saveNow, importLocalData, dismissImport, dismissConflicts, discardLocalChanges } = wb;
  const notices = [];

  if (syncStatus.kind === "error") {
    notices.push(
      <div className="sync-notice" data-tone="error" key="error">
        <span>Changes could not be saved: {syncStatus.message}</span>
        <button className="secondary-action" onClick={saveNow}>Try again</button>
        <button className="danger-action" onClick={discardLocalChanges}>Discard unsaved changes</button>
      </div>,
    );
  }
  if (syncStatus.conflicts > 0) {
    notices.push(
      <div className="sync-notice" data-tone="warning" key="conflicts">
        <span>
          {rows(syncStatus.conflicts)} you edited had already been changed by a teammate. Their version was kept.
        </span>
        <button className="secondary-action" onClick={dismissConflicts}>Dismiss</button>
      </div>,
    );
  }
  if (syncStatus.importRows > 0) {
    notices.push(
      <div className="sync-notice" data-tone="info" key="import">
        <span>
          This browser has {rows(syncStatus.importRows)} saved before the workspace was shared. A backup copy was kept on this device.
        </span>
        <button className="primary-action" onClick={importLocalData}>Add to shared workspace</button>
        <button className="secondary-action" onClick={dismissImport}>Not now</button>
      </div>,
    );
  }

  return notices.length ? <div className="sync-notices">{notices}</div> : null;
}
