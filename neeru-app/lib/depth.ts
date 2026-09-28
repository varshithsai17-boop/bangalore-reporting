import type { Depth, TravelMode } from "./types";

export const DEPTHS: Depth[] = ["ankle", "knee", "waist", "closed"];

export const DEPTH_INFO: Record<
  Depth,
  { label: string; short: string; range: string; color: string; car: string; bike: string; rank: number }
> = {
  ankle: {
    label: "Ankle-deep",
    short: "Ankle",
    range: "up to 15 cm",
    color: "#7fd0e6",
    car: "Passable. Drive slowly.",
    bike: "Passable with care. Water splashes into the silencer at speed.",
    rank: 1,
  },
  knee: {
    label: "Knee-deep",
    short: "Knee",
    range: "15–45 cm",
    color: "#f2b33d",
    car: "Cars getting through slowly.",
    bike: "Two-wheelers stalling. Avoid.",
    rank: 2,
  },
  waist: {
    label: "Waist-deep",
    short: "Waist",
    range: "45–90 cm",
    color: "#f2743a",
    car: "Cars stalling. Avoid.",
    bike: "Impassable on a two-wheeler.",
    rank: 3,
  },
  closed: {
    label: "Impassable",
    short: "Closed",
    range: "over 90 cm",
    color: "#e5484d",
    car: "Road or underpass closed.",
    bike: "Road or underpass closed.",
    rank: 4,
  },
};

/** How bad a spot is for a given vehicle. Used to rank routes. */
export const DEPTH_WEIGHT: Record<TravelMode, Record<Depth, number>> = {
  car: { ankle: 1, knee: 4, waist: 30, closed: 60 },
  bike: { ankle: 2, knee: 25, waist: 60, closed: 60 },
};

/** Depth that means "don't take this road" for the vehicle. */
export const blocks = (d: Depth, mode: TravelMode) =>
  mode === "bike" ? DEPTH_INFO[d].rank >= 2 : DEPTH_INFO[d].rank >= 3;

export const isDepth = (v: unknown): v is Depth => typeof v === "string" && (DEPTHS as string[]).includes(v);
