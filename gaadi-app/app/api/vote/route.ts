import { errorResponse, rpc } from "@/lib/server/supabase";
import { clientIp, json, rateLimited, tooMany } from "@/lib/server/util";

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (rateLimited(`vote:${ip}`, 20, 60_000)) return tooMany();
  let b: { spot?: unknown; kind?: unknown; device?: unknown; photo?: unknown };
  try {
    b = await req.json();
  } catch {
    return json({ error: "Bad request." }, { status: 400 });
  }
  const spot = String(b.spot ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(spot) || !["still", "cleaned", "flag"].includes(String(b.kind))) return json({ error: "Bad request." }, { status: 400 });
  try {
    await rpc("gaadi_spot_vote", {
      p_spot: spot,
      p_kind: b.kind,
      p_device: String(b.device ?? ""),
      p_photo: typeof b.photo === "string" ? b.photo : null,
      p_ip: ip || null,
    });
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e, "Couldn't send that. Try again.");
  }
}
