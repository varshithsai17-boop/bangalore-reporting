import type { LatLng } from "./types";

const M_PER_DEG = 111320;

/** Metres between two points (equirectangular; well under 1% error across a city). */
export function distM(a: LatLng, b: LatLng): number {
  const k = Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return M_PER_DEG * Math.hypot(b.lat - a.lat, (b.lng - a.lng) * k);
}

/**
 * Closest approach of a point to a polyline.
 * Returns the offset from the line and the distance along the line to that closest point.
 */
export function nearestOnPath(p: LatLng, path: [number, number][]): { offsetM: number; alongM: number } {
  if (path.length === 0) return { offsetM: Infinity, alongM: 0 };
  const k = Math.cos(p.lat * (Math.PI / 180));
  // Local planar coordinates in metres, centred on p.
  const xy = (lat: number, lng: number): [number, number] => [(lng - p.lng) * k * M_PER_DEG, (lat - p.lat) * M_PER_DEG];

  let best = Infinity;
  let bestAlong = 0;
  let along = 0;
  let [ax, ay] = xy(path[0][0], path[0][1]);
  if (path.length === 1) return { offsetM: Math.hypot(ax, ay), alongM: 0 };

  for (let i = 1; i < path.length; i++) {
    const [bx, by] = xy(path[i][0], path[i][1]);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const d = Math.hypot(cx, cy);
    const segLen = Math.sqrt(len2);
    if (d < best) {
      best = d;
      bestAlong = along + t * segLen;
    }
    along += segLen;
    ax = bx;
    ay = by;
  }
  return { offsetM: best, alongM: bestAlong };
}

/** Point a given fraction of the way along a path (by distance). */
export function pointAlong(path: [number, number][], frac: number): LatLng {
  if (path.length === 1) return { lat: path[0][0], lng: path[0][1] };
  const segs: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const d = distM({ lat: path[i - 1][0], lng: path[i - 1][1] }, { lat: path[i][0], lng: path[i][1] });
    segs.push(d);
    total += d;
  }
  let target = total * frac;
  for (let i = 0; i < segs.length; i++) {
    if (target <= segs[i]) {
      const t = segs[i] === 0 ? 0 : target / segs[i];
      return {
        lat: path[i][0] + (path[i + 1][0] - path[i][0]) * t,
        lng: path[i][1] + (path[i + 1][1] - path[i][1]) * t,
      };
    }
    target -= segs[i];
  }
  const last = path[path.length - 1];
  return { lat: last[0], lng: last[1] };
}

/** Rough Bengaluru bounds used to bias search and reject far-away reports. */
export const BLR_BOUNDS = { south: 12.7, west: 77.3, north: 13.3, east: 77.95 };
export const BLR_CENTER: LatLng = { lat: 12.9716, lng: 77.5946 };

export const inBengaluru = (p: LatLng) =>
  p.lat >= BLR_BOUNDS.south && p.lat <= BLR_BOUNDS.north && p.lng >= BLR_BOUNDS.west && p.lng <= BLR_BOUNDS.east;

export function formatKm(m: number): string {
  if (m < 950) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

export function formatMin(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function timeAgo(iso: string, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  return `${Math.floor(m / 60)} h ${m % 60} min ago`;
}
