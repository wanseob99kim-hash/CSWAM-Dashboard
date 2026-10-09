import { describe, expect, test } from "vitest";
import { defaultActiveProjectId, defaultDeliveries, defaultProjects } from "../../lib/seed-data";
import {
  loadWorkspace,
  pantherDemoSeedKey,
  parseSavedWorkspace,
  resolveInitialWorkspace,
  saveWorkspace,
  storageKey,
  type StorageLike,
  type WorkspaceSnapshot,
} from "../../lib/storage";
import type { Project } from "../../lib/types";

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

const customProject: Project = {
  id: "project-x",
  name: "Custom",
  code: "X",
  phase: "1T",
  productionWindow: "",
  plant: "",
  budget: 0,
};

describe("parseSavedWorkspace", () => {
  test("returns null for missing or corrupt data instead of throwing", () => {
    expect(parseSavedWorkspace(null)).toBeNull();
    expect(parseSavedWorkspace("{not json")).toBeNull();
    expect(parseSavedWorkspace("[]")).toBeNull();
    expect(parseSavedWorkspace("42")).toBeNull();
  });

  test("keeps only known array fields", () => {
    const parsed = parseSavedWorkspace(JSON.stringify({ projects: [customProject], deliveries: "oops", extra: [1] }));
    expect(parsed).toEqual({ projects: [customProject] });
  });
});

describe("resolveInitialWorkspace", () => {
  test("uses seed data when nothing is saved", () => {
    const workspace = resolveInitialWorkspace(null, true);
    expect(workspace.projects).toBe(defaultProjects);
    expect(workspace.deliveries).toBe(defaultDeliveries);
    expect(workspace.activeProjectId).toBe(defaultActiveProjectId);
    expect(workspace.ecnRecords).toBeUndefined();
  });

  test("merges demo projects and deliveries on the first seeded load", () => {
    const workspace = resolveInitialWorkspace({ projects: [customProject], deliveries: [] }, true);
    expect(workspace.projects[0]).toBe(customProject);
    expect(workspace.projects).toHaveLength(defaultProjects.length + 1);
    expect(workspace.deliveries).toHaveLength(defaultDeliveries.length);
    expect(workspace.activeProjectId).toBe(defaultActiveProjectId);
  });

  test("keeps saved data as-is once the demo was seeded", () => {
    const workspace = resolveInitialWorkspace({ projects: [customProject], deliveries: [] }, false);
    expect(workspace.projects).toEqual([customProject]);
    expect(workspace.deliveries).toEqual([]);
    expect(workspace.activeProjectId).toBe("project-x");
  });

  test("restores optional lists only when they have entries", () => {
    const todo = { id: "t1" } as WorkspaceSnapshot["todoItems"][number];
    const workspace = resolveInitialWorkspace({ projects: [customProject], todoItems: [todo], ecnRecords: [] }, false);
    expect(workspace.todoItems).toEqual([todo]);
    expect("ecnRecords" in workspace).toBe(false);
  });
});

describe("loadWorkspace / saveWorkspace", () => {
  test("marks the demo as seeded after the first load", () => {
    const storage = memoryStorage();
    loadWorkspace(storage);
    expect(storage.data[pantherDemoSeedKey]).toBe("true");
  });

  test("survives a corrupt saved workspace", () => {
    const storage = memoryStorage({ [storageKey]: "{broken", [pantherDemoSeedKey]: "true" });
    expect(loadWorkspace(storage).projects).toBe(defaultProjects);
  });

  test("round-trips a saved snapshot", () => {
    const storage = memoryStorage({ [pantherDemoSeedKey]: "true" });
    const snapshot: WorkspaceSnapshot = {
      projects: [customProject],
      deliveries: [],
      bomItems: [],
      supplierNcrs: [],
      internalNcrs: [],
      ecnRecords: [],
      todoItems: [],
      supplierPlans: [],
      purchasePoLines: [],
    };
    saveWorkspace(storage, snapshot);
    expect(loadWorkspace(storage)).toMatchObject({ projects: [customProject], activeProjectId: "project-x" });
  });
});
