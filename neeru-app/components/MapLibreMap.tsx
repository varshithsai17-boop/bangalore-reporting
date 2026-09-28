"use client";
import { LngLatBounds, Map as MLMap, Marker, NavigationControl, setWorkerUrl, type ExpressionSpecification, type GeoJSONSource, type MapLayerMouseEvent, type MapMouseEvent } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { DEPTH_INFO } from "@/lib/depth";
import { BLR_CENTER } from "@/lib/geo";
import type { LatLng } from "@/lib/types";
import { ROUTE_ALT, ROUTE_SELECTED, type MapProps } from "./mapTypes";
import { markerEl } from "./markers";

const STYLE = "https://tiles.openfreemap.org/styles/dark";
// Served from /public by scripts/copy-maplibre-worker.mjs
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

/** Free map: MapLibre GL with OpenFreeMap vector tiles (OpenStreetMap data). */
export default function MapLibreMap(p: MapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const ready = useRef(false);
  const markers = useRef<Record<string, Marker>>({});
  const props = useRef(p);
  props.current = p;

  // Create the map once.
  useEffect(() => {
    if (!el.current) return;
    const m = new MLMap({
      container: el.current,
      style: STYLE,
      center: [BLR_CENTER.lng, BLR_CENTER.lat],
      zoom: 11.2,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    m.touchZoomRotate.disableRotation();
    m.addControl(new NavigationControl({ showCompass: false }), "top-right");
    m.on("error", (e: { error?: unknown }) => {
      if (!ready.current) props.current.onError("The map couldn't load. Check your connection.");
      console.warn(e.error);
    });
    // "style.load" fires as soon as the style is parsed; "load" waits for every tile and sprite and can stall on slow networks.
    m.once("style.load", () => {
      m.addSource("routes", { type: "geojson", data: empty() });
      m.addSource("floods", { type: "geojson", data: empty() });
      // Heat sits under the routes so the route line stays readable on top of it.
      m.addLayer({ id: "flood-heat", type: "heatmap", source: "floods", maxzoom: 18,
        paint: {
          "heatmap-weight": ["get", "weight"],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 9, 2.2, 12, 3, 15, 3.6],
          // Radius grows with zoom so a hotspot covers roughly the same ground (a few hundred metres).
          "heatmap-radius": ["interpolate", ["exponential", 2], ["zoom"], 9, 14, 11, 26, 13, 50, 15, 120, 17, 320],
          "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(127,208,230,0)", 0.12, "rgba(127,208,230,0.28)", 0.3, "rgba(127,208,230,0.55)",
            0.5, "rgba(242,179,61,0.75)", 0.7, "rgba(242,116,58,0.85)", 0.9, "rgba(229,72,77,0.92)", 1, "rgb(255,90,95)"],
          "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0.95, 16, 0.55],
        } });
      m.addLayer({ id: "route-casing", type: "line", source: "routes", layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#0b141c", "line-width": ["case", ["get", "selected"], 10, 7] } });
      m.addLayer({ id: "route-line", type: "line", source: "routes", layout: { "line-cap": "round", "line-join": "round", "line-sort-key": ["case", ["get", "selected"], 1, 0] },
        paint: { "line-color": ["case", ["get", "selected"], ROUTE_SELECTED, ROUTE_ALT], "line-width": ["case", ["get", "selected"], 5.5, 4] } });
      // Exact spots appear once you zoom in to street level. Spots on your route and the one you opened always show.
      const show = (visible: number): ExpressionSpecification =>
        ["interpolate", ["linear"], ["zoom"], 12.5, ["case", ["any", ["get", "hit"], ["get", "selected"]], visible, 0], 14, visible];
      m.addLayer({ id: "flood-dot", type: "circle", source: "floods",
        paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, ["+", 3, ["*", 0.6, ["get", "size"]]], 16, ["+", 7, ["get", "size"]]],
          "circle-color": ["get", "color"], "circle-stroke-color": ["case", ["get", "selected"], "#ffffff", "#0b141c"],
          "circle-stroke-width": ["case", ["get", "selected"], 2.5, 1.5],
          "circle-opacity": show(1), "circle-stroke-opacity": show(1) } });
      m.on("click", "flood-dot", (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id;
        if (id && !props.current.picking) props.current.onFlood(String(id));
      });
      m.on("click", "route-line", (e: MapLayerMouseEvent) => {
        const i = e.features?.[0]?.properties?.index;
        if (i !== undefined && !props.current.picking) props.current.onRoute(Number(i));
      });
      for (const layer of ["flood-dot", "route-line"]) {
        m.on("mouseenter", layer, () => (m.getCanvas().style.cursor = "pointer"));
        m.on("mouseleave", layer, () => (m.getCanvas().style.cursor = ""));
      }
      m.on("click", (e: MapMouseEvent) => {
        if (props.current.picking) props.current.onPick({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      });
      ready.current = true;
      sync();
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      ready.current = false;
    };
  }, []);

  function sync() {
    const m = map.current;
    if (!m || !ready.current) return;
    const { floods, checks, selectedRoute, selectedFlood } = props.current;
    const hitIds = new Set((checks?.[selectedRoute]?.hits ?? []).map((h) => h.flood.id));
    (m.getSource("floods") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: floods.map((f) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [f.lng, f.lat] },
        properties: {
          id: f.id,
          color: DEPTH_INFO[f.depth].color,
          size: DEPTH_INFO[f.depth].rank * 1.2,
          // Heat = how deep × how sure we are (more recent confirmations, more heat).
          weight: (DEPTH_INFO[f.depth].rank / 4) * Math.min(1, 0.45 + 0.12 * f.still),
          hit: hitIds.has(f.id),
          selected: f.id === selectedFlood,
        },
      })),
    });
    (m.getSource("routes") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: (checks ?? []).map((c, i) => ({
        type: "Feature",
        geometry: { type: "LineString", coordinates: c.route.path.map(([lat, lng]) => [lng, lat]) },
        properties: { index: i, selected: i === selectedRoute },
      })),
    });
    m.getCanvas().style.cursor = props.current.picking ? "crosshair" : "";
  }

  function setMarker(key: string, pos: LatLng | null) {
    const m = map.current;
    if (!m) return;
    const existing = markers.current[key];
    if (!pos) {
      existing?.remove();
      delete markers.current[key];
      return;
    }
    if (existing) existing.setLngLat([pos.lng, pos.lat]);
    else markers.current[key] = new Marker({ element: markerEl(key), anchor: key === "pin" ? "bottom" : "center" }).setLngLat([pos.lng, pos.lat]).addTo(m);
  }

  useEffect(sync, [p.floods, p.checks, p.selectedRoute, p.selectedFlood, p.picking]);
  useEffect(() => setMarker("origin", p.origin), [p.origin]);
  useEffect(() => setMarker("destination", p.destination), [p.destination]);
  useEffect(() => setMarker("me", p.me), [p.me]);
  useEffect(() => setMarker("pin", p.pin), [p.pin]);

  useEffect(() => {
    const m = map.current;
    if (!m || !p.fit || p.fit.points.length === 0) return;
    const b = new LngLatBounds();
    p.fit.points.forEach((pt) => b.extend([pt.lng, pt.lat]));
    m.fitBounds(b, { padding: { top: 60, bottom: 60, left: 40, right: 40 }, maxZoom: 15, duration: 600 });
  }, [p.fit?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current;
    if (!m || !p.focus) return;
    m.easeTo({ center: [p.focus.point.lng, p.focus.point.lat], zoom: Math.max(m.getZoom(), p.focus.zoom ?? 14.5), duration: 500 });
  }, [p.focus?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className="map-canvas" aria-label="Map of flooded roads" />;
}

const empty = (): FeatureCollection => ({ type: "FeatureCollection", features: [] });
