import type { Metadata, Viewport } from "next";
import { Big_Shoulders, IBM_Plex_Mono, Instrument_Sans, Noto_Sans_Kannada } from "next/font/google";
import "./globals.css";

const display = Big_Shoulders({ subsets: ["latin"], weight: ["800"], variable: "--font-display", adjustFontFallback: false });
const body = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });
const kannada = Noto_Sans_Kannada({ subsets: ["kannada"], weight: ["600"], variable: "--font-kn" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: "Neeru · Bengaluru flooded roads, live",
  description: "Check your route for flooded roads before you leave. Live depth reports from people standing in the water, across Bengaluru.",
  applicationName: "Neeru",
  openGraph: {
    title: "Neeru · Is your route flooded?",
    description: "Live depth reports from people standing in the water, across Bengaluru.",
    type: "website",
    locale: "en_IN",
  },
  twitter: { card: "summary_large_image" },
  appleWebApp: { capable: true, title: "Neeru", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0c1822",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${display.variable} ${body.variable} ${mono.variable} ${kannada.variable}`}>
      <body>{children}</body>
    </html>
  );
}
