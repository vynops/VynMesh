import { NextResponse } from "next/server";
import { canManageSources, requireSession } from "@/lib/auth";
import { resolveAiEndpoint } from "@/lib/ai-providers";
import { getWorkspaceSettings, saveWorkspaceSettings } from "@/lib/settings-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireSession();
    if (!canManageSources(session.role)) return NextResponse.json({ error: "Settings require an administrator role." }, { status: 403 });
    return NextResponse.json(getWorkspaceSettings(session.workspaceId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load settings." }, { status: 401 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireSession();
    if (!canManageSources(session.role)) return NextResponse.json({ error: "Settings require an administrator role." }, { status: 403 });
    const body = await request.json() as { aiProvider?: string; aiEndpoint?: string; aiModel?: string; aiApiKey?: string; retentionDays?: number };
    if (!body.aiProvider?.trim() || !body.aiModel?.trim()) return NextResponse.json({ error: "Provider and model are required." }, { status: 400 });
    const endpoint = resolveAiEndpoint(body.aiProvider.trim(), body.aiEndpoint);
    if (body.retentionDays !== undefined && (!Number.isInteger(body.retentionDays) || body.retentionDays < 1 || body.retentionDays > 3650)) return NextResponse.json({ error: "Retention must be between 1 and 3650 days." }, { status: 400 });
    saveWorkspaceSettings(session.workspaceId, session.userId, { aiProvider: body.aiProvider.trim(), aiEndpoint: endpoint, aiModel: body.aiModel.trim(), aiApiKey: body.aiApiKey?.trim() || undefined, retentionDays: body.retentionDays ?? 365 });
    return NextResponse.json(getWorkspaceSettings(session.workspaceId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save settings." }, { status: 400 });
  }
}
