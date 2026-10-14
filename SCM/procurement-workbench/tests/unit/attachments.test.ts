import { describe, expect, test } from "vitest";
import { attachmentRows, namesWithoutRow, namesWithUploads } from "../../lib/attachments";
import type { AttachmentFile } from "../../lib/files-api";

const file = (id: string, fileName: string): AttachmentFile => ({
  id,
  fileName,
  projectId: "p",
  ownerType: "supplier_plan_batch",
  ownerId: "b",
  kind: "commercial_invoice",
  contentType: "application/pdf",
  sizeBytes: 10,
  uploadedBy: "a@x",
  uploadedAt: "2026-10-09T00:00:00.000Z",
});

describe("attachmentRows", () => {
  test("shows uploaded files, then names that were only tracked", () => {
    const rows = attachmentRows(["old.pdf", "ci.pdf", "old.pdf"], [file("1", "ci.pdf")]);
    expect(rows.map((row) => [row.name, Boolean(row.file)])).toEqual([
      ["ci.pdf", true],
      ["old.pdf", false],
    ]);
  });
});

describe("names", () => {
  test("adds uploaded names once", () => {
    expect(namesWithUploads(["a.pdf"], [file("1", "a.pdf"), file("2", "b.pdf")])).toEqual(["a.pdf", "b.pdf"]);
  });

  test("keeps a name while another upload still carries it", () => {
    const [first] = attachmentRows([], [file("1", "a.pdf")]);
    expect(namesWithoutRow(["a.pdf", "b.pdf"], first, [file("2", "a.pdf")])).toEqual(["a.pdf", "b.pdf"]);
    expect(namesWithoutRow(["a.pdf", "b.pdf"], first, [])).toEqual(["b.pdf"]);
  });
});
