import { createPublicKey, createVerify } from "node:crypto";

export type OidcDiscovery = { authorization_endpoint: string; token_endpoint: string; jwks_uri: string };
export type OidcClaims = { sub: string; email?: string; name?: string };
type Jwk = { kid?: string; kty?: string; [key: string]: unknown };

let discoveryCache: (OidcDiscovery & { issuer: string }) | undefined;

export async function discoverOidc(issuer: string): Promise<OidcDiscovery> {
  if (discoveryCache?.issuer === issuer) return discoveryCache;
  const response = await fetch(`${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`);
  if (!response.ok) throw new Error("Could not reach the identity provider.");
  const config = await response.json() as OidcDiscovery;
  if (!config.authorization_endpoint || !config.token_endpoint || !config.jwks_uri) throw new Error("Identity provider discovery document is incomplete.");
  discoveryCache = { issuer, ...config };
  return config;
}

export async function exchangeCodeForToken(tokenEndpoint: string, params: { code: string; clientId: string; clientSecret: string; redirectUri: string; codeVerifier: string }) {
  const body = new URLSearchParams({ grant_type: "authorization_code", code: params.code, redirect_uri: params.redirectUri, client_id: params.clientId, client_secret: params.clientSecret, code_verifier: params.codeVerifier });
  const response = await fetch(tokenEndpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!response.ok) throw new Error("Could not exchange the authorization code with the identity provider.");
  const payload = await response.json() as { id_token?: string };
  if (!payload.id_token) throw new Error("Identity provider did not return an ID token.");
  return payload.id_token;
}

export async function verifyIdToken(idToken: string, issuer: string, audience: string, jwksUri: string): Promise<OidcClaims> {
  const [headerB64, payloadB64, signatureB64] = idToken.split(".");
  if (!headerB64 || !payloadB64 || !signatureB64) throw new Error("Malformed ID token.");
  const header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8")) as { alg: string; kid: string };
  const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as Record<string, unknown>;
  if (header.alg !== "RS256") throw new Error("Only RS256-signed ID tokens are supported.");

  const jwksResponse = await fetch(jwksUri);
  if (!jwksResponse.ok) throw new Error("Could not fetch the identity provider's signing keys.");
  const jwks = await jwksResponse.json() as { keys: Jwk[] };
  const jwk = jwks.keys.find((key) => key.kid === header.kid);
  if (!jwk) throw new Error("Signing key not found for this ID token.");

  const publicKey = createPublicKey({ key: jwk, format: "jwk" });
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = Buffer.from(signatureB64, "base64url");
  const validSignature = createVerify("RSA-SHA256").update(signingInput).verify(publicKey, signature);
  if (!validSignature) throw new Error("ID token signature is invalid.");

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && payload.exp < now) throw new Error("ID token has expired.");
  if (payload.iss !== issuer) throw new Error("ID token issuer does not match the configured identity provider.");
  const audience_claim = payload.aud;
  const audienceOk = audience_claim === audience || (Array.isArray(audience_claim) && audience_claim.includes(audience));
  if (!audienceOk) throw new Error("ID token audience does not match this application.");

  if (typeof payload.sub !== "string") throw new Error("ID token is missing a subject claim.");
  return { sub: payload.sub, email: typeof payload.email === "string" ? payload.email : undefined, name: typeof payload.name === "string" ? payload.name : undefined };
}
