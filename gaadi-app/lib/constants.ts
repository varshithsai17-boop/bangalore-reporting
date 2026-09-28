import type { Category, VanStatus } from "./types";

export const CATEGORIES: Category[] = ["dumping", "overflowing", "burning", "drain"];

export const CATEGORY_INFO: Record<Category, { label: string; short: string; color: string; ask: string }> = {
  dumping: { label: "Dumping spot", short: "Dumping", color: "#8a5a2b", ask: "clear this garbage dumping spot and stop it from coming back" },
  overflowing: { label: "Overflowing bin", short: "Overflowing", color: "#c7792b", ask: "empty this overflowing bin" },
  burning: { label: "Garbage burning", short: "Burning", color: "#d13f2f", ask: "stop the garbage burning here" },
  drain: { label: "Garbage in drain", short: "In drain", color: "#2f6fa3", ask: "clear the garbage blocking this drain before the next rain" },
};

export const STATUS_INFO: Record<VanStatus, { label: string; sub: string }> = {
  came: { label: "Came", sub: "Picked up our waste" },
  missed: { label: "Didn't come", sub: "No van today" },
  refused: { label: "Came, didn't take it", sub: "Skipped us or refused the waste" },
};

/** A ward needs this many check-ins in the window before it gets a score. */
export const MIN_CHECKINS = 15;

/** Van reliability colours, worst to best. */
export const SCORE_STOPS: [number, string][] = [
  [0, "#c8372d"],
  [0.5, "#e0742b"],
  [0.65, "#e9b12a"],
  [0.8, "#8fb83a"],
  [0.92, "#2f8f57"],
];
export const NO_DATA = "#d9ddd6";

export function scoreColor(score: number | null | undefined): string {
  if (score == null) return NO_DATA;
  let c = SCORE_STOPS[0][1];
  for (const [t, col] of SCORE_STOPS) if (score >= t) c = col;
  return c;
}

export const pct = (s: number | null | undefined) => (s == null ? "–" : `${Math.round(s * 100)}%`);

/** The city's waste complaints WhatsApp line. */
export const CITY_WHATSAPP = "919448197197";
export const CITY_WHATSAPP_DISPLAY = "94481 97197";

export const photoUrl = (path: string) =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL || ""}/storage/v1/object/public/gaadi-photos/${path}`;
