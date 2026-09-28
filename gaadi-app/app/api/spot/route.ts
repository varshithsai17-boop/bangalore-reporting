import { CATEGORIES } from "@/lib/constants";
import { streetAt } from "@/lib/server/osm";
import { errorResponse, writeRpc } from "@/lib/server/supabase";
import { browserId, requireUser } from "@/lib/server/session";
import { clientIp, fail, json, rateLimited, tooMany } from "@/lib/server/util";
import type { Category } from "@/lib/types";
import { wardAt } from "@/lib/wards";

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (rateLimited(`spot:${ip}`, 10, 60_000)) return tooMany(req);
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  let b: { device?: unknown; lat?: unknown; lng?: unknown; category?: unknown; photo?: unknown; forceNew?: unknown };
  try {
    b = await req.json();
  } catch {
    return fail(req, "badRequest", 400);
  }
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  if (!CATEGORIES.includes(b.category as Category)) return fail(req, "bad_category", 400);
  if (typeof b.photo !== "string") return fail(req, "photoRequired", 400);
  const ward = Number.isFinite(lat) && Number.isFinite(lng) ? wardAt(lat, lng) : null;
  if (!ward) return fail(req, "outside_bengaluru", 400);
  const label = await streetAt(lat, lng).catch(() => null);
  try {
    const out = await writeRpc<{ spot_id: string; merged: boolean }>("gaadi_submit_spot", {
      p_user: user.id,
      p_browser: browserId(b.device),
      p_ward: ward.id,
      p_lat: lat,
      p_lng: lng,
      p_label: label,
      p_category: b.category,
      p_photo: b.photo,
      p_ip: ip || null,
      p_force_new: b.forceNew === true,
    });
    return json({ ...out, ward: { id: ward.id, name: ward.name }, label });
  } catch (e) {
    return errorResponse(e, "reportFail", req);
  }
}
