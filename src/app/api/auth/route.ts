import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!checkRateLimit(`auth:${clientKey(request)}`, 10, 60_000)) return NextResponse.json({ error: "Too many sign-in attempts. Please wait a moment." }, { status: 429 });
  if (process.env.OIDC_ISSUER) return NextResponse.json({ error: "Single sign-on is configured for this workspace. Use /api/auth/login." }, { status: 501 });
  if (process.env.NODE_ENV === "production" && process.env.VYNMESH_DEMO_AUTH !== "true") return NextResponse.json({ error: "External identity provider integration is required in production." }, { status: 501 });
  const body = await request.json().catch(() => ({})) as { email?: string; password?: string };
  if (!body.email?.trim() || !body.password) return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  const user = authenticate(body.email, body.password);
  if (!user) return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  const response = NextResponse.json({ authenticated: true });
  response.cookies.set("vynmesh_session", `${user.userId}:${user.workspaceId}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 8 });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.delete("vynmesh_session");
  return response;
}
