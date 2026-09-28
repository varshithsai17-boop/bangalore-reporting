"use client";
import { errorText, langFromCookieHeader } from "../i18n";
import type { Category, Home, Spot, VanStatus, WardStat } from "../types";

/** Error text in the language the person picked (the switcher stores it in a cookie). */
export const clientError = (code: string) => errorText(langFromCookieHeader(typeof document === "undefined" ? null : document.cookie), code);

let memDevice = "";
/** Random id for this browser (not the account). Lets the database cap how many accounts use one phone. */
export function deviceId(): string {
  try {
    let id = localStorage.getItem("gaadi:device");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("gaadi:device", id);
    }
    return id;
  } catch {
    if (!memDevice) memDevice = crypto.randomUUID();
    return memDevice;
  }
}

export function loadHome(): Home | null {
  try {
    const h = JSON.parse(localStorage.getItem("gaadi:home") || "null");
    return h && typeof h.lat === "number" && typeof h.ward_id === "string" ? h : null;
  } catch {
    return null;
  }
}
export function saveHome(h: Home | null) {
  try {
    if (h) localStorage.setItem("gaadi:home", JSON.stringify(h));
    else localStorage.removeItem("gaadi:home");
  } catch {}
}

/** Thrown when the server says the person needs to sign in first. */
export class SignInNeeded extends Error {}

export type Me = { name: string; picture: string | null };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error(clientError("offline"));
  }
  const body = await res.json().catch(() => ({}));
  const err = body as { error?: string; signin?: boolean };
  if (res.status === 401 && err.signin) throw new SignInNeeded(err.error || clientError("signed_out"));
  if (!res.ok) throw new Error(err.error || clientError("generic"));
  return body as T;
}
const post = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const api = {
  me: () => call<{ user: Me | null }>("/api/auth/me", { cache: "no-store" }),
  signIn: (credential: string) => call<{ user: Me }>("/api/auth/google", post({ credential })),
  signOut: () => call<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  stats: (days: number) => call<{ days: number; stats: WardStat[] }>(`/api/stats?days=${days}`),
  spots: () => call<{ spots: Spot[] }>("/api/spots", { cache: "no-store" }),
  locate: (lat: number, lng: number) =>
    call<{ ward: { id: string; name: string; corp: string } | null; street: string | null }>(`/api/locate?lat=${lat}&lng=${lng}`),
  search: (q: string, signal?: AbortSignal) =>
    call<{ places: { title: string; subtitle: string; lat: number; lng: number }[] }>(`/api/search?q=${encodeURIComponent(q)}`, { signal }),
  today: () => call<{ today: { status: VanStatus; ward_id: string; street: string | null } | null }>("/api/today", { cache: "no-store" }),
  checkin: (home: Home, status: VanStatus) =>
    call<{ ok: true }>("/api/checkin", post({ device: deviceId(), lat: home.lat, lng: home.lng, street: home.street, status })),
  photo: (blob: Blob) => call<{ path: string }>("/api/photo", { method: "POST", headers: { "Content-Type": blob.type }, body: blob }),
  /** forceNew: the reporter said it's not one of the nearby spots we showed them, so never auto-merge. */
  spot: (lat: number, lng: number, category: Category, photo: string, forceNew = false) =>
    call<{ spot_id: string; merged: boolean; ward: { id: string; name: string }; label: string | null }>(
      "/api/spot",
      post({ device: deviceId(), lat, lng, category, photo, forceNew }),
    ),
  vote: (spot: string, kind: "still" | "cleaned" | "flag", photo?: string) => call<{ ok: true }>("/api/vote", post({ spot, kind, photo, device: deviceId() })),
};
