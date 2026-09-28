import "server-only";
import { decode } from "@googlemaps/polyline-codec";
import { BLR_BOUNDS, BLR_CENTER } from "../geo";
import type { Place, Route, TravelMode } from "../types";
import { cached, fetchJson } from "./util";

/**
 * Google is used only when both keys are set. Google's terms require its routes and
 * place results to be shown on a Google map, so the browser key must be there too.
 */
export const googleEnabled = () => !!process.env.GOOGLE_MAPS_API_KEY && !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

const osmHeaders = () => ({
  "User-Agent": `Neeru flood map (${process.env.OSM_CONTACT || "contact not set"})`,
  "Accept-Language": "en",
});

/* ------------------------------------------------------------------ search */

export async function autocomplete(q: string, session: string): Promise<Place[]> {
  const query = q.trim().slice(0, 120);
  if (query.length < 2) return [];
  if (googleEnabled()) return googleAutocomplete(query, session);
  return cached(`osm:ac:${query.toLowerCase()}`, 10 * 60_000, () => osmSearch(query));
}

async function googleAutocomplete(q: string, session: string): Promise<Place[]> {
  const res = await fetchJson("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY! },
    body: JSON.stringify({
      input: q,
      sessionToken: session || undefined,
      includedRegionCodes: ["in"],
      languageCode: "en",
      locationBias: { circle: { center: { latitude: BLR_CENTER.lat, longitude: BLR_CENTER.lng }, radius: 35000 } },
    }),
  });
  if (!res.ok) throw new Error(`google_places_${res.status}`);
  type S = { placePrediction?: { placeId: string; text?: { text: string }; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } } } };
  const suggestions = ((res.body as { suggestions?: S[] })?.suggestions ?? []).slice(0, 6);
  return suggestions
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<S["placePrediction"]> => !!p)
    .map((p) => ({
      title: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "Place",
      subtitle: p.structuredFormat?.secondaryText?.text,
      placeId: p.placeId,
    }));
}

async function osmSearch(q: string): Promise<Place[]> {
  // Photon is built for search-as-you-type. Nominatim is the fallback if Photon is down.
  try {
    const url = new URL("https://photon.komoot.io/api/");
    url.searchParams.set("q", q);
    url.searchParams.set("limit", "6");
    url.searchParams.set("lat", String(BLR_CENTER.lat));
    url.searchParams.set("lon", String(BLR_CENTER.lng));
    url.searchParams.set("bbox", `${BLR_BOUNDS.west},${BLR_BOUNDS.south},${BLR_BOUNDS.east},${BLR_BOUNDS.north}`);
    const res = await fetchJson(url.toString(), { headers: osmHeaders(), timeoutMs: 5000 });
    if (!res.ok) throw new Error("photon");
    type F = { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> };
    const feats = (res.body as { features?: F[] })?.features ?? [];
    return feats.map((f) => {
      const p = f.properties;
      const title = p.name || [p.housenumber, p.street].filter(Boolean).join(" ") || "Place";
      const subtitle = [p.street && p.name ? p.street : undefined, p.district || p.locality, p.city].filter(Boolean).join(", ");
      return { title, subtitle, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] };
    });
  } catch {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", q);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "6");
    url.searchParams.set("countrycodes", "in");
    url.searchParams.set("viewbox", `${BLR_BOUNDS.west},${BLR_BOUNDS.north},${BLR_BOUNDS.east},${BLR_BOUNDS.south}`);
    url.searchParams.set("bounded", "1");
    const res = await fetchJson(url.toString(), { headers: osmHeaders() });
    if (!res.ok) throw new Error("nominatim");
    type N = { lat: string; lon: string; name?: string; display_name: string };
    return ((res.body as N[]) ?? []).map((n) => {
      const parts = n.display_name.split(", ");
      return { title: n.name || parts[0], subtitle: parts.slice(1, 4).join(", "), lat: +n.lat, lng: +n.lon };
    });
  }
}

/* ------------------------------------------------------------------ reverse geocode */

export async function reverse(lat: number, lng: number): Promise<string | null> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  return cached(`rev:${googleEnabled() ? "g" : "o"}:${key}`, 60 * 60_000, async () => {
    if (googleEnabled()) {
      const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
      url.searchParams.set("latlng", `${lat},${lng}`);
      url.searchParams.set("key", process.env.GOOGLE_MAPS_API_KEY!);
      url.searchParams.set("language", "en");
      const res = await fetchJson(url.toString());
      type C = { long_name: string; short_name: string; types: string[] };
      const results = (res.body as { results?: { address_components: C[] }[] })?.results ?? [];
      const comps = results[0]?.address_components ?? [];
      const road = comps.find((c) => c.types.includes("route"))?.long_name;
      const area = comps.find((c) => c.types.includes("sublocality_level_1") || c.types.includes("sublocality") || c.types.includes("neighborhood"))?.long_name;
      return [road, area].filter(Boolean).join(", ") || null;
    }
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("zoom", "17");
    const res = await fetchJson(url.toString(), { headers: osmHeaders() });
    const b = res.body as { name?: string; address?: Record<string, string> } | null;
    if (!b) return null;
    const a = b.address ?? {};
    const road = b.name || a.road;
    const area = a.neighbourhood || a.suburb || a.quarter || a.city_district;
    return [road, area].filter(Boolean).join(", ") || null;
  });
}

/* ------------------------------------------------------------------ routes */

type Waypoint = { lat?: number; lng?: number; placeId?: string };

export async function routes(from: Waypoint, to: Waypoint, mode: TravelMode): Promise<Route[]> {
  if (googleEnabled()) return googleRoutes(from, to, mode);
  if (from.lat == null || from.lng == null || to.lat == null || to.lng == null) throw new Error("need_coordinates");
  const key = `osrm:${from.lat.toFixed(4)},${from.lng.toFixed(4)}:${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;
  return cached(key, 60_000, () => osrmRoutes(from as Required<Waypoint>, to as Required<Waypoint>));
}

async function googleRoutes(from: Waypoint, to: Waypoint, mode: TravelMode): Promise<Route[]> {
  const wp = (w: Waypoint) => (w.placeId ? { placeId: w.placeId } : { location: { latLng: { latitude: w.lat, longitude: w.lng } } });
  const res = await fetchJson("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY!,
      "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.description",
    },
    body: JSON.stringify({
      origin: wp(from),
      destination: wp(to),
      travelMode: mode === "bike" ? "TWO_WHEELER" : "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      computeAlternativeRoutes: true,
      languageCode: "en-IN",
      regionCode: "IN",
      units: "METRIC",
    }),
    timeoutMs: 10000,
  });
  if (!res.ok) throw new Error(`google_routes_${res.status}`);
  type R = { duration?: string; distanceMeters?: number; description?: string; polyline?: { encodedPolyline?: string } };
  const list = (res.body as { routes?: R[] })?.routes ?? [];
  return list
    .filter((r) => r.polyline?.encodedPolyline)
    .map((r, i) => ({
      id: `g${i}`,
      summary: r.description ? `via ${r.description}` : `Route ${String.fromCharCode(65 + i)}`,
      durationSec: parseInt(r.duration ?? "0", 10),
      distanceM: r.distanceMeters ?? 0,
      path: decode(r.polyline!.encodedPolyline!, 5) as [number, number][],
      provider: "google" as const,
    }));
}

async function osrmRoutes(from: Required<Waypoint>, to: Required<Waypoint>): Promise<Route[]> {
  const base = process.env.OSRM_URL || "https://router.project-osrm.org";
  const url = `${base}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?alternatives=3&overview=full&geometries=geojson&steps=true`;
  const res = await fetchJson(url, { timeoutMs: 10000 });
  if (!res.ok) throw new Error(`osrm_${res.status}`);
  type R = { duration: number; distance: number; geometry: { coordinates: [number, number][] }; legs: { summary?: string }[] };
  const list = (res.body as { routes?: R[] })?.routes ?? [];
  return list.map((r, i) => ({
    id: `o${i}`,
    summary: r.legs?.[0]?.summary ? `via ${[...new Set(r.legs[0].summary.split(", ").filter(Boolean))].join(", ")}` : `Route ${String.fromCharCode(65 + i)}`,
    durationSec: Math.round(r.duration),
    distanceM: Math.round(r.distance),
    path: r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
    provider: "osrm" as const,
  }));
}
