// Attachment storage: bytes in R2 (binding FILES), metadata in the D1 `files`
// table, every upload and removal recorded in change_log.
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import * as schema from "../db/schema";
import type { Clock, WorkspaceDb } from "./workspace-service";

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_FILES_PER_OWNER = 50;

/** Allowed uploads by extension; the stored content type comes from here, never from the client. */
export const ALLOWED_FILE_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  tif: "image/tiff",
  tiff: "image/tiff",
  txt: "text/plain",
  csv: "text/csv",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  msg: "application/vnd.ms-outlook",
  eml: "message/rfc822",
  zip: "application/zip",
};

const OWNER_KINDS = {
  supplier_plan: ["attachment"],
  supplier_plan_batch: ["commercial_invoice", "packing_list"],
  /** Shared, team-wide documents such as the weekly Master Production Plan. */
  workspace: ["mpp", "mdmp", "leadtime"],
} as const;

/** Production plans are read by the app, so only spreadsheets are accepted for them. */
const KIND_EXTENSIONS: Partial<Record<FileOwner["kind"], string[]>> = {
  mpp: ["xlsx", "xls"],
  mdmp: ["xlsx", "xls"],
  leadtime: ["xlsx", "xls"],
};

const id = z.string().trim().min(1).max(200);

export const fileOwnerSchema = z
  .object({
    projectId: id,
    ownerType: z.enum(schema.FILE_OWNER_TYPES),
    ownerId: id,
    kind: z.enum(schema.FILE_KINDS),
  })
  .refine((owner) => (OWNER_KINDS[owner.ownerType] as readonly string[]).includes(owner.kind), {
    message: "kind does not belong to this owner type",
    path: ["kind"],
  });

export type FileOwner = z.infer<typeof fileOwnerSchema>;

export type StoredFile = {
  id: string;
  projectId: string;
  ownerType: FileOwner["ownerType"];
  ownerId: string;
  kind: FileOwner["kind"];
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedAt: string;
};

export class FileRuleError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 413,
  ) {
    super(message);
  }
}

/** Keeps the visible name but drops path parts, control characters, and characters unsafe in headers. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f"<>|*?:]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  return cleaned || "file";
}

export function fileExtension(name: string): string {
  const match = /\.([A-Za-z0-9]+)$/.exec(name);
  return match ? match[1].toLowerCase() : "";
}

/** Public view of a file row; the storage key stays on the server. */
function toStoredFile(row: typeof schema.files.$inferSelect): StoredFile {
  return {
    id: row.id,
    projectId: row.projectId,
    ownerType: row.ownerType,
    ownerId: row.ownerId,
    kind: row.kind,
    fileName: row.fileName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    uploadedBy: row.uploadedBy,
    uploadedAt: row.uploadedAt,
  };
}

export async function listFiles(db: WorkspaceDb, owner: Pick<FileOwner, "ownerType" | "ownerId">): Promise<StoredFile[]> {
  const rows = await db
    .select()
    .from(schema.files)
    .where(and(eq(schema.files.ownerType, owner.ownerType), eq(schema.files.ownerId, owner.ownerId), isNull(schema.files.deletedAt)))
    .orderBy(desc(schema.files.uploadedAt));
  return rows.map(toStoredFile);
}

export async function uploadFile(
  db: WorkspaceDb,
  bucket: FilesBucket,
  owner: FileOwner,
  file: { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> },
  userEmail: string,
  clock: Clock,
): Promise<StoredFile> {
  const fileName = cleanFileName(file.name);
  const contentType = ALLOWED_FILE_TYPES[fileExtension(fileName)];
  if (!contentType) {
    throw new FileRuleError(`File type not allowed. Use one of: ${Object.keys(ALLOWED_FILE_TYPES).join(", ")}.`, 400);
  }
  const kindExtensions = KIND_EXTENSIONS[owner.kind];
  if (kindExtensions && !kindExtensions.includes(fileExtension(fileName))) {
    throw new FileRuleError(`This document must be one of: ${kindExtensions.join(", ")}.`, 400);
  }
  if (file.size <= 0) throw new FileRuleError("The file is empty.", 400);
  if (file.size > MAX_FILE_BYTES) throw new FileRuleError(`Files can be at most ${MAX_FILE_BYTES / 1024 / 1024} MB.`, 413);

  const existing = await db.$count(
    schema.files,
    and(eq(schema.files.ownerType, owner.ownerType), eq(schema.files.ownerId, owner.ownerId), isNull(schema.files.deletedAt)),
  );
  if (existing >= MAX_FILES_PER_OWNER) throw new FileRuleError(`At most ${MAX_FILES_PER_OWNER} files per item.`, 409);

  const fileId = crypto.randomUUID();
  const uploadedAt = clock().toISOString();
  const row = {
    id: fileId,
    ...owner,
    fileName,
    contentType,
    sizeBytes: file.size,
    // The key never contains the user's file name, so names need no escaping in storage.
    r2Key: `projects/${encodeURIComponent(owner.projectId)}/${owner.ownerType}/${encodeURIComponent(owner.ownerId)}/${fileId}`,
    uploadedBy: userEmail,
    uploadedAt,
  };

  await bucket.put(row.r2Key, await file.arrayBuffer(), {
    httpMetadata: { contentType },
    customMetadata: { fileId, uploadedBy: userEmail },
  });
  try {
    await db.batch([
      db.insert(schema.files).values(row),
      db.insert(schema.changeLog).values({
        collection: "files",
        rowId: fileId,
        action: "upsert",
        changedBy: userEmail,
        changedAt: uploadedAt,
        beforeJson: null,
        afterJson: JSON.stringify(toStoredFile({ ...row, deletedAt: null })),
      }),
    ]);
  } catch (error) {
    // Do not leave an orphaned object behind when the metadata write fails.
    await bucket.delete(row.r2Key);
    throw error;
  }
  return toStoredFile({ ...row, deletedAt: null });
}

async function liveFile(db: WorkspaceDb, fileId: string) {
  const [row] = await db
    .select()
    .from(schema.files)
    .where(and(eq(schema.files.id, fileId), isNull(schema.files.deletedAt)));
  if (!row) throw new FileRuleError("File not found.", 404);
  return row;
}

export async function openFile(db: WorkspaceDb, bucket: FilesBucket, fileId: string) {
  const row = await liveFile(db, fileId);
  const object = await bucket.get(row.r2Key);
  if (!object) throw new FileRuleError("File not found.", 404);
  return { file: toStoredFile(row), body: object.body };
}

/** Marks the metadata deleted (kept for the audit trail) and removes the bytes. */
export async function removeFile(db: WorkspaceDb, bucket: FilesBucket, fileId: string, userEmail: string, clock: Clock) {
  const row = await liveFile(db, fileId);
  const deletedAt = clock().toISOString();
  await db.batch([
    db.update(schema.files).set({ deletedAt }).where(and(eq(schema.files.id, fileId), isNull(schema.files.deletedAt))),
    db.insert(schema.changeLog).values({
      collection: "files",
      rowId: fileId,
      action: "delete",
      changedBy: userEmail,
      changedAt: deletedAt,
      beforeJson: JSON.stringify(toStoredFile(row)),
      afterJson: null,
    }),
  ]);
  await bucket.delete(row.r2Key);
}

/** `attachment` disposition with an ASCII fallback and the exact UTF-8 name (RFC 6266 / 5987). */
export function contentDisposition(fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
