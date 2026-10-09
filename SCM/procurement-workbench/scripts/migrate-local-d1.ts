// Applies drizzle/ migrations to the D1 database that `npm run dev` uses
// (persisted by the Cloudflare Vite plugin under .wrangler/state/v3).
// Production migrations are applied by the hosting platform, not this script.
import { readFileSync } from "node:fs";
import { Miniflare } from "miniflare";

// Must match SITE_CREATOR_PLACEHOLDER_DATABASE_ID in vite.config.ts.
const LOCAL_DATABASE_ID = "00000000-0000-4000-8000-000000000000";
const drizzleDir = new URL("../drizzle/", import.meta.url);

const mf = new Miniflare({
  modules: true,
  script: "export default { fetch() { return new Response(null, { status: 204 }); } }",
  defaultPersistRoot: new URL("../.wrangler/state/v3", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
  d1Databases: { DB: LOCAL_DATABASE_ID },
});

try {
  const d1 = await mf.getD1Database("DB");
  await d1.prepare("CREATE TABLE IF NOT EXISTS _local_migrations (tag TEXT PRIMARY KEY, applied_at TEXT NOT NULL)").run();
  const applied = new Set((await d1.prepare("SELECT tag FROM _local_migrations").all<{ tag: string }>()).results.map((row) => row.tag));
  const { entries } = JSON.parse(readFileSync(new URL("meta/_journal.json", drizzleDir), "utf8")) as { entries: Array<{ tag: string }> };

  for (const { tag } of entries) {
    if (applied.has(tag)) continue;
    const statements = readFileSync(new URL(`${tag}.sql`, drizzleDir), "utf8")
      .split("--> statement-breakpoint")
      .map((statement) => statement.replace(/^--.*$/gm, "").trim())
      .filter(Boolean)
      .map((statement) => d1.prepare(statement));
    await d1.batch([...statements, d1.prepare("INSERT INTO _local_migrations (tag, applied_at) VALUES (?, ?)").bind(tag, new Date().toISOString())]);
    console.log(`applied ${tag}`);
  }
  console.log("local D1 is up to date");
} finally {
  await mf.dispose();
}
