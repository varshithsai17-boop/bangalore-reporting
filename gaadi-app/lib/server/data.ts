import "server-only";
import type { Spot, WardDetail, WardStat } from "../types";
import { rpc } from "./supabase";

export const getWardStats = (days: number) => rpc<WardStat[]>("gaadi_ward_stats", { p_days: days });
export const getWardDetail = (id: string) => rpc<WardDetail>("gaadi_ward_detail", { p_ward: id });
export const getSpots = () => rpc<Spot[]>("gaadi_spots", {});
