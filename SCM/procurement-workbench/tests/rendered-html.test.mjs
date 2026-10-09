import assert from "node:assert/strict";
import test from "node:test";

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

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
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
