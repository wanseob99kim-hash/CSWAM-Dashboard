// Links Sales Pipeline rows ("2026 Panther Grove II", "2026 Xcel-Hale",
// "2027 Highland126S") to workbench projects ("Panther Grove Phase 2 - 100T",
// "Hale - 2T", "Highland - 124 Adapter").
import type { Project } from "../types";
import type { PipelineProject } from "./parse";

const CUSTOMER_WORDS = new Set(["vestas", "vt", "nordex", "sgre", "se", "ge", "xcel", "accio", "aes", "fge"]);
const FILLER_WORDS = new Set(["adapter", "adapters", "adap", "tw", "phase"]);

/** "2026 Panther Grove II" and "Panther Grove Phase 2 - 100T" both become "panther grove ii". */
export function pipelineKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\bphase\s*2\b/g, "ii")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/\d+[a-z]*$/, ""))
    .filter((word) => word && !/\d/.test(word) && !CUSTOMER_WORDS.has(word) && !FILLER_WORDS.has(word))
    .join(" ");
}

/** The pipeline row for a project: same key, or one key a whole-word prefix of the other; the earliest row wins. */
export function pipelineFor(project: Pick<Project, "name">, rows: readonly PipelineProject[]): PipelineProject | null {
  const key = pipelineKey(project.name);
  if (!key) return null;
  const sameOrPrefix = (other: string) => other === key || key.startsWith(`${other} `) || other.startsWith(`${key} `);
  return rows.find((row) => pipelineKey(row.project) === key) ?? rows.find((row) => sameOrPrefix(pipelineKey(row.project))) ?? null;
}
