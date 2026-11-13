import type Database from "better-sqlite3";

export type TeamRole = "owner" | "admin" | "analyst" | "viewer";

export function migrateTeamMembershipBlocks(database: Database.Database) {
  const columns = (database.prepare("pragma table_info(workspace_memberships)").all() as Array<{ name: string }>).map((column) => column.name);
  if (!columns.includes("is_blocked")) database.exec("alter table workspace_memberships add column is_blocked integer not null default 0 check (is_blocked in (0,1))");
}

export function findAccessibleMembership(database: Database.Database, userId: string, workspaceId?: string) {
  const row = workspaceId
    ? database.prepare("select workspace_id, role from workspace_memberships where user_id = ? and workspace_id = ? and is_blocked = 0").get(userId, workspaceId)
    : database.prepare("select workspace_id, role from workspace_memberships where user_id = ? and is_blocked = 0 order by workspace_id limit 1").get(userId);
  return row as { workspace_id: string; role: TeamRole } | undefined;
}

export function setTeamMemberBlocked(database: Database.Database, workspaceId: string, actorId: string, userId: string, blocked: boolean) {
  database.transaction(() => {
    const actor = database.prepare("select role from workspace_memberships where workspace_id = ? and user_id = ? and is_blocked = 0").get(workspaceId, actorId) as { role: TeamRole } | undefined;
    if (!actor || (actor.role !== "owner" && actor.role !== "admin")) throw new Error("Team management requires an administrator role.");
    const current = database.prepare("select role, is_blocked from workspace_memberships where workspace_id = ? and user_id = ?").get(workspaceId, userId) as { role: TeamRole; is_blocked: number } | undefined;
    if (!current) throw new Error("Team member not found.");
    if (current.role === "owner" || current.role === "admin") throw new Error("Only non-admin members can be blocked or unblocked.");
    const blockedValue = blocked ? 1 : 0;
    if (current.is_blocked === blockedValue) return;
    database.prepare("update workspace_memberships set is_blocked = ? where workspace_id = ? and user_id = ?").run(blockedValue, workspaceId, userId);
    database.prepare("insert into audit_events (workspace_id, user_id, action, resource_type, resource_id, details) values (?, ?, ?, ?, ?, ?)").run(workspaceId, actorId, blocked ? "Team member blocked" : "Team member unblocked", "user", userId, JSON.stringify({ isBlocked: blocked }));
  })();
}
