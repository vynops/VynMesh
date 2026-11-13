import { readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { dataRoot, getDb } from "@/lib/db";
import type { ConnectorKind } from "@/lib/connector-adapters";
import { encryptConfig } from "@/lib/secrets";

export type Source = { id: string; name: string; kind: ConnectorKind; status: "registered" | "connected" | "attention"; lastSync: string; recordCount: number };
export type Activity = { id: string; title: string; detail: string; tone: "orange" | "lime" | "blue" | "purple" };
export type Investigation = { id: string; question: string; status: "queued" | "investigating" | "complete"; confidence: number; createdAt: string; answer?: string; evidence: Evidence[] };
export type CatalogRecord = { id: string; sourceId: string; sourceName: string; domain: "structured" | "semi-structured" | "unstructured"; title: string; content: string; fields: string[] };
export type Evidence = { id: string; sourceName: string; title: string; domain: CatalogRecord["domain"]; excerpt: string; relevance: number; citation?: string };
export type LakeStats = { rawObjects: number; curatedObjects: number; bytes: number };
export type MeshState = { workspace: string; sources: Source[]; records: CatalogRecord[]; activities: Activity[]; investigations: Investigation[]; policyPosture: number; dataVolume: number; lake: LakeStats };

export async function getMeshState(workspaceId: string): Promise<MeshState> {
  const db = getDb();
  const workspace = db.prepare("select name from workspaces where id = ?").get(workspaceId) as { name: string } | undefined;
  if (!workspace) throw new Error("Workspace not found.");

  const sourceRows = db.prepare("select s.id, s.name, s.kind, s.status, s.last_sync, count(r.id) as record_count from sources s left join catalog_records r on r.source_id = s.id where s.workspace_id = ? group by s.id order by s.created_at").all(workspaceId) as Array<{ id: string; name: string; kind: Source["kind"]; status: Source["status"]; last_sync: string | null; record_count: number }>;
  const sources = sourceRows.map((source) => ({ id: source.id, name: source.name, kind: source.kind, status: source.status, lastSync: source.last_sync ? relativeTime(source.last_sync) : "never", recordCount: source.record_count }));

  const recordRows = db.prepare("select id, source_id, source_name, domain, title, redacted_content, fields from catalog_records where workspace_id = ? order by created_at desc").all(workspaceId) as Array<{ id: string; source_id: string; source_name: string; domain: CatalogRecord["domain"]; title: string; redacted_content: string; fields: string }>;
  const records = recordRows.map((record) => ({ id: record.id, sourceId: record.source_id, sourceName: record.source_name, domain: record.domain, title: record.title, content: record.redacted_content, fields: JSON.parse(record.fields) as string[] }));

  const investigationRows = db.prepare("select id, question, status, confidence, answer, created_at from investigations where workspace_id = ? order by created_at desc limit 10").all(workspaceId) as Array<{ id: string; question: string; status: Investigation["status"]; confidence: number; answer: string | null; created_at: string }>;
  const evidenceStatement = db.prepare("select e.record_id as id, e.relevance, e.excerpt, e.citation, r.source_name, r.domain from investigation_evidence e join catalog_records r on r.id = e.record_id where e.investigation_id = ? order by e.relevance desc");
  const investigations = investigationRows.map((row) => ({ id: row.id, question: row.question, status: row.status, confidence: Number(row.confidence), answer: row.answer ?? undefined, createdAt: row.created_at, evidence: (evidenceStatement.all(row.id) as Array<{ id: string; relevance: number; excerpt: string; citation: string; source_name: string; domain: CatalogRecord["domain"] }>).map((evidence) => ({ id: evidence.id, sourceName: evidence.source_name, title: evidence.citation.split(":").slice(1).join(":") || evidence.citation, domain: evidence.domain, excerpt: evidence.excerpt, relevance: Number(evidence.relevance), citation: evidence.citation })) }));

  const activityRows = db.prepare("select id, action, resource_id, created_at from audit_events where workspace_id = ? order by created_at desc limit 8").all(workspaceId) as Array<{ id: number; action: string; resource_id: string | null; created_at: string }>;
  const activities = activityRows.map((event) => ({ id: String(event.id), title: event.action, detail: `${event.resource_id ?? "workspace"} · ${relativeTime(event.created_at)}`, tone: "blue" as const }));

  const lake = computeLakeStats();
  return { workspace: workspace.name, policyPosture: 98.4, dataVolume: Number((lake.bytes / (1024 * 1024)).toFixed(3)), sources, records, investigations, activities, lake };
}

export async function addSource(workspaceId: string, userId: string, input: { name: string; kind: ConnectorKind; locator: string; secretConfig?: Record<string, string> }) {
  const db = getDb();
  const id = `source-${crypto.randomUUID()}`;
  db.prepare("insert into sources (id, workspace_id, name, kind, locator, secret_config) values (?, ?, ?, ?, ?, ?)").run(id, workspaceId, input.name, input.kind, input.locator, input.secretConfig ? encryptConfig(input.secretConfig) : null);
  db.prepare("insert into audit_events (workspace_id, user_id, action, resource_type, resource_id, details) values (?, ?, ?, ?, ?, ?)").run(workspaceId, userId, "Source connected", "source", id, JSON.stringify({ kind: input.kind }));
  return id;
}

export function updateSource(workspaceId: string, userId: string, sourceId: string, input: { name: string; kind: ConnectorKind; locator?: string; secretConfig?: Record<string, string> }) {
  const db = getDb();
  const existing = db.prepare("select id from sources where id = ? and workspace_id = ?").get(sourceId, workspaceId) as { id: string } | undefined;
  if (!existing) throw new Error("Source not found in this workspace.");
  db.prepare("update sources set name = ?, kind = ?, locator = coalesce(nullif(?, ''), locator), secret_config = coalesce(?, secret_config), status = 'registered', last_sync = null where id = ? and workspace_id = ?").run(input.name, input.kind, input.locator ?? "", input.secretConfig ? encryptConfig(input.secretConfig) : null, sourceId, workspaceId);
  db.prepare("insert into audit_events (workspace_id, user_id, action, resource_type, resource_id, details) values (?, ?, ?, ?, ?, ?)").run(workspaceId, userId, "Source updated", "source", sourceId, JSON.stringify({ kind: input.kind }));
}

export function deleteSource(workspaceId: string, userId: string, sourceId: string) {
  const db = getDb();
  const source = db.prepare("select id from sources where id = ? and workspace_id = ?").get(sourceId, workspaceId) as { id: string } | undefined;
  if (!source) throw new Error("Source not found in this workspace.");
  db.prepare("delete from sources where id = ? and workspace_id = ?").run(sourceId, workspaceId);
  rmSync(path.join(dataRoot, "lake", "raw", sourceId), { recursive: true, force: true });
  rmSync(path.join(dataRoot, "lake", "curated", sourceId), { recursive: true, force: true });
  db.prepare("insert into audit_events (workspace_id, user_id, action, resource_type, resource_id, details) values (?, ?, ?, ?, ?, ?)").run(workspaceId, userId, "Source deleted", "source", sourceId, "{}");
}

export async function searchCatalog(workspaceId: string, question: string): Promise<Evidence[]> {
  const terms = question.toLowerCase().match(/[a-z0-9]{3,}/g);
  if (!terms || terms.length === 0) return [];
  const matchQuery = terms.map((term) => `"${term.replace(/"/g, "")}"`).join(" OR ");
  const db = getDb();
  const rows = db.prepare(`select r.id, r.source_name, r.domain, r.title, r.redacted_content, bm25(catalog_fts) as rank
    from catalog_fts f join catalog_records r on r.id = f.id
    where catalog_fts match ? and r.workspace_id = ?
    order by rank limit 4`).all(matchQuery, workspaceId) as Array<{ id: string; source_name: string; domain: CatalogRecord["domain"]; title: string; redacted_content: string; rank: number }>;
  return rows.map((row) => ({ id: row.id, sourceName: row.source_name, title: row.title, domain: row.domain, excerpt: row.redacted_content, relevance: Math.max(50, Math.min(99, Math.round(99 + row.rank * 6))) }));
}

export async function createInvestigation(workspaceId: string, userId: string, question: string, evidence: Evidence[], answer: string, model: string) {
  const db = getDb();
  const id = `investigation-${crypto.randomUUID()}`;
  db.prepare("insert into investigations (id, workspace_id, user_id, question, status, confidence, answer, model) values (?, ?, ?, ?, 'complete', ?, ?, ?)").run(id, workspaceId, userId, question, evidence.length > 0 ? 91 : 42, answer, model);
  const insertEvidence = db.prepare("insert into investigation_evidence (investigation_id, record_id, relevance, excerpt, citation) values (?, ?, ?, ?, ?)");
  for (const item of evidence) insertEvidence.run(id, item.id, item.relevance, item.excerpt, `${item.sourceName}:${item.title}`);
  db.prepare("insert into audit_events (workspace_id, user_id, action, resource_type, resource_id, details) values (?, ?, ?, ?, ?, ?)").run(workspaceId, userId, "Grounded question answered", "investigation", id, JSON.stringify({ evidenceCount: evidence.length }));
  return id;
}

function computeLakeStats(): LakeStats {
  const rawDir = path.join(dataRoot, "lake", "raw");
  const curatedDir = path.join(dataRoot, "lake", "curated");
  const raw = countFiles(rawDir);
  const curated = countFiles(curatedDir);
  return { rawObjects: raw.count, curatedObjects: curated.count, bytes: raw.bytes + curated.bytes };
}

function countFiles(root: string): { count: number; bytes: number } {
  let count = 0;
  let bytes = 0;
  let entries: string[];
  try { entries = readdirSync(root); } catch { return { count: 0, bytes: 0 }; }
  for (const entry of entries) {
    const full = path.join(root, entry);
    const info = statSync(full);
    if (info.isDirectory()) { const nested = countFiles(full); count += nested.count; bytes += nested.bytes; }
    else { count += 1; bytes += info.size; }
  }
  return { count, bytes };
}

function relativeTime(value: string) { const minutes = Math.max(0, Math.round((Date.now() - new Date(`${value}Z`).getTime()) / 60000)); return minutes < 1 ? "just now" : minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} hr ago`; }
