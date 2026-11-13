"use client";

import { useEffect, useState } from "react";
import { Edit3, Loader2, Plus, Trash2, Users, X } from "lucide-react";

type Role = "owner" | "admin" | "analyst" | "viewer";
type Member = { userId: string; email: string; name: string; role: Role };

export default function TeamPanel() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "analyst" as Role });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() { setLoading(true); try { const response = await fetch("/api/team", { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setMembers(data.members); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load team."); } finally { setLoading(false); } }
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, []);
  async function action(body: Record<string, string>) { const response = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setMembers(data.members); }
  async function saveMember(event: React.FormEvent) { event.preventDefault(); setSaving(true); setError(""); try { const payload = { action: editing ? "update" : "add", ...(editing ? { userId: editing.userId } : {}), name: form.name, email: form.email, role: form.role, ...(form.password ? { password: form.password } : {}) }; await action(payload); setForm({ name: "", email: "", password: "", role: "analyst" }); setEditing(null); setModalOpen(false); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save member."); } finally { setSaving(false); } }
  async function remove(member: Member) { if (!window.confirm(`Remove ${member.name} from this workspace?`)) return; try { await action({ action: "remove", userId: member.userId }); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not remove member."); } }

  function editMember(member: Member) { setEditing(member); setForm({ name: member.name, email: member.email, password: "", role: member.role }); setModalOpen(true); }
  return <section className="team-page">
    <div className="settings-heading"><div><p className="settings-kicker">Admin</p><h3>Team</h3><p>Manage who can access this workspace and what they can do.</p></div><button className="btn-primary" onClick={() => { setEditing(null); setForm({ name: "", email: "", password: "", role: "analyst" }); setModalOpen(true); }}><Plus size={15} /> Add member</button></div>
    {error && <div className="settings-error">{error}</div>}
    <div className="team-card"><div className="team-card-heading"><div><h4>Workspace members</h4><p>{members.length} member{members.length === 1 ? "" : "s"}</p></div><Users size={18} /></div>{loading ? <p className="muted"><Loader2 size={14} className="spin" /> Loading team…</p> : members.map((member) => <div className="member-row" key={member.userId}><div className="user-avatar">{member.name.slice(0, 1).toUpperCase()}</div><div className="member-info"><strong>{member.name}</strong><span>{member.email}</span></div><span className="role-label">{member.role}</span><button className="icon-btn" onClick={() => editMember(member)} title="Edit member"><Edit3 size={15} /></button><button className="icon-btn danger-icon" onClick={() => void remove(member)} title="Remove member"><Trash2 size={15} /></button></div>)}</div>
    {modalOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}><form className="modal" onSubmit={saveMember}><div className="modal-head"><h3>{editing ? "Edit team member" : "Add team member"}</h3><button type="button" className="icon-btn" onClick={() => setModalOpen(false)} aria-label="Close"><X size={18} /></button></div><p>{editing ? "Update details or enter a new password to reset it." : "Create a local account with a name, email, and password."}</p><label>Name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Alex Kim" /></label><label>Email<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="alex@example.com" /></label><label>{editing ? "New password (optional)" : "Password"}<input required={!editing} minLength={8} type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder={editing ? "Leave blank to keep current password" : "At least 8 characters"} /></label><label>Role<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Role })}><option value="admin">Admin</option><option value="analyst">Analyst</option><option value="viewer">Viewer</option><option value="owner">Owner</option></select></label><button className="btn-primary" type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Add member"}</button></form></div>}
  </section>;
}
