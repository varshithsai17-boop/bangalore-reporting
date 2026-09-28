import { inBengaluru } from "@/lib/geo";
import { reverse } from "@/lib/server/providers";
import { clientIp, json, rateLimited, tooMany } from "@/lib/server/util";

export async function GET(req: Request) {
  if (rateLimited(`reverse:${clientIp(req)}`, 30, 60_000)) return tooMany();
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get("lat"));
  const lng = Number(u.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inBengaluru({ lat, lng })) return json({ label: null });
  try {
    return json({ label: await reverse(lat, lng) });
  } catch {
    return json({ label: null });
  }
}
