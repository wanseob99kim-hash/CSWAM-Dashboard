import type { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import * as schema from "../../db/schema";
import { cleanFileName, contentDisposition, MAX_FILES_PER_OWNER, type StoredFile } from "../../server/files-service";
import { handleDeleteFile, handleDownloadFile, handleListFiles, handleUploadFile } from "../../server/files-handlers";
import { createTestD1, type TestD1 } from "../helpers/d1";

let mf: Miniflare;
let db: TestD1["db"];
let files: FilesBucket;

beforeAll(async () => {
  ({ mf, db, files } = await createTestD1("workbench-files"));
}, 60_000);

afterAll(async () => {
  await mf?.dispose();
});

const USER = { "oai-authenticated-user-email": "buyer@cswind.example" };
const clock = () => new Date("2026-10-09T16:00:00.000Z");
const batchOwner = { projectId: "project-1700", ownerType: "supplier_plan_batch", ownerId: "batch-1", kind: "commercial_invoice" };

function upload(file: File | string | null, owner: Record<string, string> = batchOwner, headers: Record<string, string> = USER) {
  const form = new FormData();
  if (file !== null) form.set("file", file);
  for (const [key, value] of Object.entries(owner)) form.set(key, value);
  return handleUploadFile(new Request("http://localhost/api/files", { method: "POST", headers, body: form }), db, files, clock);
}

const list = (ownerId = "batch-1", headers: Record<string, string> = USER) =>
  handleListFiles(new Request(`http://localhost/api/files?ownerType=supplier_plan_batch&ownerId=${ownerId}`, { headers }), db);
const download = (id: string, headers: Record<string, string> = USER) =>
  handleDownloadFile(new Request(`http://localhost/api/files/${id}`, { headers }), id, db, files);
const remove = (id: string) =>
  handleDeleteFile(new Request(`http://localhost/api/files/${id}`, { method: "DELETE", headers: USER }), id, db, files, clock);

async function body<T>(response: Response) {
  return (await response.json()) as { success: boolean; data: T; error: string | null };
}

describe("file names", () => {
  test("strip paths and header-breaking characters", () => {
    expect(cleanFileName("C:\\Users\\me\\CI \"final\".pdf")).toBe("CI final.pdf");
    expect(cleanFileName("../../etc/passwd")).toBe("passwd");
    expect(cleanFileName("   ")).toBe("file");
  });

  test("encode non-ASCII names for download", () => {
    expect(contentDisposition("송장 (1).pdf")).toBe(
      "attachment; filename=\"__ (1).pdf\"; filename*=UTF-8''%EC%86%A1%EC%9E%A5%20%281%29.pdf",
    );
  });
});

describe("upload, list, download, delete", () => {
  let stored: StoredFile;

  test("stores the bytes in R2 and the metadata in D1", async () => {
    const response = await upload(new File(["%PDF-1.7 invoice"], "Invoice B1.pdf", { type: "text/html" }));
    expect(response.status).toBe(201);
    stored = (await body<StoredFile>(response)).data;
    expect(stored).toMatchObject({
      ...batchOwner,
      fileName: "Invoice B1.pdf",
      // Taken from the extension, not from what the browser claimed.
      contentType: "application/pdf",
      sizeBytes: 16,
      uploadedBy: "buyer@cswind.example",
    });
    expect(stored).not.toHaveProperty("r2Key");
    expect(await db.$count(schema.changeLog)).toBeGreaterThan(0);
  });

  test("lists files for the owner only", async () => {
    const { data } = await body<StoredFile[]>(await list());
    expect(data.map((file) => file.id)).toEqual([stored.id]);
    expect((await body<StoredFile[]>(await list("other-batch"))).data).toEqual([]);
  });

  test("downloads as an attachment that browsers will not render", async () => {
    const response = await download(stored.id);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="Invoice B1.pdf"/);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.text()).toBe("%PDF-1.7 invoice");
  });

  test("deletes the bytes and hides the file", async () => {
    expect((await remove(stored.id)).status).toBe(200);
    expect((await download(stored.id)).status).toBe(404);
    expect((await body<StoredFile[]>(await list())).data).toEqual([]);
    expect((await remove(stored.id)).status).toBe(404);
  });
});

describe("rules", () => {
  test("requires a signed-in user", async () => {
    expect((await upload(new File(["x"], "a.pdf"), batchOwner, {})).status).toBe(401);
    expect((await list("batch-1", {})).status).toBe(401);
    expect((await download("anything", {})).status).toBe(401);
  });

  test.each([
    ["a disallowed type", new File(["<script>"], "page.html"), batchOwner, 400, /not allowed/],
    ["an SVG", new File(["<svg/>"], "logo.svg"), batchOwner, 400, /not allowed/],
    ["an empty file", new File([], "empty.pdf"), batchOwner, 400, /empty/],
    ["a text field instead of a file", "not a file", batchOwner, 400, /exactly one file/],
    ["a kind that does not fit the owner", new File(["x"], "a.pdf"), { ...batchOwner, kind: "attachment" }, 400, /kind/],
    ["an unknown owner type", new File(["x"], "a.pdf"), { ...batchOwner, ownerType: "project" }, 400, /ownerType/],
  ])("rejects %s", async (_label, file, owner, status, message) => {
    const response = await upload(file as File | string, owner as Record<string, string>);
    expect(response.status).toBe(status);
    expect((await body(response)).error).toMatch(message);
  });

  test("rejects files over the size limit", async () => {
    const big = new File([new Uint8Array(20 * 1024 * 1024 + 1)], "big.pdf");
    expect((await upload(big)).status).toBe(413);
  });

  test("caps files per item", async () => {
    const owner = { ...batchOwner, ownerId: "batch-full" };
    for (let index = 0; index < MAX_FILES_PER_OWNER; index += 1) {
      expect((await upload(new File(["x"], `doc-${index}.pdf`), owner)).status).toBe(201);
    }
    expect((await upload(new File(["x"], "one-more.pdf"), owner)).status).toBe(409);
  }, 60_000);
});
