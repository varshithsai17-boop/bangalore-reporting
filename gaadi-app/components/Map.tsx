"use client";
import type { FeatureCollection } from "geojson";
import { LngLatBounds, Map as MLMap, Marker, NavigationControl, setWorkerUrl, type ExpressionSpecification, type GeoJSONSource, type MapLayerMouseEvent, type MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { CATEGORY_INFO, MIN_CHECKINS, NO_DATA, SCORE_STOPS } from "@/lib/constants";
import type { LatLng, Spot, WardStat } from "@/lib/types";

setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
const STYLE = "https://tiles.openfreemap.org/styles/positron";

export type MapMode = "van" | "spots";

export type MapProps = {
  mode: MapMode;
  stats: WardStat[];
  spots: Spot[];
  home: LatLng | null;
  pin: LatLng | null;
  picking: boolean;
  selectedSpot: string | null;
  selectedWard: string | null;
  onPick: (p: LatLng) => void;
  onSpot: (id: string) => void;
  onWard: (id: string) => void;
  focus: { key: number; point: LatLng; zoom?: number } | null;
  fitWard: { key: number; id: string } | null;
  onError: (msg: string) => void;
};

const scoreExpr: ExpressionSpecification = [
  "case",
  ["<", ["coalesce", ["feature-state", "n"], 0], MIN_CHECKINS],
  NO_DATA,
  ["step", ["coalesce", ["feature-state", "score"], 0], ...SCORE_STOPS.flatMap(([t, c], i) => (i === 0 ? [c] : [t, c]))],
] as unknown as ExpressionSpecification;

export default function GaadiMap(p: MapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const ready = useRef(false);
  const wards = useRef<FeatureCollection | null>(null);
  const markers = useRef<Record<string, Marker>>({});
  const props = useRef(p);
  props.current = p;

  useEffect(() => {
    if (!el.current) return;
    const m = new MLMap({
      container: el.current,
      style: STYLE,
      center: [77.5946, 12.9716],
      zoom: 10.4,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    m.touchZoomRotate.disableRotation();
    m.addControl(new NavigationControl({ showCompass: false }), "top-right");
    // Individual tile or icon errors are normal; only complain if the map never gets going.
    m.on("error", (e: { error?: unknown }) => console.warn(e.error));
    const failTimer = setTimeout(() => {
      if (!ready.current) props.current.onError("The map couldn't load. Check your connection.");
    }, 15000);
    m.once("style.load", async () => {
      m.addSource("wards", { type: "geojson", data: { type: "FeatureCollection", features: [] }, promoteId: "id" });
      m.addSource("spots", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "ward-fill", type: "fill", source: "wards",
        paint: { "fill-color": scoreExpr, "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.85, 0.62] } });
      m.addLayer({ id: "ward-line", type: "line", source: "wards",
        paint: { "line-color": ["case", ["boolean", ["feature-state", "selected"], false], "#15241b", "#ffffff"],
          // "zoom" must be the outermost input, so the selected-ward check goes inside each stop.
          "line-width": ["interpolate", ["linear"], ["zoom"],
            10, ["case", ["boolean", ["feature-state", "selected"], false], 2.4, 0.4],
            14, ["case", ["boolean", ["feature-state", "selected"], false], 3, 1.4]] } });
      m.addLayer({ id: "spot-dot", type: "circle", source: "spots",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, ["case", ["get", "open"], 3.5, 2.5], 15, ["case", ["get", "open"], 9, 6]],
          "circle-color": ["case", ["get", "open"], ["get", "color"], "#9aa59d"],
          "circle-stroke-color": ["case", ["get", "selected"], "#15241b", "#ffffff"],
          "circle-stroke-width": ["case", ["get", "selected"], 3, 1.5],
          "circle-opacity": ["case", ["get", "open"], 1, 0.75],
        } });
      m.on("click", "spot-dot", (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id;
        if (id && !props.current.picking && props.current.mode === "spots") {
          e.preventDefault();
          props.current.onSpot(String(id));
        }
      });
      m.on("click", "ward-fill", (e: MapLayerMouseEvent) => {
        if (e.defaultPrevented || props.current.picking || props.current.mode !== "van") return;
        const id = e.features?.[0]?.properties?.id;
        if (id) props.current.onWard(String(id));
      });
      m.on("click", (e: MapMouseEvent) => {
        if (props.current.picking) props.current.onPick({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      });
      for (const layer of ["spot-dot", "ward-fill"]) {
        m.on("mouseenter", layer, () => !props.current.picking && (m.getCanvas().style.cursor = "pointer"));
        m.on("mouseleave", layer, () => !props.current.picking && (m.getCanvas().style.cursor = ""));
      }
      ready.current = true;
      try {
        const res = await fetch("/api/wards");
        wards.current = await res.json();
        (m.getSource("wards") as GeoJSONSource | undefined)?.setData(wards.current!);
      } catch {
        props.current.onError("Ward boundaries couldn't load.");
      }
      sync();
    });
    map.current = m;
    return () => {
      clearTimeout(failTimer);
      m.remove();
      map.current = null;
      ready.current = false;
    };
  }, []);

  const lastSelectedWard = useRef<string | null>(null);
  function sync() {
    const m = map.current;
    if (!m || !ready.current || !m.getSource("wards")) return;
    const { stats, spots, mode, selectedSpot, selectedWard, picking } = props.current;
    if (wards.current) {
      for (const s of stats) m.setFeatureState({ source: "wards", id: s.ward_id }, { score: s.score ?? 0, n: s.checkins });
      if (lastSelectedWard.current && lastSelectedWard.current !== selectedWard)
        m.setFeatureState({ source: "wards", id: lastSelectedWard.current }, { selected: false });
      if (selectedWard) m.setFeatureState({ source: "wards", id: selectedWard }, { selected: true });
      lastSelectedWard.current = selectedWard;
    }
    (m.getSource("spots") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: mode === "spots"
        ? spots.map((s) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [s.lng, s.lat] },
            properties: { id: s.id, color: CATEGORY_INFO[s.category].color, open: s.status === "open", selected: s.id === selectedSpot },
          }))
        : [],
    });
    m.setPaintProperty("ward-fill", "fill-opacity", mode === "van"
      ? ["case", ["boolean", ["feature-state", "selected"], false], 0.85, 0.62]
      : 0.08);
    m.getCanvas().style.cursor = picking ? "crosshair" : "";
  }

  function setMarker(key: string, pos: LatLng | null) {
    const m = map.current;
    if (!m) return;
    const ex = markers.current[key];
    if (!pos) {
      ex?.remove();
      delete markers.current[key];
      return;
    }
    if (ex) ex.setLngLat([pos.lng, pos.lat]);
    else {
      const d = document.createElement("div");
      d.className = `mk mk-${key}`;
      if (key === "pin")
        d.innerHTML = '<svg width="30" height="40" viewBox="0 0 30 40" aria-hidden="true"><path d="M15 39S2 23.5 2 14.5a13 13 0 0 1 26 0C28 23.5 15 39 15 39z" fill="#15241b" stroke="#fff" stroke-width="2"/><circle cx="15" cy="14.5" r="5" fill="#f2c230"/></svg>';
      markers.current[key] = new Marker({ element: d, anchor: key === "pin" ? "bottom" : "center" }).setLngLat([pos.lng, pos.lat]).addTo(m);
    }
  }

  useEffect(sync, [p.stats, p.spots, p.mode, p.selectedSpot, p.selectedWard, p.picking]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setMarker("home", p.home), [p.home]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setMarker("pin", p.pin), [p.pin]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current;
    if (!m || !p.focus) return;
    m.easeTo({ center: [p.focus.point.lng, p.focus.point.lat], zoom: Math.max(m.getZoom(), p.focus.zoom ?? 15), duration: 500 });
  }, [p.focus?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current;
    const f = wards.current?.features.find((x) => x.properties?.id === p.fitWard?.id);
    if (!m || !f || f.geometry.type === "GeometryCollection" || f.geometry.type === "Point") return;
    const b = new LngLatBounds();
    const g = f.geometry;
    const rings = g.type === "Polygon" ? g.coordinates : g.type === "MultiPolygon" ? g.coordinates.flat() : [];
    for (const r of rings) for (const [x, y] of r as number[][]) b.extend([x, y]);
    m.fitBounds(b, { padding: 50, maxZoom: 15, duration: 600 });
  }, [p.fitWard?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className="map-canvas" aria-label="Map of Bengaluru wards and garbage spots" />;
}
