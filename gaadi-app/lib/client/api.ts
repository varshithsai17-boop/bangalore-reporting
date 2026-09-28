"use client";
import type { Category, Home, Spot, VanStatus, WardStat } from "../types";

let memDevice = "";
/** Anonymous id for this browser, used for one-check-in-per-day and rate limits. No accounts. */
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

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error("You seem to be offline. Check your connection.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || "Something went wrong. Try again.");
  return body as T;
}
const post = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const api = {
  stats: (days: number) => call<{ days: number; stats: WardStat[] }>(`/api/stats?days=${days}`),
  spots: () => call<{ spots: Spot[] }>("/api/spots", { cache: "no-store" }),
  locate: (lat: number, lng: number) =>
    call<{ ward: { id: string; name: string; corp: string } | null; street: string | null }>(`/api/locate?lat=${lat}&lng=${lng}`),
  search: (q: string, signal?: AbortSignal) =>
    call<{ places: { title: string; subtitle: string; lat: number; lng: number }[] }>(`/api/search?q=${encodeURIComponent(q)}`, { signal }),
  today: () => call<{ today: { status: VanStatus; ward_id: string; street: string | null } | null }>(`/api/today?device=${deviceId()}`, { cache: "no-store" }),
  checkin: (home: Home, status: VanStatus) =>
    call<{ ok: true }>("/api/checkin", post({ device: deviceId(), lat: home.lat, lng: home.lng, street: home.street, status })),
  photo: (blob: Blob) => call<{ path: string }>("/api/photo", { method: "POST", headers: { "Content-Type": blob.type }, body: blob }),
  spot: (lat: number, lng: number, category: Category, photo: string) =>
    call<{ spot_id: string; merged: boolean; ward: { id: string; name: string }; label: string | null }>(
      "/api/spot",
      post({ device: deviceId(), lat, lng, category, photo }),
    ),
  vote: (spot: string, kind: "still" | "cleaned" | "flag", photo?: string) => call<{ ok: true }>("/api/vote", post({ spot, kind, photo, device: deviceId() })),
};
