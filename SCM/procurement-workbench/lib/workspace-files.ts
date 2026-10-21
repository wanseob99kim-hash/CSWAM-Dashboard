// Loads the newest shared workspace file of one kind (MDMP, lead times, WINSYS
// extract, Sales Pipeline budgets) published with npm run plans:publish.
import { attachmentUrl, listAttachments, type AttachmentFile } from "./files-api";

export type WorkspaceFileKind = "mdmp" | "leadtime" | "winsys" | "pipeline";

export type Loaded<T> = { kind: "idle" | "loading" | "empty" } | { kind: "ready"; file: AttachmentFile; data: T } | { kind: "error"; message: string };

export async function loadLatestWorkspaceFile<T>(ownerId: WorkspaceFileKind, read: (data: ArrayBuffer) => T): Promise<Loaded<T>> {
  const listed = await listAttachments({ ownerType: "workspace", ownerId });
  if (listed.kind === "unauthorized") return { kind: "error", message: "Sign in to see the shared plan files." };
  if (listed.kind !== "ok") return { kind: "error", message: listed.message };
  const [file] = [...listed.data].sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt));
  if (!file) return { kind: "empty" };
  const response = await fetch(attachmentUrl(file.id), { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) return { kind: "error", message: `Could not download ${file.fileName} (${response.status}).` };
  try {
    return { kind: "ready", file, data: read(await response.arrayBuffer()) };
  } catch (error) {
    return { kind: "error", message: `${file.fileName}: ${error instanceof Error ? error.message : "could not be read"}` };
  }
}

export const decodeText = (data: ArrayBuffer) => new TextDecoder().decode(data);
