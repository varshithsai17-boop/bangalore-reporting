import { requireUser } from "@/lib/server/session";
import { errorResponse, uploadPhoto } from "@/lib/server/supabase";
import { clientIp, fail, json, rateLimited, tooMany } from "@/lib/server/util";

const MAX = 900 * 1024;

/**
 * Receives a photo that the browser has already shrunk and re-encoded (which strips its
 * location metadata), checks it really is a JPEG or WebP, and stores it.
 */
export async function POST(req: Request) {
  if (rateLimited(`photo:${clientIp(req)}`, 12, 10 * 60_000)) return tooMany(req);
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  if (rateLimited(`photo-user:${user.id}`, 12, 10 * 60_000)) return tooMany(req);
  const type = req.headers.get("content-type") ?? "";
  if (type !== "image/jpeg" && type !== "image/webp") return fail(req, "onlyJpeg", 415);
  const bytes = await req.arrayBuffer();
  if (bytes.byteLength < 2000 || bytes.byteLength > MAX) return fail(req, "photoSize", 413);
  const head = new Uint8Array(bytes.slice(0, 12));
  const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  const isWebp = String.fromCharCode(...head.slice(0, 4)) === "RIFF" && String.fromCharCode(...head.slice(8, 12)) === "WEBP";
  if (!(type === "image/jpeg" ? isJpeg : isWebp)) return fail(req, "notPhoto", 415);
  const month = new Date().toISOString().slice(0, 7);
  const path = `spots/${month}/${crypto.randomUUID()}.${type === "image/jpeg" ? "jpg" : "webp"}`;
  try {
    await uploadPhoto(path, bytes, type);
    return json({ path });
  } catch (e) {
    return errorResponse(e, "photoFail", req);
  }
}
