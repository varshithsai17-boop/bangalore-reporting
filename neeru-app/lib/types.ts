export type Depth = "ankle" | "knee" | "waist" | "closed";
export type TravelMode = "car" | "bike";

export type LatLng = { lat: number; lng: number };

export type Flood = {
  id: string;
  lat: number;
  lng: number;
  label: string | null;
  depth: Depth;
  reports: number; // all "flooded" reports ever made at this spot
  still: number; // "flooded" reports in the last 90 minutes
  gone: number; // "water's gone" reports since the last flooded report
  first_at: string;
  last_at: string;
};

/** A place the user picked in search. Either coordinates or a provider place id (or both). */
export type Place = {
  title: string;
  subtitle?: string;
  lat?: number;
  lng?: number;
  placeId?: string; // Google place id
};

export type Route = {
  id: string;
  summary: string; // e.g. "via Hosur Rd"
  durationSec: number;
  distanceM: number;
  path: [number, number][]; // [lat, lng]
  provider: "google" | "osrm";
};

export type RouteHit = {
  flood: Flood;
  alongM: number; // distance from the start of the route
  offsetM: number; // how far the spot is from the route line
};

export type RouteCheck = {
  route: Route;
  hits: RouteHit[];
  score: number;
};
