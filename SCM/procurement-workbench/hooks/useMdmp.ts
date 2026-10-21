import { useEffect, useMemo, useState } from "react";
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
import { matchMdmpToMpp, scheduleDrift, withMppProcesses } from "@/lib/mdmp/mpp-sync";
import type { MdmpLine, MdmpPlan } from "@/lib/mdmp/parse";
import { readMdmpWorkbook } from "@/lib/mdmp/read-workbook";
import type { MaterialPlanSettings } from "@/lib/mpp/order-plan";
import type { MppPlan, MppProject } from "@/lib/mpp/parse";
import { isoWeekOf } from "@/lib/mpp/weeks";
import type { Project, PurchasePoLine } from "@/lib/types";
import { cancelledMdmpPos, receiptGaps, splitInvoiced, unknownMdmpPos, winsysPoAmounts } from "@/lib/winsys/analysis";
import type { WinsysExtract } from "@/lib/winsys/extract";
import { loadLatestWorkspaceFile as loadLatest, type Loaded } from "@/lib/workspace-files";

/** Pickups and arrivals listed this many weeks ahead. */
const UPCOMING_WEEKS = 3;

/**
 * The latest shared MDMP and lead-time workbook, and what they mean for
 * purchasing: lines needing a PO or OC, pickups and arrivals coming up,
 * material shortages against production, and vendor payments.
 */
export function useMdmp(
  enabled: boolean,
  projects: Project[],
  poLines: PurchasePoLine[],
  settings: MaterialPlanSettings,
  mppPlan: MppPlan | null,
  winsys: Loaded<WinsysExtract>,
) {
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
  const extract = winsys.kind === "ready" ? winsys.data : null;

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
    // Shortages follow the MPP shown in the top bar; the MDMP copy is the fallback.
    const mppBySheet = mppPlan ? matchMdmpToMpp(plan.projects, mppPlan) : new Map<string, MppProject>();
    const scheduled = plan.projects.map((project) => withMppProcesses(project, mppBySheet.get(project.sheet)));
    return {
      plan,
      leadTimeFor,
      projectIdBySheet,
      actions: purchaseActions(plan.projects, leadTimeFor, currentWeek, settings.safetyWeeks),
      mppBySheet,
      drift: scheduleDrift(plan.projects, mppBySheet),
      coverage: scheduled.flatMap((project) => coverageChecks(project, currentWeek)),
      upcoming: upcomingShipments(plan.projects, leadTimeFor, currentWeek, UPCOMING_WEEKS),
      // WINSYS PO values replace the manually uploaded SAP PO detail when published.
      cash: extract
        ? splitInvoiced(cashEvents(plan.projects, leadTimeFor, poValueByLine(plan.projects, winsysPoAmounts(extract))), plan.projects, extract)
        : cashEvents(plan.projects, leadTimeFor, poValueByLine(plan.projects, poLines)).map((event) => ({ ...event, invoicedAmount: 0, forecastAmount: event.amount })),
      receiptGaps: extract ? receiptGaps(plan.projects, extract) : [],
      cancelledPos: extract ? cancelledMdmpPos(plan.projects, extract) : [],
      unknownPos: extract ? unknownMdmpPos(plan.projects, extract) : [],
      openIssues: plan.issues.filter((issue) => !/^clos/i.test(issue.status)),
    };
  }, [plan, table, extract, settings, projects, poLines, currentWeek, mppPlan]);

  return { mdmp, leadTimes, winsys, leadTable: table, currentWeek, derived };
}

export type MdmpState = ReturnType<typeof useMdmp>;
