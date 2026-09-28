import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono, Noto_Sans_Kannada, Public_Sans } from "next/font/google";
import "./globals.css";

const display = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-display" });
const body = Public_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });
const kannada = Noto_Sans_Kannada({ subsets: ["kannada"], weight: ["600"], variable: "--font-kn" });

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${display.variable} ${body.variable} ${mono.variable} ${kannada.variable}`}>
      <body>{children}</body>
    </html>
  );
}
