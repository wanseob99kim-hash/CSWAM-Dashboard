// Publishes the newest plan files to the shared workspace:
//   MPP/        Master Production Plan      -> Material Plan, This Week
//   MDMP/       Material Delivery Mgmt Plan -> Material Delivery, Cashflow, This Week
//   Lead Time/  Overall lead time workbook  -> lead times for both
//
//   npm run plans:publish                 # local dev server (http://localhost:5179)
//   npm run plans:publish -- --dry-run    # check and summarise only
//   npm run plans:publish -- --force      # upload even if the server already has the file
//
// Hosted site: set MPP_PUBLISH_URL to the site URL and MPP_PUBLISH_TOKEN to the
// secret configured on the site. The token can only upload these plan files.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { readLeadTimeWorkbook } from "../lib/leadtime/read-workbook";
import { purchaseActions, lineLeadTime } from "../lib/mdmp/analysis";
import { readMdmpWorkbook } from "../lib/mdmp/read-workbook";
import { pickLatestMppFile, type MppFileCandidate } from "../lib/mpp/files";
import { buildOrderPlan, DEFAULT_PLAN_SETTINGS } from "../lib/mpp/order-plan";
import { describeMppFile, readMppWorkbook } from "../lib/mpp/read-workbook";
import { formatWeek, isoWeekOf } from "../lib/mpp/weeks";

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const baseUrl = (process.env.MPP_PUBLISH_URL ?? "http://localhost:5179").replace(/\/+$/, "");
const token = process.env.MPP_PUBLISH_TOKEN;
const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");
const currentWeek = isoWeekOf(new Date());

type PlanKind = "mpp" | "mdmp" | "leadtime";

const PLANS: Array<{ kind: PlanKind; label: string; folder: string; summarise: (data: ArrayBuffer) => string }> = [
  {
    kind: "mpp",
    label: "MPP",
    folder: process.env.MPP_DIR ?? "MPP",
    summarise: (data) => {
      const plan = readMppWorkbook(data);
      const rows = buildOrderPlan(plan, DEFAULT_PLAN_SETTINGS, currentWeek);
      const count = (status: string) => rows.filter((row) => row.status === status).length;
      return `${plan.projects.length} projects, ${formatWeek(plan.firstWeek)} to ${formatWeek(plan.lastWeek)}; orders: ${count("order-overdue") + count("need-passed")} past deadline, ${count("order-soon")} due soon`;
    },
  },
  {
    kind: "mdmp",
    label: "MDMP",
    folder: process.env.MDMP_DIR ?? "MDMP",
    summarise: (data) => {
      const plan = readMdmpWorkbook(data);
      const lines = plan.projects.reduce((sum, project) => sum + project.lines.length, 0);
      const actions = purchaseActions(plan.projects, (line) => lineLeadTime(null, line, DEFAULT_PLAN_SETTINGS), currentWeek, DEFAULT_PLAN_SETTINGS.safetyWeeks);
      const open = plan.issues.filter((issue) => issue.status.toLowerCase() !== "close" && issue.status.toLowerCase() !== "closed").length;
      return `${plan.projects.length} projects, ${lines} PO lines, as of ${plan.referenceDate.toISOString().slice(0, 10)}; ${actions.length} lines need a PO or OC; ${open} open issues`;
    },
  },
  {
    kind: "leadtime",
    label: "Lead time",
    folder: process.env.LEADTIME_DIR ?? "Lead Time",
    summarise: (data) => {
      const table = readLeadTimeWorkbook(data);
      return `${table.routes.length} supplier routes, ${table.suppliers.length} supplier EXW lead times, ${Object.keys(table.categories).length} categories`;
    },
  },
];

function listFiles(dir: string, base = dir): MppFileCandidate[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full, base);
    return [{ path: path.relative(base, full).split(path.sep).join("/"), modifiedMs: statSync(full).mtimeMs }];
  });
}

const headers = (): Record<string, string> => (token ? { authorization: `Bearer ${token}` } : {});

async function serverHasSameFile(kind: PlanKind, fileName: string, sizeBytes: number): Promise<boolean | null> {
  const response = await fetch(`${baseUrl}/api/files?ownerType=workspace&ownerId=${kind}`, { headers: headers() });
  if (!response.ok) return null; // e.g. no browser sign-in when publishing with the token
  const body = (await response.json()) as { data: Array<{ fileName: string; sizeBytes: number; uploadedAt: string }> };
  const [latest] = [...body.data].sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt));
  return Boolean(latest && latest.fileName === fileName && latest.sizeBytes === sizeBytes);
}

async function publish(plan: (typeof PLANS)[number]): Promise<void> {
  const dir = path.resolve(projectRoot, plan.folder);
  const latest = existsSync(dir) ? pickLatestMppFile(listFiles(dir)) : null;
  if (!latest) {
    console.log(`${plan.label.padEnd(10)} no .xlsx file in ${plan.folder}/, skipped`);
    return;
  }
  const bytes = readFileSync(path.join(dir, latest.path));
  const fileName = path.basename(latest.path);
  const summary = plan.summarise(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  console.log(`${plan.label.padEnd(10)} ${latest.path} (${describeMppFile(fileName)}): ${summary}`);
  if (dryRun) return;

  if (!force && (await serverHasSameFile(plan.kind, fileName, bytes.byteLength))) {
    console.log(`${"".padEnd(10)} already on ${baseUrl}, not uploaded (use --force to upload again)`);
    return;
  }
  const form = new FormData();
  form.set("file", new Blob([bytes]), fileName);
  form.set("projectId", "workspace");
  form.set("ownerType", "workspace");
  form.set("ownerId", plan.kind);
  form.set("kind", plan.kind);
  const response = await fetch(`${baseUrl}/api/files`, { method: "POST", headers: headers(), body: form });
  const text = await response.text();
  if (!response.ok) {
    let message = text;
    try {
      message = (JSON.parse(text) as { error?: string }).error ?? text;
    } catch {
      // keep the raw text
    }
    throw new Error(`${plan.label} upload to ${baseUrl} failed (${response.status}): ${message}`);
  }
  console.log(`${"".padEnd(10)} uploaded to ${baseUrl}`);
}

async function main() {
  for (const plan of PLANS) await publish(plan);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
