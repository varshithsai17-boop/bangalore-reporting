import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ShareBar from "@/components/ShareBar";
import { wardShareText } from "@/components/share";
import { CATEGORY_INFO, MIN_CHECKINS, pct, photoUrl, scoreColor } from "@/lib/constants";
import { getSpots, getWardDetail, getWardStats } from "@/lib/server/data";
import type { WardDetail, WardStat } from "@/lib/types";
import { wardById } from "@/lib/wards";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const w = wardById(id);
  if (!w) return {};
  return {
    title: `${w.name} ward report card`,
    description: `Did the garbage van come in ${w.name}? Daily check-ins from residents, open garbage spots and how fast they get cleaned.`,
  };
}

function rankOf(stats: WardStat[], id: string) {
  const ranked = stats.filter((s) => s.checkins >= MIN_CHECKINS && s.score != null).sort((a, b) => b.score! - a.score! || b.checkins - a.checkins);
  const i = ranked.findIndex((s) => s.ward_id === id);
  return { rank: i >= 0 ? i + 1 : null, of: ranked.length };
}

export default async function WardPage({ params }: Params) {
  const { id } = await params;
  const base = wardById(id);
  if (!base) notFound();
  const [s7, s30, detail, spots] = await Promise.all([getWardStats(7), getWardStats(30), getWardDetail(id), getSpots()]);
  const w7 = s7.find((s) => s.ward_id === id)!;
  const w30 = s30.find((s) => s.ward_id === id)!;
  const { rank, of } = rankOf(s7, id);
  const wardSpots = spots.filter((s) => s.ward_id === id);
  const open = wardSpots.filter((s) => s.status === "open");
  const enough7 = w7.checkins >= MIN_CHECKINS;
  const enough30 = w30.checkins >= MIN_CHECKINS;

  return (
    <div className="page">
      <header className="top">
        <Link href="/" className="brand">
          <span className="word">
            Gaadi Bantha<span className="q">?</span>
          </span>
        </Link>
        <nav className="nav">
          <Link href="/wards">Ward rankings</Link>
          <Link href="/">Map</Link>
        </nav>
      </header>

      <section className="rc-head">
        <span className="lbl">
          Ward {base.no} · {base.corp} corporation · {base.assembly} assembly · population {base.pop.toLocaleString("en-IN")}
        </span>
        <h1>
          {base.name}{" "}
          <span className="kn" lang="kn">
            {base.name_kn}
          </span>
        </h1>
      </section>

      <section className="rc-grid">
        <div className="card rc-score">
          <span className="lbl">Van came · last 7 days</span>
          <div className="huge" style={{ color: enough7 ? scoreColor(w7.score) : undefined }}>
            {enough7 ? pct(w7.score) : "–"}
          </div>
          <p>
            {enough7 ? (
              <>
                of {w7.checkins} check-ins from {w7.streets} {w7.streets === 1 ? "street" : "streets"}.{" "}
                {rank ? (
                  <>
                    Ranked <b>#{rank}</b> of {of} wards with enough data.
                  </>
                ) : null}
              </>
            ) : (
              <>Only {w7.checkins} check-ins this week. A ward needs {MIN_CHECKINS} to get a score. Share this page with your neighbours.</>
            )}
          </p>
        </div>
        <div className="card rc-facts">
          <Fact label="Last 30 days" value={enough30 ? pct(w30.score) : "–"} color={enough30 ? scoreColor(w30.score) : undefined} sub={`${w30.checkins} check-ins`} />
          <Fact label="Van didn't come" value={String(w7.missed)} sub="times this week" />
          <Fact label="Came, didn't take it" value={String(w7.refused)} sub="times this week" />
          <Fact label="Open garbage spots" value={String(open.length)} sub={w30.avg_clean_days != null ? `cleaned in ${w30.avg_clean_days} days on average` : "none cleaned yet"} />
        </div>
      </section>

      <section className="card">
        <span className="lbl">Every day, last 30 days</span>
        <DailyChart daily={detail.daily} />
        <div className="chart-key">
          <span>
            <i style={{ background: "#2f8f57" }} />
            Came
          </span>
          <span>
            <i style={{ background: "#e9b12a" }} />
            Came, didn't take it
          </span>
          <span>
            <i style={{ background: "#c8372d" }} />
            Didn't come
          </span>
        </div>
      </section>

      {detail.streets.length > 0 && (
        <section className="card">
          <span className="lbl">Streets with the most misses · 30 days</span>
          <ol className="rank">
            {detail.streets.map((s) => (
              <li key={s.street}>
                <div className="rank-row">
                  <span>
                    <b>{s.street}</b>
                    <small>{s.n} check-ins</small>
                  </span>
                  <span className="score" style={{ color: scoreColor(1 - s.missed / s.n) }}>
                    {s.missed} missed
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="card">
        <span className="lbl">Open garbage spots in {base.name}</span>
        {open.length === 0 ? (
          <p className="muted small">None reported right now.</p>
        ) : (
          <div className="photo-grid">
            {open.slice(0, 12).map((s) => (
              <figure key={s.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl(s.photo)} alt={`${CATEGORY_INFO[s.category].label} at ${s.label ?? "a spot in this ward"}`} loading="lazy" />
                <figcaption>
                  <b>{CATEGORY_INFO[s.category].label}</b>
                  {s.label}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <span className="lbl">Share this report card</span>
        <ShareBar text={enough7 ? wardShareText(w7) : `Did the garbage van come in ${base.name}? Check in daily on Gaadi Bantha.`} path={`/ward/${id}`} />
      </section>

      <p className="muted small foot">
        Numbers come from residents' daily check-ins on this site and are not official figures. Ward boundaries: GBA final delimitation, December 2025, via OpenCity.
      </p>
    </div>
  );
}

function Fact({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <div className="fact">
      <span className="lbl">{label}</span>
      <strong style={{ color }}>{value}</strong>
      <small>{sub}</small>
    </div>
  );
}

function DailyChart({ daily }: { daily: WardDetail["daily"] }) {
  const W = 720;
  const H = 180;
  const padL = 26;
  const padB = 22;
  const padT = 10;
  const max = Math.max(4, ...daily.map((d) => d.came + d.missed + d.refused));
  const step = Math.ceil(max / 4);
  const top = step * 4;
  const bw = (W - padL) / daily.length;
  const y = (v: number) => padT + (H - padB - padT) * (1 - v / top);
  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily check-ins for the last 30 days: came, came but didn't take it, and didn't come">
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <line x1={padL} x2={W} y1={y(i * step)} y2={y(i * step)} stroke="#d6ddd5" strokeWidth="1" />
            <text x={padL - 6} y={y(i * step) + 4} textAnchor="end" fontSize="10" fill="#5d6b62" fontFamily="var(--font-mono)">
              {i * step}
            </text>
          </g>
        ))}
        {daily.map((d, i) => {
          const x = padL + i * bw + bw * 0.15;
          const w = bw * 0.7;
          let acc = 0;
          const seg = (v: number, color: string, key: string) => {
            if (!v) return null;
            const r = <rect key={key} x={x} y={y(acc + v)} width={w} height={y(acc) - y(acc + v)} fill={color} rx="1.5" />;
            acc += v;
            return r;
          };
          const date = new Date(d.day + "T00:00:00");
          return (
            <g key={d.day}>
              <title>{`${date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}: ${d.came} came, ${d.refused} came but didn't take it, ${d.missed} didn't come`}</title>
              {seg(d.came, "#2f8f57", "c")}
              {seg(d.refused, "#e9b12a", "r")}
              {seg(d.missed, "#c8372d", "m")}
              {(i % 5 === 0 || i === daily.length - 1) && (
                <text x={x + w / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="#5d6b62" fontFamily="var(--font-mono)">
                  {date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
