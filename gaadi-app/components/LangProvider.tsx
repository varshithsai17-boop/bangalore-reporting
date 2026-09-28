"use client";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { dict, LANG_COOKIE, LANGS, type Dict, type Lang } from "@/lib/i18n";

type Ctx = { lang: Lang; t: Dict; setLang: (l: Lang) => void };
const LangContext = createContext<Ctx>({ lang: "en", t: dict("en"), setLang: () => {} });

export function LangProvider({ initial, children }: { initial: Lang; children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);
  const router = useRouter();
  const setLang = useCallback(
    (l: Lang) => {
      document.cookie = `${LANG_COOKIE}=${l}; Path=/; Max-Age=31536000; SameSite=Lax`;
      document.documentElement.lang = LANGS.find((x) => x.code === l)?.html ?? "en-IN";
      setLangState(l);
      router.refresh(); // re-render server pages (ward report cards, rankings) in the new language
    },
    [router],
  );
  const value = useMemo(() => ({ lang, t: dict(lang), setLang }), [lang, setLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);

/** EN · हिं · ಕ switcher for the page header. */
export function LangSwitch() {
  const { lang, setLang, t } = useLang();
  return (
    <div className="lang" role="group" aria-label={t.common.language}>
      {LANGS.map((l) => (
        <button key={l.code} lang={l.html} aria-pressed={lang === l.code} title={l.name} aria-label={l.name} onClick={() => lang !== l.code && setLang(l.code)}>
          {l.short}
        </button>
      ))}
    </div>
  );
}
