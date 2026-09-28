import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Neeru · Bengaluru flooded roads",
    short_name: "Neeru",
    description: "Check your route for flooded roads. Live depth reports across Bengaluru.",
    start_url: "/",
    display: "standalone",
    background_color: "#0c1822",
    theme_color: "#0c1822",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
