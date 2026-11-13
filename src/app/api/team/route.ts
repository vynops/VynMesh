import { NextResponse } from "next/server";
import { canManageSources, requireSession } from "@/lib/auth";
import { addTeamMember, listTeamMembers, removeTeamMember, updateTeamMember, type TeamMember } from "@/lib/team-store";

export const runtime = "nodejs";
const roles: TeamMember["role"][] = ["owner", "admin", "analyst", "viewer"];

export async function GET() {
  try {
    const session = await requireSession();
    if (!canManageSources(session.role)) return NextResponse.json({ error: "Team management requires an administrator role." }, { status: 403 });
    return NextResponse.json({ members: listTeamMembers(session.workspaceId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load team." }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    if (!canManageSources(session.role)) return NextResponse.json({ error: "Team management requires an administrator role." }, { status: 403 });
    const body = await request.json() as { action?: "add" | "update" | "remove"; userId?: string; email?: string; name?: string; password?: string; role?: TeamMember["role"] };
    if (body.action === "add") {
      if (!body.email?.includes("@") || !body.name?.trim() || !body.password || body.password.length < 8 || !body.role || !roles.includes(body.role)) return NextResponse.json({ error: "Name, valid email, password of at least 8 characters, and role are required." }, { status: 400 });
      if (session.role !== "owner" && body.role === "owner") return NextResponse.json({ error: "Only the workspace owner can assign the owner role." }, { status: 403 });
      addTeamMember(session.workspaceId, session.userId, { email: body.email, name: body.name, password: body.password, role: body.role });
    } else if (body.action === "update") {
      if (!body.userId || !body.role || !roles.includes(body.role) || !body.name?.trim() || !body.email?.includes("@")) return NextResponse.json({ error: "User, name, valid email, and role are required." }, { status: 400 });
      const target = listTeamMembers(session.workspaceId).find((member) => member.userId === body.userId);
      if (!target) return NextResponse.json({ error: "Team member not found." }, { status: 404 });
      if (session.role !== "owner" && (target.role === "owner" || body.role === "owner")) return NextResponse.json({ error: "Only the workspace owner can manage ownership." }, { status: 403 });
      updateTeamMember(session.workspaceId, session.userId, body.userId, { name: body.name, email: body.email, password: body.password, role: body.role });
    } else if (body.action === "remove") {
      if (!body.userId) return NextResponse.json({ error: "User is required." }, { status: 400 });
      const target = listTeamMembers(session.workspaceId).find((member) => member.userId === body.userId);
      if (!target) return NextResponse.json({ error: "Team member not found." }, { status: 404 });
      if (session.role !== "owner" && target.role === "owner") return NextResponse.json({ error: "Only the workspace owner can remove an owner." }, { status: 403 });
      removeTeamMember(session.workspaceId, session.userId, body.userId);
    } else return NextResponse.json({ error: "Unknown team action." }, { status: 400 });
    return NextResponse.json({ members: listTeamMembers(session.workspaceId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Team action failed." }, { status: 400 });
  }
}
