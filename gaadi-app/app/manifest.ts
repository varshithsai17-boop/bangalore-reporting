import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gaadi Bantha? · Bengaluru garbage van tracker",
    short_name: "Gaadi Bantha",
    description: "Did the garbage van come today? One tap a day, and every ward gets a report card.",
    start_url: "/",
    display: "standalone",
    background_color: "#eef1ec",
    theme_color: "#1f7a4d",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
