"use client";
import { useEffect, useRef } from "react";
import { DEPTH_INFO } from "@/lib/depth";
import { BLR_CENTER } from "@/lib/geo";
import type { LatLng } from "@/lib/types";
import { ROUTE_ALT, ROUTE_SELECTED, type MapProps } from "./mapTypes";
import { markerEl } from "./markers";

let loader: Promise<void> | null = null;
function loadGoogle(key: string): Promise<void> {
  if (typeof window !== "undefined" && window.google?.maps) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const cb = `__neeruGm${Date.now()}`;
    (window as unknown as Record<string, () => void>)[cb] = () => resolve();
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=${cb}&region=IN&language=en`;
    s.async = true;
    s.onerror = () => {
      loader = null;
      reject(new Error("google_maps_load"));
    };
    document.head.appendChild(s);
  });
  return loader;
}

const DARK: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#0f1d29" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8ea3b2" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0c1822" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#223a4e" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#2b4760" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3a5a76" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#12384f" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ visibility: "off" }] },
];

/** A DOM element pinned to a lat/lng on a Google map. */
function makeOverlay() {
  return class DomOverlay extends google.maps.OverlayView {
    pos: google.maps.LatLng;
    constructor(public el: HTMLElement, pos: LatLng, public anchorBottom: boolean) {
      super();
      this.pos = new google.maps.LatLng(pos.lat, pos.lng);
      el.style.position = "absolute";
    }
    onAdd() {
      this.getPanes()!.overlayMouseTarget.appendChild(this.el);
    }
    draw() {
      const pt = this.getProjection()?.fromLatLngToDivPixel(this.pos);
      if (!pt) return;
      const w = this.el.offsetWidth;
      const h = this.el.offsetHeight;
      this.el.style.left = `${pt.x - w / 2}px`;
      this.el.style.top = `${this.anchorBottom ? pt.y - h : pt.y - h / 2}px`;
    }
    onRemove() {
      this.el.remove();
    }
    move(p: LatLng) {
      this.pos = new google.maps.LatLng(p.lat, p.lng);
      this.draw();
    }
  };
}

/** Google map. Used when both Google keys are configured (Google's terms require Google routes on a Google map). */
export default function GoogleMap(p: MapProps & { apiKey: string }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const lines = useRef<google.maps.Polyline[]>([]);
  const dots = useRef<Map<string, google.maps.Marker>>(new Map());
  const heat = useRef<google.maps.Circle[]>([]);
  const overlays = useRef<Record<string, InstanceType<ReturnType<typeof makeOverlay>>>>({});
  const Overlay = useRef<ReturnType<typeof makeOverlay> | null>(null);
  const props = useRef(p);
  props.current = p;

  useEffect(() => {
    let cancelled = false;
    loadGoogle(p.apiKey)
      .then(() => {
        if (cancelled || !el.current) return;
        Overlay.current = makeOverlay();
        const m = new google.maps.Map(el.current, {
          center: BLR_CENTER,
          zoom: 12,
          styles: DARK,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          gestureHandling: "greedy",
          backgroundColor: "#0c1822",
        });
        m.addListener("click", (e: google.maps.MapMouseEvent) => {
          if (props.current.picking && e.latLng) props.current.onPick({ lat: e.latLng.lat(), lng: e.latLng.lng() });
        });
        // Street-level dots appear and disappear with zoom.
        m.addListener("zoom_changed", () => showDots());
        map.current = m;
        sync();
        syncMarkers();
      })
      .catch(() => props.current.onError("Google Maps couldn't load. Check the browser key and its allowed websites."));
    return () => {
      cancelled = true;
    };
  }, [p.apiKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function sync() {
    const m = map.current;
    if (!m) return;
    const { floods, checks, selectedRoute, selectedFlood } = props.current;

    lines.current.forEach((l) => l.setMap(null));
    lines.current = [];
    (checks ?? []).forEach((c, i) => {
      const sel = i === selectedRoute;
      const path = c.route.path.map(([lat, lng]) => ({ lat, lng }));
      const casing = new google.maps.Polyline({ map: m, path, strokeColor: "#0b141c", strokeWeight: sel ? 10 : 7, zIndex: sel ? 3 : 1, clickable: false });
      const line = new google.maps.Polyline({ map: m, path, strokeColor: sel ? ROUTE_SELECTED : ROUTE_ALT, strokeWeight: sel ? 5.5 : 4, zIndex: sel ? 4 : 2 });
      line.addListener("click", () => !props.current.picking && props.current.onRoute(i));
      lines.current.push(casing, line);
    });

    const hitIds = new Set((checks?.[selectedRoute]?.hits ?? []).map((h) => h.flood.id));

    // Heat: stacked translucent rings in metres, so overlapping hotspots glow hotter.
    // (Google retired its own heatmap layer, so this is drawn by hand.)
    heat.current.forEach((c) => c.setMap(null));
    heat.current = [];
    for (const f of floods) {
      const info = DEPTH_INFO[f.depth];
      const sure = Math.min(1, 0.45 + 0.12 * f.still);
      for (const [r, o] of [[520, 0.07], [320, 0.1], [160, 0.16]] as const) {
        heat.current.push(
          new google.maps.Circle({
            map: m,
            center: { lat: f.lat, lng: f.lng },
            radius: r * (0.7 + info.rank * 0.15),
            fillColor: info.color,
            fillOpacity: o * sure,
            strokeWeight: 0,
            clickable: false,
            zIndex: 1,
          }),
        );
      }
    }

    const seen = new Set<string>();
    for (const f of floods) {
      seen.add(f.id);
      const info = DEPTH_INFO[f.depth];
      const icon: google.maps.Symbol = {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 5 + info.rank * 1.6,
        fillColor: info.color,
        fillOpacity: 1,
        strokeColor: f.id === selectedFlood ? "#ffffff" : hitIds.has(f.id) ? info.color : "#0b141c",
        strokeWeight: f.id === selectedFlood ? 3 : hitIds.has(f.id) ? 6 : 2,
        strokeOpacity: hitIds.has(f.id) && f.id !== selectedFlood ? 0.45 : 1,
      };
      let mk = dots.current.get(f.id);
      if (!mk) {
        mk = new google.maps.Marker({ map: m, position: { lat: f.lat, lng: f.lng }, icon, zIndex: 10 + info.rank, title: f.label ?? info.label });
        mk.addListener("click", () => !props.current.picking && props.current.onFlood(f.id));
        dots.current.set(f.id, mk);
      } else {
        mk.setIcon(icon);
        mk.setPosition({ lat: f.lat, lng: f.lng });
      }
    }
    for (const [id, mk] of dots.current) if (!seen.has(id)) (mk.setMap(null), dots.current.delete(id));
    showDots();
    m.setOptions({ draggableCursor: props.current.picking ? "crosshair" : undefined });
  }

  /** Exact spots show at street level; spots on your route and the one you opened always show. */
  function showDots() {
    const m = map.current;
    if (!m) return;
    const { checks, selectedRoute, selectedFlood } = props.current;
    const hitIds = new Set((checks?.[selectedRoute]?.hits ?? []).map((h) => h.flood.id));
    const zoomedIn = (m.getZoom() ?? 12) >= 14;
    for (const [id, mk] of dots.current) mk.setVisible(zoomedIn || hitIds.has(id) || id === selectedFlood);
  }

  function setOverlay(key: string, pos: LatLng | null) {
    const m = map.current;
    const O = Overlay.current;
    if (!m || !O) return;
    const ex = overlays.current[key];
    if (!pos) {
      ex?.setMap(null);
      delete overlays.current[key];
      return;
    }
    if (ex) ex.move(pos);
    else {
      const o = new O(markerEl(key), pos, key === "pin");
      o.setMap(m);
      overlays.current[key] = o;
    }
  }
  function syncMarkers() {
    setOverlay("origin", props.current.origin);
    setOverlay("destination", props.current.destination);
    setOverlay("me", props.current.me);
    setOverlay("pin", props.current.pin);
  }

  useEffect(sync, [p.floods, p.checks, p.selectedRoute, p.selectedFlood, p.picking]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(syncMarkers, [p.origin, p.destination, p.me, p.pin]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current;
    if (!m || !p.fit || !p.fit.points.length) return;
    const b = new google.maps.LatLngBounds();
    p.fit.points.forEach((pt) => b.extend(pt));
    m.fitBounds(b, { top: 60, bottom: 60, left: 40, right: 40 });
  }, [p.fit?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current;
    if (!m || !p.focus) return;
    m.panTo(p.focus.point);
    if ((m.getZoom() ?? 12) < (p.focus.zoom ?? 14.5)) m.setZoom(Math.round(p.focus.zoom ?? 15));
  }, [p.focus?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className="map-canvas" aria-label="Map of flooded roads" />;
}
