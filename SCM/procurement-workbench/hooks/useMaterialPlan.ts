import { useEffect, useMemo, useState } from "react";
import { attachmentUrl, listAttachments, type AttachmentFile } from "@/lib/files-api";
import { reconcileProjects } from "@/lib/mpp/match";
import { buildOrderPlan, DEFAULT_PLAN_SETTINGS, findPlanIssues, measureArrivalOffsets, type MaterialPlanSettings } from "@/lib/mpp/order-plan";
import type { MppPlan } from "@/lib/mpp/parse";
import { readMppWorkbook } from "@/lib/mpp/read-workbook";
import { loadPlanSettings, savePlanSettings } from "@/lib/mpp/settings";
import { isoWeekOf } from "@/lib/mpp/weeks";
import type { Project } from "@/lib/types";

const MPP_OWNER = { projectId: "workspace", ownerType: "workspace", ownerId: "mpp", kind: "mpp" } as const;

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; file: AttachmentFile; plan: MppPlan }
  | { kind: "empty" }
  | { kind: "error"; message: string };

const latestFirst = (left: AttachmentFile, right: AttachmentFile) => right.uploadedAt.localeCompare(left.uploadedAt);

async function loadLatestPlan(): Promise<LoadState> {
  const listed = await listAttachments(MPP_OWNER);
  if (listed.kind === "unauthorized") return { kind: "error", message: "Sign in to see the shared production plan." };
  if (listed.kind !== "ok") return { kind: "error", message: listed.message };
  const [file] = [...listed.data].sort(latestFirst);
  if (!file) return { kind: "empty" };

  const response = await fetch(attachmentUrl(file.id), { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) return { kind: "error", message: `Could not download ${file.fileName} (${response.status}).` };
  try {
    return { kind: "ready", file, plan: readMppWorkbook(await response.arrayBuffer()) };
  } catch (error) {
    return { kind: "error", message: `${file.fileName}: ${error instanceof Error ? error.message : "could not be read"}` };
  }
}

/**
 * The latest shared MPP and the purchasing plan derived from it. Loaded once the
 * workspace is ready; This Week and the navigation badges depend on it.
 */
export function useMaterialPlan(active: boolean, projects: Project[]) {
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const [settings, setSettings] = useState<MaterialPlanSettings>(DEFAULT_PLAN_SETTINGS);
  const currentWeek = useMemo(() => isoWeekOf(new Date()), []);

  useEffect(() => {
    // Saved lead times live in this browser only; read them after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(loadPlanSettings(window.localStorage));
  }, []);

  useEffect(() => {
    if (!active) return;
    let current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ kind: "loading" });
    void loadLatestPlan().then((next) => {
      if (current) setState(next);
    });
    return () => {
      current = false;
    };
  }, [active]);

  const plan = state.kind === "ready" ? state.plan : null;
  const derived = useMemo(() => {
    if (!plan) return null;
    const reconciliation = reconcileProjects(projects, plan, currentWeek);
    const projectIdByRow = new Map(reconciliation.matches.map((match) => [match.mpp.row, match.project.id]));
    return {
      rows: buildOrderPlan(plan, settings, currentWeek),
      projectIdByRow,
      issues: findPlanIssues(plan),
      offsets: measureArrivalOffsets(plan),
      reconciliation,
    };
  }, [plan, settings, currentWeek, projects]);

  function updateSettings(next: MaterialPlanSettings) {
    setSettings(next);
    savePlanSettings(window.localStorage, next);
  }

  return {
    state,
    currentWeek,
    settings,
    updateSettings,
    resetSettings: () => updateSettings(DEFAULT_PLAN_SETTINGS),
    derived,
  };
}

export type MaterialPlanState = ReturnType<typeof useMaterialPlan>;
