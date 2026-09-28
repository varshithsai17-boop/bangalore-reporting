import "server-only";
import { cached, fetchJson } from "./util";

const headers = () => ({
  "User-Agent": `Gaadi Bantha (${process.env.OSM_CONTACT || "contact not set"})`,
  "Accept-Language": "en",
});

/** Street and area name for a point, e.g. "17th Cross Road, HSR Layout". Cached per ~10 m. */
export async function streetAt(lat: number, lng: number): Promise<string | null> {
  const key = `rev:${lat.toFixed(4)},${lng.toFixed(4)}`;
  return cached(key, 24 * 60 * 60_000, async () => {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("zoom", "17");
    const res = await fetchJson(url.toString(), { headers: headers(), timeoutMs: 6000 });
    const b = res.body as { name?: string; address?: Record<string, string> } | null;
    if (!res.ok || !b) return null;
    const a = b.address ?? {};
    const road = a.road || b.name;
    const area = a.neighbourhood || a.suburb || a.quarter || a.city_district;
    return [road, area].filter(Boolean).join(", ") || null;
  });
}

/** Place search inside Bengaluru, for people setting their street by name instead of GPS. */
export async function searchPlaces(q: string) {
  const query = q.trim().slice(0, 120);
  if (query.length < 2) return [];
  return cached(`search:${query.toLowerCase()}`, 10 * 60_000, async () => {
    try {
      const u = new URL("https://photon.komoot.io/api/");
      u.searchParams.set("q", query);
      u.searchParams.set("limit", "6");
      u.searchParams.set("lat", "12.9716");
      u.searchParams.set("lon", "77.5946");
      u.searchParams.set("bbox", "77.3,12.7,77.95,13.3");
      const res = await fetchJson(u.toString(), { headers: headers(), timeoutMs: 5000 });
      if (!res.ok) throw new Error("photon");
      type F = { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> };
      return ((res.body as { features?: F[] })?.features ?? []).map((f) => ({
        title: f.properties.name || f.properties.street || "Place",
        subtitle: [f.properties.district || f.properties.locality, f.properties.city].filter(Boolean).join(", "),
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
      }));
    } catch {
      const u = new URL("https://nominatim.openstreetmap.org/search");
      u.searchParams.set("q", query);
      u.searchParams.set("format", "jsonv2");
      u.searchParams.set("limit", "6");
      u.searchParams.set("viewbox", "77.3,13.3,77.95,12.7");
      u.searchParams.set("bounded", "1");
      const res = await fetchJson(u.toString(), { headers: headers() });
      type N = { lat: string; lon: string; name?: string; display_name: string };
      return ((res.body as N[]) ?? []).map((n) => {
        const parts = n.display_name.split(", ");
        return { title: n.name || parts[0], subtitle: parts.slice(1, 3).join(", "), lat: +n.lat, lng: +n.lon };
      });
    }
  });
}
