import { searchPlaces } from "@/lib/server/osm";
import { clientIp, fail, json, rateLimited, tooMany } from "@/lib/server/util";

export async function GET(req: Request) {
  if (rateLimited(`search:${clientIp(req)}`, 60, 60_000)) return tooMany(req);
  try {
    return json({ places: await searchPlaces(new URL(req.url).searchParams.get("q") ?? "") });
  } catch {
    return fail(req, "searchDown", 502, { places: [] });
  }
}
