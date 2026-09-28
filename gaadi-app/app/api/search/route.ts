import { searchPlaces } from "@/lib/server/osm";
import { clientIp, json, rateLimited, tooMany } from "@/lib/server/util";

export async function GET(req: Request) {
  if (rateLimited(`search:${clientIp(req)}`, 60, 60_000)) return tooMany();
  try {
    return json({ places: await searchPlaces(new URL(req.url).searchParams.get("q") ?? "") });
  } catch {
    return json({ places: [], error: "Search isn't working right now." }, { status: 502 });
  }
}
