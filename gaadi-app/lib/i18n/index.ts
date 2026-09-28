import { Fragment, createElement, type ReactNode } from "react";
import { en, type Dict } from "./en";
import { hi } from "./hi";
import { kn } from "./kn";

export type Lang = "en" | "hi" | "kn";
export type { Dict };

export const LANGS: { code: Lang; short: string; name: string; html: string }[] = [
  { code: "en", short: "EN", name: "English", html: "en-IN" },
  { code: "hi", short: "हिं", name: "हिन्दी", html: "hi-IN" },
  { code: "kn", short: "ಕ", name: "ಕನ್ನಡ", html: "kn-IN" },
];

export const LANG_COOKIE = "gb_lang";
const DICTS: Record<Lang, Dict> = { en, hi, kn };

export const isLang = (v: unknown): v is Lang => v === "en" || v === "hi" || v === "kn";
export const dict = (lang: Lang): Dict => DICTS[lang] ?? en;

/** Reads the language from a raw Cookie header (API routes). */
export function langFromCookieHeader(header: string | null): Lang {
  const v = (header ?? "")
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${LANG_COOKIE}=`))
    ?.slice(LANG_COOKIE.length + 1);
  return isLang(v) ? v : "en";
}

/** Translated error message for a code, falling back to English and then to `fallback`. */
export const errorText = (lang: Lang, code: string, fallback?: string) =>
  dict(lang).errors[code] ?? en.errors[code] ?? fallback ?? dict(lang).errors.generic;

/**
 * Fills {placeholders} in a sentence with React nodes, so bold numbers can sit wherever each
 * language puts them: fill("In {ward}, the van came on {pct}", { ward: "Jayanagar", pct: <b>80%</b> }).
 */
export function fill(template: string, parts: Record<string, ReactNode>): ReactNode {
  const out = template.split(/(\{\w+\})/).map((bit, i) => {
    const m = bit.match(/^\{(\w+)\}$/);
    return createElement(Fragment, { key: i }, m && m[1] in parts ? parts[m[1]] : bit);
  });
  return createElement(Fragment, null, ...out);
}

/** Ward name in the chosen language (Kannada names exist for all 369 wards). */
export const wardName = (lang: Lang, w: { name: string; name_kn?: string | null }) => (lang === "kn" && w.name_kn ? w.name_kn : w.name);
