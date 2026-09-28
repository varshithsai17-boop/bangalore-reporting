import { CATEGORY_INFO, CITY_WHATSAPP, pct, photoUrl } from "@/lib/constants";
import { en, type Dict } from "@/lib/i18n/en";
import type { Spot, WardStat } from "@/lib/types";

export const siteUrl = () =>
  (typeof window !== "undefined" ? window.location.origin : process.env.NEXT_PUBLIC_SITE_URL) || "http://localhost:3000";

export function timeAgo(iso: string, t: Dict = en, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (m < 1) return t.time.justNow;
  if (m < 60) return t.time.minAgo(m);
  const h = Math.floor(m / 60);
  if (h < 24) return t.time.hAgo(h);
  return t.time.daysAgo(Math.floor(h / 24));
}

export function daysOpen(s: Spot, t: Dict = en, now = Date.now()): string {
  const d = Math.floor((now - new Date(s.created_at).getTime()) / 86_400_000);
  return d < 1 ? t.time.sinceToday : t.time.forDays(d);
}

const mapsLink = (s: Spot) => `https://maps.google.com/?q=${s.lat.toFixed(6)},${s.lng.toFixed(6)}`;

/**
 * Pre-written complaint to the city's waste WhatsApp line. Always in English, whatever language
 * the app is in, because it goes to city officials.
 */
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

/** Post on X, in the person's language. */
export function spotShareX(s: Spot, t: Dict, wardName?: string) {
  const text = t.share.spotX(t.cats[s.category].label, s.label || t.share.thisSpot, wardName ?? "", daysOpen(s, t), s.confirms);
  return `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(mapsLink(s))}`;
}

export function wardShareText(w: WardStat, t: Dict = en, name = w.name) {
  return t.share.ward(name, pct(w.score), w.checkins, w.open_spots);
}
