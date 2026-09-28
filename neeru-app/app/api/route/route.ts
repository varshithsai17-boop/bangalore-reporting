import { routes } from "@/lib/server/providers";
import { clientIp, json, rateLimited, tooMany } from "@/lib/server/util";
import type { TravelMode } from "@/lib/types";

type W = { lat?: unknown; lng?: unknown; placeId?: unknown };
const clean = (w: W | undefined) => {
  if (!w) return null;
  const placeId = typeof w.placeId === "string" && /^[A-Za-z0-9_-]{10,300}$/.test(w.placeId) ? w.placeId : undefined;
  const lat = Number(w.lat);
  const lng = Number(w.lng);
  const hasLL = Number.isFinite(lat) && Number.isFinite(lng) && w.lat !== undefined && w.lng !== undefined;
  if (!placeId && !hasLL) return null;
  return { placeId, lat: hasLL ? lat : undefined, lng: hasLL ? lng : undefined };
};

export async function POST(req: Request) {
  if (rateLimited(`route:${clientIp(req)}`, 20, 60_000)) return tooMany();
  let b: { from?: W; to?: W; mode?: unknown };
  try {
    b = await req.json();
  } catch {
    return json({ error: "Bad request." }, { status: 400 });
  }
  const from = clean(b.from);
  const to = clean(b.to);
  if (!from || !to) return json({ error: "Pick both a start and a destination." }, { status: 400 });
  const mode: TravelMode = b.mode === "bike" ? "bike" : "car";
  try {
    const list = await routes(from, to, mode);
    if (!list.length) return json({ error: "No route found between those places." }, { status: 404 });
    return json({ routes: list });
  } catch {
    return json({ error: "Couldn't get a route right now. Try again in a moment." }, { status: 502 });
  }
}
