// Browser client for /api/files.
import { callApi, type ApiOutcome } from "./workspace-api";

export type FileOwnerRef = {
  projectId: string;
  ownerType: "supplier_plan" | "supplier_plan_batch";
  ownerId: string;
  kind: "attachment" | "commercial_invoice" | "packing_list";
};

export type AttachmentFile = FileOwnerRef & {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedAt: string;
};

export function listAttachments(owner: Pick<FileOwnerRef, "ownerType" | "ownerId">): Promise<ApiOutcome<AttachmentFile[]>> {
  const query = new URLSearchParams({ ownerType: owner.ownerType, ownerId: owner.ownerId });
  return callApi<AttachmentFile[]>(`/api/files?${query}`, { headers: { accept: "application/json" } });
}

export function uploadAttachment(owner: FileOwnerRef, file: File): Promise<ApiOutcome<AttachmentFile>> {
  const form = new FormData();
  form.set("file", file);
  for (const [key, value] of Object.entries(owner)) form.set(key, value);
  return callApi<AttachmentFile>("/api/files", { method: "POST", body: form });
}

export function deleteAttachment(fileId: string): Promise<ApiOutcome<{ id: string }>> {
  return callApi<{ id: string }>(`/api/files/${encodeURIComponent(fileId)}`, { method: "DELETE" });
}

export function attachmentUrl(fileId: string): string {
  return `/api/files/${encodeURIComponent(fileId)}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
