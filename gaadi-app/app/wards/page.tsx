import type { Metadata } from "next";
import Link from "next/link";
import { LangSwitch } from "@/components/LangProvider";
import Rankings from "@/components/Rankings";
import { getDict } from "@/lib/i18n/server";
import { getWardStats } from "@/lib/server/data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Ward rankings",
  description: "Which Bengaluru wards does the garbage van actually reach? Ranked by residents' daily check-ins.",
};

export default async function WardsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { days: d } = await searchParams;
  const days = d === "30" ? 30 : 7;
  const [stats, { t }] = await Promise.all([getWardStats(days), getDict()]);
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
            <Link href="/">{t.common.map}</Link>
            <Link href="/about">{t.common.how}</Link>
          </nav>
          <LangSwitch />
        </div>
      </header>
      <section className="rc-head">
        <span className="lbl">{t.rankings.lbl(days)}</span>
        <h1>{t.rankings.title}</h1>
        <div className="seg">
          <Link href="/wards" aria-current={days === 7 ? "page" : undefined}>
            {t.rankings.d7}
          </Link>
          <Link href="/wards?days=30" aria-current={days === 30 ? "page" : undefined}>
            {t.rankings.d30}
          </Link>
        </div>
      </section>
      <Rankings stats={stats} />
    </div>
  );
}
