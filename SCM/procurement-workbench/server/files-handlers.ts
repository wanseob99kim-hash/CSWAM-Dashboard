// HTTP layer for attachments. Route files pass in D1 and the R2 bucket so these
// handlers can be tested against Miniflare.
import { z } from "zod";
import {
  contentDisposition,
  FileRuleError,
  fileOwnerSchema,
  listFiles,
  MAX_FILE_BYTES,
  openFile,
  removeFile,
  uploadFile,
} from "./files-service";
import { created, fail, ok, serverError } from "./http";
import { requestUser } from "./request-user";
import type { Clock, WorkspaceDb } from "./workspace-service";

const FILES_ERROR = "Something went wrong with the file. Please try again.";
/** Multipart overhead allowance on top of the file itself. */
const MAX_UPLOAD_REQUEST_BYTES = MAX_FILE_BYTES + 64 * 1024;
const listQuerySchema = z.object({
  ownerType: z.enum(["supplier_plan", "supplier_plan_batch"]),
  ownerId: z.string().trim().min(1).max(200),
});

function handleError(context: string, error: unknown): Response {
  if (error instanceof FileRuleError) return fail(error.status, error.message);
  return serverError("files-api", context, error, FILES_ERROR);
}

export async function handleListFiles(request: Request, db: WorkspaceDb) {
  if (!requestUser(request)) return fail(401, "Sign in to see attachments.");
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const query = listQuerySchema.safeParse(params);
  if (!query.success) return fail(400, "ownerType and ownerId are required.");
  try {
    return ok(await listFiles(db, query.data));
  } catch (error) {
    return handleError("list failed", error);
  }
}

export async function handleUploadFile(request: Request, db: WorkspaceDb, bucket: FilesBucket, clock: Clock = () => new Date()) {
  const user = requestUser(request);
  if (!user) return fail(401, "Sign in to upload attachments.");
  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_REQUEST_BYTES) {
    return fail(413, `Files can be at most ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "Send the file as multipart/form-data.");
  }
  const file = form.get("file");
  if (!file || typeof file === "string") return fail(400, "Attach exactly one file in the `file` field.");
  const owner = fileOwnerSchema.safeParse({
    projectId: form.get("projectId"),
    ownerType: form.get("ownerType"),
    ownerId: form.get("ownerId"),
    kind: form.get("kind"),
  });
  if (!owner.success) {
    const issue = owner.error.issues[0];
    return fail(400, `Invalid attachment target: ${issue.path.join(".") || "request"} ${issue.message}`);
  }

  try {
    return created(await uploadFile(db, bucket, owner.data, file, user.email, clock));
  } catch (error) {
    return handleError("upload failed", error);
  }
}

export async function handleDownloadFile(request: Request, fileId: string, db: WorkspaceDb, bucket: FilesBucket) {
  if (!requestUser(request)) return fail(401, "Sign in to download attachments.");
  try {
    const { file, body } = await openFile(db, bucket, fileId);
    return new Response(body, {
      headers: {
        "content-type": file.contentType,
        "content-length": String(file.sizeBytes),
        // Always a download, never rendered inline, and never sniffed into another type.
        "content-disposition": contentDisposition(file.fileName),
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return handleError("download failed", error);
  }
}

export async function handleDeleteFile(request: Request, fileId: string, db: WorkspaceDb, bucket: FilesBucket, clock: Clock = () => new Date()) {
  const user = requestUser(request);
  if (!user) return fail(401, "Sign in to remove attachments.");
  try {
    await removeFile(db, bucket, fileId, user.email, clock);
    return ok({ id: fileId });
  } catch (error) {
    return handleError("delete failed", error);
  }
}
