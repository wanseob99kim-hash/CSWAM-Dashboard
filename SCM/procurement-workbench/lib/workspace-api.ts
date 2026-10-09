// Browser client for /api/workspace. Errors are classified so the sync hook can
// decide between "sign in", "retry later", and "this data was rejected".
import type { ServerRead, ServerSyncResult } from "./sync-client";
import type { SyncRequest } from "./sync";

export type ApiOutcome<T> =
  | { kind: "ok"; data: T }
  | { kind: "unauthorized" }
  | { kind: "rejected"; message: string }
  | { kind: "unavailable"; message: string };

async function call<T>(input: string, init?: RequestInit): Promise<ApiOutcome<T>> {
  let response: Response;
  try {
    response = await fetch(input, { ...init, credentials: "same-origin", cache: "no-store" });
  } catch {
    return { kind: "unavailable", message: "No connection to the server." };
  }

  if (response.status === 401) return { kind: "unauthorized" };

  let body: { success?: boolean; data?: T; error?: string | null } | null = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (response.ok && body?.success) return { kind: "ok", data: body.data as T };
  const message = body?.error ?? `Server responded with ${response.status}.`;
  return response.status >= 400 && response.status < 500 ? { kind: "rejected", message } : { kind: "unavailable", message };
}

export function fetchWorkspace(since: string | null): Promise<ApiOutcome<ServerRead>> {
  const query = since ? `?since=${encodeURIComponent(since)}` : "";
  return call<ServerRead>(`/api/workspace${query}`, { headers: { accept: "application/json" } });
}

export function postSync(request: SyncRequest): Promise<ApiOutcome<ServerSyncResult>> {
  return call<ServerSyncResult>("/api/workspace/sync", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(request),
  });
}
