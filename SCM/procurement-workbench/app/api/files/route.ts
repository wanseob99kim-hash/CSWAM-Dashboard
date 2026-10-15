import { env } from "cloudflare:workers";
import { getDb, getFilesBucket } from "@/db";
import { handleListFiles, handleUploadFile } from "@/server/files-handlers";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleListFiles(request, getDb());
}

export function POST(request: Request) {
  return handleUploadFile(request, getDb(), getFilesBucket(), undefined, { publishToken: env.MPP_PUBLISH_TOKEN });
}
