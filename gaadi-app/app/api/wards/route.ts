import { wardsGeoJSON } from "@/lib/wards";

// Ward boundaries: GBA final delimitation, December 2025 (369 wards), via OpenCity.
export async function GET() {
  return new Response(JSON.stringify(wardsGeoJSON), {
    headers: { "content-type": "application/json", "Cache-Control": "public, max-age=86400, s-maxage=604800" },
  });
}
