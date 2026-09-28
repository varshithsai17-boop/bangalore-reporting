import { rpc, RpcError } from "@/lib/server/supabase";
import { json } from "@/lib/server/util";
import type { Flood } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const floods = await rpc<Flood[]>("neeru_active_floods", {});
    // A short shared cache keeps the database calm when many people open the app at once.
    return json(
      { floods, at: new Date().toISOString() },
      { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20" } },
    );
  } catch (e) {
    const status = e instanceof RpcError ? e.status : 502;
    return json({ error: "Couldn't load flood reports." }, { status });
  }
}
