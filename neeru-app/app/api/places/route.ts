import { autocomplete } from "@/lib/server/providers";
import { clientIp, json, rateLimited, tooMany } from "@/lib/server/util";

export async function GET(req: Request) {
  if (rateLimited(`places:${clientIp(req)}`, 90, 60_000)) return tooMany();
  const u = new URL(req.url);
  const q = u.searchParams.get("q") ?? "";
  const session = (u.searchParams.get("session") ?? "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 64);
  try {
    return json({ places: await autocomplete(q, session) });
  } catch {
    return json({ error: "Search isn't working right now.", places: [] }, { status: 502 });
  }
}
