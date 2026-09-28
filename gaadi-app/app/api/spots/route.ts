import { getSpots } from "@/lib/server/data";
import { errorResponse } from "@/lib/server/supabase";
import { json } from "@/lib/server/util";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const spots = await getSpots();
    return json({ spots }, { headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=40" } });
  } catch (e) {
    return errorResponse(e, "loadSpots", req);
  }
}
