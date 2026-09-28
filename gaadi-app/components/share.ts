import { CATEGORY_INFO, CITY_WHATSAPP, pct, photoUrl } from "@/lib/constants";
import type { Spot, WardStat } from "@/lib/types";

export const siteUrl = () =>
  (typeof window !== "undefined" ? window.location.origin : process.env.NEXT_PUBLIC_SITE_URL) || "http://localhost:3000";

export function timeAgo(iso: string, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? "day" : "days"} ago`;
}

export function daysOpen(s: Spot, now = Date.now()): string {
  const d = Math.floor((now - new Date(s.created_at).getTime()) / 86_400_000);
  return d < 1 ? "since today" : `for ${d} ${d === 1 ? "day" : "days"}`;
}

const mapsLink = (s: Spot) => `https://maps.google.com/?q=${s.lat.toFixed(6)},${s.lng.toFixed(6)}`;

/** Pre-written complaint to the city's waste WhatsApp line. */
export function spotWhatsApp(s: Spot, wardName?: string) {
  const c = CATEGORY_INFO[s.category];
  const text =
    `Garbage complaint: ${c.label.toLowerCase()} at ${s.label || "the location below"}` +
    `${wardName ? `, ${wardName} ward` : ""}, Bengaluru.\n` +
    `Open ${daysOpen(s)}, reported by ${s.confirms} ${s.confirms === 1 ? "resident" : "residents"} on Gaadi Bantha.\n` +
    `Location: ${mapsLink(s)}\nPhoto: ${photoUrl(s.photo)}\n` +
    `Please ${c.ask}.`;
  return `https://wa.me/${CITY_WHATSAPP}?text=${encodeURIComponent(text)}`;
}

export function spotShareX(s: Spot, wardName?: string) {
  const c = CATEGORY_INFO[s.category];
  const text = `${c.label} at ${s.label || "this spot"}${wardName ? ` (${wardName} ward)` : ""}, open ${daysOpen(s)}. Reported by ${s.confirms} ${s.confirms === 1 ? "resident" : "residents"} on Gaadi Bantha. #Bengaluru`;
  return `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(mapsLink(s))}`;
}

export function wardShareText(w: WardStat) {
  return `${w.name}, Bengaluru: residents say the garbage van came on ${pct(w.score)} of days this week (${w.checkins} check-ins). ${w.open_spots} garbage ${w.open_spots === 1 ? "spot" : "spots"} still open. Is your ward better?`;
}
