import { errorResponse, writeRpc } from "@/lib/server/supabase";
import { browserId, requireUser } from "@/lib/server/session";
import { streetAt } from "@/lib/server/osm";
import { clientIp, fail, json, rateLimited, tooMany } from "@/lib/server/util";
import { wardAt } from "@/lib/wards";

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (rateLimited(`checkin:${ip}`, 20, 60_000)) return tooMany(req);
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  let b: { device?: unknown; lat?: unknown; lng?: unknown; status?: unknown; street?: unknown };
  try {
    b = await req.json();
  } catch {
    return fail(req, "badRequest", 400);
  }
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  if (!["came", "missed", "refused"].includes(String(b.status))) return fail(req, "bad_status", 400);
  const ward = Number.isFinite(lat) && Number.isFinite(lng) ? wardAt(lat, lng) : null;
  if (!ward) return fail(req, "outside_bengaluru", 400);
  const street = typeof b.street === "string" && b.street ? b.street.slice(0, 80) : await streetAt(lat, lng).catch(() => null);
  try {
    await writeRpc("gaadi_checkin", {
      p_user: user.id,
      p_browser: browserId(b.device),
      p_ward: ward.id,
      p_lat: lat,
      p_lng: lng,
      p_street: street,
      p_status: b.status,
      p_ip: ip || null,
    });
    return json({ ok: true, ward: { id: ward.id, name: ward.name } });
  } catch (e) {
    return errorResponse(e, "checkinFail", req);
  }
}
