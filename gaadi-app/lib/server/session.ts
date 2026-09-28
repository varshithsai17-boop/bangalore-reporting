import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { fail } from "./util";

/**
 * Sign-in with Google, without storing anyone's email or name.
 *
 * The browser gets a Google ID token from Google's button. The server checks it against
 * Google's public keys, and the database keeps only a hash of the Google account id.
 * The person's first name and photo live in their own signed cookie, only for showing
 * "signed in as ..." on their screen.
 */

export type SessionUser = { id: string; name: string; picture: string | null };

const COOKIE = "gb_session";
const MAX_AGE = 180 * 24 * 3600; // 6 months, so people aren't asked again every week

const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export async function verifyGoogleToken(credential: string) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("google_not_configured");
  const { payload } = await jwtVerify(credential, googleKeys, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: clientId,
  });
  if (typeof payload.sub !== "string" || payload.email_verified !== true) throw new Error("bad_google_account");
  const name = String(payload.given_name ?? payload.name ?? "").slice(0, 40) || "Resident";
  const picture = typeof payload.picture === "string" && payload.picture.startsWith("https://") ? payload.picture : null;
  return { sub: payload.sub, name, picture };
}

/* ---------------- signed cookie (HMAC-SHA256, no library needed) ---------------- */

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer | Uint8Array) =>
  Buffer.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf)).toString("base64url");

let keyPromise: Promise<CryptoKey> | null = null;
function hmacKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("session_not_configured");
  keyPromise ??= crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  return keyPromise;
}

async function sign(data: string) {
  return b64url(await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(data)));
}

export async function sessionCookie(user: SessionUser, secure: boolean) {
  const body = b64url(enc.encode(JSON.stringify({ u: user.id, n: user.name, p: user.picture, e: Math.floor(Date.now() / 1000) + MAX_AGE })));
  const value = `${body}.${await sign(body)}`;
  return `${COOKIE}=${value}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export const clearCookie = (secure: boolean) => `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;

export const isSecure = (req: Request) => new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";

export async function getUser(req: Request): Promise<SessionUser | null> {
  const raw = (req.headers.get("cookie") ?? "")
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!raw) return null;
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(), Buffer.from(sig, "base64url"), enc.encode(body));
    if (!ok) return null;
    const s = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { u: string; n: string; p: string | null; e: number };
    if (!s.u || !/^[0-9a-f-]{36}$/.test(s.u) || s.e < Date.now() / 1000) return null;
    return { id: s.u, name: s.n, picture: s.p };
  } catch {
    return null;
  }
}

/** For routes that change data: returns the user, or a 401 the app turns into the sign-in sheet. */
export async function requireUser(req: Request): Promise<SessionUser | Response> {
  const u = await getUser(req);
  return u ?? fail(req, "signed_out", 401, { signin: true });
}

/** Random id for this browser (not an account). Lets the database cap accounts per phone. */
export const browserId = (v: unknown) => (typeof v === "string" && /^[A-Za-z0-9-]{16,64}$/.test(v) ? v : null);
