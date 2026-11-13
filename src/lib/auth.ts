import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { verifyPassword } from "@/lib/passwords";
import { findAccessibleMembership, type TeamRole } from "@/lib/team-access";

export type Session = { userId: string; workspaceId: string; role: TeamRole };
export type CurrentUser = { userId: string; email: string; name: string; workspaceId: string; role: Session["role"] };
export type AuthenticatedUser = CurrentUser & { mustChangePassword: boolean };

export function authenticate(email: string, password: string) {
  const database = getDb();
  const row = database.prepare("select id, email, display_name, password_hash, must_change_password from users where lower(email) = lower(?)").get(email.trim()) as { id: string; email: string; display_name: string; password_hash: string | null; must_change_password: number } | undefined;
  if (!row?.password_hash || !verifyPassword(password, row.password_hash)) return null;
  const membership = findAccessibleMembership(database, row.id);
  if (!membership) return null;
  return { userId: row.id, email: row.email, name: row.display_name, workspaceId: membership.workspace_id, role: membership.role, mustChangePassword: row.must_change_password === 1 } satisfies AuthenticatedUser;
}

export async function requireSession(): Promise<Session> {
  const cookieStore = await cookies();
  const session = cookieStore.get("vynmesh_session")?.value;
  const [userId, workspaceId] = session?.split(":") ?? [];
  if (!userId || !workspaceId) throw new Error("Authentication required.");
  const row = getDb().prepare("select m.role from workspace_memberships m join users u on u.id = m.user_id where m.user_id = ? and m.workspace_id = ? and m.is_blocked = 0 and u.must_change_password = 0").get(userId, workspaceId) as { role: Session["role"] } | undefined;
  if (!row) throw new Error("Workspace access denied.");
  return { userId, workspaceId, role: row.role };
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const session = await requireSession();
  const row = getDb().prepare("select email, display_name from users where id = ?").get(session.userId) as { email: string; display_name: string } | undefined;
  if (!row) throw new Error("User not found.");
  return { userId: session.userId, email: row.email, name: row.display_name, workspaceId: session.workspaceId, role: session.role };
}

export function canWrite(role: Session["role"]) {
  return role === "owner" || role === "admin" || role === "analyst";
}

export function canManageSources(role: Session["role"]) {
  return role === "owner" || role === "admin";
}
