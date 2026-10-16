import { useEffect, useMemo, useState } from "react";
import { attachmentUrl, listAttachments, type AttachmentFile } from "@/lib/files-api";
import type { LeadTimeTable } from "@/lib/leadtime/parse";
import { readLeadTimeWorkbook } from "@/lib/leadtime/read-workbook";
import {
  cashEvents,
  coverageChecks,
  lineLeadTime,
  poValueByLine,
  purchaseActions,
  upcomingShipments,
  type LineLeadTime,
} from "@/lib/mdmp/analysis";
import { matchMdmpProjects } from "@/lib/mdmp/match";
import type { MdmpLine, MdmpPlan } from "@/lib/mdmp/parse";
import { readMdmpWorkbook } from "@/lib/mdmp/read-workbook";
import type { MaterialPlanSettings } from "@/lib/mpp/order-plan";
import { isoWeekOf } from "@/lib/mpp/weeks";
import type { Project, PurchasePoLine } from "@/lib/types";

/** Pickups and arrivals listed this many weeks ahead. */
const UPCOMING_WEEKS = 3;

type Loaded<T> = { kind: "idle" | "loading" | "empty" } | { kind: "ready"; file: AttachmentFile; data: T } | { kind: "error"; message: string };

async function loadLatest<T>(ownerId: "mdmp" | "leadtime", read: (data: ArrayBuffer) => T): Promise<Loaded<T>> {
  const listed = await listAttachments({ ownerType: "workspace", ownerId });
  if (listed.kind === "unauthorized") return { kind: "error", message: "Sign in to see the shared plan files." };
  if (listed.kind !== "ok") return { kind: "error", message: listed.message };
  const [file] = [...listed.data].sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt));
  if (!file) return { kind: "empty" };
  const response = await fetch(attachmentUrl(file.id), { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) return { kind: "error", message: `Could not download ${file.fileName} (${response.status}).` };
  try {
    return { kind: "ready", file, data: read(await response.arrayBuffer()) };
  } catch (error) {
    return { kind: "error", message: `${file.fileName}: ${error instanceof Error ? error.message : "could not be read"}` };
  }
}

/**
 * The latest shared MDMP and lead-time workbook, and what they mean for
 * purchasing: lines needing a PO or OC, pickups and arrivals coming up,
 * material shortages against production, and vendor payments.
 */
export function useMdmp(enabled: boolean, projects: Project[], poLines: PurchasePoLine[], settings: MaterialPlanSettings) {
  const [mdmp, setMdmp] = useState<Loaded<MdmpPlan>>({ kind: "idle" });
  const [leadTimes, setLeadTimes] = useState<Loaded<LeadTimeTable>>({ kind: "idle" });
  const currentWeek = useMemo(() => isoWeekOf(new Date()), []);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMdmp({ kind: "loading" });
    setLeadTimes({ kind: "loading" });
    void loadLatest("mdmp", (data) => readMdmpWorkbook(data)).then((next) => active && setMdmp(next));
    void loadLatest("leadtime", readLeadTimeWorkbook).then((next) => active && setLeadTimes(next));
    return () => {
      active = false;
    };
  }, [enabled]);

  const plan = mdmp.kind === "ready" ? mdmp.data : null;
  const table = leadTimes.kind === "ready" ? leadTimes.data : null;

  const derived = useMemo(() => {
    if (!plan) return null;
    const leadCache = new Map<MdmpLine, LineLeadTime>();
    const leadTimeFor = (line: MdmpLine) => {
      let lead = leadCache.get(line);
      if (!lead) {
        lead = lineLeadTime(table, line, settings);
        leadCache.set(line, lead);
      }
      return lead;
    };
    const projectIdBySheet = matchMdmpProjects(projects, plan.projects);
    return {
      plan,
      leadTimeFor,
      projectIdBySheet,
      actions: purchaseActions(plan.projects, leadTimeFor, currentWeek, settings.safetyWeeks),
      coverage: plan.projects.flatMap((project) => coverageChecks(project, currentWeek)),
      upcoming: upcomingShipments(plan.projects, leadTimeFor, currentWeek, UPCOMING_WEEKS),
      cash: cashEvents(plan.projects, leadTimeFor, poValueByLine(plan.projects, poLines)),
      openIssues: plan.issues.filter((issue) => !/^clos/i.test(issue.status)),
    };
  }, [plan, table, settings, projects, poLines, currentWeek]);

  return { mdmp, leadTimes, leadTable: table, currentWeek, derived };
}

export type MdmpState = ReturnType<typeof useMdmp>;
