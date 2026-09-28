import "server-only";
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";
import raw from "./data/wards.json";

type Props = { id: string; name: string; name_kn: string; no: number; corp: string; assembly: string; zone: string; pop: number; cx: number; cy: number };
type WardFeature = Feature<Polygon | MultiPolygon, Props>;

const data = raw as unknown as FeatureCollection<Polygon | MultiPolygon, Props>;

// Bounding boxes, computed once, so most wards are ruled out without the full polygon test.
const index = data.features.map((f) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys) for (const [x, y] of poly[0]) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { f: f as WardFeature, minX, minY, maxX, maxY };
});

function inRing(x: number, y: number, ring: Position[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(x: number, y: number, poly: Position[][]) {
  if (!inRing(x, y, poly[0])) return false;
  for (let h = 1; h < poly.length; h++) if (inRing(x, y, poly[h])) return false;
  return true;
}

/** Which of the 369 GBA wards (Dec 2025 delimitation) a point falls in, or null if outside the city. */
export function wardAt(lat: number, lng: number): Props | null {
  for (const w of index) {
    if (lng < w.minX || lng > w.maxX || lat < w.minY || lat > w.maxY) continue;
    const g = w.f.geometry;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    if (polys.some((p) => inPolygon(lng, lat, p))) return w.f.properties;
  }
  return null;
}

export function wardById(id: string): Props | null {
  return data.features.find((f) => f.properties.id === id)?.properties ?? null;
}

export const wardsGeoJSON = data;
