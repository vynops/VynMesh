import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { canManageSources, canWrite, requireSession, type Session } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sourcesRoot } from "@/lib/connectors";
import { ingestSource, testConnectorConfiguration, testSourceConnection } from "@/lib/ingestion";
import { addSource, createInvestigation, deleteSource, getMeshState, searchCatalog, updateSource } from "@/lib/mesh-store";
import { answerWithModel } from "@/lib/model";
import { ensureSampleSources } from "@/lib/sample-data";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";
import type { ConnectorKind } from "@/lib/connector-adapters";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { session, demo } = await getSession();
    await bootstrapDemoData(session.workspaceId, session.userId);
    const response = NextResponse.json(await getMeshState(session.workspaceId));
    if (demo) setDemoCookie(response);
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load data center." }, { status: 401 });
  }
}

export async function POST(request: Request) {
  if (!checkRateLimit(`mesh:${clientKey(request)}`, 60, 60_000)) return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });
  let session: Session;
  try { session = (await getSession()).session; } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Authentication required." }, { status: 401 }); }
  const body = await request.json() as { action?: string; name?: string; kind?: ConnectorKind; question?: string; sourceId?: string; locator?: string; config?: Record<string, string> | string };

  if (body.action === "add-source") {
    if (!canManageSources(session.role)) return NextResponse.json({ error: "Source management requires an administrator role." }, { status: 403 });
    if (!body.name?.trim()) return NextResponse.json({ error: "Name is required." }, { status: 400 });
    const supportedKinds: ConnectorKind[] = ["file", "sqlite", "json", "document", "postgres", "s3", "rest", "sharepoint", "onedrive", "snowflake"];
    const kind = body.kind && supportedKinds.includes(body.kind) ? body.kind : "json";
    const config = typeof body.config === "string" ? parseConfig(body.config) : body.config;
    if (["postgres", "s3", "rest", "sharepoint", "onedrive", "snowflake"].includes(kind) && !config) return NextResponse.json({ error: `${kind} source configuration is required.` }, { status: 400 });
    const slug = body.name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || `source-${Date.now()}`;
    const locator = body.locator ?? (["json", "document"].includes(kind) ? provisionCustomSource(kind as "json" | "document", slug) : "");
    await addSource(session.workspaceId, session.userId, { name: body.name.trim(), kind, locator, secretConfig: config });
    return NextResponse.json(await getMeshState(session.workspaceId));
  }

  if (body.action === "ingest-source") {
    if (!canManageSources(session.role)) return NextResponse.json({ error: "Ingestion requires an administrator role." }, { status: 403 });
    if (!body.sourceId?.trim()) return NextResponse.json({ error: "sourceId is required." }, { status: 400 });
    try { await ingestSource(session.workspaceId, session.userId, body.sourceId.trim()); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Ingestion failed." }, { status: 400 }); }
    return NextResponse.json(await getMeshState(session.workspaceId));
  }

  if (body.action === "test-source") {
    if (!canManageSources(session.role)) return NextResponse.json({ error: "Connection testing requires an administrator role." }, { status: 403 });
    if (!body.sourceId?.trim()) return NextResponse.json({ error: "sourceId is required." }, { status: 400 });
    try {
      const result = await testSourceConnection(session.workspaceId, body.sourceId.trim());
      return NextResponse.json({ ok: true, ...result });
    } catch (error) {
      getDb().prepare("update sources set status = 'attention' where id = ? and workspace_id = ?").run(body.sourceId.trim(), session.workspaceId);
      return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Connection test failed." }, { status: 400 });
    }
  }

  if (body.action === "test-source-config") {
    if (!canManageSources(session.role)) return NextResponse.json({ error: "Connection testing requires an administrator role." }, { status: 403 });
    if (!body.kind) return NextResponse.json({ error: "Source type is required." }, { status: 400 });
    const config = typeof body.config === "string" ? parseConfig(body.config) : body.config;
    try {
      const result = await testConnectorConfiguration(body.kind, body.locator ?? "", config ?? {});
      return NextResponse.json({ ok: true, ...result });
    } catch (error) {
      return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Connection test failed." }, { status: 400 });
    }
  }

  if (body.action === "update-source") {
    if (!canManageSources(session.role)) return NextResponse.json({ error: "Source editing requires an administrator role." }, { status: 403 });
    if (!body.sourceId?.trim() || !body.name?.trim() || !body.kind) return NextResponse.json({ error: "Source id, name, and kind are required." }, { status: 400 });
    const supportedKinds: ConnectorKind[] = ["file", "sqlite", "json", "document", "postgres", "s3", "rest", "sharepoint", "onedrive", "snowflake"];
    if (!supportedKinds.includes(body.kind)) return NextResponse.json({ error: "Unsupported source type." }, { status: 400 });
    const config = typeof body.config === "string" ? parseConfig(body.config) : body.config;
    updateSource(session.workspaceId, session.userId, body.sourceId.trim(), { name: body.name.trim(), kind: body.kind, locator: body.locator, secretConfig: config });
    return NextResponse.json(await getMeshState(session.workspaceId));
  }

  if (body.action === "delete-source") {
    if (!canManageSources(session.role)) return NextResponse.json({ error: "Source deletion requires an administrator role." }, { status: 403 });
    if (!body.sourceId?.trim()) return NextResponse.json({ error: "sourceId is required." }, { status: 400 });
    deleteSource(session.workspaceId, session.userId, body.sourceId.trim());
    return NextResponse.json(await getMeshState(session.workspaceId));
  }

  if (body.action === "investigate") {
    if (!canWrite(session.role)) return NextResponse.json({ error: "Investigation requires workspace access." }, { status: 403 });
    if (!body.question?.trim()) return NextResponse.json({ error: "A question is required." }, { status: 400 });
    const question = body.question.trim();
    const evidence = await searchCatalog(session.workspaceId, question);
    const groundedAnswer = await answerWithModel(question, evidence, session.workspaceId);
    await createInvestigation(session.workspaceId, session.userId, question, evidence, groundedAnswer.answer, groundedAnswer.model);
    return NextResponse.json(await getMeshState(session.workspaceId));
  }

  return NextResponse.json({ error: "Unknown mesh action." }, { status: 400 });
}

async function getSession() {
  try { return { session: await requireSession(), demo: false }; }
  catch (error) {
    if (process.env.NODE_ENV !== "production" || process.env.VYNMESH_DEMO_AUTH === "true") return { session: { userId: "user-demo", workspaceId: "workspace-northstar", role: "owner" as const }, demo: true };
    throw error;
  }
}

function setDemoCookie(response: NextResponse) {
  response.cookies.set("vynmesh_session", "user-demo:workspace-northstar", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 8 });
}

function provisionCustomSource(kind: "json" | "document", slug: string) {
  const customRoot = path.join(sourcesRoot, "custom");
  mkdirSync(customRoot, { recursive: true });
  if (kind === "document") {
    const dir = path.join(customRoot, slug);
    mkdirSync(dir, { recursive: true });
    const starter = path.join(dir, "notes.txt");
    if (!existsSync(starter)) writeFileSync(starter, `Starter document for ${slug}. Replace this file with real content, then ingest the source.`);
    return path.join("custom", slug);
  }
  const filePath = path.join(customRoot, `${slug}.json`);
  if (!existsSync(filePath)) writeFileSync(filePath, JSON.stringify([{ title: `${slug} starter event`, note: `Starter record for ${slug}. Replace this file with real events, then ingest the source.` }], null, 2));
  return path.join("custom", `${slug}.json`);
}

function parseConfig(value: string) {
  try { const parsed = JSON.parse(value) as unknown; if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(); return parsed as Record<string, string>; }
  catch { throw new Error("Connection details must be valid JSON."); }
}

let bootstrapped = false;
async function bootstrapDemoData(workspaceId: string, userId: string) {
  if (bootstrapped) return;
  bootstrapped = true;
  ensureSampleSources();
  const db = getDb();
  const existing = db.prepare("select count(*) as count from sources where workspace_id = ?").get(workspaceId) as { count: number };
  if (existing.count > 0) return;
  await addSource(workspaceId, userId, { name: "orders-prod", kind: "sqlite", locator: "orders.db" });
  await addSource(workspaceId, userId, { name: "finance-risk-events", kind: "json", locator: "risk-events.json" });
  await addSource(workspaceId, userId, { name: "customer-docs", kind: "document", locator: "documents" });
  const sourceIds = (db.prepare("select id from sources where workspace_id = ?").all(workspaceId) as Array<{ id: string }>).map((row) => row.id);
  for (const sourceId of sourceIds) await ingestSource(workspaceId, userId, sourceId);
}
