"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { MIN_CHECKINS, pct, scoreColor } from "@/lib/constants";
import { wardName } from "@/lib/i18n";
import { useLang } from "./LangProvider";
import type { WardStat } from "@/lib/types";

const CORPS = ["All", "Central", "East", "North", "South", "West"];
type Sort = "worst" | "best" | "spots";

export default function Rankings({ stats }: { stats: WardStat[] }) {
  const { t, lang } = useLang();
  const [corp, setCorp] = useState("All");
  const [sort, setSort] = useState<Sort>("worst");
  const [q, setQ] = useState("");

  const { ranked, pending } = useMemo(() => {
    const f = stats.filter((s) => (corp === "All" || s.corp === corp) && (s.name + " " + (s.name_kn ?? "")).toLowerCase().includes(q.trim().toLowerCase()));
    const ranked = f.filter((s) => s.checkins >= MIN_CHECKINS && s.score != null);
    ranked.sort((a, b) =>
      sort === "spots" ? b.open_spots - a.open_spots || a.score! - b.score! : sort === "worst" ? a.score! - b.score! || b.checkins - a.checkins : b.score! - a.score! || b.checkins - a.checkins,
    );
    return { ranked, pending: f.filter((s) => !(s.checkins >= MIN_CHECKINS && s.score != null)).sort((a, b) => b.checkins - a.checkins) };
  }, [stats, corp, sort, q]);

  return (
    <section className="card">
      <div className="filters">
        <div className="chips" role="group" aria-label={t.rankings.corpAria}>
          {CORPS.map((c) => (
            <button key={c} aria-pressed={corp === c} onClick={() => setCorp(c)}>
              {t.common.corp[c] ?? c}
            </button>
          ))}
        </div>
        <div className="filters-row">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.rankings.find} aria-label={t.rankings.find} />
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={t.rankings.sortBy}>
            <option value="worst">{t.rankings.worstFirst}</option>
            <option value="best">{t.rankings.bestFirst}</option>
            <option value="spots">{t.rankings.mostSpots}</option>
          </select>
        </div>
      </div>
      {ranked.length === 0 ? (
        <p className="muted">{t.rankings.noneYet(MIN_CHECKINS)}</p>
      ) : (
        <ol className="table">
          {ranked.map((s, i) => (
            <li key={s.ward_id}>
              <Link href={`/ward/${s.ward_id}`}>
                <span className="n">{i + 1}</span>
                <span className="name">
                  <b>{wardName(lang, s)}</b>
                  <small>{t.rankings.row(t.common.corp[s.corp] ?? s.corp, s.checkins, s.open_spots)}</small>
                </span>
                <span className="bar" aria-hidden="true">
                  <i style={{ width: `${Math.round((s.score ?? 0) * 100)}%`, background: scoreColor(s.score) }} />
                </span>
                <span className="score" style={{ color: scoreColor(s.score) }}>
                  {pct(s.score)}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
      {pending.length > 0 && (
        <details className="pending">
          <summary>
            {t.rankings.pending(pending.length)}
          </summary>
          <ul>
            {pending.map((s) => (
              <li key={s.ward_id}>
                <Link href={`/ward/${s.ward_id}`}>{wardName(lang, s)}</Link> <small>({s.checkins})</small>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
