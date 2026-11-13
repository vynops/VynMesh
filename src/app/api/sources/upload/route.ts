import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import unzipper from "unzipper";
import { NextResponse } from "next/server";
import { canManageSources, requireSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sourcesRoot } from "@/lib/connectors";
import { addSource, getMeshState } from "@/lib/mesh-store";
import { ingestSource } from "@/lib/ingestion";

export const runtime = "nodejs";
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_BATCH_BYTES = 100 * 1024 * 1024;
const MAX_FILES = 200;
const allowedExtensions = new Set([".json", ".csv", ".txt", ".md"]);
type UploadItem = { name: string; bytes: Buffer };

type Skipped = { name: string; reason: string };

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    if (!canManageSources(session.role)) return NextResponse.json({ error: "Only workspace administrators can upload files." }, { status: 403 });
    const form = await request.formData();
    const formFiles = form.getAll("files").filter((value): value is File => value instanceof File);
    const singleFile = form.get("file");
    const files = formFiles.length > 0 ? formFiles : singleFile instanceof File ? [singleFile] : [];
    if (files.length === 0) return NextResponse.json({ error: "Choose one or more files, a folder, or a ZIP archive." }, { status: 400 });
    if (files.length > MAX_FILES) return NextResponse.json({ error: `You can upload up to ${MAX_FILES} files at once.` }, { status: 413 });

    const items: UploadItem[] = [];
    const skipped: Skipped[] = [];
    let totalBytes = 0;
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) { skipped.push({ name: file.name, reason: "File is larger than 25 MB." }); continue; }
      const bytes = Buffer.from(await file.arrayBuffer());
      totalBytes += bytes.length;
      if (totalBytes > MAX_BATCH_BYTES) return NextResponse.json({ error: "The complete upload must be smaller than 100 MB." }, { status: 413 });
      if (path.extname(file.name).toLowerCase() === ".zip") {
        const extracted = await extractZip(bytes, file.name);
        items.push(...extracted.items);
        skipped.push(...extracted.skipped);
      } else items.push({ name: safeRelativeName(file.name), bytes });
    }

    const accepted = items.filter((item) => allowedExtensions.has(path.extname(item.name).toLowerCase())).slice(0, MAX_FILES);
    for (const item of items.slice(MAX_FILES)) skipped.push({ name: item.name, reason: `Upload limit is ${MAX_FILES} files.` });
    for (const item of items.filter((item) => !allowedExtensions.has(path.extname(item.name).toLowerCase()))) skipped.push({ name: item.name, reason: "Unsupported file type." });
    if (accepted.length === 0) return NextResponse.json({ error: "No supported files were found.", skipped }, { status: 415 });

    const uploadDir = path.join(sourcesRoot, "uploads");
    await mkdir(uploadDir, { recursive: true });
    const db = getDb();
    const results: Array<{ name: string; status: "connected" | "failed"; records?: number; error?: string }> = [];
    for (const item of accepted) {
      const safeName = `${crypto.randomUUID()}-${path.basename(item.name).replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      await writeFile(path.join(uploadDir, safeName), item.bytes);
      const existing = db.prepare("select id from sources where workspace_id = ? and name = ?").get(session.workspaceId, item.name) as { id: string } | undefined;
      const sourceId = existing?.id ?? await addSource(session.workspaceId, session.userId, { name: item.name, kind: "file", locator: path.join("uploads", safeName) });
      if (existing) db.prepare("update sources set kind = 'file', locator = ?, status = 'registered' where id = ? and workspace_id = ?").run(path.join("uploads", safeName), sourceId, session.workspaceId);
      try { const ingested = await ingestSource(session.workspaceId, session.userId, sourceId); results.push({ name: item.name, status: "connected", records: ingested.recordsWritten }); }
      catch (error) { results.push({ name: item.name, status: "failed", error: error instanceof Error ? error.message : "Ingestion failed." }); }
    }
    return NextResponse.json({ ...await getMeshState(session.workspaceId), upload: { results, skipped } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed." }, { status: 400 });
  }
}

async function extractZip(bytes: Buffer, archiveName: string) {
  const items: UploadItem[] = [];
  const skipped: Skipped[] = [];
  let extractedBytes = 0;
  const archive = await unzipper.Open.buffer(bytes);
  for (const entry of archive.files) {
    if (entry.type !== "File") continue;
    const name = safeRelativeName(entry.path);
    if (name.startsWith("__invalid__")) { skipped.push({ name: entry.path, reason: "Unsafe archive path." }); continue; }
    if (entry.uncompressedSize > MAX_FILE_BYTES) { skipped.push({ name: entry.path, reason: "File is larger than 25 MB." }); continue; }
    if (extractedBytes + entry.uncompressedSize > MAX_BATCH_BYTES) { skipped.push({ name: entry.path, reason: "ZIP contents exceed the 100 MB upload limit." }); continue; }
    const entryBytes = await entry.buffer();
    extractedBytes += entryBytes.length;
    items.push({ name, bytes: entryBytes });
  }
  if (items.length === 0 && skipped.length === 0) skipped.push({ name: archiveName, reason: "ZIP contains no files." });
  return { items, skipped };
}

function safeRelativeName(name: string) {
  const normalized = name.replace(/\\/g, "/");
  if (path.posix.isAbsolute(normalized) || normalized.split("/").includes("..")) return `__invalid__/${path.basename(normalized)}`;
  return normalized.replace(/^\.\//, "");
}
