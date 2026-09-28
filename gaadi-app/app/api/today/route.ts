import { getUser } from "@/lib/server/session";
import { writeRpc } from "@/lib/server/supabase";
import { json } from "@/lib/server/util";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getUser(req).catch(() => null);
  if (!user) return json({ today: null }, { headers: { "Cache-Control": "no-store" } });
  try {
    return json({ today: await writeRpc("gaadi_my_today", { p_user: user.id }) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return json({ today: null });
  }
}
