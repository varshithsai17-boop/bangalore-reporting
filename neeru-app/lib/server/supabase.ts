import "server-only";
import { fetchJson } from "./util";

/**
 * Calls a Postgres function through Supabase's REST API.
 * The key stays on the server: browsers only ever talk to this app's /api routes.
 */
export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) throw new RpcError("server_misconfigured", 500);
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

export class RpcError extends Error {
  constructor(public code: string, public status: number) {
    super(code);
  }
}

/** Plain-language messages for the errors the database guard raises. */
export const RPC_MESSAGES: Record<string, string> = {
  too_fast: "You just sent a report. Wait a few seconds before the next one.",
  too_many: "That's a lot of reports from you this hour. Try again later.",
  already_reported: "You already reported this spot in the last 10 minutes.",
  outside_bengaluru: "That spot is outside Bengaluru.",
  bad_depth: "Pick how deep the water is.",
  bad_device: "Reload the page and try again.",
  no_spot: "This spot has cleared. Report it again if the water is back.",
  server_misconfigured: "The app isn't connected to its database yet.",
};
