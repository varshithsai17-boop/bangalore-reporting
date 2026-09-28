import type { Metadata } from "next";
import Link from "next/link";
import Rankings from "@/components/Rankings";
import { getWardStats } from "@/lib/server/data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Ward rankings",
  description: "Which Bengaluru wards does the garbage van actually reach? Ranked by residents' daily check-ins.",
};

export default async function WardsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { days: d } = await searchParams;
  const days = d === "30" ? 30 : 7;
  const stats = await getWardStats(days);
  return (
    <div className="page">
      <header className="top">
        <Link href="/" className="brand">
          <span className="word">
            Gaadi Bantha<span className="q">?</span>
          </span>
        </Link>
        <nav className="nav">
          <Link href="/">Map</Link>
          <Link href="/about">How it works</Link>
        </nav>
      </header>
      <section className="rc-head">
        <span className="lbl">Residents' check-ins · last {days} days</span>
        <h1>Which wards does the van actually reach?</h1>
        <div className="seg">
          <Link href="/wards" aria-current={days === 7 ? "page" : undefined}>
            7 days
          </Link>
          <Link href="/wards?days=30" aria-current={days === 30 ? "page" : undefined}>
            30 days
          </Link>
        </div>
      </section>
      <Rankings stats={stats} />
    </div>
  );
}
