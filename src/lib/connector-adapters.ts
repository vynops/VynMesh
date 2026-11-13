import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import snowflake from "snowflake-sdk";
import { parse as parseCsv } from "csv-parse/sync";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { IngestedRecord } from "@/lib/connectors";

export type ConnectorKind = "file" | "sqlite" | "postgres" | "s3" | "rest" | "sharepoint" | "onedrive" | "snowflake" | "json" | "document";
export type ConnectorConfig = {
  filePath?: string;
  connectionString?: string;
  query?: string;
  region?: string;
  bucket?: string;
  prefix?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  itemsPath?: string;
  accessToken?: string;
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  driveId?: string;
  folderId?: string;
  account?: string;
  username?: string;
  password?: string;
  warehouse?: string;
  database?: string;
  schema?: string;
};

export async function readFileSource(filePath: string): Promise<IngestedRecord[]> {
  const resolved = path.resolve(process.cwd(), "data", "sources", filePath);
  if (!resolved.startsWith(path.resolve(process.cwd(), "data", "sources") + path.sep)) throw new Error("Uploaded file must stay inside the sources root.");
  const content = await readFile(resolved, "utf8");
  const extension = path.extname(resolved).toLowerCase();
  if (extension === ".json") return recordsFromJson(JSON.parse(content));
  if (extension === ".csv") return recordsFromJson(parseCsv(content, { columns: true, skip_empty_lines: true }));
  return [{ sourceLocator: path.basename(resolved), title: path.basename(resolved), content, fields: [], domain: "unstructured", entityKeys: {} }];
}

export async function readS3Source(config: ConnectorConfig): Promise<IngestedRecord[]> {
  if (!config.bucket) throw new Error("S3 source requires a bucket.");
  const client = new S3Client({ region: config.region ?? "us-east-1", endpoint: config.endpoint, forcePathStyle: Boolean(config.endpoint), credentials: config.accessKeyId && config.secretAccessKey ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } : undefined });
  const listed = await client.send(new ListObjectsV2Command({ Bucket: config.bucket, Prefix: config.prefix }));
  const records: IngestedRecord[] = [];
  for (const object of (listed.Contents ?? []).filter((item) => item.Key && !item.Key.endsWith("/"))) {
    const response = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: object.Key }));
    const content = await response.Body?.transformToString();
    if (!content) continue;
    records.push(...await readFileContent(object.Key!, content));
  }
  return records;
}

export async function readRestSource(config: ConnectorConfig): Promise<IngestedRecord[]> {
  if (!config.url) throw new Error("REST source requires a URL.");
  const response = await fetch(config.url, { method: config.method ?? "GET", headers: config.headers });
  if (!response.ok) throw new Error(`REST source returned ${response.status}.`);
  const payload = await response.json() as unknown;
  const selected = config.itemsPath ? getPath(payload, config.itemsPath) : payload;
  return recordsFromJson(Array.isArray(selected) ? selected : [selected]);
}

export async function readMicrosoftSource(config: ConnectorConfig, provider: "sharepoint" | "onedrive"): Promise<IngestedRecord[]> {
  const token = config.accessToken ?? await getMicrosoftToken(config);
  const root = provider === "sharepoint" ? `https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(config.endpoint ?? "root")}/drive/root` : `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(config.driveId ?? "")}/root`;
  const url = `${root}/children${config.folderId ? `?$filter=parentReference/id eq '${encodeURIComponent(config.folderId)}'` : ""}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`${provider} returned ${response.status}.`);
  const listing = await response.json() as { value?: Array<{ id: string; name: string; file?: unknown; "@microsoft.graph.downloadUrl"?: string }> };
  const records: IngestedRecord[] = [];
  for (const item of listing.value ?? []) {
    if (!item.file || !item["@microsoft.graph.downloadUrl"]) continue;
    const fileResponse = await fetch(item["@microsoft.graph.downloadUrl"]);
    if (fileResponse.ok) records.push(...await readFileContent(item.name, await fileResponse.text()));
  }
  return records;
}

export async function readSnowflakeSource(config: ConnectorConfig): Promise<IngestedRecord[]> {
  if (!config.account || !config.username || !config.password || !config.query) throw new Error("Snowflake source requires account, username, password, and query.");
  const connection = snowflake.createConnection({ account: config.account, username: config.username, password: config.password, warehouse: config.warehouse, database: config.database, schema: config.schema });
  await new Promise<void>((resolve, reject) => connection.connect((error) => error ? reject(error) : resolve()));
  try {
    const rows = await new Promise<Record<string, unknown>[]>((resolve, reject) => connection.execute({ sqlText: config.query!, complete: (error, _statement, rows) => error ? reject(error) : resolve((rows ?? []) as Record<string, unknown>[]) }));
    return rows.map((row, index) => recordFromObject(row, `row/${index + 1}`, `Snowflake row ${index + 1}`, "structured"));
  } finally {
    connection.destroy(() => undefined);
  }
}

async function readFileContent(locator: string, content: string) { const extension = path.extname(locator).toLowerCase(); return extension === ".json" ? recordsFromJson(JSON.parse(content)) : extension === ".csv" ? recordsFromJson(parseCsv(content, { columns: true, skip_empty_lines: true })) : [{ sourceLocator: locator, title: locator, content, fields: [], domain: "unstructured" as const, entityKeys: {} }]; }
function recordsFromJson(value: unknown): IngestedRecord[] { const rows = Array.isArray(value) ? value : [value]; return rows.map((row, index) => recordFromObject(typeof row === "object" && row !== null ? row as Record<string, unknown> : { value: row }, `record/${index + 1}`, `Record ${index + 1}`, "semi-structured")); }
function recordFromObject(row: Record<string, unknown>, sourceLocator: string, title: string, domain: IngestedRecord["domain"]): IngestedRecord { return { sourceLocator, title, content: Object.entries(row).map(([key, value]) => `${key}: ${value}`).join(". "), fields: Object.keys(row), domain, entityKeys: Object.fromEntries(Object.entries(row).filter(([key, value]) => /(^id$|_id$|key$)/i.test(key) && ["string", "number"].includes(typeof value)).map(([key, value]) => [key, String(value)])) }; }
function getPath(value: unknown, pathValue: string) { return pathValue.split(".").reduce<unknown>((current, part) => current && typeof current === "object" ? (current as Record<string, unknown>)[part] : undefined, value); }
async function getMicrosoftToken(config: ConnectorConfig) { if (!config.tenantId || !config.clientId || !config.clientSecret) throw new Error("Microsoft source requires tenant, client, and secret configuration."); const response = await fetch(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }) }); if (!response.ok) throw new Error(`Microsoft token request returned ${response.status}.`); return (await response.json() as { access_token: string }).access_token; }
