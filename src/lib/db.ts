import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

export const dataRoot = path.join(process.cwd(), "data");
const dbPath = path.join(dataRoot, "vynmesh.db");

const SCHEMA_SQL = `
create table if not exists workspaces (
  id text primary key,
  name text not null,
  created_at text not null default (datetime('now'))
);
create table if not exists users (
  id text primary key,
  email text not null unique,
  display_name text not null,
  password_hash text
);
create table if not exists workspace_memberships (
  workspace_id text not null references workspaces(id),
  user_id text not null references users(id),
  role text not null check (role in ('owner','admin','analyst','viewer')),
  primary key (workspace_id, user_id)
);
create table if not exists sources (
  id text primary key,
  workspace_id text not null references workspaces(id),
  name text not null,
  kind text not null,
  locator text not null,
  secret_config text,
  status text not null default 'registered' check (status in ('registered','connected','attention')),
  last_sync text,
  created_at text not null default (datetime('now')),
  unique (workspace_id, name)
);
create table if not exists catalog_records (
  id text primary key,
  workspace_id text not null,
  source_id text not null references sources(id),
  source_name text not null,
  domain text not null check (domain in ('structured','semi-structured','unstructured')),
  title text not null,
  content text not null,
  redacted_content text not null default '',
  fields text not null default '[]',
  raw_locator text not null,
  curated_locator text not null,
  schema_version text,
  entity_keys text not null default '{}',
  lineage text not null default '{}',
  classification text not null default 'internal',
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);
create virtual table if not exists catalog_fts using fts5(id unindexed, title, content, fields);
create table if not exists investigations (
  id text primary key,
  workspace_id text not null,
  user_id text not null,
  question text not null,
  status text not null default 'complete',
  confidence real not null default 0,
  answer text,
  model text,
  created_at text not null default (datetime('now'))
);
create table if not exists investigation_evidence (
  investigation_id text not null references investigations(id),
  record_id text not null references catalog_records(id),
  relevance real not null,
  excerpt text not null,
  citation text not null,
  primary key (investigation_id, record_id)
);
create table if not exists audit_events (
  id integer primary key autoincrement,
  workspace_id text not null,
  user_id text,
  action text not null,
  resource_type text not null,
  resource_id text,
  details text not null default '{}',
  created_at text not null default (datetime('now'))
);
create table if not exists dead_letters (
  id integer primary key autoincrement,
  workspace_id text not null,
  source_id text not null,
  error text not null,
  attempt integer not null,
  created_at text not null default (datetime('now'))
);
create table if not exists workspace_settings (
  workspace_id text primary key references workspaces(id) on delete cascade,
  ai_provider text not null default 'openai-compatible',
  ai_endpoint text not null default '',
  ai_model text not null default 'default',
  ai_secret text,
  retention_days integer not null default 365,
  updated_at text not null default (datetime('now'))
);
`;

let db: Database.Database | undefined;

export function getDb() {
  if (db) return db;
  mkdirSync(dataRoot, { recursive: true });
  db = new Database(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA_SQL);
  migrateExistingDatabase(db);
  seedWorkspace(db);
  return db;
}

function migrateExistingDatabase(database: Database.Database) {
  const userColumns = (database.prepare("pragma table_info(users)").all() as Array<{ name: string }>).map((column) => column.name);
  if (!userColumns.includes("password_hash")) database.exec("alter table users add column password_hash text");
  const columns = (database.prepare("pragma table_info(sources)").all() as Array<{ name: string }>).map((column) => column.name);
  if (!columns.includes("secret_config")) database.exec("alter table sources add column secret_config text");
  const sourceSchema = (database.prepare("select sql from sqlite_master where type = 'table' and name = 'sources'").get() as { sql?: string } | undefined)?.sql ?? "";
  if (sourceSchema.includes("check (kind in")) {
    database.exec("alter table sources rename to sources_legacy; create table sources (id text primary key, workspace_id text not null references workspaces(id), name text not null, kind text not null, locator text not null, secret_config text, status text not null default 'registered' check (status in ('registered','connected','attention')), last_sync text, created_at text not null default (datetime('now')), unique (workspace_id, name)); insert into sources select id, workspace_id, name, kind, locator, secret_config, status, last_sync, created_at from sources_legacy; drop table sources_legacy;");
  }
  const recordColumns = (database.prepare("pragma table_info(catalog_records)").all() as Array<{ name: string }>).map((column) => column.name);
  if (!recordColumns.includes("redacted_content")) database.exec("alter table catalog_records add column redacted_content text not null default ''");
}

function seedWorkspace(database: Database.Database) {
  database.prepare("insert into workspaces (id, name) values (?, ?) on conflict (id) do nothing").run("workspace-northstar", "Northstar finance");
  database.prepare("insert into users (id, email, display_name, password_hash) values (?, ?, ?, ?) on conflict (id) do update set password_hash = coalesce(users.password_hash, excluded.password_hash)").run("user-demo", "demo@vynmesh.local", "Demo Analyst", "81a6096090bcdcb285f00dc48d7269f0:67733669fa483da3518e5a4b68da75a6e39c460facfe79a47bc052353d89f1b9d8c0970bc2f93dc457d99c1034590bc2afba842419897e1b4c94a3c1732f29b6");
  database.prepare("insert into workspace_memberships (workspace_id, user_id, role) values (?, ?, ?) on conflict (workspace_id, user_id) do nothing").run("workspace-northstar", "user-demo", "owner");
  database.prepare("insert into users (id, email, display_name, password_hash) values (?, ?, ?, ?) on conflict (email) do update set display_name = excluded.display_name, password_hash = coalesce(users.password_hash, excluded.password_hash)").run("user-admin", "admin@vynmesh.local", "Admin", "81a6096090bcdcb285f00dc48d7269f0:67733669fa483da3518e5a4b68da75a6e39c460facfe79a47bc052353d89f1b9d8c0970bc2f93dc457d99c1034590bc2afba842419897e1b4c94a3c1732f29b6");
  database.prepare("insert into workspace_memberships (workspace_id, user_id, role) values (?, ?, ?) on conflict (workspace_id, user_id) do update set role = excluded.role").run("workspace-northstar", "user-admin", "admin");
  database.prepare("insert into workspace_settings (workspace_id) values (?) on conflict (workspace_id) do nothing").run("workspace-northstar");
}

export function withTransaction<T>(work: () => T): T {
  const database = getDb();
  database.exec("BEGIN");
  try {
    const result = work();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
