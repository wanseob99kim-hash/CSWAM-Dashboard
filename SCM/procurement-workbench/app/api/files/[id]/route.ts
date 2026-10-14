import { getDb, getFilesBucket } from "@/db";
import { handleDeleteFile, handleDownloadFile } from "@/server/files-handlers";

export const dynamic = "force-dynamic";

type FileRouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: FileRouteContext) {
  const { id } = await params;
  return handleDownloadFile(request, id, getDb(), getFilesBucket());
}

export async function DELETE(request: Request, { params }: FileRouteContext) {
  const { id } = await params;
  return handleDeleteFile(request, id, getDb(), getFilesBucket());
}
