import { ImageResponse } from "next/og";

export const alt = "Gaadi Bantha: did the garbage van come?";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  const cells = ["#2f8f57", "#8fb83a", "#c8372d", "#e9b12a", "#2f8f57", "#e0742b", "#2f8f57", "#c8372d", "#8fb83a", "#2f8f57", "#e9b12a", "#2f8f57"];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#1f7a4d", color: "#eef1ec", padding: 72, justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 700 }}>
          <div style={{ fontSize: 110, fontWeight: 800, lineHeight: 0.95, display: "flex", flexDirection: "column" }}>
            <span>Gaadi</span>
            <span>
              Bantha<span style={{ color: "#f2c230" }}>?</span>
            </span>
          </div>
          <div style={{ fontSize: 36, lineHeight: 1.25 }}>Did the garbage van come today? One tap a day. Every Bengaluru ward gets a report card.</div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", width: 300, alignContent: "center" }}>
          {cells.map((c, i) => (
            <div key={i} style={{ width: 84, height: 84, margin: 8, borderRadius: 14, background: c, border: "4px solid #eef1ec" }} />
          ))}
        </div>
      </div>
    ),
    size,
  );
}
