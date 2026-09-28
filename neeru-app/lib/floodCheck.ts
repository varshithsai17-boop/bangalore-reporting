import { DEPTH_WEIGHT } from "./depth";
import { nearestOnPath } from "./geo";
import type { Flood, Route, RouteCheck, TravelMode } from "./types";

/** A reported spot counts as "on the route" when it is this close to the route line. */
export const ON_ROUTE_M = 70;

/** Spots with only one report and nobody confirming for a while count for less. */
function confidence(f: Flood): number {
  if (f.still >= 3) return 1;
  if (f.still === 2) return 0.85;
  return 0.6;
}

export function checkRoute(route: Route, floods: Flood[], mode: TravelMode): RouteCheck {
  const hits = [];
  for (const flood of floods) {
    const { offsetM, alongM } = nearestOnPath({ lat: flood.lat, lng: flood.lng }, route.path);
    if (offsetM <= ON_ROUTE_M) hits.push({ flood, alongM, offsetM });
  }
  hits.sort((a, b) => a.alongM - b.alongM);
  const score = hits.reduce((s, h) => s + DEPTH_WEIGHT[mode][h.flood.depth] * confidence(h.flood), 0);
  return { route, hits, score };
}

/**
 * Check every route and pick the one to recommend.
 * A slower route wins only if it is meaningfully drier: every flood point is worth a few minutes of detour.
 */
export function checkRoutes(routes: Route[], floods: Flood[], mode: TravelMode) {
  const checks = routes.map((r) => checkRoute(r, floods, mode));
  const MIN_PER_POINT = 1.5 * 60; // seconds of extra travel we'd accept per flood point avoided
  let best = 0;
  for (let i = 1; i < checks.length; i++) {
    const cost = (c: RouteCheck) => c.route.durationSec + c.score * MIN_PER_POINT;
    if (cost(checks[i]) < cost(checks[best])) best = i;
  }
  return { checks, recommended: best };
}
