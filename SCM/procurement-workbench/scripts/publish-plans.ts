// Publishes the newest plan files to the shared workspace:
//   MPP/        Master Production Plan      -> Material Plan, This Week
//   MDMP/       Material Delivery Mgmt Plan -> Material Delivery, Cashflow, This Week
//   Lead Time/  Overall lead time workbook  -> lead times for both
//   WINSYS/     PO Status exports (PO Detail/, GR Detail/, Invoice Detail/)
//               -> one JSON extract: PO values, receipts, invoices and due dates
//
//   npm run plans:publish                 # local dev server (http://localhost:5179)
//   npm run plans:publish -- --dry-run    # check and summarise only
//   npm run plans:publish -- --force      # upload even if the server already has the file
//   npm run plans:publish -- --all        # every MPP week in MPP/ (for the week picker), not just the newest
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
import * as XLSX from "xlsx";
import { buildWinsysExtract } from "../lib/winsys/extract";
import { parseGrDetail, parseInvoiceDetail, parsePoDetail } from "../lib/winsys/parse";

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const baseUrl = (process.env.MPP_PUBLISH_URL ?? "http://localhost:5179").replace(/\/+$/, "");
const token = process.env.MPP_PUBLISH_TOKEN;
const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");
const allMppWeeks = process.argv.includes("--all");
const currentWeek = isoWeekOf(new Date());

type PlanKind = "mpp" | "mdmp" | "leadtime" | "winsys";

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

/** fetch that retries once when a kept-alive connection was closed while the script was busy reading workbooks. */
async function request(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (!/ECONNRESET|socket|other side closed/i.test(String((error as { cause?: unknown }).cause ?? error))) throw error;
    return fetch(url, init);
  }
}

const headers = (): Record<string, string> => (token ? { authorization: `Bearer ${token}` } : {});

type ServerFile = { fileName: string; sizeBytes: number; uploadedAt: string };

async function serverFiles(kind: PlanKind): Promise<ServerFile[] | null> {
  const response = await request(`${baseUrl}/api/files?ownerType=workspace&ownerId=${kind}`, { headers: headers() });
  if (!response.ok) return null; // e.g. no browser sign-in when publishing with the token
  return ((await response.json()) as { data: ServerFile[] }).data;
}

/** MPP weeks are picked by file name, so any copy on the server counts; MDMP and lead times use the latest upload. */
function alreadyOnServer(kind: PlanKind, files: ServerFile[] | null, fileName: string, sizeBytes: number): boolean {
  if (!files) return false;
  const same = (file: ServerFile) => file.fileName === fileName && file.sizeBytes === sizeBytes;
  if (kind === "mpp") return files.some(same);
  const [latest] = [...files].sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt));
  return Boolean(latest && same(latest));
}

const SPREADSHEET = /.xlsx?$/i;

async function publish(plan: (typeof PLANS)[number]): Promise<void> {
  const dir = path.resolve(projectRoot, plan.folder);
  const candidates = existsSync(dir) ? listFiles(dir) : [];
  const latest = pickLatestMppFile(candidates);
  if (!latest) {
    console.log(`${plan.label.padEnd(10)} no .xlsx file in ${plan.folder}/, skipped`);
    return;
  }
  const chosen =
    plan.kind === "mpp" && allMppWeeks
      ? candidates.filter((file) => SPREADSHEET.test(file.path) && !path.basename(file.path).startsWith("~$")).sort((left, right) => left.path.localeCompare(right.path))
      : [latest];
  const onServer = dryRun ? null : await serverFiles(plan.kind);
  for (const file of chosen) await publishFile(plan, dir, file.path, onServer);
}

async function publishFile(plan: (typeof PLANS)[number], dir: string, relativePath: string, onServer: ServerFile[] | null): Promise<void> {
  const latest = { path: relativePath };
  const bytes = readFileSync(path.join(dir, latest.path));
  const fileName = path.basename(latest.path);
  const summary = plan.summarise(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  console.log(`${plan.label.padEnd(10)} ${latest.path} (${describeMppFile(fileName)}): ${summary}`);
  if (dryRun) return;

  await upload(plan.kind, plan.label, fileName, bytes, onServer);
}

async function upload(kind: PlanKind, label: string, fileName: string, bytes: Uint8Array, onServer: ServerFile[] | null): Promise<void> {
  if (!force && alreadyOnServer(kind, onServer, fileName, bytes.byteLength)) {
    console.log(`${"".padEnd(10)} already on ${baseUrl}, not uploaded (use --force to upload again)`);
    return;
  }
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(bytes)]), fileName);
  form.set("projectId", "workspace");
  form.set("ownerType", "workspace");
  form.set("ownerId", kind);
  form.set("kind", kind);
  const response = await request(`${baseUrl}/api/files`, { method: "POST", headers: headers(), body: form });
  const text = await response.text();
  if (!response.ok) {
    let message = text;
    try {
      message = (JSON.parse(text) as { error?: string }).error ?? text;
    } catch {
      // keep the raw text
    }
    throw new Error(`${label} upload to ${baseUrl} failed (${response.status}): ${message}`);
  }
  console.log(`${"".padEnd(10)} uploaded to ${baseUrl}`);
}

const WINSYS_FOLDERS = { po: "PO Detail", gr: "GR Detail", invoice: "Invoice Detail" } as const;
const DATE_IN_NAME = /(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})/;

function readSheetRows(file: string): unknown[][] {
  const workbook = XLSX.read(readFileSync(file), { type: "buffer", cellDates: true });
  return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: "" }) as unknown[][];
}

/** Newest export per WINSYS subfolder (by the date in its name, then modification time). */
function newestExport(dir: string): { file: string; date: string | null } | null {
  if (!existsSync(dir)) return null;
  const files = listFiles(dir).filter((file) => /\.xlsx?$/i.test(file.path) && !path.basename(file.path).startsWith("~$"));
  const dated = files.map((file) => {
    const match = DATE_IN_NAME.exec(path.basename(file.path));
    return { ...file, date: match ? `${match[1]}-${match[2]}-${match[3]}` : null };
  });
  dated.sort((left, right) => (right.date ?? "").localeCompare(left.date ?? "") || right.modifiedMs - left.modifiedMs);
  return dated[0] ? { file: path.join(dir, dated[0].path), date: dated[0].date } : null;
}

async function publishWinsys(): Promise<void> {
  const root = path.resolve(projectRoot, process.env.WINSYS_DIR ?? "WINSYS");
  const found = Object.fromEntries(
    Object.entries(WINSYS_FOLDERS).map(([key, folder]) => [key, newestExport(path.join(root, folder))]),
  ) as Record<keyof typeof WINSYS_FOLDERS, ReturnType<typeof newestExport>>;
  const missing = Object.entries(found).filter(([, value]) => !value).map(([key]) => `WINSYS/${WINSYS_FOLDERS[key as keyof typeof WINSYS_FOLDERS]}/`);
  if (missing.length) {
    console.log(`${"WINSYS".padEnd(10)} no export in ${missing.join(", ")}, skipped`);
    return;
  }
  const { po, gr, invoice } = found as Record<keyof typeof WINSYS_FOLDERS, NonNullable<ReturnType<typeof newestExport>>>;
  const asOf = po.date ?? new Date().toISOString().slice(0, 10);
  const extract = buildWinsysExtract(
    { poLines: parsePoDetail(readSheetRows(po.file)), receipts: parseGrDetail(readSheetRows(gr.file)), invoices: parseInvoiceDetail(readSheetRows(invoice.file)) },
    { po: path.basename(po.file), gr: path.basename(gr.file), invoice: path.basename(invoice.file) },
    asOf,
  );
  const bytes = new TextEncoder().encode(JSON.stringify(extract));
  const live = extract.pos.filter((po) => !po.cancelled);
  const value = live.reduce((sum, po) => sum + po.usdAmount, 0);
  const openDue = extract.openInvoices.filter((item) => (item.dueDate ?? "") >= new Date().toISOString().slice(0, 10)).reduce((sum, item) => sum + item.usdAmount, 0);
  console.log(
    `${"WINSYS".padEnd(10)} exports of ${asOf}: ${live.length} POs (${Math.round(value / 1e6)}M USD), ${extract.openInvoices.length} open invoice lines, ${Math.round(openDue / 1e6)}M USD invoiced and not yet due; extract ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB`,
  );
  if (dryRun) return;
  await upload("winsys", "WINSYS", `WINSYS extract ${asOf}.json`, bytes, await serverFiles("winsys"));
}

async function main() {
  for (const plan of PLANS) await publish(plan);
  await publishWinsys();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.message}${error.cause ? ` (${String(error.cause)})` : ""}` : error);
  process.exitCode = 1;
});
