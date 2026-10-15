// Publishes the newest Master Production Plan in MPP/ to the shared workspace.
//
//   npm run mpp:publish                 # local dev server (http://localhost:5179)
//   npm run mpp:publish -- --dry-run    # check and summarise only
//   npm run mpp:publish -- --force      # upload even if the server already has this file
//
// Hosted site: set MPP_PUBLISH_URL to the site URL and MPP_PUBLISH_TOKEN to the
// secret configured on the site. The token can only upload the production plan.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pickLatestMppFile, type MppFileCandidate } from "../lib/mpp/files";
import { buildOrderPlan, DEFAULT_PLAN_SETTINGS } from "../lib/mpp/order-plan";
import { describeMppFile, readMppWorkbook } from "../lib/mpp/read-workbook";
import { formatWeek, isoWeekOf } from "../lib/mpp/weeks";

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const mppDir = path.resolve(projectRoot, process.env.MPP_DIR ?? "MPP");
const baseUrl = (process.env.MPP_PUBLISH_URL ?? "http://localhost:5179").replace(/\/+$/, "");
const token = process.env.MPP_PUBLISH_TOKEN;
const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

function listFiles(dir: string, base = dir): MppFileCandidate[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full, base);
    return [{ path: path.relative(base, full).split(path.sep).join("/"), modifiedMs: statSync(full).mtimeMs }];
  });
}

function headers(): Record<string, string> {
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function serverHasSameFile(fileName: string, sizeBytes: number): Promise<boolean | null> {
  const response = await fetch(`${baseUrl}/api/files?ownerType=workspace&ownerId=mpp`, { headers: headers() });
  if (!response.ok) return null; // e.g. no browser sign-in when publishing with the token
  const body = (await response.json()) as { data: Array<{ fileName: string; sizeBytes: number; uploadedAt: string }> };
  const [latest] = [...body.data].sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt));
  return Boolean(latest && latest.fileName === fileName && latest.sizeBytes === sizeBytes);
}

async function main() {
  const latest = pickLatestMppFile(listFiles(mppDir));
  if (!latest) throw new Error(`No .xlsx or .xls file in ${mppDir}`);

  const fullPath = path.join(mppDir, latest.path);
  const bytes = readFileSync(fullPath);
  const fileName = path.basename(latest.path);
  const plan = readMppWorkbook(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));

  const currentWeek = isoWeekOf(new Date());
  const rows = buildOrderPlan(plan, DEFAULT_PLAN_SETTINGS, currentWeek);
  const count = (status: string) => rows.filter((row) => row.status === status).length;
  console.log(`MPP:      ${latest.path} (${describeMppFile(fileName)}, ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`Plan:     ${plan.projects.length} projects, ${formatWeek(plan.firstWeek)} to ${formatWeek(plan.lastWeek)}`);
  console.log(
    `Orders:   ${count("order-overdue") + count("need-passed")} past deadline, ${count("order-soon")} due within ${DEFAULT_PLAN_SETTINGS.dueSoonWeeks} weeks, ${count("planned")} planned (default lead times, ${formatWeek(currentWeek)})`,
  );
  if (dryRun) return;

  if (!force && (await serverHasSameFile(fileName, bytes.byteLength))) {
    console.log(`Server:   ${baseUrl} already has this file. Nothing to upload (use --force to upload again).`);
    return;
  }

  const form = new FormData();
  form.set("file", new Blob([bytes]), fileName);
  form.set("projectId", "workspace");
  form.set("ownerType", "workspace");
  form.set("ownerId", "mpp");
  form.set("kind", "mpp");
  const response = await fetch(`${baseUrl}/api/files`, { method: "POST", headers: headers(), body: form });
  const text = await response.text();
  if (!response.ok) {
    const message = (() => {
      try {
        return (JSON.parse(text) as { error?: string }).error ?? text;
      } catch {
        return text;
      }
    })();
    throw new Error(`Upload to ${baseUrl} failed (${response.status}): ${message}`);
  }
  console.log(`Server:   uploaded to ${baseUrl}. Open Material Plan to see it.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
