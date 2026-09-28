import { getWardStats } from "@/lib/server/data";
import { errorResponse } from "@/lib/server/supabase";
import { json } from "@/lib/server/util";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const days = Math.max(1, Math.min(90, Number(new URL(req.url).searchParams.get("days")) || 7));
  try {
    const stats = await getWardStats(days);
    return json({ days, stats }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } });
  } catch (e) {
    return errorResponse(e, "Couldn't load ward numbers.");
  }
}
