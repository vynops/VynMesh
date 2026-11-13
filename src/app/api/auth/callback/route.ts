import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { discoverOidc, exchangeCodeForToken, verifyIdToken } from "@/lib/oidc";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const issuer = process.env.OIDC_ISSUER;
  const clientId = process.env.OIDC_CLIENT_ID;
  const clientSecret = process.env.OIDC_CLIENT_SECRET;
  const redirectUri = process.env.OIDC_REDIRECT_URI;
  if (!issuer || !clientId || !clientSecret || !redirectUri) return NextResponse.redirect(new URL("/?error=Single+sign-on+is+not+configured.", request.url));

  const stored = request.headers.get("cookie")?.split("; ").find((entry) => entry.startsWith("vynmesh_oidc="))?.slice("vynmesh_oidc=".length);
  const [expectedState, codeVerifier] = stored ? [stored.split(":")[0], stored.split(":")[1]] : [undefined, undefined];
  if (!code || !state || !codeVerifier || state !== expectedState) return NextResponse.redirect(new URL("/?error=Sign-in+could+not+be+verified.+Please+try+again.", request.url));

  try {
    const config = await discoverOidc(issuer);
    const idToken = await exchangeCodeForToken(config.token_endpoint, { code, clientId, clientSecret, redirectUri, codeVerifier });
    const claims = await verifyIdToken(idToken, issuer, clientId, config.jwks_uri);
    const email = claims.email ?? `${claims.sub}@sso.local`;
    const name = claims.name ?? email;

    const db = getDb();
    const userId = `user-${Buffer.from(claims.sub).toString("base64url").slice(0, 24)}`;
    db.prepare("insert into users (id, email, display_name) values (?, ?, ?) on conflict (id) do update set email = excluded.email, display_name = excluded.display_name").run(userId, email, name);

    const workspaceId = "workspace-northstar";
    const memberCount = db.prepare("select count(*) as count from workspace_memberships where workspace_id = ?").get(workspaceId) as { count: number };
    const role = memberCount.count === 0 ? "owner" : "analyst";
    db.prepare("insert into workspace_memberships (workspace_id, user_id, role) values (?, ?, ?) on conflict (workspace_id, user_id) do nothing").run(workspaceId, userId, role);
    const membership = db.prepare("select is_blocked from workspace_memberships where workspace_id = ? and user_id = ?").get(workspaceId, userId) as { is_blocked: number } | undefined;
    if (!membership || membership.is_blocked) return NextResponse.redirect(new URL("/?error=Workspace+access+is+blocked.+Contact+an+administrator.", request.url));
    db.prepare("insert into audit_events (workspace_id, user_id, action, resource_type, resource_id, details) values (?, ?, ?, ?, ?, ?)").run(workspaceId, userId, "Signed in via SSO", "user", userId, JSON.stringify({ email }));

    const response = NextResponse.redirect(new URL("/", request.url));
    response.cookies.set("vynmesh_session", `${userId}:${workspaceId}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 8 });
    response.cookies.delete("vynmesh_oidc");
    return response;
  } catch (error) {
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(error instanceof Error ? error.message : "Sign-in failed.")}`, request.url));
  }
}
