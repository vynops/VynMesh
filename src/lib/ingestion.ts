import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataRoot, getDb, withTransaction } from "@/lib/db";
import { readDocumentSource, readJsonSource, readPostgresSource, readSqliteSource, type IngestedRecord } from "@/lib/connectors";
import { readFileSource, readMicrosoftSource, readRestSource, readS3Source, readSnowflakeSource } from "@/lib/connector-adapters";
import { scanAndRedact } from "@/lib/pii";
import { decryptConfig, encryptConfig } from "@/lib/secrets";

export type SourceRow = { id: string; workspace_id: string; name: string; kind: string; locator: string; secret_config: string | null };
export type IngestionResult = { sourceId: string; recordsRead: number; recordsWritten: number; schemaVersion: string; rawLocator: string; completedAt: string };

const lakeRoot = path.join(dataRoot, "lake");
const MAX_ATTEMPTS = 3;

function delay(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function readSourceWithRetry(source: SourceRow): Promise<IngestedRecord[]> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      if (source.kind === "sqlite") return await readSqliteSource(source.locator, "orders");
      if (source.kind === "json") return await readJsonSource(source.locator);
      if (source.kind === "postgres") {
        const config = decryptConfig(source.secret_config ?? "");
        if (!config.connectionString || !config.query) throw new Error("This source is missing its database connection details.");
        return await readPostgresSource(config.connectionString, config.query);
      }
      if (source.kind === "file") return await readFileSource(source.locator);
      if (source.kind === "document") return await readDocumentSource(source.locator);
      const config = decryptConfig(source.secret_config ?? "");
      if (source.kind === "rest" && !config.url) config.url = source.locator;
      if (source.kind === "s3" && !config.bucket) config.bucket = source.locator;
      if (source.kind === "sharepoint" && !config.endpoint) config.endpoint = source.locator;
      if (source.kind === "s3") return await readS3Source(config);
      if (source.kind === "rest") return await readRestSource(config);
      if (source.kind === "sharepoint") return await readMicrosoftSource(config, "sharepoint");
      if (source.kind === "onedrive") return await readMicrosoftSource(config, "onedrive");
      if (source.kind === "snowflake") return await readSnowflakeSource(config);
      throw new Error(`Unsupported source kind: ${source.kind}`);
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) await delay(200 * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Ingestion failed after retries.");
}

export async function ingestSource(workspaceId: string, userId: string, sourceId: string): Promise<IngestionResult> {
  const db = getDb();
  const source = db.prepare("select id, workspace_id, name, kind, locator, secret_config from sources where id = ? and workspace_id = ?").get(sourceId, workspaceId) as SourceRow | undefined;
  if (!source) throw new Error("Source not found in this workspace.");

  let records: IngestedRecord[];
  try {
    records = await readSourceWithRetry(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ingestion failed.";
    db.prepare("update sources set status = 'attention' where id = ? and workspace_id = ?").run(sourceId, workspaceId);
    db.prepare("insert into dead_letters (workspace_id, source_id, error, attempt) values (?, ?, ?, ?)").run(workspaceId, sourceId, message, MAX_ATTEMPTS);
    db.prepare("insert into audit_events (workspace_id, user_id, action, resource_type, resource_id, details) values (?, ?, ?, ?, ?, ?)").run(workspaceId, userId, "Source ingestion failed", "source", sourceId, JSON.stringify({ error: message, attempts: MAX_ATTEMPTS }));
    throw new Error(message);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rawDir = path.join(lakeRoot, "raw", sourceId);
  const curatedDir = path.join(lakeRoot, "curated", sourceId);
  mkdirSync(rawDir, { recursive: true });
  mkdirSync(curatedDir, { recursive: true });
  const rawLocator = path.join(rawDir, `${timestamp}.json`);
  writeFileSync(rawLocator, JSON.stringify(records, null, 2));

  const schemaVersion = schemaFingerprint(records);
  withTransaction(() => {
    const upsert = db.prepare(`insert into catalog_records (id, workspace_id, source_id, source_name, domain, title, content, redacted_content, fields, raw_locator, curated_locator, schema_version, entity_keys, lineage, classification, updated_at)
      values (@id, @workspaceId, @sourceId, @sourceName, @domain, @title, @content, @redactedContent, @fields, @rawLocator, @curatedLocator, @schemaVersion, @entityKeys, @lineage, @classification, datetime('now'))
      on conflict (id) do update set title = excluded.title, content = excluded.content, redacted_content = excluded.redacted_content, fields = excluded.fields, raw_locator = excluded.raw_locator, curated_locator = excluded.curated_locator, schema_version = excluded.schema_version, entity_keys = excluded.entity_keys, lineage = excluded.lineage, classification = excluded.classification, updated_at = datetime('now')`);
    const deleteFts = db.prepare("delete from catalog_fts where id = ?");
    const insertFts = db.prepare("insert into catalog_fts (id, title, content, fields) values (?, ?, ?, ?)");

    for (const record of records) {
      const id = recordId(sourceId, record.sourceLocator);
      const curatedLocator = path.join(curatedDir, `${id}.json`);
      const lineage = JSON.stringify({ sourceId, sourceName: source.name, sourceLocator: record.sourceLocator, rawLocator, ingestedAt: new Date().toISOString() });
      const pii = scanAndRedact(record.content);
      writeFileSync(curatedLocator, JSON.stringify({ ...record, id, lineage: JSON.parse(lineage), classification: pii.classification }, null, 2));
      upsert.run({ id, workspaceId, sourceId, sourceName: source.name, domain: record.domain, title: record.title, content: record.content, redactedContent: pii.redacted, fields: JSON.stringify(record.fields), rawLocator, curatedLocator, schemaVersion, entityKeys: JSON.stringify(record.entityKeys), lineage, classification: pii.classification });
      deleteFts.run(id);
      insertFts.run(id, record.title, record.content, record.fields.join(" "));
    }

    db.prepare("update sources set last_sync = datetime('now'), status = 'connected' where id = ? and workspace_id = ?").run(sourceId, workspaceId);
    db.prepare("insert into audit_events (workspace_id, user_id, action, resource_type, resource_id, details) values (?, ?, ?, ?, ?, ?)").run(workspaceId, userId, "Source ingested", "source", sourceId, JSON.stringify({ recordsRead: records.length, schemaVersion }));
  });

  return { sourceId, recordsRead: records.length, recordsWritten: records.length, schemaVersion, rawLocator, completedAt: new Date().toISOString() };
}

export async function testSourceConnection(workspaceId: string, sourceId: string) {
  const db = getDb();
  const source = db.prepare("select id, workspace_id, name, kind, locator, secret_config from sources where id = ? and workspace_id = ?").get(sourceId, workspaceId) as SourceRow | undefined;
  if (!source) throw new Error("Source not found in this workspace.");
  const records = await readSourceWithRetry(source);
  db.prepare("update sources set status = 'connected' where id = ? and workspace_id = ?").run(sourceId, workspaceId);
  return { sourceId, sourceName: source.name, recordsAvailable: records.length };
}

export async function testConnectorConfiguration(kind: string, locator: string, config: Record<string, string>) {
  const source: SourceRow = { id: "connection-test", workspace_id: "connection-test", name: "Connection test", kind, locator, secret_config: encryptConfig(config) };
  const records = await readSourceWithRetry(source);
  return { recordsAvailable: records.length };
}

function recordId(sourceId: string, locator: string) { return `record-${Buffer.from(`${sourceId}:${locator}`).toString("base64url")}`; }
function schemaFingerprint(records: IngestedRecord[]) { return Buffer.from(records.flatMap((record) => record.fields).sort().join("|")).toString("hex").slice(0, 16); }
