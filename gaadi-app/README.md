# Gaadi Bantha?

"Did the garbage van come?" Residents of Bengaluru tap once a day to say whether the garbage van came to their street. The app adds up those taps into a **public report card for every one of the city's 369 wards**, plus a live map of garbage spots, each reported with a photo, that anyone can send to the city on WhatsApp in one tap.

## What's in here

- **Next.js 16** app, deployable to Vercel as is.
  - `components/Home.tsx`: the main screen (check-in, map, reporting)
  - `app/ward/[id]`: ward report cards, each with its own share image
  - `app/wards`: ward rankings
- **Supabase** (your `body-coach` project, in its own `gaadi` schema) stores check-ins, spots and photos. Photos go in the public `gaadi-photos` storage bucket. The database key stays on the server; browsers only talk to this app's `/api/*` routes.
- **Maps and addresses** use free OpenStreetMap services, so no Google key is needed:
  - MapLibre with OpenFreeMap tiles for the map
  - Nominatim for street names
  - Photon for search
- **Ward boundaries** (`lib/data/wards.json`) come from the GBA final delimitation of December 2025 (369 wards across 5 corporations), via OpenCity, simplified for the web.

## Run it on your laptop

```bash
npm install
npm run dev
```

Open http://localhost:3000. `.env.local` is already filled in.

## Deploy to Vercel

1. Push this folder to a new GitHub repo. `.env.local` is gitignored, so your keys won't be pushed.
2. In Vercel, click **Add New → Project** and pick the repo.
3. Under **Settings → Environment Variables**, add everything in `.env.local`, and set `NEXT_PUBLIC_SITE_URL` to your final URL so share images and links point at it.
4. Deploy.

## How the numbers work

- **Check-ins**: one per phone per day (Indian time). You can change your answer that day, up to 5 times. The location is stored rounded to about 10 m, and the exact home location is never saved.
- **Ward score**: the share of check-ins in the last 7 (or 30) days that say "Came". A ward needs **15 check-ins** in the window to get a score or be ranked, so a handful of answers can't swing it. Change `MIN_CHECKINS` in `lib/constants.ts` to adjust.
- **Spot reports**:
  - A report within 40 m of an open spot of the same kind joins that spot.
  - A spot is marked cleaned after 2 "It's cleaned" taps, or 1 with an after photo.
  - Photos flagged by 3 different people are hidden.
- **Spam limits**:
  - 1 spot report per 20 s and 20 per hour per phone, plus a per-IP limit.
  - The photo upload endpoint has its own limit.
  - IPs are stored only as a one-way hash.
- **Photos**: shrunk on the phone to 1280 px, which also strips GPS and other metadata, and checked on the server to be a real JPEG/WebP under 900 KB.

## Demo data (a simulated month)

The database has sample data flagged `seed = true`:
- About **16,700 van check-ins over 30 days** in 185 wards.
- **170 garbage spots**, each with a placeholder image clearly labelled "SAMPLE · not a real photo".

The patterns are modelled on the news:
- The ten assembly areas whose collection contracts were re-tendered in September 2026 (BTM Layout, Malleshwaram, Gandhinagar, Jayanagar and others) score lower.
- Outer areas like Mahadevapura, K.R. Pura and Yelahanka are patchier and slower to clean up.
- Central wards score higher.
- Sundays and one festival day dip, and a few wards have multi-day breakdown streaks.

Scores are based on the last 7/30 days, so over time the demo month slides out of view. To move the whole sample month so it ends today, run this in the Supabase SQL editor:

```sql
select gaadi.replay_seed();
```

**Before a public launch, delete it**, so the rankings reflect only real residents:

```sql
delete from gaadi.spots where seed;
delete from gaadi.checkins where seed;
```

## Before a big launch

- The public Nominatim and Photon services are fine at moderate volume. For heavy traffic, switch street lookup to a paid geocoder, or cache more aggressively. Street names are only looked up when someone sets their street or reports a spot.
- Add the city's official X handles to the share text in `components/share.ts` once you've confirmed them.
- The database schema is the `gaadi_init` migration in the Supabase dashboard (Database → Migrations). Re-run it there to move to a new project.
