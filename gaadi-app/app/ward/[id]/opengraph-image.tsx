import { ImageResponse } from "next/og";
import { MIN_CHECKINS, pct, scoreColor } from "@/lib/constants";
import { getWardDetail, getWardStats } from "@/lib/server/data";
import { wardById } from "@/lib/wards";

export const alt = "Ward garbage van report card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OG({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const w = wardById(id);
  const [stats, detail] = await Promise.all([getWardStats(7).catch(() => []), getWardDetail(id).catch(() => null)]);
  const s = stats.find((x) => x.ward_id === id);
  const enough = !!s && s.checkins >= MIN_CHECKINS;
  const last7 = (detail?.daily ?? []).slice(-7);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#eef1ec", color: "#15241b", padding: 64 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 36, fontWeight: 800, display: "flex" }}>
            Gaadi Bantha<span style={{ color: "#1f7a4d" }}>?</span>
          </div>
          <div style={{ fontSize: 24, color: "#5d6b62" }}>Ward report card · last 7 days</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 30, color: "#5d6b62" }}>{w ? `${w.corp} corporation · ward ${w.no}` : "Bengaluru"}</div>
          <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.02 }}>{w?.name ?? "Unknown ward"}</div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "baseline" }}>
            <div style={{ fontSize: 150, fontWeight: 800, lineHeight: 1, color: enough ? scoreColor(s!.score) : "#9aa59d" }}>{enough ? pct(s!.score) : "–"}</div>
            <div style={{ fontSize: 30, marginLeft: 24, maxWidth: 380, color: "#15241b" }}>
              {enough ? `of ${s!.checkins} resident check-ins say the garbage van came` : "Not enough check-ins yet. Is the van coming on your street?"}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            {last7.map((d) => {
              const n = d.came + d.missed + d.refused;
              const r = n ? d.came / n : 0;
              return <div key={d.day} style={{ width: 34, marginLeft: 10, height: 30 + Math.round(r * 110), background: n ? scoreColor(r) : "#d9ddd6", borderRadius: 6 }} />;
            })}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
