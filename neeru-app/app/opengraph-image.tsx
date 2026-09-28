import { ImageResponse } from "next/og";

export const alt = "Neeru: is your route flooded?";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  const dots = [
    ["#e5484d", 780, 180, 26],
    ["#f2743a", 900, 300, 22],
    ["#f2b33d", 700, 360, 20],
    ["#f2b33d", 980, 440, 18],
    ["#7fd0e6", 820, 480, 16],
    ["#7fd0e6", 1060, 230, 16],
  ] as const;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0c1822", color: "#e7eef2", padding: 72, position: "relative" }}>
        <svg width="1200" height="630" style={{ position: "absolute", left: 0, top: 0 }}>
          <path d="M620 120 C760 60 1000 120 1080 260 S1040 560 860 560 S600 470 600 320 Z" fill="none" stroke="#3a5a76" strokeWidth="10" />
          <path d="M560 330 L1160 330 M840 40 L840 620 M650 560 L1100 110" stroke="#223a4e" strokeWidth="7" />
          {dots.map(([c, x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill={c} stroke="#0b141c" strokeWidth="5" />
          ))}
        </svg>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 560 }}>
          <div style={{ fontSize: 120, fontWeight: 800, letterSpacing: 2, display: "flex" }}>
            NEE<span style={{ color: "#7fd0e6" }}>RU</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 58, fontWeight: 700, lineHeight: 1.05 }}>Is your route flooded?</div>
            <div style={{ fontSize: 28, color: "#8ea3b2", marginTop: 20 }}>Live depth reports from people standing in the water, across Bengaluru.</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
