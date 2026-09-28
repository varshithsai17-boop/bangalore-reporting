import { streetAt } from "@/lib/server/osm";
import { clientIp, json, rateLimited, tooMany } from "@/lib/server/util";
import { wardAt } from "@/lib/wards";

/** Ward and street name for a point. */
export async function GET(req: Request) {
  if (rateLimited(`locate:${clientIp(req)}`, 30, 60_000)) return tooMany();
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get("lat"));
  const lng = Number(u.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json({ ward: null, street: null });
  const w = wardAt(lat, lng);
  if (!w) return json({ ward: null, street: null });
  const street = await streetAt(lat, lng).catch(() => null);
  return json({ ward: { id: w.id, name: w.name, corp: w.corp }, street });
}
