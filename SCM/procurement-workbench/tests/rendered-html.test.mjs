import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe } from "node:test";
import test from "node:test";
import { Miniflare } from "miniflare";

const WORKSPACE_TABS = [
  "Overview",
  "Delivery",
  "Supplier Schedule",
  "MCIP",
  "Cashflow",
  "Logistics",
  "BOM",
  "NCR",
  "ECN",
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
  assert.match(html, /Wind tower procurement/);
});

test("renders every workspace tab", async () => {
  const html = await (await render()).text();
  const tabs = [...html.matchAll(/<button class="workspace-tab[^"]*">([^<]+)<\/button>/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(tabs, WORKSPACE_TABS);
});

test("opens on the default Panther Grove project with seeded projects in the sidebar", async () => {
  const html = await (await render()).text();
  assert.match(html, /<h1>Panther Grove Phase 2 - 5T<\/h1>/);

  const projects = [...html.matchAll(/<button class="project-button[^"]*"><span><strong>([^<]+)<\/strong>/g)];
  assert.ok(projects.length >= 10, `expected seeded projects, got ${projects.length}`);
  assert.match(html, /<button class="project-button active"><span><strong>Panther Grove Phase 2 - 5T<\/strong>/);
});

test("shows only the overview panel on first render", async () => {
  const html = await (await render()).text();
  assert.match(html, /<section class="overview-panel">/);
  assert.match(html, /<section class="cashflow-panel" hidden="">/);
  assert.match(html, /<section class="ncr-panel ncr-total-panel" hidden="">/);
});

describe("workspace API in the built worker", () => {
  const USER = { "oai-authenticated-user-email": "buyer@cswind.example" };
  let mf;

  before(async () => {
    mf = new Miniflare({
      modules: true,
      script: "export default { fetch() { return new Response(null, { status: 204 }); } }",
      d1Databases: { DB: "ssr-api" },
    });
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
});
