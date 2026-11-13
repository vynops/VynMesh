import { getDb } from "@/lib/db";
import { hashPassword } from "@/lib/passwords";
import { setTeamMemberBlocked as setBlocked, type TeamRole } from "./team-access";

export type TeamMember = { userId: string; email: string; name: string; role: TeamRole; isBlocked: boolean };

export function listTeamMembers(workspaceId: string): TeamMember[] {
  const rows = getDb().prepare("select u.id as userId, u.email, u.display_name as name, m.role, m.is_blocked as isBlocked from workspace_memberships m join users u on u.id = m.user_id where m.workspace_id = ? order by case m.role when 'owner' then 0 when 'admin' then 1 when 'analyst' then 2 else 3 end, u.display_name").all(workspaceId) as Array<Omit<TeamMember, "isBlocked"> & { isBlocked: number }>;
  return rows.map(({ isBlocked, ...member }) => ({ ...member, isBlocked: isBlocked === 1 }));
}

export function addTeamMember(workspaceId: string, actorId: string, input: { email: string; name: string; role: TeamMember["role"]; password: string }) {
  const db = getDb();
  const userId = `user-${crypto.randomUUID()}`;
  db.prepare("insert into users (id, email, display_name, password_hash) values (?, ?, ?, ?)").run(userId, input.email.trim().toLowerCase(), input.name.trim(), hashPassword(input.password));
  db.prepare("insert into workspace_memberships (workspace_id, user_id, role) values (?, ?, ?)").run(workspaceId, userId, input.role);
  db.prepare("insert into audit_events (workspace_id, user_id, action, resource_type, resource_id, details) values (?, ?, ?, ?, ?, ?)").run(workspaceId, actorId, "Team member added", "user", userId, JSON.stringify({ role: input.role, email: input.email.trim().toLowerCase() }));
}

export function updateTeamMember(workspaceId: string, actorId: string, userId: string, input: { role: TeamMember["role"]; name?: string; email?: string; password?: string }) {
  const db = getDb();
  const current = db.prepare("select role from workspace_memberships where workspace_id = ? and user_id = ?").get(workspaceId, userId) as { role: TeamMember["role"] } | undefined;
  if (!current) throw new Error("Team member not found.");
  if (current.role === "owner" && input.role !== "owner") ensureOwnerRemains(workspaceId, userId);
  if (input.name?.trim() || input.email?.trim()) db.prepare("update users set display_name = coalesce(nullif(?, ''), display_name), email = coalesce(nullif(?, ''), email) where id = ?").run(input.name?.trim() ?? "", input.email?.trim().toLowerCase() ?? "", userId);
  if (input.password?.trim()) db.prepare("update users set password_hash = ? where id = ?").run(hashPassword(input.password), userId);
  db.prepare("update workspace_memberships set role = ? where workspace_id = ? and user_id = ?").run(input.role, workspaceId, userId);
  db.prepare("insert into audit_events (workspace_id, user_id, action, resource_type, resource_id, details) values (?, ?, ?, ?, ?, ?)").run(workspaceId, actorId, "Team member updated", "user", userId, JSON.stringify({ role: input.role, name: input.name, email: input.email }));
}

export function removeTeamMember(workspaceId: string, actorId: string, userId: string) {
  const db = getDb();
  const current = db.prepare("select role from workspace_memberships where workspace_id = ? and user_id = ?").get(workspaceId, userId) as { role: TeamMember["role"] } | undefined;
  if (!current) throw new Error("Team member not found.");
  if (current.role === "owner") ensureOwnerRemains(workspaceId, userId);
  db.prepare("delete from workspace_memberships where workspace_id = ? and user_id = ?").run(workspaceId, userId);
  db.prepare("insert into audit_events (workspace_id, user_id, action, resource_type, resource_id, details) values (?, ?, ?, ?, ?, ?)").run(workspaceId, actorId, "Team member removed", "user", userId, "{}");
}

export function setTeamMemberBlocked(workspaceId: string, actorId: string, userId: string, blocked: boolean) {
  setBlocked(getDb(), workspaceId, actorId, userId, blocked);
}

function ensureOwnerRemains(workspaceId: string, userId: string) {
  const owners = getDb().prepare("select count(*) as count from workspace_memberships where workspace_id = ? and role = 'owner' and user_id != ?").get(workspaceId, userId) as { count: number };
  if (owners.count < 1) throw new Error("The workspace must keep at least one owner.");
}
