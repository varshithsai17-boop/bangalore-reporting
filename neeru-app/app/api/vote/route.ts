import { isDepth } from "@/lib/depth";
import { rpc, RPC_MESSAGES, RpcError } from "@/lib/server/supabase";
import { clientIp, json, rateLimited, tooMany } from "@/lib/server/util";

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (rateLimited(`vote:${ip}`, 20, 60_000)) return tooMany();
  let b: { spot?: unknown; kind?: unknown; device?: unknown; depth?: unknown };
  try {
    b = await req.json();
  } catch {
    return json({ error: "Bad request." }, { status: 400 });
  }
  const spot = String(b.spot ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(spot)) return json({ error: "Bad request." }, { status: 400 });
  if (b.kind !== "flooded" && b.kind !== "clear") return json({ error: "Bad request." }, { status: 400 });
  try {
    await rpc("neeru_vote", {
      p_spot: spot,
      p_kind: b.kind,
      p_device: String(b.device ?? ""),
      p_depth: isDepth(b.depth) ? b.depth : null,
      p_ip: ip || null,
    });
    return json({ ok: true });
  } catch (e) {
    const code = e instanceof RpcError ? e.code : "db_error";
    return json({ error: RPC_MESSAGES[code] ?? "Couldn't send that. Try again." }, { status: e instanceof RpcError ? e.status : 502 });
  }
}
