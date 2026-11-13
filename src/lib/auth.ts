import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { verifyPassword } from "@/lib/passwords";

export type Session = { userId: string; workspaceId: string; role: "owner" | "admin" | "analyst" | "viewer" };
export type CurrentUser = { userId: string; email: string; name: string; workspaceId: string; role: Session["role"] };

export function authenticate(email: string, password: string) {
  const row = getDb().prepare("select id, email, display_name, password_hash from users where lower(email) = lower(?)").get(email.trim()) as { id: string; email: string; display_name: string; password_hash: string | null } | undefined;
  if (!row?.password_hash || !verifyPassword(password, row.password_hash)) return null;
  const membership = getDb().prepare("select workspace_id, role from workspace_memberships where user_id = ? order by workspace_id limit 1").get(row.id) as { workspace_id: string; role: Session["role"] } | undefined;
  if (!membership) return null;
  return { userId: row.id, email: row.email, name: row.display_name, workspaceId: membership.workspace_id, role: membership.role } satisfies CurrentUser;
}

export async function requireSession(): Promise<Session> {
  const cookieStore = await cookies();
  const session = cookieStore.get("vynmesh_session")?.value;
  const [userId, workspaceId] = session?.split(":") ?? [];
  if (!userId || !workspaceId) throw new Error("Authentication required.");
  const row = getDb().prepare("select role from workspace_memberships where user_id = ? and workspace_id = ?").get(userId, workspaceId) as { role: Session["role"] } | undefined;
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
