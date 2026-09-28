import "server-only";
import { cookies } from "next/headers";
import { dict, isLang, LANG_COOKIE, type Lang } from "./index";

/** Language for server-rendered pages, from the cookie the switcher sets. */
export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(v) ? v : "en";
}

export async function getDict() {
  const lang = await getLang();
  return { lang, t: dict(lang) };
}
