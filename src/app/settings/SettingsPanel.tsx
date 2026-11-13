"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Eye, EyeOff, Loader2, Save, ShieldCheck, XCircle } from "lucide-react";

type Settings = { aiProvider: string; aiEndpoint: string; aiModel: string; aiSecretConfigured: boolean; retentionDays: number };

const AI_PROVIDERS = [
  { id: "groq", label: "Groq (Recommended)", endpoint: "https://api.groq.com/openai/v1/chat/completions", models: [{ value: "openai/gpt-oss-120b", label: "GPT OSS 120B" }, { value: "openai/gpt-oss-20b", label: "GPT OSS 20B (Fast)" }, { value: "groq/compound", label: "Groq Compound" }, { value: "groq/compound-mini", label: "Groq Compound Mini" }] },
  { id: "openai", label: "OpenAI", endpoint: "https://api.openai.com/v1/chat/completions", models: [{ value: "gpt-4o", label: "GPT-4o" }, { value: "gpt-4o-mini", label: "GPT-4o Mini (Fast)" }, { value: "gpt-4.1-mini", label: "GPT-4.1 Mini" }] },
  { id: "anthropic", label: "Anthropic (Claude)", endpoint: "https://api.anthropic.com/v1/messages", models: [{ value: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet" }, { value: "claude-3-7-sonnet-latest", label: "Claude 3.7 Sonnet" }, { value: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku" }] },
  { id: "google", label: "Google (Gemini)", endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", models: [{ value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" }, { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" }, { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" }] },
  { id: "custom", label: "Custom / Self-hosted", endpoint: "", models: [] },
] as const;

export default function SettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { void fetch("/api/settings").then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); const knownProvider = AI_PROVIDERS.some((provider) => provider.id === data.aiProvider); setSettings({ ...data, aiProvider: knownProvider ? data.aiProvider : "custom" }); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load settings.")); }, []);
  function update<K extends keyof Settings>(key: K, value: Settings[K]) { setSettings((current) => current ? { ...current, [key]: value } : current); setSaved(false); }
  function selectProvider(providerId: string) { const provider = AI_PROVIDERS.find((item) => item.id === providerId) ?? AI_PROVIDERS[0]; setSettings((current) => current ? { ...current, aiProvider: provider.id, aiEndpoint: provider.endpoint, aiModel: provider.models[0]?.value ?? current.aiModel } : current); setSaved(false); setTestResult(null); }
  async function save() { if (!settings) return; setSaving(true); setError(""); try { const response = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...settings, aiApiKey: apiKey }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setSettings(data); setApiKey(""); setSaved(true); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save settings."); } finally { setSaving(false); } }
  async function test() { if (!settings) return; setTesting(true); setTestResult(null); try { const response = await fetch("/api/settings/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: settings.aiEndpoint, model: settings.aiModel, apiKey }) }); const data = await response.json(); setTestResult({ ok: response.ok, message: data.message ?? data.error ?? "Connection test failed." }); } catch (reason) { setTestResult({ ok: false, message: reason instanceof Error ? reason.message : "Connection test failed." }); } finally { setTesting(false); } }

  if (!settings) return <section className="settings-page"><p>{error || "Loading settings…"}</p></section>;
  return <section className="settings-page">
    <div className="settings-heading"><div><p className="settings-kicker">Admin</p><h3>Settings</h3><p>Configure how VynMesh answers questions for this workspace.</p></div><button className="btn-primary" onClick={() => void save()} disabled={saving}>{saving ? <Loader2 size={15} className="spin" /> : <Save size={15} />} {saved ? "Saved" : "Save"}</button></div>
    {error && <div className="settings-error">{error}</div>}
    <div className="settings-card"><div className="settings-card-heading"><div><h4>AI provider</h4><p>Ask AI uses this provider after it finds evidence in your data.</p></div><span className="settings-status"><span /> Server-side</span></div>
      <label>Provider<select value={settings.aiProvider} onChange={(event) => selectProvider(event.target.value)}>{AI_PROVIDERS.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select></label>
      <label>Endpoint URL<input value={settings.aiEndpoint} onChange={(event) => update("aiEndpoint", event.target.value)} placeholder="https://api.example.com/v1/chat/completions" /></label>
      <label>Model name{(AI_PROVIDERS.find((provider) => provider.id === settings.aiProvider)?.models.length ?? 0) > 0 ? <select value={settings.aiModel} onChange={(event) => update("aiModel", event.target.value)}>{AI_PROVIDERS.find((provider) => provider.id === settings.aiProvider)?.models.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}</select> : <input value={settings.aiModel} onChange={(event) => update("aiModel", event.target.value)} placeholder="your-model-id" />}</label>
      <label>API key<div className="secret-input"><input type={showKey ? "text" : "password"} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={settings.aiSecretConfigured ? "Key saved. Enter a new key to replace it." : "Enter provider API key"} /><button type="button" onClick={() => setShowKey(!showKey)}>{showKey ? <EyeOff size={15} /> : <Eye size={15} />}</button></div></label>
      <div className="settings-actions"><button className="btn-secondary" onClick={() => void test()} disabled={testing || !apiKey}>{testing ? <Loader2 size={14} className="spin" /> : <CheckCircle size={14} />} Test</button>{testResult && <span className={testResult.ok ? "test-ok" : "test-fail"}>{testResult.ok ? <CheckCircle size={14} /> : <XCircle size={14} />} {testResult.message}</span>}</div>
    </div>
    <div className="settings-card"><div className="settings-card-heading"><div><h4>Workspace</h4><p>Basic data lifecycle behavior for this workspace.</p></div></div><label>Keep audit and catalog data for (days)<input type="number" min="1" max="3650" value={settings.retentionDays} onChange={(event) => update("retentionDays", Number(event.target.value))} /></label></div>
    <div className="settings-card security-card"><div className="settings-card-heading"><div><h4>Security status</h4><p>Current protections applied to this workspace.</p></div></div><p><ShieldCheck size={16} /> PII redaction is enabled for ingested records.</p><p><ShieldCheck size={16} /> Connector credentials are encrypted at rest.</p><p><ShieldCheck size={16} /> Workspace settings require an administrator role.</p></div>
  </section>;
}
