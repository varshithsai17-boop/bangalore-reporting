import { isDepth } from "@/lib/depth";
import { inBengaluru } from "@/lib/geo";
import { rpc, RPC_MESSAGES, RpcError } from "@/lib/server/supabase";
import { clientIp, json, rateLimited, tooMany } from "@/lib/server/util";

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (rateLimited(`report:${ip}`, 10, 60_000)) return tooMany();
  let b: { lat?: unknown; lng?: unknown; depth?: unknown; device?: unknown; label?: unknown };
  try {
    b = await req.json();
  } catch {
    return json({ error: "Bad request." }, { status: 400 });
  }
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inBengaluru({ lat, lng }))
    return json({ error: RPC_MESSAGES.outside_bengaluru }, { status: 400 });
  if (!isDepth(b.depth)) return json({ error: RPC_MESSAGES.bad_depth }, { status: 400 });
  try {
    const out = await rpc<{ spot_id: string; merged: boolean }>("neeru_submit_report", {
      p_lat: lat,
      p_lng: lng,
      p_depth: b.depth,
      p_device: String(b.device ?? ""),
      p_label: typeof b.label === "string" ? b.label.slice(0, 80) : null,
      p_ip: ip || null,
    });
    return json(out);
  } catch (e) {
    const code = e instanceof RpcError ? e.code : "db_error";
    return json({ error: RPC_MESSAGES[code] ?? "Couldn't send your report. Try again." }, { status: e instanceof RpcError ? e.status : 502 });
  }
}
