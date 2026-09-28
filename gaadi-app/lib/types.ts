export type LatLng = { lat: number; lng: number };

export type VanStatus = "came" | "missed" | "refused";
export type Category = "dumping" | "overflowing" | "burning" | "drain";

export type Spot = {
  id: string;
  lat: number;
  lng: number;
  ward_id: string;
  label: string | null;
  category: Category;
  photo: string;
  after_photo: string | null;
  status: "open" | "cleaned";
  created_at: string;
  last_seen_at: string;
  cleaned_at: string | null;
  confirms: number;
};

export type WardStat = {
  ward_id: string;
  name: string;
  /** Kannada name, added on the server from the ward boundary file. */
  name_kn?: string | null;
  corp: string;
  checkins: number;
  came: number;
  missed: number;
  refused: number;
  score: number | null;
  streets: number;
  open_spots: number;
  cleaned_spots: number;
  avg_clean_days: number | null;
};

export type WardInfo = {
  id: string;
  name: string;
  name_kn: string | null;
  corp: string;
  assembly: string | null;
  zone: string | null;
  pop: number | null;
};

export type WardDetail = {
  ward: WardInfo | null;
  daily: { day: string; came: number; missed: number; refused: number }[];
  streets: { street: string; n: number; missed: number }[];
};

/** Where the user said they live: saved in their browser only. */
export type Home = { lat: number; lng: number; ward_id: string; ward_name: string; street: string | null };
