"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { MIN_CHECKINS, pct, scoreColor } from "@/lib/constants";
import type { WardStat } from "@/lib/types";

const CORPS = ["All", "Central", "East", "North", "South", "West"];
type Sort = "worst" | "best" | "spots";

export default function Rankings({ stats }: { stats: WardStat[] }) {
  const [corp, setCorp] = useState("All");
  const [sort, setSort] = useState<Sort>("worst");
  const [q, setQ] = useState("");

  const { ranked, pending } = useMemo(() => {
    const f = stats.filter((s) => (corp === "All" || s.corp === corp) && s.name.toLowerCase().includes(q.trim().toLowerCase()));
    const ranked = f.filter((s) => s.checkins >= MIN_CHECKINS && s.score != null);
    ranked.sort((a, b) =>
      sort === "spots" ? b.open_spots - a.open_spots || a.score! - b.score! : sort === "worst" ? a.score! - b.score! || b.checkins - a.checkins : b.score! - a.score! || b.checkins - a.checkins,
    );
    return { ranked, pending: f.filter((s) => !(s.checkins >= MIN_CHECKINS && s.score != null)).sort((a, b) => b.checkins - a.checkins) };
  }, [stats, corp, sort, q]);

  return (
    <section className="card">
      <div className="filters">
        <div className="chips" role="group" aria-label="Corporation">
          {CORPS.map((c) => (
            <button key={c} aria-pressed={corp === c} onClick={() => setCorp(c)}>
              {c}
            </button>
          ))}
        </div>
        <div className="filters-row">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a ward" aria-label="Find a ward" />
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort by">
            <option value="worst">Worst first</option>
            <option value="best">Best first</option>
            <option value="spots">Most open garbage spots</option>
          </select>
        </div>
      </div>
      {ranked.length === 0 ? (
        <p className="muted">No ward has {MIN_CHECKINS} check-ins yet for this filter.</p>
      ) : (
        <ol className="table">
          {ranked.map((s, i) => (
            <li key={s.ward_id}>
              <Link href={`/ward/${s.ward_id}`}>
                <span className="n">{i + 1}</span>
                <span className="name">
                  <b>{s.name}</b>
                  <small>
                    {s.corp} · {s.checkins} check-ins · {s.open_spots} open {s.open_spots === 1 ? "spot" : "spots"}
                  </small>
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
            {pending.length} {pending.length === 1 ? "ward needs" : "wards need"} more check-ins to be ranked
          </summary>
          <ul>
            {pending.map((s) => (
              <li key={s.ward_id}>
                <Link href={`/ward/${s.ward_id}`}>{s.name}</Link> <small>({s.checkins})</small>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
