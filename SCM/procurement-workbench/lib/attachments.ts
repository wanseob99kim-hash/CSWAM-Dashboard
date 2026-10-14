// Document names live in the synced workspace (they drive readiness counts and
// supplier emails); the files themselves live in R2. These helpers keep both in step.
import type { AttachmentFile } from "./files-api";

export type AttachmentRow = {
  key: string;
  name: string;
  /** Present when the file was uploaded; absent for names recorded before uploads existed. */
  file?: AttachmentFile;
};

/** Uploaded files first (newest first, as listed), then tracked names that have no uploaded file. */
export function attachmentRows(names: readonly string[], files: readonly AttachmentFile[]): AttachmentRow[] {
  const uploadedNames = new Set(files.map((file) => file.fileName));
  return [
    ...files.map((file) => ({ key: `file-${file.id}`, name: file.fileName, file })),
    ...[...new Set(names)].filter((name) => !uploadedNames.has(name)).map((name) => ({ key: `name-${name}`, name })),
  ];
}

export function namesWithUploads(names: readonly string[], uploaded: readonly AttachmentFile[]): string[] {
  return [...new Set([...names, ...uploaded.map((file) => file.fileName)])];
}

/** Drops a name once no remaining uploaded file carries it. */
export function namesWithoutRow(names: readonly string[], removed: AttachmentRow, remainingFiles: readonly AttachmentFile[]): string[] {
  if (remainingFiles.some((file) => file.fileName === removed.name)) return [...names];
  return names.filter((name) => name !== removed.name);
}
