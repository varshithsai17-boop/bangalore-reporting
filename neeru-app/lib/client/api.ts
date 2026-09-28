"use client";
import type { Depth, Flood, Place, Route, TravelMode } from "../types";

let memDevice = "";
/** Anonymous id for this browser. Lets the server rate-limit and de-duplicate without accounts. */
export function deviceId(): string {
  try {
    let id = localStorage.getItem("neeru:device");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("neeru:device", id);
    }
    return id;
  } catch {
    if (!memDevice) memDevice = crypto.randomUUID();
    return memDevice;
  }
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

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  floods: () => call<{ floods: Flood[]; at: string }>("/api/floods", { cache: "no-store" }),
  places: (q: string, session: string, signal?: AbortSignal) =>
    call<{ places: Place[] }>(`/api/places?q=${encodeURIComponent(q)}&session=${session}`, { signal }),
  reverse: (lat: number, lng: number) => call<{ label: string | null }>(`/api/reverse?lat=${lat}&lng=${lng}`),
  route: (from: Place, to: Place, mode: TravelMode) =>
    call<{ routes: Route[] }>(
      "/api/route",
      post({
        from: { lat: from.lat, lng: from.lng, placeId: from.placeId },
        to: { lat: to.lat, lng: to.lng, placeId: to.placeId },
        mode,
      }),
    ),
  report: (lat: number, lng: number, depth: Depth, label: string | null) =>
    call<{ spot_id: string; merged: boolean }>("/api/report", post({ lat, lng, depth, label, device: deviceId() })),
  vote: (spot: string, kind: "flooded" | "clear", depth?: Depth) =>
    call<{ ok: true }>("/api/vote", post({ spot, kind, depth, device: deviceId() })),
};
