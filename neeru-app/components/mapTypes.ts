import type { Flood, LatLng, RouteCheck } from "@/lib/types";

export type MapProps = {
  floods: Flood[];
  checks: RouteCheck[] | null;
  selectedRoute: number;
  origin: LatLng | null;
  destination: LatLng | null;
  me: LatLng | null;
  /** Report pin, shown while the report panel is open. */
  pin: LatLng | null;
  picking: boolean;
  selectedFlood: string | null;
  onPick: (p: LatLng) => void;
  onFlood: (id: string) => void;
  onRoute: (index: number) => void;
  /** Change `key` to make the map fit these points. */
  fit: { key: number; points: LatLng[] } | null;
  /** Change `key` to fly to a point. */
  focus: { key: number; point: LatLng; zoom?: number } | null;
  onError: (msg: string) => void;
};

export const ROUTE_SELECTED = "#eef1ea";
export const ROUTE_ALT = "#4d6b85";
