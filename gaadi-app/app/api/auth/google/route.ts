import { errorResponse, writeRpc } from "@/lib/server/supabase";
import { isSecure, sessionCookie, verifyGoogleToken } from "@/lib/server/session";
import { clientIp, fail, json, rateLimited, tooMany } from "@/lib/server/util";

/** Receives the ID token from Google's sign-in button and starts a session. */
export async function POST(req: Request) {
  if (rateLimited(`login:${clientIp(req)}`, 10, 60_000)) return tooMany(req);
  let credential = "";
  try {
    credential = String((await req.json()).credential ?? "");
  } catch {}
  if (!credential || credential.length > 4096) return fail(req, "badRequest", 400);

  let g: Awaited<ReturnType<typeof verifyGoogleToken>>;
  try {
    g = await verifyGoogleToken(credential);
  } catch (e) {
    return fail(req, (e as Error).message === "google_not_configured" ? "google_not_configured" : "googleFail", 401);
  }

  try {
    const r = await writeRpc<{ user_id: string; banned: boolean }>("gaadi_login", { p_sub: g.sub });
    if (r.banned) return fail(req, "banned", 403);
    const user = { id: r.user_id, name: g.name, picture: g.picture };
    return json(
      { user: { name: user.name, picture: user.picture } },
      { headers: { "Set-Cookie": await sessionCookie(user, isSecure(req)), "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e, "signinFail", req);
  }
}
