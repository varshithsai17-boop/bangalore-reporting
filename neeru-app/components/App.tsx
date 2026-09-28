"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { blocks, DEPTH_INFO, DEPTHS } from "@/lib/depth";
import { checkRoutes } from "@/lib/floodCheck";
import { distM, formatKm, formatMin, inBengaluru, pointAlong, timeAgo } from "@/lib/geo";
import type { Depth, Flood, LatLng, Place, Route, RouteCheck, TravelMode } from "@/lib/types";
import type { MapProps } from "./mapTypes";
import PlaceInput from "./PlaceInput";

const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || "";
const Loading = () => <div className="map-canvas map-loading" />;
const MapLibreMap = dynamic(() => import("./MapLibreMap"), { ssr: false, loading: Loading });
const GoogleMap = dynamic(() => import("./GoogleMap"), { ssr: false, loading: Loading });
function MapView(p: MapProps) {
  return GOOGLE_KEY ? <GoogleMap {...p} apiKey={GOOGLE_KEY} /> : <MapLibreMap {...p} />;
}

type Panel = "trip" | "report" | "spot";

export default function App() {
  /* ---------- live floods ---------- */
  const [floods, setFloods] = useState<Flood[]>([]);
  const [floodsAt, setFloodsAt] = useState<number | null>(null);
  const [floodsErr, setFloodsErr] = useState<string | null>(null);
  const [, tick] = useState(0);

  const loadFloods = useCallback(async () => {
    try {
      const r = await api.floods();
      setFloods(r.floods);
      setFloodsAt(Date.now());
      setFloodsErr(null);
    } catch (e) {
      setFloodsErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    loadFloods();
    const t = setInterval(() => document.visibilityState === "visible" && loadFloods(), 30_000);
    const t2 = setInterval(() => tick((n) => n + 1), 15_000);
    const onVis = () => document.visibilityState === "visible" && loadFloods();
    document.addEventListener("visibilitychange", onVis);
    return () => (clearInterval(t), clearInterval(t2), document.removeEventListener("visibilitychange", onVis));
  }, [loadFloods]);

  /* ---------- trip ---------- */
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
  const [mode, setMode] = useState<TravelMode>("car");
  const [routes, setRoutes] = useState<Route[] | null>(null);
  const [routing, setRouting] = useState(false);
  const [routeErr, setRouteErr] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const reqId = useRef(0);

  useEffect(() => {
    try {
      const m = localStorage.getItem("neeru:mode");
      if (m === "bike" || m === "car") setMode(m);
    } catch {}
  }, []);
  const chooseMode = (m: TravelMode) => {
    setMode(m);
    try {
      localStorage.setItem("neeru:mode", m);
    } catch {}
  };

  const result = useMemo(() => (routes ? checkRoutes(routes, floods, mode) : null), [routes, floods, mode]);
  const fastest = useMemo(() => (routes ? routes.reduce((b, r, i) => (r.durationSec < routes[b].durationSec ? i : b), 0) : 0), [routes]);

  /* ---------- map state ---------- */
  const [me, setMe] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [fit, setFit] = useState<MapProps["fit"]>(null);
  const [focus, setFocus] = useState<MapProps["focus"]>(null);
  const [mapErr, setMapErr] = useState<string | null>(null);

  const [panel, setPanel] = useState<Panel>("trip");
  const [spotId, setSpotId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [about, setAbout] = useState(false);
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = (msg: string) => {
    setToast(msg);
    if (toastT.current) clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(null), 3200);
  };
  const panelRef = useRef<HTMLDivElement>(null);
  const showPanel = () => {
    if (window.matchMedia("(max-width: 899px)").matches) panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const locate = useCallback(
    (): Promise<LatLng | null> =>
      new Promise((resolve) => {
        if (!("geolocation" in navigator)) {
          say("Your browser can't share location. Search for a place instead.");
          return resolve(null);
        }
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setMe(p);
            setLocating(false);
            resolve(p);
          },
          (err) => {
            setLocating(false);
            say(err.code === 1 ? "Location is blocked. Allow it in your browser settings, or search for a place." : "Couldn't find your location. Search for a place instead.");
            resolve(null);
          },
          { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
        );
      }),
    [],
  );

  const useMyLocationAsFrom = async () => {
    const p = await locate();
    if (p) setFrom({ title: "Your location", lat: p.lat, lng: p.lng });
  };

  /* ---------- fetch routes when both ends are set ---------- */
  useEffect(() => {
    if (!from || !to) {
      setRoutes(null);
      setRouteErr(null);
      return;
    }
    const id = ++reqId.current;
    setRouting(true);
    setRouteErr(null);
    api
      .route(from, to, mode)
      .then((r) => {
        if (id !== reqId.current) return;
        setRoutes(r.routes);
        const rec = checkRoutes(r.routes, floods, mode).recommended;
        setSelected(rec);
        const pts: LatLng[] = [];
        for (const rt of r.routes) for (let i = 0; i < rt.path.length; i += Math.max(1, Math.floor(rt.path.length / 40))) pts.push({ lat: rt.path[i][0], lng: rt.path[i][1] });
        setFit({ key: Date.now(), points: pts });
        setPanel("trip");
      })
      .catch((e) => id === reqId.current && (setRoutes(null), setRouteErr((e as Error).message)))
      .finally(() => id === reqId.current && setRouting(false));
    // floods intentionally not a dependency: new reports re-check the same routes without refetching.
  }, [from, to, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const selRoute = result?.checks[selected] ?? null;
  const endpoints = useMemo(() => {
    const r = routes?.[0];
    const start = from?.lat != null ? { lat: from.lat, lng: from.lng! } : r ? { lat: r.path[0][0], lng: r.path[0][1] } : null;
    const end = to?.lat != null ? { lat: to.lat, lng: to.lng! } : r ? { lat: r.path[r.path.length - 1][0], lng: r.path[r.path.length - 1][1] } : null;
    return { start, end };
  }, [from, to, routes]);

  /* ---------- report ---------- */
  const [pin, setPin] = useState<LatLng | null>(null);
  const [pinLabel, setPinLabel] = useState<string | null>(null);
  const [depth, setDepth] = useState<Depth | null>(null);
  const [sending, setSending] = useState(false);

  const startReport = async () => {
    setPanel("report");
    setSpotId(null);
    setDepth(null);
    setPin(null);
    setPinLabel(null);
    showPanel();
    const p = me ?? (await locate());
    if (p && inBengaluru(p)) {
      setPin(p);
      setFocus({ key: Date.now(), point: p, zoom: 16 });
    }
  };

  useEffect(() => {
    if (!pin) return;
    let live = true;
    const t = setTimeout(() => {
      api.reverse(pin.lat, pin.lng).then((r) => live && setPinLabel(r.label)).catch(() => {});
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [pin]);

  const sendReport = async () => {
    if (!pin || !depth) return;
    if (!inBengaluru(pin)) return say("That spot is outside Bengaluru.");
    setSending(true);
    try {
      const r = await api.report(pin.lat, pin.lng, depth, pinLabel);
      say(r.merged ? "Thanks. Added to a spot others already reported." : "Thanks. Your report is on the map.");
      await loadFloods();
      setPanel("spot");
      setSpotId(r.spot_id);
      setPin(null);
    } catch (e) {
      say((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  /* ---------- spot ---------- */
  const spot = floods.find((f) => f.id === spotId) ?? null;
  const openSpot = (id: string) => {
    const f = floods.find((x) => x.id === id);
    if (!f) return;
    setSpotId(id);
    setPanel("spot");
    setFocus({ key: Date.now(), point: { lat: f.lat, lng: f.lng }, zoom: 15 });
    showPanel();
  };
  const [voting, setVoting] = useState(false);
  const [changeDepth, setChangeDepth] = useState(false);
  const vote = async (kind: "flooded" | "clear", d?: Depth) => {
    if (!spot) return;
    setVoting(true);
    try {
      await api.vote(spot.id, kind, d);
      say(kind === "clear" ? "Thanks. It clears once others agree." : "Thanks for confirming.");
      setChangeDepth(false);
      await loadFloods();
    } catch (e) {
      say((e as Error).message);
    } finally {
      setVoting(false);
    }
  };

  const share = async (text: string) => {
    const url = window.location.origin;
    try {
      if (navigator.share) return await navigator.share({ text, url });
    } catch {
      return;
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      say("Copied. Paste it anywhere.");
    } catch {
      say("Couldn't copy on this browser.");
    }
  };

  const mapProps: MapProps = {
    floods,
    checks: result?.checks ?? null,
    selectedRoute: selected,
    origin: endpoints.start,
    destination: endpoints.end,
    me,
    pin: panel === "report" ? pin : null,
    picking: panel === "report",
    selectedFlood: panel === "spot" ? spotId : null,
    onPick: (p) => setPin(p),
    onFlood: openSpot,
    onRoute: (i) => setSelected(i),
    fit,
    focus,
    onError: setMapErr,
  };

  const worst = floods.reduce<Depth | null>((w, f) => (!w || DEPTH_INFO[f.depth].rank > DEPTH_INFO[w].rank ? f.depth : w), null);

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <div className="word">
            Nee<span>ru</span>
          </div>
          <div className="kn" lang="kn">
            ನೀರು
          </div>
        </div>
        <div className="top-right">
          <span className={`live ${floods.length ? "wet" : ""}`} aria-live="polite">
            <i aria-hidden="true" style={worst ? { background: DEPTH_INFO[worst].color } : undefined} />
            {floodsErr && !floodsAt
              ? "Reports unavailable"
              : floods.length
                ? `${floods.length} flooded ${floods.length === 1 ? "spot" : "spots"}`
                : floodsAt
                  ? "No flooding reported"
                  : "Loading reports…"}
            {floodsAt && <em> · {timeAgo(new Date(floodsAt).toISOString())}</em>}
          </span>
          <button className="linkish" onClick={() => setAbout(true)}>
            How it works
          </button>
        </div>
      </header>

      <main className="main">
        <section className="mapwrap">
          <MapView {...mapProps} />
          {panel === "report" && <div className="map-hint">{pin ? "Tap the map to move the pin" : "Tap the map where the water is"}</div>}
          {mapErr && <div className="map-err">{mapErr}</div>}
          <div className="legend" aria-label="Heat shows how deep the water is and how many people confirmed it">
            <span className="legend-bar" aria-hidden="true" />
            <span className="legend-labels">
              <span>Ankle</span>
              <span>Knee</span>
              <span>Waist</span>
              <span>Closed</span>
            </span>
          </div>
        </section>

        <aside className="panel" ref={panelRef}>
          {panel === "trip" && (
            <>
              <div className="card trip">
                <PlaceInput label="From" placeholder="Where are you starting?" value={from} onChange={setFrom} onUseLocation={useMyLocationAsFrom} locating={locating && !from} />
                <button
                  className="swap"
                  aria-label="Swap start and destination"
                  onClick={() => {
                    setFrom(to);
                    setTo(from);
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" />
                  </svg>
                </button>
                <PlaceInput label="To" placeholder="Where are you going?" value={to} onChange={setTo} />
                <div className="modes" role="radiogroup" aria-label="Vehicle">
                  {(["car", "bike"] as TravelMode[]).map((m) => (
                    <button key={m} role="radio" aria-checked={mode === m} onClick={() => chooseMode(m)}>
                      {m === "car" ? "Car" : "Two-wheeler"}
                    </button>
                  ))}
                </div>
              </div>

              {routing && (
                <div className="card status">
                  <span className="spinner" aria-hidden="true" /> Checking your route against live reports…
                </div>
              )}
              {!routing && routeErr && <div className="card status err">{routeErr}</div>}

              {!routing && result && selRoute && (
                <RouteResult
                  checks={result.checks}
                  selected={selected}
                  recommended={result.recommended}
                  fastest={fastest}
                  mode={mode}
                  floodCount={floods.length}
                  onSelect={setSelected}
                  onSpot={openSpot}
                  gmaps={gmapsUrl(from, to, selRoute.route, selected !== 0)}
                  onShare={() => share(verdictText(selRoute, mode, to?.title))}
                />
              )}

              {!routes && !routing && (
                <FloodList floods={floods} loaded={!!floodsAt} err={floodsErr} onSpot={openSpot} onReport={startReport} />
              )}
            </>
          )}

          {panel === "report" && (
            <div className="card report">
              <div className="row-between">
                <h2>Report water</h2>
                <button className="linkish" onClick={() => setPanel("trip")}>
                  Cancel
                </button>
              </div>
              <p className="muted">Only report water you can see right now. Stay somewhere safe, and never use your phone while riding or driving.</p>
              <div className="where">
                <span className="lbl">Where</span>
                {pin ? (
                  <>
                    <strong>{pinLabel || `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`}</strong>
                    {me && distM(me, pin) > 1500 && <span className="warn">This is {formatKm(distM(me, pin))} from you.</span>}
                  </>
                ) : (
                  <strong className="muted">{locating ? "Finding you…" : "Tap the map where the water is"}</strong>
                )}
              </div>
              <span className="lbl">How deep is it?</span>
              <div className="depths">
                {DEPTHS.map((d) => (
                  <button key={d} aria-pressed={depth === d} onClick={() => setDepth(d)}>
                    <DepthGlyph depth={d} />
                    <b>{DEPTH_INFO[d].short}</b>
                    <small>{DEPTH_INFO[d].range}</small>
                  </button>
                ))}
              </div>
              <button className="btn primary" disabled={!pin || !depth || sending} onClick={sendReport}>
                {sending ? "Sending…" : "Send report"}
              </button>
            </div>
          )}

          {panel === "spot" && (
            <div className="card spot">
              <div className="row-between">
                <span className="lbl">{spot ? `First reported ${timeAgo(spot.first_at)}` : ""}</span>
                <button className="linkish" onClick={() => setPanel("trip")}>
                  Back
                </button>
              </div>
              {!spot ? (
                <p className="muted">This spot has cleared.</p>
              ) : (
                <>
                  <h2>{spot.label || "Unnamed road"}</h2>
                  <div className="spot-grid">
                    <Gauge depth={spot.depth} />
                    <div className="facts">
                      <div>
                        <span>Depth</span>
                        <strong style={{ color: DEPTH_INFO[spot.depth].color }}>{DEPTH_INFO[spot.depth].label}</strong>
                      </div>
                      <div>
                        <span>Confirmed</span>
                        <strong>
                          {spot.still} in 90 min
                        </strong>
                      </div>
                      <div>
                        <span>Last report</span>
                        <strong>{timeAgo(spot.last_at)}</strong>
                      </div>
                      <div>
                        <span>Says it's gone</span>
                        <strong>{spot.gone}</strong>
                      </div>
                    </div>
                  </div>
                  <p className="advice">
                    <b>Car:</b> {DEPTH_INFO[spot.depth].car}
                    <br />
                    <b>Two-wheeler:</b> {DEPTH_INFO[spot.depth].bike}
                  </p>
                  {spot.still < 2 && <p className="muted small">Only one person has reported this so far. Treat it as unconfirmed.</p>}
                  <span className="lbl">Are you here now?</span>
                  {!changeDepth ? (
                    <div className="two">
                      <button className="btn" disabled={voting} onClick={() => vote("flooded")}>
                        Still flooded
                      </button>
                      <button className="btn" disabled={voting} onClick={() => vote("clear")}>
                        Water's gone
                      </button>
                      <button className="linkish span2" onClick={() => setChangeDepth(true)}>
                        It's a different depth now
                      </button>
                    </div>
                  ) : (
                    <div className="depths">
                      {DEPTHS.map((d) => (
                        <button key={d} disabled={voting} onClick={() => vote("flooded", d)}>
                          <DepthGlyph depth={d} />
                          <b>{DEPTH_INFO[d].short}</b>
                          <small>{DEPTH_INFO[d].range}</small>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="two">
                    <button className="btn" onClick={() => share(spotText(spot))}>
                      Share alert
                    </button>
                    <a className="btn" target="_blank" rel="noopener noreferrer" href={`https://x.com/intent/tweet?text=${encodeURIComponent(spotText(spot) + " #BengaluruRains")}&url=${encodeURIComponent(typeof window !== "undefined" ? window.location.origin : "")}`}>
                      Post on X
                    </a>
                  </div>
                </>
              )}
            </div>
          )}
        </aside>
      </main>

      {panel !== "report" && (
        <button className="fab" onClick={startReport}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M3 15c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M3 20c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M12 3v8M8.5 7.5 12 11l3.5-3.5" />
          </svg>
          Report water here
        </button>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {about && <About onClose={() => setAbout(false)} />}
    </div>
  );
}

/* ================================================================== pieces */

function RouteResult(p: {
  checks: RouteCheck[];
  selected: number;
  recommended: number;
  fastest: number;
  mode: TravelMode;
  floodCount: number;
  onSelect: (i: number) => void;
  onSpot: (id: string) => void;
  gmaps: string;
  onShare: () => void;
}) {
  const c = p.checks[p.selected];
  const rec = p.checks[p.recommended];
  const fast = p.checks[p.fastest];
  const blockers = c.hits.filter((h) => blocks(h.flood.depth, p.mode));
  const tone = c.hits.length === 0 ? "clear" : blockers.length ? "bad" : "warn";
  const letter = (i: number) => String.fromCharCode(65 + i);
  const extra = Math.round((rec.route.durationSec - fast.route.durationSec) / 60);

  return (
    <div className="result">
      {p.recommended !== p.selected && (
        <button className="card suggest" onClick={() => p.onSelect(p.recommended)}>
          <b>Route {letter(p.recommended)} is drier.</b>{" "}
          {rec.hits.length === 0 ? "No flooding reported on it" : `${rec.hits.length} minor ${rec.hits.length === 1 ? "spot" : "spots"}`}
          {p.recommended !== p.fastest && extra > 0 ? `, about ${extra} min longer.` : "."} Switch to it
        </button>
      )}

      <div className={`card verdict ${tone}`}>
        <span className="lbl">
          Route {letter(p.selected)} · {formatMin(c.route.durationSec)} · {formatKm(c.route.distanceM)}
        </span>
        <h2>
          {tone === "clear"
            ? "No flooding reported on this route"
            : `${c.hits.length} flooded ${c.hits.length === 1 ? "spot" : "spots"} on this route`}
        </h2>
        <p className="muted small">
          {tone === "clear"
            ? `Checked against ${p.floodCount} live ${p.floodCount === 1 ? "report" : "reports"} across the city. Rain moves fast, so check again before you leave.`
            : blockers.length
              ? `${blockers.length} of them ${blockers.length === 1 ? "is" : "are"} too deep for a ${p.mode === "bike" ? "two-wheeler" : "car"}.`
              : `Passable with care in a ${p.mode === "bike" ? "two-wheeler" : "car"}.`}
        </p>
        {c.hits.length > 0 && (
          <ol className="hits">
            {c.hits.map((h) => (
              <li key={h.flood.id}>
                <button onClick={() => p.onSpot(h.flood.id)}>
                  <i style={{ background: DEPTH_INFO[h.flood.depth].color }} />
                  <span>
                    <b>{h.flood.label || "Unnamed road"}</b>
                    <small>
                      {DEPTH_INFO[h.flood.depth].label} · {p.mode === "bike" ? DEPTH_INFO[h.flood.depth].bike : DEPTH_INFO[h.flood.depth].car}
                    </small>
                  </span>
                  <span className="meta">
                    in {formatKm(h.alongM)}
                    <small>{timeAgo(h.flood.last_at)}</small>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
        <div className="two">
          <a className="btn primary" href={p.gmaps} target="_blank" rel="noopener noreferrer">
            Open in Google Maps
          </a>
          <button className="btn" onClick={p.onShare}>
            Share
          </button>
        </div>
      </div>

      {p.checks.length > 1 && (
        <div className="card routes">
          <span className="lbl">Other routes</span>
          {p.checks.map((ck, i) => (
            <button key={ck.route.id} className="route-opt" aria-pressed={i === p.selected} onClick={() => p.onSelect(i)}>
              <b>{letter(i)}</b>
              <span>
                {ck.route.summary}
                <small>
                  {formatMin(ck.route.durationSec)} · {formatKm(ck.route.distanceM)}
                  {i === p.fastest ? " · fastest" : ""}
                </small>
              </span>
              <span className={`tag ${ck.hits.length === 0 ? "ok" : ck.hits.some((h) => blocks(h.flood.depth, p.mode)) ? "bad" : "warn"}`}>
                {ck.hits.length === 0 ? "Clear" : `${ck.hits.length} flooded`}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FloodList(p: { floods: Flood[]; loaded: boolean; err: string | null; onSpot: (id: string) => void; onReport: () => void }) {
  if (p.err && !p.loaded) return <div className="card status err">{p.err}</div>;
  if (!p.loaded) return <div className="card status"><span className="spinner" aria-hidden="true" /> Loading live reports…</div>;
  if (!p.floods.length)
    return (
      <div className="card empty">
        <h2>No flooding reported right now</h2>
        <p className="muted">When it rains, people standing at a flooded road report how deep it is. Reports expire after 3 hours, or sooner when people say the water's gone.</p>
        <button className="btn" onClick={p.onReport}>
          See water? Report it
        </button>
      </div>
    );
  return (
    <div className="card list">
      <span className="lbl">Flooded now · deepest first</span>
      <ol className="hits">
        {p.floods.map((f) => (
          <li key={f.id}>
            <button onClick={() => p.onSpot(f.id)}>
              <i style={{ background: DEPTH_INFO[f.depth].color }} />
              <span>
                <b>{f.label || "Unnamed road"}</b>
                <small>
                  {DEPTH_INFO[f.depth].label} · {f.still} confirmed in 90 min
                </small>
              </span>
              <span className="meta">{timeAgo(f.last_at)}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Staff gauge, like the depth posts at flood-prone underpasses. */
function Gauge({ depth }: { depth: Depth }) {
  const cm = { ankle: 12, knee: 35, waist: 70, closed: 110 }[depth];
  const H = 110;
  const max = 120;
  const y = 6 + H - (Math.min(cm, max) / max) * H;
  return (
    <svg width="64" height="128" viewBox="0 0 64 128" role="img" aria-label={`${DEPTH_INFO[depth].label}, ${DEPTH_INFO[depth].range}`}>
      <rect x="14" y="6" width="20" height={H} rx="2" fill="#16293a" stroke="#223a4e" />
      <rect x="14" y={y} width="20" height={6 + H - y} rx="2" fill={DEPTH_INFO[depth].color} opacity="0.9" />
      {Array.from({ length: 13 }, (_, i) => i * 10).map((v) => {
        const ty = 6 + H - (v / max) * H;
        return (
          <g key={v}>
            <line x1="18" x2={v % 50 === 0 ? 34 : 28} y1={ty} y2={ty} stroke="#e7eef2" strokeWidth="1" opacity="0.8" />
            {v % 20 === 0 && (
              <text x="38" y={ty + 3} fontSize="8.5" fill="#8ea3b2" fontFamily="var(--font-mono)">
                {v}
              </text>
            )}
          </g>
        );
      })}
      <text x="2" y="126" fontSize="8" fill="#5d7485" fontFamily="var(--font-mono)">
        cm
      </text>
    </svg>
  );
}

/** A person and the water line. */
function DepthGlyph({ depth }: { depth: Depth }) {
  const level = { ankle: 34, knee: 27, waist: 18, closed: 4 }[depth];
  return (
    <svg width="30" height="38" viewBox="0 0 30 38" aria-hidden="true">
      <circle cx="15" cy="5" r="3.2" fill="currentColor" />
      <path d="M15 9v13M15 12l-5 5M15 12l5 5M15 22l-4 12M15 22l4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      <rect x="0" y={level} width="30" height={38 - level} fill={DEPTH_INFO[depth].color} opacity="0.75" />
    </svg>
  );
}

function About({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="about-h" onClick={(e) => e.stopPropagation()}>
        <button className="modal-x" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <h2 id="about-h">How Neeru works</h2>
        <p>People standing at a flooded road report how deep the water is. Enter where you're going, and Neeru checks every route against those reports and suggests the driest one.</p>
        <h3>When a spot disappears</h3>
        <p>After 3 hours without a new report, or when two people say the water's gone.</p>
        <h3>What we store</h3>
        <p>The spot you report, the depth, the time, and a random id for your browser so one person can't flood the map with reports. Your IP address is scrambled (hashed) before it's stored and is only used to stop spam. No accounts, no names, no photos.</p>
        <h3>Stay safe</h3>
        <p>Never drive or ride into water when you can't see the road under it. Reports come from the public and can be wrong. In an emergency call <b>112</b>.</p>
      </div>
    </div>
  );
}

/* ================================================================== text + links */

function spotText(f: Flood) {
  return `${f.label || "A road"} is ${DEPTH_INFO[f.depth].label.toLowerCase()} right now (${f.still} ${f.still === 1 ? "report" : "reports"} on Neeru).`;
}

function verdictText(c: RouteCheck, mode: TravelMode, dest?: string) {
  const where = dest ? ` to ${dest}` : "";
  if (!c.hits.length) return `Checked my route${where} on Neeru: no flooding reported.`;
  const worst = c.hits.reduce((w, h) => (DEPTH_INFO[h.flood.depth].rank > DEPTH_INFO[w.flood.depth].rank ? h : w));
  return `Checked my route${where} on Neeru: ${c.hits.length} flooded ${c.hits.length === 1 ? "spot" : "spots"}, worst is ${worst.flood.label || "one road"} (${DEPTH_INFO[worst.flood.depth].label.toLowerCase()}).`;
}

/** Hand the chosen route to Google Maps. Alternatives get one via point so Google follows the same roads. */
function gmapsUrl(from: Place | null, to: Place | null, route: Route, isAlternative: boolean) {
  const u = new URL("https://www.google.com/maps/dir/");
  u.searchParams.set("api", "1");
  const end = route.path[route.path.length - 1];
  const start = route.path[0];
  if (from?.title === "Your location") {
    // Leaving origin empty makes Google use the phone's live location.
  } else if (from?.placeId) {
    u.searchParams.set("origin", from.title);
    u.searchParams.set("origin_place_id", from.placeId);
  } else u.searchParams.set("origin", `${start[0]},${start[1]}`);
  if (to?.placeId) {
    u.searchParams.set("destination", to.title);
    u.searchParams.set("destination_place_id", to.placeId);
  } else u.searchParams.set("destination", `${end[0]},${end[1]}`);
  if (isAlternative) {
    const mid = pointAlong(route.path, 0.5);
    u.searchParams.set("waypoints", `${mid.lat.toFixed(5)},${mid.lng.toFixed(5)}`);
  }
  u.searchParams.set("travelmode", "driving");
  return u.toString();
}
