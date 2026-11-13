import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { completeInitialPasswordChange } from "@/lib/password-bootstrap";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!checkRateLimit(`auth-password-change:${clientKey(request)}`, 10, 60_000)) return NextResponse.json({ error: "Too many attempts. Please wait a moment." }, { status: 429 });
  const token = (await cookies()).get("vynmesh_password_change")?.value;
  if (!token) return NextResponse.json({ error: "Your password-change session expired. Sign in again." }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { password?: string };
  if (!body.password || body.password.length < 8 || body.password.length > 128) return NextResponse.json({ error: "Choose a password between 8 and 128 characters." }, { status: 400 });

  const session = completeInitialPasswordChange(getDb(), token, body.password);
  if (!session) {
    const response = NextResponse.json({ error: "Your password-change session expired. Sign in again." }, { status: 401 });
    response.cookies.delete("vynmesh_password_change");
    return response;
  }

  const response = NextResponse.json({ authenticated: true });
  response.cookies.set("vynmesh_session", `${session.userId}:${session.workspaceId}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 8 });
  response.cookies.delete("vynmesh_password_change");
  return response;
}
