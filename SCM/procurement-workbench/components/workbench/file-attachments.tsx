import { useEffect, useId, useState, type ChangeEvent } from "react";
import { attachmentRows, namesWithoutRow, namesWithUploads, type AttachmentRow } from "@/lib/attachments";
import {
  attachmentUrl,
  deleteAttachment,
  formatFileSize,
  listAttachments,
  uploadAttachment,
  type AttachmentFile,
  type FileOwnerRef,
} from "@/lib/files-api";

type FileAttachmentsProps = {
  label: string;
  owner: FileOwnerRef;
  /** Document names stored with the plan or batch. */
  names: string[];
  onNamesChange: (names: string[]) => void;
  emptyText: string;
};

export function FileAttachments({ label, owner, names, onNamesChange, emptyText }: FileAttachmentsProps) {
  const inputId = useId();
  const [files, setFiles] = useState<AttachmentFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { projectId, ownerType, ownerId, kind } = owner;

  useEffect(() => {
    let active = true;
    void listAttachments({ ownerType, ownerId }).then((outcome) => {
      if (!active) return;
      if (outcome.kind === "ok") {
        setFiles(outcome.data.filter((file) => file.kind === kind));
        setMessage(null);
      } else {
        setFiles([]);
        setMessage(outcome.kind === "unauthorized" ? "Sign in to upload and download files." : null);
      }
    });
    return () => {
      active = false;
    };
  }, [ownerType, ownerId, kind]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!selected.length) return;

    setBusy(true);
    const uploaded: AttachmentFile[] = [];
    const errors: string[] = [];
    for (const file of selected) {
      const outcome = await uploadAttachment({ projectId, ownerType, ownerId, kind }, file);
      if (outcome.kind === "ok") uploaded.push(outcome.data);
      else errors.push(`${file.name}: ${outcome.kind === "unauthorized" ? "sign in to upload" : outcome.message}`);
    }
    setBusy(false);
    setMessage(errors.length ? errors.join(" ") : null);
    if (uploaded.length) {
      setFiles((current) => [...[...uploaded].reverse(), ...current]);
      onNamesChange(namesWithUploads(names, uploaded));
    }
  }

  async function remove(row: AttachmentRow) {
    if (row.file) {
      setBusy(true);
      const outcome = await deleteAttachment(row.file.id);
      setBusy(false);
      // Already gone on the server is fine; anything else keeps the file listed.
      if (outcome.kind !== "ok" && !(outcome.kind === "rejected" && /not found/i.test(outcome.message))) {
        setMessage(`${row.name}: ${outcome.kind === "unauthorized" ? "sign in to remove" : "could not be removed"}`);
        return;
      }
    }
    const remaining = files.filter((file) => file.id !== row.file?.id);
    setFiles(remaining);
    onNamesChange(namesWithoutRow(names, row, remaining));
  }

  const rows = attachmentRows(names, files);

  return (
    <div className="file-field">
      <label htmlFor={inputId}>{label}</label>
      <input id={inputId} type="file" multiple disabled={busy} onChange={(event) => void upload(event)} />
      {rows.length ? (
        <ul className="file-list">
          {rows.map((row) => (
            <li key={row.key}>
              {row.file ? (
                <a href={attachmentUrl(row.file.id)} download={row.file.fileName}>
                  {row.name}
                </a>
              ) : (
                <span title="Recorded before file uploads were available; the file itself is not stored.">{row.name} (name only)</span>
              )}
              {row.file ? <small>{formatFileSize(row.file.sizeBytes)}</small> : null}
              <button type="button" className="file-remove" disabled={busy} onClick={() => void remove(row)} aria-label={`Remove ${row.name}`}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <small>{busy ? "Uploading…" : emptyText}</small>
      )}
      {busy && rows.length ? <small>Working…</small> : null}
      {message ? (
        <small className="file-message" role="alert">
          {message}
        </small>
      ) : null}
    </div>
  );
}
