// Writes the demo seed into the custom Drizzle migration created by
// `drizzle-kit generate --custom --name=seed_demo`.
import { readdirSync, writeFileSync } from "node:fs";
import { buildSeedSql } from "../db/seed";

const migrationsDir = new URL("../drizzle/", import.meta.url);
const target = readdirSync(migrationsDir).find((name) => /^\d{4}_seed_demo\.sql$/.test(name));
if (!target) {
  throw new Error("No *_seed_demo.sql migration. Run: npx drizzle-kit generate --custom --name=seed_demo");
}
writeFileSync(new URL(target, migrationsDir), buildSeedSql());
console.log(`wrote drizzle/${target}`);
