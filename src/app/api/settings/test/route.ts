import { NextResponse } from "next/server";
import { canManageSources, requireSession } from "@/lib/auth";
import { findAiProvider, resolveAiEndpoint } from "@/lib/ai-providers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    if (!canManageSources(session.role)) return NextResponse.json({ error: "Settings require an administrator role." }, { status: 403 });
    const body = await request.json() as { provider?: string; endpoint?: string; model?: string; apiKey?: string };
    if (!body.provider || !body.model?.trim() || !body.apiKey?.trim()) return NextResponse.json({ error: "Provider, model, and API key are required." }, { status: 400 });
    const provider = findAiProvider(body.provider);
    if (!provider) return NextResponse.json({ error: "Choose a supported AI provider." }, { status: 400 });
    const endpoint = resolveAiEndpoint(provider.id, body.endpoint);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const anthropic = provider.id === "anthropic";
      const headers: Record<string, string> = anthropic
        ? { "Content-Type": "application/json", "x-api-key": body.apiKey, "anthropic-version": "2023-06-01" }
        : { "Content-Type": "application/json", Authorization: `Bearer ${body.apiKey}` };
      const requestBody = anthropic
        ? { model: body.model, max_tokens: 16, messages: [{ role: "user", content: "Reply with OK." }] }
        : { model: body.model, temperature: 0, messages: [{ role: "user", content: "Reply with OK." }] };
      const response = await fetch(endpoint, { method: "POST", signal: controller.signal, headers, body: JSON.stringify(requestBody) });
      if (!response.ok) return NextResponse.json({ error: `Provider returned HTTP ${response.status}.` }, { status: 400 });
      return NextResponse.json({ ok: true, message: "AI provider connection works." });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.name === "AbortError" ? "Connection timed out." : error.message : "Connection test failed." }, { status: 400 });
  }
}
