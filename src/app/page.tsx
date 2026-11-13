"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Database, LogOut, Layers, MessageCircle, Network, Plus, RefreshCw, Search, Settings, Users, X } from "lucide-react";
import type { Investigation, MeshState, Source } from "@/lib/mesh-store";
import type { ConnectorKind } from "@/lib/connector-adapters";
import SettingsPanel from "@/app/settings/SettingsPanel";
import TeamPanel from "@/app/team/TeamPanel";

type Page = "Dashboard" | "Data Sources" | "Ask AI" | "Settings" | "Team";
type SourceMode = "choose" | "connect";
type SourceForm = { name: string; kind: ConnectorKind; locator: string; configText: string };
type CurrentUser = { userId: string; email: string; name: string; role: string };

const kindLabels: Record<Source["kind"], string> = { file: "Uploaded file", sqlite: "Database", json: "Events file", document: "Documents", postgres: "Database (Postgres)", s3: "S3 storage", rest: "REST API", sharepoint: "SharePoint", onedrive: "OneDrive", snowflake: "Snowflake" };
const statusLabels: Record<Source["status"], string> = { connected: "Connected", attention: "Needs attention", registered: "Not synced yet" };

export default function Home({ initialPage = "Dashboard" }: { initialPage?: Page }) {
  const router = useRouter();
  const [state, setState] = useState<MeshState | null>(null);
  const [page, setPage] = useState<Page>(initialPage);
  const [query, setQuery] = useState("");
  const [sourceForm, setSourceForm] = useState<SourceForm>({ name: "", kind: "postgres", locator: "", configText: "" });
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceMode, setSourceMode] = useState<SourceMode>("choose");
  const [editingSource, setEditingSource] = useState<Source | null>(null);
  const [sourceMessage, setSourceMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);

  async function loadState() { setLoading(true); try { const response = await fetch("/api/mesh", { cache: "no-store" }); if (!response.ok) throw new Error("Could not load your data."); setState(await response.json()); setError(""); } catch { setError("Could not reach VynMesh. Try refreshing."); } finally { setLoading(false); } }
  useEffect(() => { const timer = window.setTimeout(() => { void loadState(); }, 0); return () => window.clearTimeout(timer); }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void fetch("/api/auth/me").then((response) => response.ok ? response.json() : null).then((user) => { if (user) setCurrentUser(user); }); }, 0); return () => window.clearTimeout(timer); }, []);
  useEffect(() => { const params = new URLSearchParams(window.location.search); const redirectError = params.get("error"); if (!redirectError) return; window.history.replaceState({}, "", window.location.pathname); const timer = window.setTimeout(() => setError(redirectError), 0); return () => window.clearTimeout(timer); }, []);
  async function mutate(action: string, payload: Record<string, string> = {}) { const response = await fetch("/api/mesh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Something went wrong."); setState(result); return result as MeshState; }
  function navigate(nextPage: Page) { setPage(nextPage); router.push(nextPage === "Dashboard" ? "/" : nextPage === "Data Sources" ? "/sources" : nextPage === "Ask AI" ? "/ask" : nextPage === "Settings" ? "/settings" : "/team"); }
  async function askQuestion(event: React.FormEvent) { event.preventDefault(); if (!query.trim()) return; navigate("Ask AI"); try { await mutate("investigate", { question: query }); setQuery(""); } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Your question could not be answered."); } }
  async function saveSource(event: React.FormEvent) { event.preventDefault(); try { const config = sourceForm.configText.trim() ? JSON.parse(sourceForm.configText) as Record<string, string> : undefined; const action = editingSource ? "update-source" : "add-source"; await mutate(action, { ...(editingSource ? { sourceId: editingSource.id } : {}), name: sourceForm.name, kind: sourceForm.kind, ...(sourceForm.locator.trim() ? { locator: sourceForm.locator } : {}), ...(config ? { config: JSON.stringify(config) } : {}) }); setSourceForm({ name: "", kind: "postgres", locator: "", configText: "" }); setEditingSource(null); setSourceOpen(false); } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Could not save that source. Check the connection details."); } }
  async function syncSource(sourceId: string) { try { await mutate("ingest-source", { sourceId }); } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Sync failed."); } }
  async function testSource(sourceId: string) { setSourceMessage("Testing connection…"); try { const response = await fetch("/api/mesh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test-source", sourceId }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Connection test failed."); setSourceMessage(`${result.sourceName} is reachable. ${result.recordsAvailable} records found.`); await loadState(); } catch (testError) { setSourceMessage(testError instanceof Error ? testError.message : "Connection test failed."); await loadState(); } }
  async function testEditingSource() { if (!editingSource) return; setSourceMessage("Testing connection…"); try { const config = sourceForm.configText.trim() ? JSON.parse(sourceForm.configText) as Record<string, string> : undefined; if (sourceForm.configText.trim()) await mutate("update-source", { sourceId: editingSource.id, name: sourceForm.name, kind: sourceForm.kind, ...(sourceForm.locator.trim() ? { locator: sourceForm.locator } : {}), config: JSON.stringify(config) }); const response = await fetch("/api/mesh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test-source", sourceId: editingSource.id }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Connection test failed."); setSourceMessage(`${result.sourceName} is reachable. ${result.recordsAvailable} records found.`); await loadState(); } catch (testError) { setSourceMessage(testError instanceof Error ? testError.message : "Connection test failed."); } }
  async function testNewSource() { setSourceMessage("Testing connection…"); try { const config = sourceForm.configText.trim() ? JSON.parse(sourceForm.configText) as Record<string, string> : {}; const response = await fetch("/api/mesh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test-source-config", kind: sourceForm.kind, locator: sourceForm.locator, config }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Connection test failed."); setSourceMessage(`Connection works. ${result.recordsAvailable} records found.`); } catch (testError) { setSourceMessage(testError instanceof Error ? testError.message : "Connection test failed."); } }
  async function removeSource(source: Source) { if (!window.confirm(`Delete ${source.name}? Its catalog records and lake copies will also be removed.`)) return; try { await mutate("delete-source", { sourceId: source.id }); setSourceMessage(`${source.name} was deleted.`); } catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : "Could not delete that source."); } }
  function editSource(source: Source) { setEditingSource(source); setSourceMode("connect"); setSourceForm({ name: source.name, kind: source.kind, locator: "", configText: "" }); setSourceOpen(true); }
  async function signOut() { await fetch("/api/auth", { method: "DELETE" }); router.push("/login"); }
  async function uploadFiles(event: React.ChangeEvent<HTMLInputElement>) { const files = Array.from(event.target.files ?? []); event.target.value = ""; if (files.length === 0) return; try { const form = new FormData(); files.forEach((file) => form.append("files", file, file.webkitRelativePath || file.name)); const response = await fetch("/api/sources/upload", { method: "POST", body: form }); const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Upload failed."); setState(result); setSourceMessage(`${files.length} upload${files.length === 1 ? "" : "s"} processed.`); navigate("Data Sources"); } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : "Upload failed."); } }

  if (loading && !state) return <main className="center-screen"><div className="card"><div className="logo">V</div><h1>Loading your data…</h1></div></main>;

  const sourceCount = state?.sources.length ?? 0;
  const recordCount = state?.records.length ?? 0;
  const questionCount = state?.investigations.length ?? 0;

  return <main className="app">
    <nav className="side-nav">
      <div className="logo-row"><div className="brand-mark"><Network size={17} /></div><div><strong>VynMesh</strong><span>Data Intelligence</span></div></div>
      <button className={`nav-btn ${page === "Dashboard" ? "active" : ""}`} onClick={() => navigate("Dashboard")}><Layers size={17} /> Dashboard</button>
      <button className={`nav-btn ${page === "Data Sources" ? "active" : ""}`} onClick={() => navigate("Data Sources")}><Database size={17} /> Data Sources</button>
      <button className={`nav-btn ${page === "Ask AI" ? "active" : ""}`} onClick={() => navigate("Ask AI")}><MessageCircle size={17} /> Ask AI{questionCount > 0 && <span className="badge">{questionCount}</span>}</button>
      <div className="side-nav-bottom"><button className={`nav-btn ${page === "Team" ? "active" : ""}`} onClick={() => navigate("Team")}><Users size={17} /> Team</button><button className={`nav-btn ${page === "Settings" ? "active" : ""}`} onClick={() => navigate("Settings")}><Settings size={17} /> Settings</button><div className="user-footer"><div className="user-avatar">{(currentUser?.name ?? "?").slice(0, 1).toUpperCase()}</div><div><strong>{currentUser?.name ?? "Loading…"}</strong><span>{currentUser?.role ?? ""}</span></div><button className="icon-btn" onClick={() => void signOut()} title="Sign out"><LogOut size={14} /></button></div><div className="suite-label">Part of VynOps Suite</div></div>
    </nav>
    <section className="main">
      <header className="top-bar"><div><h2>{page}</h2><span className="top-subtitle">VynMesh data intelligence</span></div><div className="top-actions"><span className="connection-state"><i /> Mesh connected</span><button className="icon-btn" onClick={() => void loadState()} title="Refresh"><RefreshCw size={17} /></button><button className="icon-btn" onClick={() => void signOut()} title="Sign out"><LogOut size={16} /></button><span className="top-avatar">{(currentUser?.name ?? "?").slice(0, 1).toUpperCase()}</span></div></header>
      {error && <div className="error"><span>{error}</span><button onClick={() => setError("")}><X size={14} /></button></div>}
      <div className="page-body">
        {page === "Dashboard" && <Dashboard state={state} sourceCount={sourceCount} recordCount={recordCount} questionCount={questionCount} query={query} setQuery={setQuery} askQuestion={askQuestion} onAddSource={() => setSourceOpen(true)} />}
        {page === "Data Sources" && <DataSources state={state} onAddSource={() => { setEditingSource(null); setSourceMode("choose"); setSourceForm({ name: "", kind: "postgres", locator: "", configText: "" }); setSourceOpen(true); }} onSync={(sourceId) => void syncSource(sourceId)} onTest={(sourceId) => void testSource(sourceId)} onEdit={editSource} onDelete={(source) => void removeSource(source)} message={sourceMessage} />}
        {page === "Ask AI" && <AskAI state={state} query={query} setQuery={setQuery} askQuestion={askQuestion} />}
        {page === "Settings" && <SettingsPanel />}
        {page === "Team" && <TeamPanel />}
      </div>
    </section>
    <input ref={uploadInput} type="file" accept=".json,.csv,.txt,.md" multiple hidden onChange={(event) => void uploadFiles(event)} />
    <input ref={folderInput} type="file" accept=".json,.csv,.txt,.md" multiple hidden {...{ webkitdirectory: "", directory: "" }} onChange={(event) => void uploadFiles(event)} />
    <input ref={zipInput} type="file" accept=".zip" hidden onChange={(event) => void uploadFiles(event)} />
    {sourceOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSourceOpen(false); }}>
      {sourceMode === "choose" ? <div className="modal choice-modal"><div className="modal-head"><h3>Add a data source</h3><button type="button" className="icon-btn" onClick={() => setSourceOpen(false)} aria-label="Close"><X size={18} /></button></div><p>Choose how you want to bring data into VynMesh.</p><button type="button" className="choice-button" onClick={() => { setSourceOpen(false); uploadInput.current?.click(); }}><strong>Upload files</strong><span>Choose one or more CSV, JSON, TXT, or Markdown files</span></button><button type="button" className="choice-button" onClick={() => { setSourceOpen(false); folderInput.current?.click(); }}><strong>Upload a folder</strong><span>Import supported files from a folder</span></button><button type="button" className="choice-button" onClick={() => { setSourceOpen(false); zipInput.current?.click(); }}><strong>Upload a ZIP</strong><span>Import supported files from a ZIP archive</span></button><button type="button" className="choice-button" onClick={() => setSourceMode("connect")}><strong>Connect an external source</strong><span>Database, storage, API, SharePoint, OneDrive, or Snowflake</span></button></div> : <form className="modal" onSubmit={saveSource}>
        <div className="modal-head"><h3>{editingSource ? "Edit data source" : "Connect another source"}</h3><button type="button" className="icon-btn" onClick={() => { setSourceOpen(false); setEditingSource(null); }} aria-label="Close"><X size={18} /></button></div>
        <p>Connect a database, storage service, API, or company document service. To add CSV, JSON, TXT, or Markdown, use Upload a file.</p>
        <label>Name<input required value={sourceForm.name} onChange={(event) => setSourceForm({ ...sourceForm, name: event.target.value })} placeholder="e.g. customer-contracts" /></label>
          <label>Type<select value={sourceForm.kind} onChange={(event) => setSourceForm({ ...sourceForm, kind: event.target.value as ConnectorKind })}>{editingSource && !["postgres", "s3", "rest", "sharepoint", "onedrive", "snowflake"].includes(sourceForm.kind) && <option value={sourceForm.kind}>{kindLabels[sourceForm.kind]} (current)</option>}<option value="postgres">PostgreSQL database</option><option value="s3">S3-compatible storage</option><option value="rest">REST API</option><option value="sharepoint">SharePoint</option><option value="onedrive">OneDrive</option><option value="snowflake">Snowflake</option></select></label>
          <label>Location or URL<input value={sourceForm.locator} onChange={(event) => setSourceForm({ ...sourceForm, locator: event.target.value })} placeholder="Connection location or API URL" /></label><label>Connection details (JSON)<textarea required={!editingSource} value={sourceForm.configText} onChange={(event) => setSourceForm({ ...sourceForm, configText: event.target.value })} placeholder='{"connectionString":"...","query":"select ..."}' rows={4} /></label>
        <div className="modal-actions"><button className="btn-secondary" type="button" onClick={() => void (editingSource ? testEditingSource() : testNewSource())}>Test</button><button className="btn-primary" type="submit">Save</button></div>
        {editingSource && sourceMessage && <p className="source-message">{sourceMessage}</p>}
      </form>}
    </div>}
  </main>;
}

function Dashboard({ state, sourceCount, recordCount, questionCount, query, setQuery, askQuestion, onAddSource }: { state: MeshState | null; sourceCount: number; recordCount: number; questionCount: number; query: string; setQuery: (value: string) => void; askQuestion: (event: React.FormEvent) => void; onAddSource: () => void }) {
  return <>
    <p className="intro">VynMesh brings your company data together and lets you ask questions about it in plain English.</p>
    <section className="stat-row">
      <StatCard label="Data sources" value={String(sourceCount)} />
      <StatCard label="Records collected" value={String(recordCount)} />
      <StatCard label="Questions answered" value={String(questionCount)} />
    </section>
    <section className="ask-box">
      <h3>Ask a question</h3>
      <form onSubmit={askQuestion} className="ask-form"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. Which customers have a pending payment review?" /><button type="submit">Ask</button></form>
    </section>
    <section>
      <div className="section-head"><h3>Recent activity</h3></div>
      {(state?.activities ?? []).length === 0 ? <p className="muted">Nothing has happened yet.</p> : <ul className="activity-list">{state?.activities.map((item) => <li key={item.id}><strong>{item.title}</strong><span>{item.detail}</span></li>)}</ul>}
    </section>
    {sourceCount === 0 && <button className="btn-secondary" onClick={onAddSource}><Plus size={16} /> Add your first data source</button>}
  </>;
}

function DataSources({ state, onAddSource, onSync, onTest, onEdit, onDelete, message }: { state: MeshState | null; onAddSource: () => void; onSync: (sourceId: string) => void; onTest: (sourceId: string) => void; onEdit: (source: Source) => void; onDelete: (source: Source) => void; message: string }) {
  return <>
    <p className="intro">These are the places VynMesh is collecting data from.</p>
    <button className="btn-primary" onClick={onAddSource}><Plus size={16} /> Add a data source</button>
    {message && <p className="source-message">{message}</p>}
    <div className="source-list">
      {(state?.sources ?? []).length === 0 ? <p className="muted">No data sources yet.</p> : state?.sources.map((source) => <div className="source-row" key={source.id}>
        <div className="source-icon"><Database size={16} /></div>
        <div className="source-info"><strong>{source.name}</strong><span>{kindLabels[source.kind]} · {source.recordCount} records · last synced {source.lastSync}</span></div>
        <span className={`status ${source.status}`}>{statusLabels[source.status]}</span>
        <div className="source-actions"><button className="btn-secondary small" onClick={() => onTest(source.id)}>Test</button><button className="btn-secondary small" onClick={() => onSync(source.id)}><RefreshCw size={14} /> Sync</button><button className="btn-secondary small" onClick={() => onEdit(source)}>Edit</button><button className="btn-danger small" onClick={() => onDelete(source)}>Delete</button></div>
      </div>)}
    </div>
  </>;
}

function AskAI({ state, query, setQuery, askQuestion }: { state: MeshState | null; query: string; setQuery: (value: string) => void; askQuestion: (event: React.FormEvent) => void }) {
  return <>
    <p className="intro">Ask a question about your data in plain English. VynMesh searches your connected sources and shows where each answer came from.</p>
    <form onSubmit={askQuestion} className="ask-form big"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ask a question about your data" /><button type="submit">Ask</button></form>
    {(state?.investigations ?? []).length === 0 ? <p className="muted">No questions asked yet. Try asking one above.</p> : <div className="answer-list">{state?.investigations.map((item) => <AnswerCard key={item.id} item={item} />)}</div>}
  </>;
}

function AnswerCard({ item }: { item: Investigation }) {
  return <div className="answer-card">
    <strong>{item.question}</strong>
    <p>{item.answer}</p>
    {item.evidence.length > 0 && <div className="sources-used"><span className="sources-label">Sources used</span>{item.evidence.map((evidence) => <div className="source-ref" key={evidence.id}><strong>{evidence.sourceName}</strong><span>{evidence.excerpt}</span></div>)}</div>}
  </div>;
}

function StatCard({ label, value }: { label: string; value: string }) { return <div className="stat-card"><span>{label}</span><strong>{value}</strong></div>; }
