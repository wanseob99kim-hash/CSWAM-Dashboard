import { getDb } from "@/db";
import { handleGetWorkspace } from "@/server/workspace-handlers";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleGetWorkspace(request, getDb());
}
