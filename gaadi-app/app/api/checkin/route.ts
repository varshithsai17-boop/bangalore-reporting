import { errorResponse, RPC_MESSAGES, rpc } from "@/lib/server/supabase";
import { streetAt } from "@/lib/server/osm";
import { clientIp, json, rateLimited, tooMany } from "@/lib/server/util";
import { wardAt } from "@/lib/wards";

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (rateLimited(`checkin:${ip}`, 20, 60_000)) return tooMany();
  let b: { device?: unknown; lat?: unknown; lng?: unknown; status?: unknown; street?: unknown };
  try {
    b = await req.json();
  } catch {
    return json({ error: "Bad request." }, { status: 400 });
  }
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  if (!["came", "missed", "refused"].includes(String(b.status))) return json({ error: RPC_MESSAGES.bad_status }, { status: 400 });
  const ward = Number.isFinite(lat) && Number.isFinite(lng) ? wardAt(lat, lng) : null;
  if (!ward) return json({ error: RPC_MESSAGES.outside_bengaluru }, { status: 400 });
  const street = typeof b.street === "string" && b.street ? b.street.slice(0, 80) : await streetAt(lat, lng).catch(() => null);
  try {
    await rpc("gaadi_checkin", {
      p_device: String(b.device ?? ""),
      p_ward: ward.id,
      p_lat: lat,
      p_lng: lng,
      p_street: street,
      p_status: b.status,
      p_ip: ip || null,
    });
    return json({ ok: true, ward: { id: ward.id, name: ward.name } });
  } catch (e) {
    return errorResponse(e, "Couldn't save your check-in. Try again.");
  }
}
