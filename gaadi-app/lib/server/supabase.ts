import "server-only";
import { errorText } from "../i18n";
import { fetchJson, langOf } from "./util";

/** Calls a Postgres function through Supabase's REST API. The key never leaves the server. */
export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { url, key } = creds();
  const res = await fetchJson(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const msg = (res.body as { message?: string } | null)?.message ?? "db_error";
    throw new RpcError(msg, res.status >= 500 ? 502 : AUTH_STATUS[msg] ?? 400);
  }
  return res.body as T;
}

/**
 * Calls a function that changes data. The publishable key is public (other apps in this Supabase
 * project ship it to browsers), so these functions also require a key only this server knows.
 */
export function writeRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const key = process.env.GAADI_SERVER_KEY;
  if (!key) throw new RpcError("server_misconfigured", 500);
  return rpc<T>(fn, { p_key: key, ...args });
}

/** Uploads a photo to the public "gaadi-photos" bucket. The bucket only accepts new files under spots/. */
export async function uploadPhoto(path: string, bytes: ArrayBuffer, contentType: string) {
  const { url, key } = creds();
  const res = await fetch(`${url}/storage/v1/object/gaadi-photos/${path}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": contentType, "Cache-Control": "max-age=31536000" },
    body: bytes,
  });
  if (!res.ok) throw new RpcError("upload_failed", 502);
}

function creds() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) throw new RpcError("server_misconfigured", 500);
  return { url, key };
}

export class RpcError extends Error {
  constructor(public code: string, public status: number) {
    super(code);
  }
}

const AUTH_STATUS: Record<string, number> = { signed_out: 401, banned: 403, forbidden: 500 };

/** Turns a database error into a message in the person's language. `fallback` is an errors key for unknown codes. */
export function errorResponse(e: unknown, fallback: string, req?: Request) {
  const code = e instanceof RpcError ? e.code : "db_error";
  const status = e instanceof RpcError ? e.status : 502;
  const lang = langOf(req);
  return new Response(JSON.stringify({ error: errorText(lang, code, errorText(lang, fallback)), ...(code === "signed_out" ? { signin: true } : {}) }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
