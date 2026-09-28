import { getUser } from "@/lib/server/session";
import { json } from "@/lib/server/util";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = await getUser(req).catch(() => null);
  return json({ user: u ? { name: u.name, picture: u.picture } : null }, { headers: { "Cache-Control": "no-store" } });
}
