import { CATEGORIES } from "@/lib/constants";
import { streetAt } from "@/lib/server/osm";
import { errorResponse, RPC_MESSAGES, rpc } from "@/lib/server/supabase";
import { clientIp, json, rateLimited, tooMany } from "@/lib/server/util";
import type { Category } from "@/lib/types";
import { wardAt } from "@/lib/wards";

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (rateLimited(`spot:${ip}`, 10, 60_000)) return tooMany();
  let b: { device?: unknown; lat?: unknown; lng?: unknown; category?: unknown; photo?: unknown };
  try {
    b = await req.json();
  } catch {
    return json({ error: "Bad request." }, { status: 400 });
  }
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  if (!CATEGORIES.includes(b.category as Category)) return json({ error: RPC_MESSAGES.bad_category }, { status: 400 });
  if (typeof b.photo !== "string") return json({ error: "Add a photo of the garbage." }, { status: 400 });
  const ward = Number.isFinite(lat) && Number.isFinite(lng) ? wardAt(lat, lng) : null;
  if (!ward) return json({ error: RPC_MESSAGES.outside_bengaluru }, { status: 400 });
  const label = await streetAt(lat, lng).catch(() => null);
  try {
    const out = await rpc<{ spot_id: string; merged: boolean }>("gaadi_submit_spot", {
      p_device: String(b.device ?? ""),
      p_ward: ward.id,
      p_lat: lat,
      p_lng: lng,
      p_label: label,
      p_category: b.category,
      p_photo: b.photo,
      p_ip: ip || null,
    });
    return json({ ...out, ward: { id: ward.id, name: ward.name }, label });
  } catch (e) {
    return errorResponse(e, "Couldn't send your report. Try again.");
  }
}
