import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LangSwitch } from "@/components/LangProvider";
import ShareBar from "@/components/ShareBar";
import { wardShareText } from "@/components/share";
import { MIN_CHECKINS, pct, photoUrl, scoreColor } from "@/lib/constants";
import { fill, LANGS, wardName, type Dict } from "@/lib/i18n";
import { getDict } from "@/lib/i18n/server";
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
  const { lang, t } = await getDict();
  const locale = LANGS.find((l) => l.code === lang)!.html;
  const name = wardName(lang, base);
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
        <div className="top-end">
          <nav className="nav">
            <Link href="/wards">{t.common.rankings}</Link>
            <Link href="/">{t.common.map}</Link>
          </nav>
          <LangSwitch />
        </div>
      </header>

      <section className="rc-head">
        <span className="lbl">
          {t.ward.top(base.no, t.common.corp[base.corp] ?? base.corp, base.assembly, base.pop.toLocaleString("en-IN"))}
        </span>
        <h1>
          {name}{" "}
          {lang !== "kn" && (
            <span className="kn" lang="kn">
              {base.name_kn}
            </span>
          )}
        </h1>
      </section>

      <section className="rc-grid">
        <div className="card rc-score">
          <span className="lbl">{t.ward.came7}</span>
          <div className="huge" style={{ color: enough7 ? scoreColor(w7.score) : undefined }}>
            {enough7 ? pct(w7.score) : "–"}
          </div>
          <p>
            {enough7 ? (
              <>
                {t.ward.ofCheckins(w7.checkins, w7.streets)} {rank ? fill(t.ward.ranked, { rank: <b>#{rank}</b>, of }) : null}
              </>
            ) : (
              <>{t.ward.onlyN(w7.checkins, MIN_CHECKINS)}</>
            )}
          </p>
        </div>
        <div className="card rc-facts">
          <Fact label={t.ward.last30} value={enough30 ? pct(w30.score) : "–"} color={enough30 ? scoreColor(w30.score) : undefined} sub={t.common.checkins(w30.checkins)} />
          <Fact label={t.ward.missed} value={String(w7.missed)} sub={t.ward.timesWeek} />
          <Fact label={t.ward.refused} value={String(w7.refused)} sub={t.ward.timesWeek} />
          <Fact label={t.ward.openSpots} value={String(open.length)} sub={w30.avg_clean_days != null ? t.ward.cleanedAvg(w30.avg_clean_days) : t.ward.noneCleaned} />
        </div>
      </section>

      <section className="card">
        <span className="lbl">{t.ward.everyDay}</span>
        <DailyChart daily={detail.daily} t={t} locale={locale} />
        <div className="chart-key">
          <span>
            <i style={{ background: "#2f8f57" }} />
            {t.status.came.label}
          </span>
          <span>
            <i style={{ background: "#e9b12a" }} />
            {t.status.refused.label}
          </span>
          <span>
            <i style={{ background: "#c8372d" }} />
            {t.status.missed.label}
          </span>
        </div>
      </section>

      {detail.streets.length > 0 && (
        <section className="card">
          <span className="lbl">{t.ward.worstStreets}</span>
          <ol className="rank">
            {detail.streets.map((s) => (
              <li key={s.street}>
                <div className="rank-row">
                  <span>
                    <b>{s.street}</b>
                    <small>{t.common.checkins(s.n)}</small>
                  </span>
                  <span className="score" style={{ color: scoreColor(1 - s.missed / s.n) }}>
                    {t.ward.missedN(s.missed)}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="card">
        <span className="lbl">{t.ward.openIn(name)}</span>
        {open.length === 0 ? (
          <p className="muted small">{t.ward.noneNow}</p>
        ) : (
          <div className="photo-grid">
            {open.slice(0, 12).map((s) => (
              <figure key={s.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl(s.photo)} alt={t.ward.spotAlt(t.cats[s.category].label, s.label ?? t.ward.aSpot)} loading="lazy" />
                <figcaption>
                  <b>{t.cats[s.category].label}</b>
                  {s.label}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <span className="lbl">{t.ward.share}</span>
        <ShareBar text={enough7 ? wardShareText(w7, t, name) : t.share.wardLow(name)} path={`/ward/${id}`} />
      </section>

      <p className="muted small foot">
        {t.ward.foot}
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

function DailyChart({ daily, t, locale }: { daily: WardDetail["daily"]; t: Dict; locale: string }) {
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
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.ward.chartAria}>
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
              <title>{t.ward.dayTitle(date.toLocaleDateString(locale, { day: "numeric", month: "short" }), d.came, d.refused, d.missed)}</title>
              {seg(d.came, "#2f8f57", "c")}
              {seg(d.refused, "#e9b12a", "r")}
              {seg(d.missed, "#c8372d", "m")}
              {(i % 5 === 0 || i === daily.length - 1) && (
                <text x={x + w / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="#5d6b62" fontFamily="var(--font-mono)">
                  {date.toLocaleDateString(locale, { day: "numeric", month: "short" })}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
