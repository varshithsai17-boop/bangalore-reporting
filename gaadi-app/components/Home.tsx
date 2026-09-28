"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, loadHome, saveHome, SignInNeeded, type Me } from "@/lib/client/api";
import { preparePhoto } from "@/lib/client/photo";
import { CATEGORIES, CATEGORY_INFO, MIN_CHECKINS, pct, photoUrl, scoreColor } from "@/lib/constants";
import { fill, wardName, type Dict, type Lang } from "@/lib/i18n";
import type { Category, Home as HomeT, LatLng, Spot, VanStatus, WardStat } from "@/lib/types";
import { LangSwitch, useLang } from "./LangProvider";
import type { MapMode, MapProps } from "./Map";
import { daysOpen, spotShareX, spotWhatsApp, timeAgo } from "./share";
import SignInSheet, { googleSignOut } from "./SignIn";

const GaadiMap = dynamic(() => import("./Map"), { ssr: false, loading: () => <div className="map-canvas map-loading" /> });

type Panel = "main" | "report" | "spot" | "ward";
const inCity = (p: LatLng) => p.lat > 12.7 && p.lat < 13.3 && p.lng > 77.3 && p.lng < 77.95;
const STATUSES: VanStatus[] = ["came", "missed", "refused"];

export default function Home() {
  const { t, lang } = useLang();

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
    const timer = setInterval(() => document.visibilityState === "visible" && load(), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const statById = useMemo(() => new Map(stats.map((s) => [s.ward_id, s])), [stats]);
  const wName = (id: string, fallback?: string) => {
    const s = statById.get(id);
    return s ? wardName(lang, s) : fallback ?? id;
  };
  const city = useMemo(() => {
    const c = stats.reduce((a, s) => ({ n: a.n + s.checkins, came: a.came + s.came, open: a.open + s.open_spots }), { n: 0, came: 0, open: 0 });
    return { ...c, score: c.n ? c.came / c.n : null, ranked: stats.filter((s) => s.checkins >= MIN_CHECKINS).length };
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

  /* ---------------- account ---------------- */
  // Browsing never needs an account. Checking in, reporting and voting do: one Google account, one voice.
  const [me, setMe] = useState<Me | null>(null);
  const meReady = useRef<Promise<Me | null> | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const pending = useRef<(() => void) | null>(null);
  useEffect(() => {
    meReady.current = api
      .me()
      .then((r) => r.user)
      .catch(() => null);
    meReady.current.then(setMe);
  }, []);

  /** Runs `fn` now if signed in, otherwise asks the person to sign in and runs it afterwards. */
  const needUser = async (fn: () => void) => {
    const u = me ?? (await meReady.current);
    if (u) return fn();
    pending.current = fn;
    setSigningIn(true);
  };
  /** Shared error handling: a lapsed session reopens the sign-in sheet. */
  const fail = (e: unknown, retry?: () => void) => {
    if (e instanceof SignInNeeded) {
      setMe(null);
      pending.current = retry ?? null;
      setSigningIn(true);
      return;
    }
    say((e as Error).message);
  };
  const signedIn = (u: Me) => {
    setMe(u);
    setSigningIn(false);
    say(t.auth.welcome(u.name));
    const fn = pending.current;
    pending.current = null;
    fn?.();
  };
  const signOut = async () => {
    try {
      await api.signOut();
    } catch {}
    googleSignOut();
    setMe(null);
    setToday(null);
    say(t.auth.signedOut);
  };

  /* ---------------- location ---------------- */
  const [locating, setLocating] = useState(false);
  const tRef = useRef(t);
  tRef.current = t;
  const locate = useCallback(
    (): Promise<LatLng | null> =>
      new Promise((resolve) => {
        if (!("geolocation" in navigator)) {
          say(tRef.current.today.noGeo);
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
            say(err.code === 1 ? tRef.current.today.geoBlocked : tRef.current.today.geoFailed);
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
  useEffect(() => setHome(loadHome()), []);
  useEffect(() => {
    if (!me) return setToday(null);
    api.today().then((r) => setToday(r.today?.status ?? null)).catch(() => {});
  }, [me]);

  const checkin = (status: VanStatus) =>
    needUser(async () => {
      if (!home) return;
      setSaving(true);
      try {
        await api.checkin(home, status);
        setToday(status);
        say(status === "came" ? t.today.savedCame : t.today.savedMissed);
        load();
      } catch (e) {
        fail(e, () => checkin(status));
      } finally {
        setSaving(false);
      }
    });

  /* ---------------- report ---------------- */
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [pin, setPin] = useState<LatLng | null>(null);
  const [pinPlace, setPinPlace] = useState<{ street: string | null; wardId: string | null; ward: string | null } | null>(null);
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
    const timer = setTimeout(() => {
      api
        .locate(pin.lat, pin.lng)
        .then((r) => live && setPinPlace({ street: r.street, wardId: r.ward?.id ?? null, ward: r.ward?.name ?? null }))
        .catch(() => {});
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
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

  /** Step 1 of sending: sign in if needed, then, if there are open spots nearby, ask whether it's one of them. */
  const sendReport = () =>
    needUser(async () => {
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
        fail(e, sendReport);
      } finally {
        setSending(false);
      }
    });

  /** A brand-new spot. forceNew = the reporter said it isn't any of the nearby ones. */
  const submitNew = async (forceNew: boolean) => {
    if (!photo || !category || !pin) return;
    setSending(true);
    try {
      const { path } = await api.photo(photo.blob);
      const r = await api.spot(pin.lat, pin.lng, category, path, forceNew);
      say(r.merged ? t.report.addedExisting : t.report.onMap);
      const sp = await api.spots();
      setSpots(sp.spots);
      setSpotId(r.spot_id);
      setPanel("spot");
      setPin(null);
      setDupes(null);
    } catch (e) {
      fail(e, () => submitNew(forceNew));
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
      say(t.report.joined(s.confirms + 1));
      const sp = await api.spots();
      setSpots(sp.spots);
      setSpotId(s.id);
      setPanel("spot");
      setPin(null);
      setDupes(null);
      setFocus({ key: Date.now(), point: { lat: s.lat, lng: s.lng }, zoom: 16 });
    } catch (e) {
      fail(e, () => joinSpot(s));
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
  const vote = (kind: "still" | "cleaned" | "flag", file?: File) =>
    needUser(async () => {
      if (!spot) return;
      setVoting(true);
      try {
        let path: string | undefined;
        if (file) path = (await api.photo(await preparePhoto(file))).path;
        await api.vote(spot.id, kind, path);
        say(kind === "flag" ? t.spot.flagged : kind === "cleaned" ? (path ? t.spot.cleanedPhoto : t.spot.cleanedWait) : t.spot.confirmed);
        const sp = await api.spots();
        setSpots(sp.spots);
      } catch (e) {
        fail(e, () => vote(kind, file));
      } finally {
        setVoting(false);
      }
    });

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
  const catLabel = (c: Category) => t.cats[c].label;

  return (
    <div className="app">
      <header className="top">
        <Link href="/" className="brand" aria-label={t.common.brandAria}>
          <span className="word">
            Gaadi Bantha<span className="q">?</span>
          </span>
          <span className="kn" lang="kn">
            ಗಾಡಿ ಬಂತಾ?
          </span>
        </Link>
        <div className="top-end">
          <nav className="nav">
            <Link href="/wards">{t.common.rankings}</Link>
            <Link href="/about">{t.common.how}</Link>
          </nav>
          <LangSwitch />
          <Account me={me} t={t} onSignIn={() => setSigningIn(true)} onSignOut={signOut} />
        </div>
      </header>

      <main className="main">
        <section className="mapwrap">
          <div className="map-tabs" role="tablist" aria-label={t.map.tabsAria}>
            <button role="tab" aria-selected={mode === "van"} onClick={() => setMode("van")}>
              {t.map.van}
            </button>
            <button role="tab" aria-selected={mode === "spots"} onClick={() => setMode("spots")}>
              {t.map.spots}
            </button>
          </div>
          <GaadiMap {...mapProps} />
          {panel === "report" && <div className="map-hint">{pin ? t.map.hintMove : t.map.hintPlace}</div>}
          {mapErr && <div className="map-err">{mapErr}</div>}
          {mode === "van" ? (
            <div className="legend">
              <span className="lbl">{t.map.legend}</span>
              <span className="scale">
                {[
                  ["<50%", 0.3],
                  ["50%", 0.55],
                  ["65%", 0.7],
                  ["80%", 0.85],
                  ["92%+", 0.95],
                ].map(([label, s]) => (
                  <span key={label as string}>
                    <i style={{ background: scoreColor(s as number) }} />
                    {label}
                  </span>
                ))}
                <span>
                  <i className="nodata" />
                  {t.map.noData}
                </span>
              </span>
            </div>
          ) : (
            <div className="legend">
              <span className="scale">
                {CATEGORIES.map((c) => (
                  <span key={c}>
                    <i style={{ background: CATEGORY_INFO[c].color, borderRadius: "50%" }} />
                    {t.cats[c].short}
                  </span>
                ))}
                <span>
                  <i style={{ background: "#9aa59d", borderRadius: "50%" }} />
                  {t.map.cleaned}
                </span>
              </span>
            </div>
          )}
        </section>

        <div className="side">
          <section className="today-slot">
            <TodayCard
              t={t}
              lang={lang}
              home={home}
              homeWardName={home ? wName(home.ward_id, home.ward_name) : ""}
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
                  <span className="lbl">{t.home.cityWeek}</span>
                  {loadErr && !stats.length ? (
                    <p className="muted">{loadErr}</p>
                  ) : (
                    <div className="pulse-grid">
                      <div>
                        <strong style={{ color: scoreColor(city.score) }}>{pct(city.score)}</strong>
                        <span>{t.home.saidCame}</span>
                      </div>
                      <div>
                        <strong>{city.n.toLocaleString("en-IN")}</strong>
                        <span>{t.home.fromResidents}</span>
                      </div>
                      <div>
                        <strong>{city.open.toLocaleString("en-IN")}</strong>
                        <span>{t.home.stillOpen}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="card">
                  <div className="row-between">
                    <span className="lbl">{t.home.worstTitle}</span>
                    <Link href="/wards" className="linkish">
                      {t.home.allWards(city.ranked)}
                    </Link>
                  </div>
                  {worst.length === 0 ? (
                    <p className="muted small">{t.home.notRanked(MIN_CHECKINS)}</p>
                  ) : (
                    <ol className="rank">
                      {worst.map((w) => (
                        <li key={w.ward_id}>
                          <button onClick={() => openWard(w.ward_id)}>
                            <span>
                              <b>{wardName(lang, w)}</b>
                              <small>
                                {t.common.corp[w.corp] ?? w.corp} · {t.common.checkins(w.checkins)}
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
                  <span className="lbl">{t.home.newest}</span>
                  {openSpots.length === 0 ? (
                    <p className="muted small">{t.home.noOpen}</p>
                  ) : (
                    <ul className="spot-list">
                      {openSpots.slice(0, 6).map((s) => (
                        <li key={s.id}>
                          <button onClick={() => openSpot(s.id)}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={photoUrl(s.photo)} alt="" loading="lazy" />
                            <span>
                              <b>{s.label || t.common.unnamedRoad}</b>
                              <small>
                                {catLabel(s.category)} · {timeAgo(s.created_at, t)}
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
                  <span className="lbl">{ward ? t.common.corpLine(t.common.corp[ward.corp] ?? ward.corp) : ""}</span>
                  <button className="linkish" onClick={() => setPanel("main")}>
                    {t.common.back}
                  </button>
                </div>
                {!ward ? (
                  <p className="muted">{t.common.loading}</p>
                ) : (
                  <>
                    <h2>{wardName(lang, ward)}</h2>
                    <WardMini w={ward} t={t} />
                    <Link className="btn primary" href={`/ward/${ward.ward_id}`}>
                      {t.home.openCard}
                    </Link>
                  </>
                )}
              </div>
            )}

            {panel === "report" && (
              <div className="card report">
                <div className="row-between">
                  <h2>{t.report.title}</h2>
                  <button className="linkish" onClick={() => setPanel("main")}>
                    {t.common.cancel}
                  </button>
                </div>
                <label className={`photo-drop ${photo ? "has" : ""}`}>
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo.url} alt={t.report.photoAlt} />
                  ) : (
                    <>
                      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                        <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
                        <circle cx="12" cy="13" r="3.5" />
                      </svg>
                      <strong>{photoBusy ? t.report.preparing : t.report.take}</strong>
                      <span>{t.report.required}</span>
                    </>
                  )}
                  <input type="file" accept="image/*" capture="environment" onChange={(e) => pickPhoto(e.target.files?.[0])} />
                </label>
                {photo && <span className="muted small">{t.report.retake}</span>}
                <span className="lbl">{t.report.what}</span>
                <div className="cats">
                  {CATEGORIES.map((c) => (
                    <button key={c} aria-pressed={category === c} onClick={() => setCategory(c)}>
                      <i style={{ background: CATEGORY_INFO[c].color }} />
                      {catLabel(c)}
                    </button>
                  ))}
                </div>
                <div className="where">
                  <span className="lbl">{t.report.where}</span>
                  <strong>{pin ? pinPlace?.street || `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}` : locating ? t.report.finding : t.map.hintPlace}</strong>
                  {pin && pinPlace?.wardId && <span className="muted small">{t.common.ward(wName(pinPlace.wardId, pinPlace.ward ?? undefined))}</span>}
                  {pin && pinPlace && !pinPlace.wardId && <span className="warn">{t.report.outside}</span>}
                </div>
                {!dupes ? (
                  <>
                    {nearbyNow.length > 0 && <p className="muted small">{t.report.nearbyNote(nearbyNow.length)}</p>}
                    <button className="btn primary" disabled={!photo || !category || !pin || sending || (pinPlace != null && !pinPlace.wardId)} onClick={sendReport}>
                      {sending ? t.report.checking : t.report.send}
                    </button>
                  </>
                ) : (
                  <div className="dupes">
                    <h3>{t.report.dupTitle}</h3>
                    <p className="muted small">{t.report.dupBody}</p>
                    <ul>
                      {dupes.map((d) => (
                        <li key={d.id}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={photoUrl(d.photo)} alt="" />
                          <span className="dupe-info">
                            <b>{d.label || t.common.unnamedRoad}</b>
                            <small>
                              {catLabel(d.category)} · {d.dist < 20 ? t.report.rightHere : t.report.away(Math.round(d.dist / 10) * 10)}
                              {d.sameStreet ? ` · ${t.report.sameStreet}` : ""}
                            </small>
                            <small>{t.report.reportedOpen(d.confirms, daysOpen(d, t))}</small>
                          </span>
                          <button className="btn primary" disabled={sending} onClick={() => joinSpot(d)}>
                            {t.report.yes}
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button className="btn" disabled={sending} onClick={() => submitNew(true)}>
                      {sending ? t.report.sending : t.report.different}
                    </button>
                    <button className="linkish center" onClick={() => setDupes(null)}>
                      {t.common.back}
                    </button>
                  </div>
                )}
              </div>
            )}

            {panel === "spot" && (
              <div className="card spot">
                <div className="row-between">
                  <span className="lbl">{spot ? t.spot.reported(catLabel(spot.category), timeAgo(spot.created_at, t)) : ""}</span>
                  <button className="linkish" onClick={() => setPanel("main")}>
                    {t.common.back}
                  </button>
                </div>
                {!spot ? (
                  <p className="muted">{t.spot.gone}</p>
                ) : (
                  <>
                    <h2>{spot.label || t.common.unnamedRoad}</h2>
                    <div className={`photos ${spot.after_photo ? "two" : ""}`}>
                      <figure>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photoUrl(spot.photo)} alt={t.spot.photoAlt(catLabel(spot.category), spot.label ?? t.spot.thisSpot)} />
                        {spot.after_photo && <figcaption>{t.spot.before}</figcaption>}
                      </figure>
                      {spot.after_photo && (
                        <figure>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={photoUrl(spot.after_photo)} alt={t.spot.afterAlt} />
                          <figcaption>{t.spot.after}</figcaption>
                        </figure>
                      )}
                    </div>
                    <div className="facts">
                      <div>
                        <span>{t.spot.status}</span>
                        <strong className={spot.status === "open" ? "bad" : "good"}>
                          {spot.status === "open" ? t.spot.open(daysOpen(spot, t)) : t.spot.cleaned(timeAgo(spot.cleaned_at!, t))}
                        </strong>
                      </div>
                      <div>
                        <span>{t.spot.reportedBy}</span>
                        <strong>{t.spot.people(spot.confirms)}</strong>
                      </div>
                      <div>
                        <span>{t.spot.ward}</span>
                        <strong>
                          <button className="linkish strong" onClick={() => openWard(spot.ward_id)}>
                            {wName(spot.ward_id)}
                          </button>
                        </strong>
                      </div>
                    </div>
                    {spot.status === "open" && (
                      <>
                        <span className="lbl">{t.spot.sendCity}</span>
                        <div className="two">
                          <a className="btn primary" target="_blank" rel="noopener noreferrer" href={spotWhatsApp(spot, statById.get(spot.ward_id)?.name)}>
                            {t.spot.whatsappCity}
                          </a>
                          <a className="btn" target="_blank" rel="noopener noreferrer" href={spotShareX(spot, t, wName(spot.ward_id))}>
                            {t.spot.postX}
                          </a>
                        </div>
                        <span className="lbl">{t.spot.hereNow}</span>
                        <div className="two">
                          <button className="btn" disabled={voting} onClick={() => vote("still")}>
                            {t.spot.still}
                          </button>
                          <button className="btn" disabled={voting} onClick={() => vote("cleaned")}>
                            {t.spot.cleanedBtn}
                          </button>
                        </div>
                        <label className="linkish center">
                          {t.spot.addAfter}
                          <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && vote("cleaned", e.target.files[0])} />
                        </label>
                      </>
                    )}
                    <button className="linkish center" disabled={voting} onClick={() => vote("flag")}>
                      {t.spot.flag}
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
          {t.home.fab}
        </button>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {signingIn && (
        <SignInSheet
          lang={lang}
          text={{ ...t.auth, cancel: t.auth.notNow }}
          onDone={signedIn}
          onClose={() => {
            pending.current = null;
            setSigningIn(false);
          }}
        />
      )}
    </div>
  );
}

/* ================================================================== pieces */

function Account({ me, t, onSignIn, onSignOut }: { me: Me | null; t: Dict; onSignIn: () => void; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);
  if (!me)
    return (
      <button className="acct-btn out" onClick={onSignIn}>
        {t.auth.signIn}
      </button>
    );
  return (
    <div className="acct" ref={ref}>
      <button className="acct-btn" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        {me.picture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.picture} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="ini">{me.name.slice(0, 1).toUpperCase()}</span>
        )}
        {me.name}
      </button>
      {open && (
        <div className="acct-menu">
          <small>{t.auth.signedInAs(me.name)}</small>
          <button
            className="btn"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            {t.auth.signOut}
          </button>
        </div>
      )}
    </div>
  );
}

function WardMini({ w, t }: { w: WardStat; t: Dict }) {
  const enough = w.checkins >= MIN_CHECKINS;
  return (
    <div className="ward-mini">
      <div className="big" style={{ color: enough ? scoreColor(w.score) : undefined }}>
        {enough ? pct(w.score) : "–"}
      </div>
      <div>
        <b>{enough ? t.home.saidCame : t.home.wardNotEnough}</b>
        <small>{t.home.wardDetail(w.checkins, w.streets, w.missed, w.refused, w.open_spots)}</small>
      </div>
    </div>
  );
}

function TodayCard(p: {
  t: Dict;
  lang: Lang;
  home: HomeT | null;
  homeWardName: string;
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
  const { t } = p;
  const [draft, setDraft] = useState<HomeT | null>(null);
  const [finding, setFinding] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ title: string; subtitle: string; lat: number; lng: number }[]>([]);
  const ctl = useRef<AbortController | null>(null);

  const resolve = async (pt: LatLng, streetHint?: string) => {
    setFinding(true);
    try {
      const r = await api.locate(pt.lat, pt.lng);
      if (!r.ward) return p.say(t.today.outside);
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
    const timer = setTimeout(() => api.search(q, c.signal).then((r) => !c.signal.aborted && setResults(r.places)).catch(() => {}), 350);
    return () => clearTimeout(timer);
  }, [q]);

  if (!p.home) {
    return (
      <div className="card today">
        <h2>{t.today.question}</h2>
        {!draft ? (
          <>
            <p className="muted">{t.today.setOnce}</p>
            <button
              className="btn primary"
              disabled={p.locating || finding}
              onClick={async () => {
                const pt = await p.locate();
                if (pt) resolve(pt);
              }}
            >
              {p.locating || finding ? t.today.findingStreet : t.today.useLocation}
            </button>
            <div className="search">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.today.searchPh} aria-label={t.today.searchPh} />
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
              <span className="lbl">{t.today.yourStreet}</span>
              <strong>{draft.street || t.today.yourSpot}</strong>
              <span className="muted small">{t.common.ward(draft.ward_name)}</span>
            </div>
            <div className="two">
              <button className="btn" onClick={() => setDraft(null)}>
                {t.today.change}
              </button>
              <button className="btn primary" onClick={() => p.onSetHome(draft)}>
                {t.today.thatsMine}
              </button>
            </div>
            <p className="muted small">{t.today.savedOnly}</p>
          </>
        )}
      </div>
    );
  }

  const myWardName = p.myWard ? wardName(p.lang, p.myWard) : p.homeWardName;
  return (
    <div className="card today">
      <div className="row-between">
        <span className="lbl">
          {p.home.street || t.today.yourStreet} · {p.homeWardName}
        </span>
        <button className="linkish" onClick={p.onClearHome}>
          {t.today.changeStreet}
        </button>
      </div>
      <h2>{p.today ? t.today.thanks : t.today.question}</h2>
      <div className="status-btns">
        {STATUSES.map((s) => (
          <button key={s} className={`st st-${s}`} aria-pressed={p.today === s} disabled={p.saving} onClick={() => p.onCheckin(s)}>
            <b>{t.status[s].label}</b>
            <small>{t.status[s].sub}</small>
          </button>
        ))}
      </div>
      {p.today && p.myWard && (
        <p className="small">
          {p.myWard.checkins >= MIN_CHECKINS ? (
            <>{fill(t.today.wardScore, { ward: myWardName, pct: <b style={{ color: scoreColor(p.myWard.score) }}>{pct(p.myWard.score)}</b> })} </>
          ) : (
            <>{t.today.needMore(myWardName)} </>
          )}
          <Link href={`/ward/${p.myWard.ward_id}`}>{t.today.seeCard}</Link>
        </p>
      )}
      {p.today && <p className="muted small">{t.today.changeHint}</p>}
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
