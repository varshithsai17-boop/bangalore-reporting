"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, loadHome, saveHome } from "@/lib/client/api";
import { preparePhoto } from "@/lib/client/photo";
import { CATEGORIES, CATEGORY_INFO, MIN_CHECKINS, pct, photoUrl, scoreColor, STATUS_INFO } from "@/lib/constants";
import type { Category, Home as HomeT, LatLng, Spot, VanStatus, WardStat } from "@/lib/types";
import type { MapMode, MapProps } from "./Map";
import { daysOpen, spotShareX, spotWhatsApp, timeAgo } from "./share";

const GaadiMap = dynamic(() => import("./Map"), { ssr: false, loading: () => <div className="map-canvas map-loading" /> });

type Panel = "main" | "report" | "spot" | "ward";
const inCity = (p: LatLng) => p.lat > 12.7 && p.lat < 13.3 && p.lng > 77.3 && p.lng < 77.95;

export default function Home() {
  /* ---------------- data ---------------- */
  const [stats, setStats] = useState<WardStat[]>([]);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const [s, sp] = await Promise.all([api.stats(7), api.spots()]);
      setStats(s.stats);
      setSpots(sp.spots);
      setLoadErr(null);
    } catch (e) {
      setLoadErr((e as Error).message);
    }
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  const statById = useMemo(() => new Map(stats.map((s) => [s.ward_id, s])), [stats]);
  const city = useMemo(() => {
    const t = stats.reduce((a, s) => ({ n: a.n + s.checkins, came: a.came + s.came, open: a.open + s.open_spots }), { n: 0, came: 0, open: 0 });
    return { ...t, score: t.n ? t.came / t.n : null, ranked: stats.filter((s) => s.checkins >= MIN_CHECKINS).length };
  }, [stats]);
  const worst = useMemo(
    () => stats.filter((s) => s.checkins >= MIN_CHECKINS && s.score != null).sort((a, b) => a.score! - b.score! || b.checkins - a.checkins).slice(0, 5),
    [stats],
  );

  /* ---------------- ui state ---------------- */
  const [mode, setMode] = useState<MapMode>("van");
  const [panel, setPanel] = useState<Panel>("main");
  const [spotId, setSpotId] = useState<string | null>(null);
  const [wardId, setWardId] = useState<string | null>(null);
  const [focus, setFocus] = useState<MapProps["focus"]>(null);
  const [fitWard, setFitWard] = useState<MapProps["fitWard"]>(null);
  const [mapErr, setMapErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = (m: string) => {
    setToast(m);
    if (toastT.current) clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(null), 3400);
  };
  const panelRef = useRef<HTMLDivElement>(null);
  const showPanel = () => {
    // Phones: scroll the page to the panel. Desktop: scroll the right-hand column to it.
    setTimeout(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  /* ---------------- location ---------------- */
  const [locating, setLocating] = useState(false);
  const locate = useCallback(
    (): Promise<LatLng | null> =>
      new Promise((resolve) => {
        if (!("geolocation" in navigator)) {
          say("Your browser can't share location. Search for your street instead.");
          return resolve(null);
        }
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setLocating(false);
            resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          },
          (err) => {
            setLocating(false);
            say(err.code === 1 ? "Location is blocked. Allow it in your browser settings, or search instead." : "Couldn't find your location. Try again or search instead.");
            resolve(null);
          },
          { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
        );
      }),
    [],
  );

  /* ---------------- home + today ---------------- */
  const [home, setHome] = useState<HomeT | null>(null);
  const [today, setToday] = useState<VanStatus | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setHome(loadHome());
    api.today().then((r) => setToday(r.today?.status ?? null)).catch(() => {});
  }, []);

  const checkin = async (status: VanStatus) => {
    if (!home) return;
    setSaving(true);
    try {
      await api.checkin(home, status);
      setToday(status);
      say(status === "came" ? "Saved. Good to hear." : "Saved. It counts toward your ward's report card.");
      load();
    } catch (e) {
      say((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  /* ---------------- report ---------------- */
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [pin, setPin] = useState<LatLng | null>(null);
  const [pinPlace, setPinPlace] = useState<{ street: string | null; ward: string | null } | null>(null);
  const [sending, setSending] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  /** Open spots near the pin that might be the same pile; set when the reporter taps Send. */
  const [dupes, setDupes] = useState<Nearby[] | null>(null);

  const startReport = async () => {
    setPanel("report");
    setMode("spots");
    setSpotId(null);
    setCategory(null);
    setPhoto(null);
    setPin(null);
    setPinPlace(null);
    setDupes(null);
    showPanel();
    const p = await locate();
    if (p && inCity(p)) {
      setPin(p);
      setFocus({ key: Date.now(), point: p, zoom: 16 });
    }
  };
  useEffect(() => {
    setDupes(null); // moving the pin means the nearby list must be checked again
    if (!pin) return;
    let live = true;
    const t = setTimeout(() => {
      api.locate(pin.lat, pin.lng).then((r) => live && setPinPlace({ street: r.street, ward: r.ward?.name ?? null })).catch(() => {});
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [pin]);

  const pickPhoto = async (f: File | undefined) => {
    if (!f) return;
    setPhotoBusy(true);
    try {
      const blob = await preparePhoto(f);
      if (photo) URL.revokeObjectURL(photo.url);
      setPhoto({ blob, url: URL.createObjectURL(blob) });
    } catch (e) {
      say((e as Error).message);
    } finally {
      setPhotoBusy(false);
    }
  };

  // Open spots that could be the same pile: within 150 m, or on the same street within 400 m.
  const nearbyNow = useMemo(() => (pin ? nearbySpots(pin, pinPlace?.street ?? null, spots) : []), [pin, pinPlace, spots]);

  /** Step 1 of sending: if there are open spots nearby, ask whether it's one of them first. */
  const sendReport = async () => {
    if (!photo || !category || !pin) return;
    setSending(true);
    try {
      const fresh = (await api.spots()).spots;
      setSpots(fresh);
      const found = nearbySpots(pin, pinPlace?.street ?? null, fresh);
      if (found.length) {
        setDupes(found);
        return;
      }
      await submitNew(false);
    } catch (e) {
      say((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  /** A brand-new spot. forceNew = the reporter said it isn't any of the nearby ones. */
  const submitNew = async (forceNew: boolean) => {
    if (!photo || !category || !pin) return;
    setSending(true);
    try {
      const { path } = await api.photo(photo.blob);
      const r = await api.spot(pin.lat, pin.lng, category, path, forceNew);
      say(r.merged ? "Thanks. Added to a spot others already reported." : "Thanks. It's on the map.");
      const sp = await api.spots();
      setSpots(sp.spots);
      setSpotId(r.spot_id);
      setPanel("spot");
      setPin(null);
      setDupes(null);
    } catch (e) {
      say((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  /** The reporter says it's the same pile: their photo is added to that spot as another report. */
  const joinSpot = async (s: Spot) => {
    if (!photo) return;
    setSending(true);
    try {
      const { path } = await api.photo(photo.blob);
      await api.vote(s.id, "still", path);
      say(`Added to this spot. ${s.confirms + 1} people have reported it now.`);
      const sp = await api.spots();
      setSpots(sp.spots);
      setSpotId(s.id);
      setPanel("spot");
      setPin(null);
      setDupes(null);
      setFocus({ key: Date.now(), point: { lat: s.lat, lng: s.lng }, zoom: 16 });
    } catch (e) {
      say((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  /* ---------------- spot ---------------- */
  const spot = spots.find((s) => s.id === spotId) ?? null;
  const openSpot = (id: string) => {
    const s = spots.find((x) => x.id === id);
    if (!s) return;
    setSpotId(id);
    setPanel("spot");
    setMode("spots");
    setFocus({ key: Date.now(), point: { lat: s.lat, lng: s.lng }, zoom: 16 });
    showPanel();
  };
  const [voting, setVoting] = useState(false);
  const vote = async (kind: "still" | "cleaned" | "flag", file?: File) => {
    if (!spot) return;
    setVoting(true);
    try {
      let path: string | undefined;
      if (file) path = (await api.photo(await preparePhoto(file))).path;
      await api.vote(spot.id, kind, path);
      say(kind === "flag" ? "Thanks. Photos flagged by 3 people are hidden." : kind === "cleaned" ? (path ? "Marked as cleaned. Thanks for the after photo." : "Thanks. It's marked cleaned once someone else agrees.") : "Thanks for confirming.");
      const sp = await api.spots();
      setSpots(sp.spots);
    } catch (e) {
      say((e as Error).message);
    } finally {
      setVoting(false);
    }
  };

  /* ---------------- ward (map click) ---------------- */
  const openWard = (id: string) => {
    setWardId(id);
    setPanel("ward");
    setFitWard({ key: Date.now(), id });
    showPanel();
  };
  const ward = wardId ? statById.get(wardId) ?? null : null;

  const mapProps: MapProps = {
    mode,
    stats,
    spots,
    home: home ? { lat: home.lat, lng: home.lng } : null,
    pin: panel === "report" ? pin : null,
    picking: panel === "report",
    selectedSpot: panel === "spot" ? spotId : null,
    selectedWard: panel === "ward" ? wardId : home?.ward_id ?? null,
    onPick: setPin,
    onSpot: openSpot,
    onWard: openWard,
    focus,
    fitWard,
    onError: setMapErr,
  };

  const myWard = home ? statById.get(home.ward_id) : undefined;
  const openSpots = spots.filter((s) => s.status === "open");

  return (
    <div className="app">
      <header className="top">
        <Link href="/" className="brand" aria-label="Gaadi Bantha home">
          <span className="word">
            Gaadi Bantha<span className="q">?</span>
          </span>
          <span className="kn" lang="kn">
            ಗಾಡಿ ಬಂತಾ?
          </span>
        </Link>
        <nav className="nav">
          <Link href="/wards">Ward rankings</Link>
          <Link href="/about">How it works</Link>
        </nav>
      </header>

      <main className="main">
        <section className="mapwrap">
          <div className="map-tabs" role="tablist" aria-label="Map layer">
            <button role="tab" aria-selected={mode === "van"} onClick={() => setMode("van")}>
              Van reliability
            </button>
            <button role="tab" aria-selected={mode === "spots"} onClick={() => setMode("spots")}>
              Garbage spots
            </button>
          </div>
          <GaadiMap {...mapProps} />
          {panel === "report" && <div className="map-hint">{pin ? "Tap the map to move the pin" : "Tap the map where the garbage is"}</div>}
          {mapErr && <div className="map-err">{mapErr}</div>}
          {mode === "van" ? (
            <div className="legend">
              <span className="lbl">Van came, last 7 days</span>
              <span className="scale">
                {[
                  ["<50%", 0.3],
                  ["50%", 0.55],
                  ["65%", 0.7],
                  ["80%", 0.85],
                  ["92%+", 0.95],
                ].map(([t, s]) => (
                  <span key={t as string}>
                    <i style={{ background: scoreColor(s as number) }} />
                    {t}
                  </span>
                ))}
                <span>
                  <i className="nodata" />
                  Not enough data
                </span>
              </span>
            </div>
          ) : (
            <div className="legend">
              <span className="scale">
                {CATEGORIES.map((c) => (
                  <span key={c}>
                    <i style={{ background: CATEGORY_INFO[c].color, borderRadius: "50%" }} />
                    {CATEGORY_INFO[c].short}
                  </span>
                ))}
                <span>
                  <i style={{ background: "#9aa59d", borderRadius: "50%" }} />
                  Cleaned
                </span>
              </span>
            </div>
          )}
        </section>

        <div className="side">
        <section className="today-slot">
          <TodayCard
            home={home}
            today={today}
            saving={saving}
            locating={locating}
            myWard={myWard}
            onCheckin={checkin}
            onSetHome={(h) => {
              saveHome(h);
              setHome(h);
              setFitWard({ key: Date.now(), id: h.ward_id });
            }}
            onClearHome={() => {
              saveHome(null);
              setHome(null);
            }}
            locate={locate}
            say={say}
          />
        </section>

        <aside className="panel" ref={panelRef}>
          {panel === "main" && (
            <>
              <div className="card pulse">
                <span className="lbl">Bengaluru this week</span>
                {loadErr && !stats.length ? (
                  <p className="muted">{loadErr}</p>
                ) : (
                  <div className="pulse-grid">
                    <div>
                      <strong style={{ color: scoreColor(city.score) }}>{pct(city.score)}</strong>
                      <span>of check-ins say the van came</span>
                    </div>
                    <div>
                      <strong>{city.n.toLocaleString("en-IN")}</strong>
                      <span>check-ins from residents</span>
                    </div>
                    <div>
                      <strong>{city.open.toLocaleString("en-IN")}</strong>
                      <span>garbage spots still open</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="card">
                <div className="row-between">
                  <span className="lbl">Worst wards for missed pickups · 7 days</span>
                  <Link href="/wards" className="linkish">
                    All {city.ranked} wards
                  </Link>
                </div>
                {worst.length === 0 ? (
                  <p className="muted small">Not enough check-ins yet. A ward needs {MIN_CHECKINS} this week to be ranked.</p>
                ) : (
                  <ol className="rank">
                    {worst.map((w) => (
                      <li key={w.ward_id}>
                        <button onClick={() => openWard(w.ward_id)}>
                          <span>
                            <b>{w.name}</b>
                            <small>
                              {w.corp} · {w.checkins} check-ins
                            </small>
                          </span>
                          <span className="score" style={{ color: scoreColor(w.score) }}>
                            {pct(w.score)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              <div className="card">
                <span className="lbl">Newest garbage spots</span>
                {openSpots.length === 0 ? (
                  <p className="muted small">No open spots. Seen one? Report it with a photo.</p>
                ) : (
                  <ul className="spot-list">
                    {openSpots.slice(0, 6).map((s) => (
                      <li key={s.id}>
                        <button onClick={() => openSpot(s.id)}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={photoUrl(s.photo)} alt="" loading="lazy" />
                          <span>
                            <b>{s.label || "Unnamed road"}</b>
                            <small>
                              {CATEGORY_INFO[s.category].label} · {timeAgo(s.created_at)}
                            </small>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {panel === "ward" && (
            <div className="card">
              <div className="row-between">
                <span className="lbl">{ward?.corp} corporation</span>
                <button className="linkish" onClick={() => setPanel("main")}>
                  Back
                </button>
              </div>
              {!ward ? (
                <p className="muted">Loading…</p>
              ) : (
                <>
                  <h2>{ward.name}</h2>
                  <WardMini w={ward} />
                  <Link className="btn primary" href={`/ward/${ward.ward_id}`}>
                    Open the full report card
                  </Link>
                </>
              )}
            </div>
          )}

          {panel === "report" && (
            <div className="card report">
              <div className="row-between">
                <h2>Report garbage</h2>
                <button className="linkish" onClick={() => setPanel("main")}>
                  Cancel
                </button>
              </div>
              <label className={`photo-drop ${photo ? "has" : ""}`}>
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.url} alt="Your photo of the garbage" />
                ) : (
                  <>
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
                      <circle cx="12" cy="13" r="3.5" />
                    </svg>
                    <strong>{photoBusy ? "Preparing photo…" : "Take a photo of the garbage"}</strong>
                    <span>Required. Keep people's faces and number plates out of the frame.</span>
                  </>
                )}
                <input type="file" accept="image/*" capture="environment" onChange={(e) => pickPhoto(e.target.files?.[0])} />
              </label>
              {photo && <span className="muted small">Tap the photo to retake it.</span>}
              <span className="lbl">What is it?</span>
              <div className="cats">
                {CATEGORIES.map((c) => (
                  <button key={c} aria-pressed={category === c} onClick={() => setCategory(c)}>
                    <i style={{ background: CATEGORY_INFO[c].color }} />
                    {CATEGORY_INFO[c].label}
                  </button>
                ))}
              </div>
              <div className="where">
                <span className="lbl">Where</span>
                <strong>
                  {pin ? pinPlace?.street || `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}` : locating ? "Finding you…" : "Tap the map where the garbage is"}
                </strong>
                {pin && pinPlace?.ward && <span className="muted small">{pinPlace.ward} ward</span>}
                {pin && pinPlace && !pinPlace.ward && <span className="warn">This spot is outside Bengaluru's wards.</span>}
              </div>
              {!dupes ? (
                <>
                  {nearbyNow.length > 0 && (
                    <p className="muted small">
                      {nearbyNow.length} open garbage {nearbyNow.length === 1 ? "report is" : "reports are"} already near this spot. We'll check with you before sending.
                    </p>
                  )}
                  <button className="btn primary" disabled={!photo || !category || !pin || sending || (pinPlace != null && !pinPlace.ward)} onClick={sendReport}>
                    {sending ? "Checking…" : "Send report"}
                  </button>
                </>
              ) : (
                <div className="dupes">
                  <h3>Is it one of these?</h3>
                  <p className="muted small">
                    These are already reported near you. If it's the same pile, add your photo to it. More people on one report pushes it up the city's list faster than
                    several separate ones.
                  </p>
                  <ul>
                    {dupes.map((d) => (
                      <li key={d.id}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photoUrl(d.photo)} alt="" />
                        <span className="dupe-info">
                          <b>{d.label || "Unnamed road"}</b>
                          <small>
                            {CATEGORY_INFO[d.category].label} · {d.dist < 20 ? "right here" : `${Math.round(d.dist / 10) * 10} m away`}
                            {d.sameStreet ? " · same street" : ""}
                          </small>
                          <small>
                            Reported by {d.confirms} · open {daysOpen(d)}
                          </small>
                        </span>
                        <button className="btn primary" disabled={sending} onClick={() => joinSpot(d)}>
                          Yes, this one
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button className="btn" disabled={sending} onClick={() => submitNew(true)}>
                    {sending ? "Sending…" : "No, it's a different spot"}
                  </button>
                  <button className="linkish center" onClick={() => setDupes(null)}>
                    Back
                  </button>
                </div>
              )}
            </div>
          )}

          {panel === "spot" && (
            <div className="card spot">
              <div className="row-between">
                <span className="lbl">{spot ? `${CATEGORY_INFO[spot.category].label} · reported ${timeAgo(spot.created_at)}` : ""}</span>
                <button className="linkish" onClick={() => setPanel("main")}>
                  Back
                </button>
              </div>
              {!spot ? (
                <p className="muted">This spot isn't on the map any more.</p>
              ) : (
                <>
                  <h2>{spot.label || "Unnamed road"}</h2>
                  <div className={`photos ${spot.after_photo ? "two" : ""}`}>
                    <figure>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoUrl(spot.photo)} alt={`${CATEGORY_INFO[spot.category].label} reported at ${spot.label ?? "this spot"}`} />
                      {spot.after_photo && <figcaption>Before</figcaption>}
                    </figure>
                    {spot.after_photo && (
                      <figure>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photoUrl(spot.after_photo)} alt="The same spot after it was cleaned" />
                        <figcaption>After</figcaption>
                      </figure>
                    )}
                  </div>
                  <div className="facts">
                    <div>
                      <span>Status</span>
                      <strong className={spot.status === "open" ? "bad" : "good"}>{spot.status === "open" ? `Open ${daysOpen(spot)}` : `Cleaned ${timeAgo(spot.cleaned_at!)}`}</strong>
                    </div>
                    <div>
                      <span>Reported by</span>
                      <strong>
                        {spot.confirms} {spot.confirms === 1 ? "person" : "people"}
                      </strong>
                    </div>
                    <div>
                      <span>Ward</span>
                      <strong>
                        <button className="linkish strong" onClick={() => openWard(spot.ward_id)}>
                          {statById.get(spot.ward_id)?.name ?? spot.ward_id}
                        </button>
                      </strong>
                    </div>
                  </div>
                  {spot.status === "open" && (
                    <>
                      <span className="lbl">Send it to the city</span>
                      <div className="two">
                        <a className="btn primary" target="_blank" rel="noopener noreferrer" href={spotWhatsApp(spot, statById.get(spot.ward_id)?.name)}>
                          WhatsApp the city
                        </a>
                        <a className="btn" target="_blank" rel="noopener noreferrer" href={spotShareX(spot, statById.get(spot.ward_id)?.name)}>
                          Post on X
                        </a>
                      </div>
                      <span className="lbl">Are you here now?</span>
                      <div className="two">
                        <button className="btn" disabled={voting} onClick={() => vote("still")}>
                          Still there
                        </button>
                        <button className="btn" disabled={voting} onClick={() => vote("cleaned")}>
                          It's cleaned
                        </button>
                      </div>
                      <label className="linkish center">
                        Cleaned? Add an after photo
                        <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && vote("cleaned", e.target.files[0])} />
                      </label>
                    </>
                  )}
                  <button className="linkish center" disabled={voting} onClick={() => vote("flag")}>
                    Report this photo
                  </button>
                </>
              )}
            </div>
          )}
        </aside>
        </div>
      </main>

      {panel !== "report" && (
        <button className="fab" onClick={startReport}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
          Report garbage
        </button>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

/* ================================================================== pieces */

function WardMini({ w }: { w: WardStat }) {
  const enough = w.checkins >= MIN_CHECKINS;
  return (
    <div className="ward-mini">
      <div className="big" style={{ color: enough ? scoreColor(w.score) : undefined }}>
        {enough ? pct(w.score) : "–"}
      </div>
      <div>
        <b>{enough ? "of check-ins say the van came" : "Not enough check-ins yet"}</b>
        <small>
          {w.checkins} check-ins from {w.streets} {w.streets === 1 ? "street" : "streets"} · {w.missed} missed · {w.refused} refused ·{" "}
          {w.open_spots} open garbage {w.open_spots === 1 ? "spot" : "spots"}
        </small>
      </div>
    </div>
  );
}

function TodayCard(p: {
  home: HomeT | null;
  today: VanStatus | null;
  saving: boolean;
  locating: boolean;
  myWard: WardStat | undefined;
  onCheckin: (s: VanStatus) => void;
  onSetHome: (h: HomeT) => void;
  onClearHome: () => void;
  locate: () => Promise<LatLng | null>;
  say: (m: string) => void;
}) {
  const [draft, setDraft] = useState<HomeT | null>(null);
  const [finding, setFinding] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ title: string; subtitle: string; lat: number; lng: number }[]>([]);
  const ctl = useRef<AbortController | null>(null);

  const resolve = async (pt: LatLng, streetHint?: string) => {
    setFinding(true);
    try {
      const r = await api.locate(pt.lat, pt.lng);
      if (!r.ward) return p.say("That's outside Bengaluru's 369 wards.");
      setDraft({ lat: pt.lat, lng: pt.lng, ward_id: r.ward.id, ward_name: r.ward.name, street: r.street || streetHint || null });
    } catch (e) {
      p.say((e as Error).message);
    } finally {
      setFinding(false);
    }
  };

  useEffect(() => {
    ctl.current?.abort();
    if (q.trim().length < 3) return setResults([]);
    const c = new AbortController();
    ctl.current = c;
    const t = setTimeout(() => api.search(q, c.signal).then((r) => !c.signal.aborted && setResults(r.places)).catch(() => {}), 350);
    return () => clearTimeout(t);
  }, [q]);

  if (!p.home) {
    return (
      <div className="card today">
        <h2>Did the garbage van come today?</h2>
        {!draft ? (
          <>
            <p className="muted">Set your street once. After that it's one tap a day, and your answer counts toward your ward's report card.</p>
            <button
              className="btn primary"
              disabled={p.locating || finding}
              onClick={async () => {
                const pt = await p.locate();
                if (pt) resolve(pt);
              }}
            >
              {p.locating || finding ? "Finding your street…" : "Use my location"}
            </button>
            <div className="search">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Or search your street or area" aria-label="Search your street or area" />
              {results.length > 0 && (
                <ul>
                  {results.map((r, i) => (
                    <li key={i}>
                      <button
                        onClick={() => {
                          setResults([]);
                          setQ(r.title);
                          resolve({ lat: r.lat, lng: r.lng }, r.title);
                        }}
                      >
                        <b>{r.title}</b>
                        <small>{r.subtitle}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="where">
              <span className="lbl">Your street</span>
              <strong>{draft.street || "Your spot"}</strong>
              <span className="muted small">{draft.ward_name} ward</span>
            </div>
            <div className="two">
              <button className="btn" onClick={() => setDraft(null)}>
                Change
              </button>
              <button className="btn primary" onClick={() => p.onSetHome(draft)}>
                That's my street
              </button>
            </div>
            <p className="muted small">Saved only on this phone. We store your check-ins rounded to about 10 metres, never your exact address.</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="card today">
      <div className="row-between">
        <span className="lbl">
          {p.home.street || "Your street"} · {p.home.ward_name}
        </span>
        <button className="linkish" onClick={p.onClearHome}>
          Change street
        </button>
      </div>
      <h2>{p.today ? "Thanks for checking in today" : "Did the garbage van come today?"}</h2>
      <div className="status-btns">
        {(Object.keys(STATUS_INFO) as VanStatus[]).map((s) => (
          <button key={s} className={`st st-${s}`} aria-pressed={p.today === s} disabled={p.saving} onClick={() => p.onCheckin(s)}>
            <b>{STATUS_INFO[s].label}</b>
            <small>{STATUS_INFO[s].sub}</small>
          </button>
        ))}
      </div>
      {p.today && p.myWard && (
        <p className="small">
          {p.myWard.checkins >= MIN_CHECKINS ? (
            <>
              In {p.myWard.name}, the van came on <b style={{ color: scoreColor(p.myWard.score) }}>{pct(p.myWard.score)}</b> of check-ins this week.{" "}
            </>
          ) : (
            <>{p.myWard.name} needs a few more check-ins this week to get a score. Share the app with your neighbours. </>
          )}
          <Link href={`/ward/${p.myWard.ward_id}`}>See your ward's report card</Link>
        </p>
      )}
      {p.today && <p className="muted small">Tap another answer to change it. You can check in once a day.</p>}
    </div>
  );
}

/* ================================================================== duplicate check */

type Nearby = Spot & { dist: number; sameStreet: boolean };

const distM = (a: LatLng, b: LatLng) => {
  const k = Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return 111320 * Math.hypot(b.lat - a.lat, (b.lng - a.lng) * k);
};
const streetKey = (s: string | null | undefined) => (s ?? "").split(",")[0].trim().toLowerCase();

/**
 * Open spots that might be the pile being reported: anything within 150 m (phone GPS is often
 * 20-50 m off), or on the same named street within 400 m. Nearest first, at most 4.
 */
function nearbySpots(pin: LatLng, street: string | null, all: Spot[]): Nearby[] {
  const key = streetKey(street);
  return all
    .filter((s) => s.status === "open")
    .map((s) => {
      const dist = distM(pin, s);
      return { ...s, dist, sameStreet: !!key && streetKey(s.label) === key };
    })
    .filter((s) => s.dist <= 150 || (s.sameStreet && s.dist <= 400))
    .sort((a, b) => Number(b.sameStreet && b.dist < 150) - Number(a.sameStreet && a.dist < 150) || a.dist - b.dist)
    .slice(0, 4);
}
