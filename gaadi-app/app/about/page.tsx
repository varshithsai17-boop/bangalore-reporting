import type { Metadata } from "next";
import Link from "next/link";
import { LangSwitch } from "@/components/LangProvider";
import { CITY_WHATSAPP_DISPLAY, MIN_CHECKINS } from "@/lib/constants";
import { getDict } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "How it works" };

export default async function About() {
  const { t } = await getDict();
  return (
    <div className="page narrow">
      <header className="top">
        <Link href="/" className="brand">
          <span className="word">
            Gaadi Bantha<span className="q">?</span>
          </span>
        </Link>
        <div className="top-end">
          <nav className="nav">
            <Link href="/">{t.common.map}</Link>
            <Link href="/wards">{t.common.rankings}</Link>
          </nav>
          <LangSwitch />
        </div>
      </header>
      <article className="card prose">
        <h1>{t.about.title}</h1>
        <p>{t.about.intro}</p>
        {t.about.sections(MIN_CHECKINS, CITY_WHATSAPP_DISPLAY).map((s) => (
          <section key={s.h}>
            <h2>{s.h}</h2>
            <p>{s.p}</p>
          </section>
        ))}
      </article>
    </div>
  );
}
