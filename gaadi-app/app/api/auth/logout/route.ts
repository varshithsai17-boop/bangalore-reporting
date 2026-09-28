import { clearCookie, isSecure } from "@/lib/server/session";
import { json } from "@/lib/server/util";

export async function POST(req: Request) {
  return json({ ok: true }, { headers: { "Set-Cookie": clearCookie(isSecure(req)) } });
}
