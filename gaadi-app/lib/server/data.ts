import "server-only";
import type { Spot, WardDetail, WardStat } from "../types";
import { wardById } from "../wards";
import { rpc } from "./supabase";

export const getWardStats = async (days: number) =>
  (await rpc<WardStat[]>("gaadi_ward_stats", { p_days: days })).map((s) => ({ ...s, name_kn: wardById(s.ward_id)?.name_kn ?? null }));
export const getWardDetail = (id: string) => rpc<WardDetail>("gaadi_ward_detail", { p_ward: id });
export const getSpots = () => rpc<Spot[]>("gaadi_spots", {});
