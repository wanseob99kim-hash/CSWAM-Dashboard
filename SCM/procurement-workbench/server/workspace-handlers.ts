// HTTP layer for the workspace API. Route files only pass in the D1 database,
// so these handlers can be tested against a local D1.
import { userFromHeaders } from "../lib/auth-headers";
import { MAX_SYNC_BODY_BYTES, sinceSchema, syncRequestSchema } from "./validation";
import { applySync, readWorkspace, type Clock, type WorkspaceDb } from "./workspace-service";

type ApiResponse<T> = {
  success: boolean;
  data: T | null;
  error: string | null;
};

function respond<T>(status: number, body: ApiResponse<T>): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

const fail = (status: number, error: string) => respond(status, { success: false, data: null, error });
const ok = <T>(data: T) => respond(200, { success: true, data, error: null });

function serverError(context: string, error: unknown): Response {
  // Details go to the Worker log only; clients get a generic message.
  console.error(`[workspace-api] ${context}`, error);
  return fail(500, "Something went wrong while saving or loading the workspace. Please try again.");
}

export async function handleGetWorkspace(request: Request, db: WorkspaceDb, clock: Clock = () => new Date()) {
  if (!userFromHeaders(request.headers)) return fail(401, "Sign in to load the workspace.");

  const since = new URL(request.url).searchParams.get("since");
  if (since !== null && !sinceSchema.safeParse(since).success) {
    return fail(400, "`since` must be an ISO timestamp returned as serverTime.");
  }

  try {
    return ok(await readWorkspace(db, since, clock));
  } catch (error) {
    return serverError("read failed", error);
  }
}

export async function handleSync(request: Request, db: WorkspaceDb, clock: Clock = () => new Date()) {
  const user = userFromHeaders(request.headers);
  if (!user) return fail(401, "Sign in to save changes.");

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_SYNC_BODY_BYTES) return fail(413, "Too many changes in one request. Save in smaller parts.");

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_SYNC_BODY_BYTES) return fail(413, "Too many changes in one request. Save in smaller parts.");
    body = JSON.parse(text);
  } catch {
    return fail(400, "Request body must be JSON.");
  }

  const parsed = syncRequestSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(400, `Invalid changes: ${issue.path.join(".") || "request"} ${issue.message}`);
  }

  try {
    return ok(await applySync(db, parsed.data, user.email, clock));
  } catch (error) {
    return serverError("sync failed", error);
  }
}
