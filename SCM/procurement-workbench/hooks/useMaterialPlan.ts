import { useEffect, useMemo, useState } from "react";
import { attachmentUrl, listAttachments, type AttachmentFile } from "@/lib/files-api";
import { mppWeekOptions, type MppWeekOption } from "@/lib/mpp/files";
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

type ListState = { kind: "ok"; files: AttachmentFile[] } | { kind: "error"; message: string };

async function listPlans(): Promise<ListState> {
  const listed = await listAttachments(MPP_OWNER);
  if (listed.kind === "unauthorized") return { kind: "error", message: "Sign in to see the shared production plan." };
  if (listed.kind !== "ok") return { kind: "error", message: listed.message };
  return { kind: "ok", files: [...listed.data] };
}

async function loadPlan(file: AttachmentFile): Promise<LoadState> {
  const response = await fetch(attachmentUrl(file.id), { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) return { kind: "error", message: `Could not download ${file.fileName} (${response.status}).` };
  try {
    return { kind: "ready", file, plan: readMppWorkbook(await response.arrayBuffer()) };
  } catch (error) {
    return { kind: "error", message: `${file.fileName}: ${error instanceof Error ? error.message : "could not be read"}` };
  }
}

/** Uploaded files that name no week (rare) are still usable: newest upload first. */
const latestUpload = (files: AttachmentFile[]) => [...files].sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt))[0] ?? null;

/**
 * The shared MPP for the chosen plan week (the newest by default) and the
 * purchasing plan derived from it. Loaded once the
 * workspace is ready; This Week and the navigation badges depend on it.
 */
export function useMaterialPlan(active: boolean, projects: Project[]) {
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const [files, setFiles] = useState<AttachmentFile[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const weekOptions: MppWeekOption<AttachmentFile>[] = useMemo(() => mppWeekOptions(files ?? []), [files]);
  const latestFile = weekOptions.find((option) => option.file)?.file ?? (files ? latestUpload(files) : null);
  const selectedFile = files?.find((file) => file.id === selectedId) ?? latestFile;
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
    void listPlans().then((listed) => {
      if (!current) return;
      if (listed.kind === "error") setState(listed);
      else setFiles(listed.files);
    });
    return () => {
      current = false;
    };
  }, [active]);

  useEffect(() => {
    if (!files) return;
    if (!selectedFile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ kind: "empty" });
      return;
    }
    let current = true;
    setState({ kind: "loading" });
    void loadPlan(selectedFile).then((next) => {
      if (current) setState(next);
    });
    return () => {
      current = false;
    };
  }, [files, selectedFile]);

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
    weekOptions,
    selectedFileId: selectedFile?.id ?? null,
    /** True while an older plan week than the newest upload is shown. */
    viewingOlder: Boolean(selectedFile && latestFile && selectedFile.id !== latestFile.id),
    selectPlanFile: (fileId: string) => setSelectedId(fileId),
    currentWeek,
    settings,
    updateSettings,
    resetSettings: () => updateSettings(DEFAULT_PLAN_SETTINGS),
    derived,
  };
}

export type MaterialPlanState = ReturnType<typeof useMaterialPlan>;
