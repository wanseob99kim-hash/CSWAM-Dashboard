import { getDb } from "@/db";
import { handleSync } from "@/server/workspace-handlers";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleSync(request, getDb());
}
