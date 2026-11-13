import Database from "better-sqlite3";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

export const sourcesRoot = path.join(process.cwd(), "data", "sources");

export type IngestedRecord = { sourceLocator: string; title: string; content: string; fields: string[]; domain: "structured" | "semi-structured" | "unstructured"; entityKeys: Record<string, string> };

function resolveWithinSourcesRoot(locator: string) {
  const resolved = path.resolve(sourcesRoot, locator);
  if (resolved !== sourcesRoot && !resolved.startsWith(sourcesRoot + path.sep)) throw new Error("Source locator must stay within the local sources root.");
  return resolved;
}

export async function readSqliteSource(locator: string, table: string): Promise<IngestedRecord[]> {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) throw new Error("Invalid table name.");
  const resolved = resolveWithinSourcesRoot(locator);
  const db = new Database(resolved, { readonly: true });
  try {
    const rows = db.prepare(`select * from ${table}`).all() as Record<string, unknown>[];
    return rows.map((row, index) => ({ sourceLocator: `${table}#${index + 1}`, title: `${table} row ${index + 1}`, content: Object.entries(row).map(([key, value]) => `${key}: ${value}`).join(". "), fields: Object.keys(row), domain: "structured" as const, entityKeys: pickEntityKeys(row) }));
  } finally {
    db.close();
  }
}

export async function readJsonSource(locator: string): Promise<IngestedRecord[]> {
  const resolved = resolveWithinSourcesRoot(locator);
  const content = await readFile(resolved, "utf8");
  const rows = JSON.parse(content) as Record<string, unknown>[];
  if (!Array.isArray(rows)) throw new Error("JSON source must contain an array of records.");
  return rows.map((row, index) => ({ sourceLocator: `${path.basename(resolved)}#${index + 1}`, title: typeof row.title === "string" ? row.title : `Event ${index + 1}`, content: typeof row.note === "string" ? row.note : JSON.stringify(row), fields: Object.keys(row), domain: "semi-structured" as const, entityKeys: pickEntityKeys(row) }));
}

export async function readDocumentSource(locator: string): Promise<IngestedRecord[]> {
  const resolved = resolveWithinSourcesRoot(locator);
  const files = await readdir(resolved, { withFileTypes: true });
  const records: IngestedRecord[] = [];
  for (const file of files.filter((entry) => entry.isFile() && /\.(txt|md)$/i.test(entry.name))) {
    const content = await readFile(path.join(resolved, file.name), "utf8");
    records.push({ sourceLocator: file.name, title: file.name, content, fields: [], domain: "unstructured", entityKeys: {} });
  }
  return records;
}

/** Trust boundary: connectionString/query are configured by a workspace admin, never taken from end-user question text. */
export async function readPostgresSource(connectionString: string, query: string): Promise<IngestedRecord[]> {
  const client = new Client({ connectionString, ssl: /sslmode=require/i.test(connectionString) ? { rejectUnauthorized: false } : undefined });
  await client.connect();
  try {
    const result = await client.query(query);
    return result.rows.map((row: Record<string, unknown>, index: number) => ({ sourceLocator: `row/${index + 1}`, title: `Row ${index + 1}`, content: Object.entries(row).map(([key, value]) => `${key}: ${value}`).join(". "), fields: Object.keys(row), domain: "structured" as const, entityKeys: pickEntityKeys(row) }));
  } finally {
    await client.end();
  }
}

function pickEntityKeys(row: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(row).filter(([key, value]) => /(^id$|_id$|key$)/i.test(key) && ["string", "number"].includes(typeof value)).map(([key, value]) => [key, String(value)]));
}
