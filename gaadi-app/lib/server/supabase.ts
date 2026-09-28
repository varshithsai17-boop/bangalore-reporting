import "server-only";
import { fetchJson } from "./util";

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
    throw new RpcError(msg, res.status >= 500 ? 502 : 400);
  }
  return res.body as T;
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

export const RPC_MESSAGES: Record<string, string> = {
  too_fast: "You just sent something. Wait a few seconds and try again.",
  too_many: "That's a lot from you for now. Try again later.",
  already_reported: "You already reported this spot in the last few hours.",
  outside_bengaluru: "That spot is outside Bengaluru's 369 wards.",
  bad_category: "Pick what kind of garbage problem it is.",
  bad_status: "Pick whether the van came.",
  bad_photo: "The photo didn't upload. Try again.",
  bad_device: "Reload the page and try again.",
  no_spot: "This spot doesn't exist any more.",
  upload_failed: "The photo didn't upload. Check your connection and try again.",
  server_misconfigured: "The app isn't connected to its database yet.",
};

export function errorResponse(e: unknown, fallback: string) {
  const code = e instanceof RpcError ? e.code : "db_error";
  const status = e instanceof RpcError ? e.status : 502;
  return new Response(JSON.stringify({ error: RPC_MESSAGES[code] ?? fallback }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
