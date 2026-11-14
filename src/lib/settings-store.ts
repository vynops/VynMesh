import { getDb } from "@/lib/db";
import { decryptConfig, encryptConfig } from "@/lib/secrets";
import { findAiProvider, resolveAiEndpoint } from "@/lib/ai-providers";

export type WorkspaceSettings = { workspaceId: string; aiProvider: string; aiEndpoint: string; aiModel: string; aiSecretConfigured: boolean; retentionDays: number };
export type AiRuntimeConfig = { provider: string; endpoint: string; model: string; apiKey: string };

export function getWorkspaceSettings(workspaceId: string): WorkspaceSettings {
  const db = getDb();
  db.prepare("insert into workspace_settings (workspace_id) values (?) on conflict (workspace_id) do nothing").run(workspaceId);
  const row = db.prepare("select workspace_id, ai_provider, ai_endpoint, ai_model, ai_secret, retention_days from workspace_settings where workspace_id = ?").get(workspaceId) as { workspace_id: string; ai_provider: string; ai_endpoint: string; ai_model: string; ai_secret: string | null; retention_days: number };
  return { workspaceId: row.workspace_id, aiProvider: row.ai_provider, aiEndpoint: row.ai_endpoint, aiModel: row.ai_model, aiSecretConfigured: Boolean(row.ai_secret), retentionDays: row.retention_days };
}

export function saveWorkspaceSettings(workspaceId: string, userId: string, input: { aiProvider: string; aiEndpoint: string; aiModel: string; aiApiKey?: string; retentionDays: number }) {
  const db = getDb();
  db.prepare("insert into workspace_settings (workspace_id, ai_provider, ai_endpoint, ai_model, ai_secret, retention_days, updated_at) values (?, ?, ?, ?, ?, ?, datetime('now')) on conflict (workspace_id) do update set ai_provider = excluded.ai_provider, ai_endpoint = excluded.ai_endpoint, ai_model = excluded.ai_model, ai_secret = coalesce(excluded.ai_secret, workspace_settings.ai_secret), retention_days = excluded.retention_days, updated_at = datetime('now')").run(workspaceId, input.aiProvider, input.aiEndpoint, input.aiModel, input.aiApiKey ? encryptConfig({ apiKey: input.aiApiKey }) : null, input.retentionDays);
  db.prepare("insert into audit_events (workspace_id, user_id, action, resource_type, resource_id, details) values (?, ?, ?, ?, ?, ?)").run(workspaceId, userId, "Settings updated", "workspace_settings", workspaceId, JSON.stringify({ aiProvider: input.aiProvider, aiModel: input.aiModel }));
}

export function getAiRuntimeConfig(workspaceId: string): AiRuntimeConfig {
  const db = getDb();
  const row = db.prepare("select ai_provider, ai_endpoint, ai_model, ai_secret from workspace_settings where workspace_id = ?").get(workspaceId) as { ai_provider: string; ai_endpoint: string; ai_model: string; ai_secret: string | null } | undefined;
  if (row?.ai_endpoint && row.ai_secret) {
    const provider = findAiProvider(row.ai_provider)?.id ?? "custom";
    return { provider, endpoint: resolveAiEndpoint(provider, row.ai_endpoint), model: row.ai_model, apiKey: decryptConfig(row.ai_secret).apiKey };
  }
  return { provider: "custom", endpoint: process.env.MODEL_ENDPOINT ?? "", model: process.env.MODEL_NAME ?? "default", apiKey: process.env.MODEL_API_KEY ?? "" };
}