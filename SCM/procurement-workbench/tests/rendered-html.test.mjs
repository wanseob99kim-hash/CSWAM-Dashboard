import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe } from "node:test";
import test from "node:test";
import { Miniflare } from "miniflare";

const NAV_SECTIONS = [
  "This Week",
  "Material Plan",
  "Supplier Schedule",
  "BOM",
  "MCIP Budget",
  "Delivery",
  "Logistics",
  "NCR",
  "ECN",
  "Cashflow",
  "Project Overview",
];

async function render(path = "/", init = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
      ...init,
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the procurement workbench shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>CSWind America Procurement Workbench<\/title>/);
  assert.match(html, /<html lang="en"/);
  assert.match(html, /CSWind America/);
  assert.match(html, /Supply chain workbench/);
  assert.match(html, /<span class="sync-chip" data-state="connecting" role="status"[^>]*>.*Connecting…<\/span>/);
});

test("lists every section in the left menu, grouped by workflow", async () => {
  const html = await (await render()).text();
  const sections = [...html.matchAll(/<button type="button" class="app-nav-item"[^>]*><span>([^<]+)<\/span>/g)].map((match) => match[1]);
  assert.deepEqual(sections, NAV_SECTIONS);
  const groups = [...html.matchAll(/<span class="app-nav-group-label">([^<]+)<\/span>/g)].map((match) => match[1]);
  assert.deepEqual(groups, ["Today", "Plan", "Buy", "Receive", "Control", "Project"]);
});

test("opens on This Week for all projects, with every project in the selector", async () => {
  const html = await (await render()).text();
  assert.match(html, /<h1>This Week<\/h1>/);
  assert.match(html, /<button type="button" class="app-nav-item" aria-current="page"><span>This Week<\/span>/);
  // React separates text and values with <!-- --> markers.
  assert.match(html, /<option value="all" selected="">All projects \((?:<!-- -->)?12(?:<!-- -->)?\)<\/option>/);
  const options = [...html.matchAll(/<option value="project-[^"]+">/g)];
  assert.equal(options.length, 12);
});

test("shows This Week and hides other sections on first render", async () => {
  const html = await (await render()).text();
  assert.match(html, /<section class="this-week">/);
  assert.match(html, /<section class="cashflow-panel" hidden="">/);
  assert.match(html, /<section class="ncr-panel ncr-total-panel" hidden="">/);
  // One-project sections are held back until a project is chosen.
  assert.match(html, /<div class="scope-gate" hidden="">/);
});

describe("workspace API in the built worker", () => {
  const USER = { "oai-authenticated-user-email": "buyer@cswind.example" };
  let mf;

  before(async () => {
    mf = new Miniflare({
      modules: true,
      script: "export default { fetch() { return new Response(null, { status: 204 }); } }",
      d1Databases: { DB: "ssr-api" },
      r2Buckets: { FILES: "ssr-files" },
    });
    globalThis.__CLOUDFLARE_ENV__.FILES = await mf.getR2Bucket("FILES");
    const d1 = await mf.getD1Database("DB");
    const drizzleDir = new URL("../drizzle/", import.meta.url);
    const { entries } = JSON.parse(readFileSync(new URL("meta/_journal.json", drizzleDir), "utf8"));
    for (const { tag } of entries) {
      const statements = readFileSync(new URL(`${tag}.sql`, drizzleDir), "utf8")
        .split("--> statement-breakpoint")
        .map((statement) => statement.replace(/^--.*$/gm, "").trim())
        .filter(Boolean);
      for (const statement of statements) await d1.prepare(statement).run();
    }
    // Picked up by db/index.ts through the cloudflare:workers shim.
    globalThis.__CLOUDFLARE_ENV__.DB = d1;
  });

  after(async () => {
    delete globalThis.__CLOUDFLARE_ENV__.DB;
    delete globalThis.__CLOUDFLARE_ENV__.FILES;
    await mf?.dispose();
  });

  test("GET /api/workspace requires a signed-in user", async () => {
    const response = await render("/api/workspace");
    assert.equal(response.status, 401);
  });

  test("GET /api/workspace returns the seeded workspace", async () => {
    const response = await render("/api/workspace", { headers: { accept: "application/json", ...USER } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.data.snapshot.projects.length, 12);
    assert.equal(body.data.versions.projects["project-1700"], 1);
  });

  test("POST /api/workspace/sync saves a change", async () => {
    const todo = { id: "todo-ssr", projectId: "project-1700", title: "Smoke", owner: "", mode: "General", priority: "Normal", dueWeek: "2026-10-14", done: false };
    const response = await render("/api/workspace/sync", {
      method: "POST",
      headers: { "content-type": "application/json", ...USER },
      body: JSON.stringify({ changes: { todoItems: { upserts: [{ ...todo, baseVersion: 0 }] } } }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.data.applied.todoItems, [{ id: "todo-ssr", version: 1, deleted: false }]);
  });

  test("file routes upload, list, download, and delete an attachment", async () => {
    const form = new FormData();
    form.set("file", new File(["packing list"], "PL B1.pdf"));
    form.set("projectId", "project-1700");
    form.set("ownerType", "supplier_plan_batch");
    form.set("ownerId", "batch-ssr");
    form.set("kind", "packing_list");
    const uploaded = await render("/api/files", { method: "POST", headers: USER, body: form });
    assert.equal(uploaded.status, 201);
    const { data: file } = await uploaded.json();

    const listed = await (await render("/api/files?ownerType=supplier_plan_batch&ownerId=batch-ssr", { headers: USER })).json();
    assert.deepEqual(listed.data.map((item) => item.id), [file.id]);

    const downloaded = await render(`/api/files/${file.id}`, { headers: USER });
    assert.equal(downloaded.status, 200);
    assert.match(downloaded.headers.get("content-disposition"), /^attachment; filename="PL B1.pdf"/);
    assert.equal(await downloaded.text(), "packing list");

    assert.equal((await render(`/api/files/${file.id}`, { method: "DELETE", headers: USER })).status, 200);
    assert.equal((await render(`/api/files/${file.id}`, { headers: USER })).status, 404);
  });

  test("file uploads over 1 MB get past the framework body limit", async () => {
    // vinext treats multipart POSTs like server actions; next.config.ts raises that limit.
    const form = new FormData();
    form.set("file", new File([new Uint8Array(3 * 1024 * 1024)], "WK42 MPP 2026_R0.xlsx"));
    form.set("projectId", "workspace");
    form.set("ownerType", "workspace");
    form.set("ownerId", "mpp");
    form.set("kind", "mpp");
    const uploaded = await render("/api/files", { method: "POST", headers: USER, body: form });
    assert.equal(uploaded.status, 201);
    assert.equal((await uploaded.json()).data.sizeBytes, 3 * 1024 * 1024);
  });
});
