import { errorResponse, writeRpc } from "@/lib/server/supabase";
import { browserId, requireUser } from "@/lib/server/session";
import { clientIp, fail, json, rateLimited, tooMany } from "@/lib/server/util";

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (rateLimited(`vote:${ip}`, 20, 60_000)) return tooMany(req);
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  let b: { spot?: unknown; kind?: unknown; device?: unknown; photo?: unknown };
  try {
    b = await req.json();
  } catch {
    return fail(req, "badRequest", 400);
  }
  const spot = String(b.spot ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(spot) || !["still", "cleaned", "flag"].includes(String(b.kind))) return fail(req, "badRequest", 400);
  try {
    await writeRpc("gaadi_spot_vote", {
      p_user: user.id,
      p_browser: browserId(b.device),
      p_spot: spot,
      p_kind: b.kind,
      p_photo: typeof b.photo === "string" ? b.photo : null,
      p_ip: ip || null,
    });
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e, "voteFail", req);
  }
}
