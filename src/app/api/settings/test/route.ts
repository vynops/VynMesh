import { NextResponse } from "next/server";
import { canManageSources, requireSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    if (!canManageSources(session.role)) return NextResponse.json({ error: "Settings require an administrator role." }, { status: 403 });
    const body = await request.json() as { endpoint?: string; model?: string; apiKey?: string };
    if (!body.endpoint?.trim() || !body.model?.trim() || !body.apiKey?.trim()) return NextResponse.json({ error: "Endpoint, model, and API key are required." }, { status: 400 });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(body.endpoint, { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${body.apiKey}` }, body: JSON.stringify({ model: body.model, temperature: 0, messages: [{ role: "user", content: "Reply with OK." }] }) });
      if (!response.ok) return NextResponse.json({ error: `Provider returned HTTP ${response.status}.` }, { status: 400 });
      return NextResponse.json({ ok: true, message: "AI provider connection works." });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.name === "AbortError" ? "Connection timed out." : error.message : "Connection test failed." }, { status: 400 });
  }
}
