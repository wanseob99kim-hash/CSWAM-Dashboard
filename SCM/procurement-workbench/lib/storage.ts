import { mergeUniqueById } from "./ids";
import { defaultActiveProjectId, defaultBomItems, defaultDeliveries, defaultProjects } from "./seed-data";
import type {
  BomItem,
  Delivery,
  EcnRecord,
  InternalNcr,
  Project,
  PurchasePoLine,
  SupplierNcr,
  SupplierSchedulePlan,
  TodoItem,
} from "./types";

export const storageKey = "im-delivery-schedule-v2";
export const pantherDemoSeedKey = "im-panther-grove-demo-seed-2026-08-11";
/** Unreadable saved data is copied here before defaults overwrite it, so it can be recovered by hand. */
export const corruptBackupKey = `${storageKey}-corrupt-backup`;

const PANTHER_PROJECT_IDS = ["project-1700", "project-1616"];

export type WorkspaceSnapshot = {
  projects: Project[];
  deliveries: Delivery[];
  bomItems: BomItem[];
  supplierNcrs: SupplierNcr[];
  internalNcrs: InternalNcr[];
  ecnRecords: EcnRecord[];
  todoItems: TodoItem[];
  supplierPlans: SupplierSchedulePlan[];
  purchasePoLines: PurchasePoLine[];
};

/** Fields restored on load. Optional lists are only set when non-empty, matching the original hydration. */
export type LoadedWorkspace = Pick<WorkspaceSnapshot, "projects" | "deliveries" | "bomItems"> &
  Partial<Omit<WorkspaceSnapshot, "projects" | "deliveries" | "bomItems">> & {
    activeProjectId: string;
  };

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

const SNAPSHOT_KEYS: Array<keyof WorkspaceSnapshot> = [
  "projects",
  "deliveries",
  "bomItems",
  "supplierNcrs",
  "internalNcrs",
  "ecnRecords",
  "todoItems",
  "supplierPlans",
  "purchasePoLines",
];

/** Parses the saved workspace JSON. Returns null for missing or unreadable data; non-array fields are dropped. */
export function parseSavedWorkspace(raw: string | null): Partial<WorkspaceSnapshot> | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  return Object.fromEntries(
    SNAPSHOT_KEYS.filter((key) => Array.isArray(record[key])).map((key) => [key, record[key]]),
  ) as Partial<WorkspaceSnapshot>;
}

/** Decides the initial workspace from saved data, seeding the Panther Grove demo once per browser. */
export function resolveInitialWorkspace(
  saved: Partial<WorkspaceSnapshot> | null,
  shouldSeedPantherDemo: boolean,
): LoadedWorkspace {
  if (!saved) {
    return {
      projects: defaultProjects,
      deliveries: defaultDeliveries,
      bomItems: defaultBomItems,
      activeProjectId: defaultActiveProjectId,
    };
  }

  const savedProjects = saved.projects?.length ? saved.projects : defaultProjects;
  const savedDeliveries = saved.deliveries ?? [];
  const savedBomItems = saved.bomItems ?? [];
  const hasPantherDeliveries = savedDeliveries.some((delivery) => PANTHER_PROJECT_IDS.includes(delivery.projectId));
  const hasPantherBom = savedBomItems.some((item) => PANTHER_PROJECT_IDS.includes(item.projectId));

  const projects = shouldSeedPantherDemo ? mergeUniqueById(savedProjects, defaultProjects) : savedProjects;
  const optionalLists = Object.fromEntries(
    (["supplierNcrs", "internalNcrs", "ecnRecords", "todoItems", "supplierPlans", "purchasePoLines"] as const)
      .filter((key) => saved[key]?.length)
      .map((key) => [key, saved[key]]),
  ) as Partial<WorkspaceSnapshot>;

  return {
    ...optionalLists,
    projects,
    deliveries: shouldSeedPantherDemo && !hasPantherDeliveries ? mergeUniqueById(savedDeliveries, defaultDeliveries) : savedDeliveries,
    bomItems: shouldSeedPantherDemo && !hasPantherBom ? mergeUniqueById(savedBomItems, defaultBomItems) : savedBomItems,
    activeProjectId: projects.some((project) => project.id === defaultActiveProjectId) ? defaultActiveProjectId : projects[0].id,
  };
}

export function loadWorkspace(storage: StorageLike): LoadedWorkspace {
  const shouldSeedPantherDemo = !storage.getItem(pantherDemoSeedKey);
  const raw = storage.getItem(storageKey);
  const saved = parseSavedWorkspace(raw);
  if (raw && !saved) storage.setItem(corruptBackupKey, raw);
  const workspace = resolveInitialWorkspace(saved, shouldSeedPantherDemo);
  if (shouldSeedPantherDemo) storage.setItem(pantherDemoSeedKey, "true");
  return workspace;
}

export function saveWorkspace(storage: StorageLike, snapshot: WorkspaceSnapshot): void {
  storage.setItem(storageKey, JSON.stringify(snapshot));
}

/** Server sync bookkeeping: the last server-confirmed workspace, row versions, and the read cursor. */
export const syncMetaKey = "im-workspace-sync-v1";
/** Copy of this browser's pre-sync data, kept when the browser first connects to the shared workspace. */
export const preSyncBackupKey = `${storageKey}-pre-sync-backup`;

export type SyncMeta = {
  synced: WorkspaceSnapshot;
  versions: Partial<Record<keyof WorkspaceSnapshot, Record<string, number>>>;
  serverTime: string | null;
};

export function loadSyncMeta(storage: StorageLike): SyncMeta | null {
  const raw = storage.getItem(syncMetaKey);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;
  const synced = parseSavedWorkspace(JSON.stringify(record.synced ?? null));
  if (!synced || !record.versions || typeof record.versions !== "object") return null;
  return {
    synced: Object.fromEntries(SNAPSHOT_KEYS.map((key) => [key, synced[key] ?? []])) as WorkspaceSnapshot,
    versions: record.versions as SyncMeta["versions"],
    serverTime: typeof record.serverTime === "string" ? record.serverTime : null,
  };
}

export function saveSyncMeta(storage: StorageLike, meta: SyncMeta): void {
  storage.setItem(syncMetaKey, JSON.stringify(meta));
}
