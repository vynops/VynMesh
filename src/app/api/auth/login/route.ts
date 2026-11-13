import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { discoverOidc } from "@/lib/oidc";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const issuer = process.env.OIDC_ISSUER;
  const clientId = process.env.OIDC_CLIENT_ID;
  const redirectUri = process.env.OIDC_REDIRECT_URI;
  if (!issuer || !clientId || !redirectUri) return NextResponse.redirect(new URL("/?error=Single+sign-on+is+not+configured.", request.url));

  try {
    const config = await discoverOidc(issuer);
    const state = randomBytes(16).toString("base64url");
    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

    const authorizeUrl = new URL(config.authorization_endpoint);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("scope", "openid email profile");
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", codeChallenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    const response = NextResponse.redirect(authorizeUrl);
    response.cookies.set("vynmesh_oidc", `${state}:${codeVerifier}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
    return response;
  } catch (error) {
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(error instanceof Error ? error.message : "Could not start sign-in.")}`, request.url));
  }
}
