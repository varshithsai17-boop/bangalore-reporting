import { rpc } from "@/lib/server/supabase";
import { json } from "@/lib/server/util";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const device = new URL(req.url).searchParams.get("device") ?? "";
  if (!/^[A-Za-z0-9-]{16,64}$/.test(device)) return json({ today: null });
  try {
    return json({ today: await rpc("gaadi_my_today", { p_device: device }) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return json({ today: null });
  }
}
