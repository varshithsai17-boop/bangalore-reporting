import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono, Noto_Sans_Devanagari, Noto_Sans_Kannada, Public_Sans } from "next/font/google";
import { LangProvider } from "@/components/LangProvider";
import { LANGS } from "@/lib/i18n";
import { getLang } from "@/lib/i18n/server";
import "./globals.css";

const display = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-display" });
const body = Public_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });
const kannada = Noto_Sans_Kannada({ subsets: ["kannada"], weight: ["400", "600", "800"], variable: "--font-kn" });
const hindi = Noto_Sans_Devanagari({ subsets: ["devanagari"], weight: ["400", "600", "800"], variable: "--font-hi" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: { default: "Gaadi Bantha? · Did Bengaluru's garbage van come?", template: "%s · Gaadi Bantha?" },
  description: "Residents check in daily on whether the garbage van came. Every ward in Bengaluru gets a public report card.",
  applicationName: "Gaadi Bantha?",
  openGraph: { type: "website", locale: "en_IN", siteName: "Gaadi Bantha?" },
  twitter: { card: "summary_large_image" },
  appleWebApp: { capable: true, title: "Gaadi Bantha?", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#eef1ec", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={LANGS.find((l) => l.code === lang)!.html} className={`${display.variable} ${body.variable} ${mono.variable} ${kannada.variable} ${hindi.variable}`}>
      <body>
        <LangProvider initial={lang}>{children}</LangProvider>
      </body>
    </html>
  );
}
