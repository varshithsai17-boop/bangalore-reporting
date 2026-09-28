# Neeru

Live map of flooded roads in Bengaluru. You enter where you are and where you're going. Neeru gets the route, checks it against depth reports from people standing in the water, and points you to the driest route. Anyone can report how deep the water is at a spot, with no account needed.

## What's in here

- **Next.js 16** app (`app/`, `components/`, `lib/`), deployable to Vercel as is.
- **Supabase** stores the reports. It's already set up in your `body-coach` project, in its own `neeru` schema. `supabase/schema.sql` is the full setup if you ever move it to a fresh project.
- **Maps and routing** have two modes:
  - **Google** (when both Google keys are set): Google map, Google Places search, and Google Routes with live traffic and a real two-wheeler mode.
  - **Free** (no keys): a MapLibre map with OpenStreetMap tiles, OSRM routes and Photon search. It works today with nothing to sign up for.

The Supabase key never reaches the browser. Browsers only call this app's `/api/*` routes, and those call Supabase from the server.

## Run it on your laptop

```bash
npm install
npm run dev
```

Open http://localhost:3000. `.env.local` is already filled in for your Supabase project.

## Deploy to Vercel

1. Push this folder to a new GitHub repo. `.env.local` is gitignored, so your keys won't be pushed.
2. In Vercel, click **Add New → Project**, pick the repo and keep the defaults.
3. Under **Settings → Environment Variables**, add what's in `.env.local`:
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
   - `OSM_CONTACT` (your email; OpenStreetMap services ask for a contact)
   - `NEXT_PUBLIC_SITE_URL` (your final URL, for example `https://neeru.vercel.app`, so link previews show the right image)
4. Deploy.

## Switch on Google Maps

1. In Google Cloud Console, create a project and turn on billing. Google gives a monthly free allowance per API.
2. Enable **Maps JavaScript API**, **Places API (New)**, **Routes API** and **Geocoding API**.
3. Create two API keys:
   - **Browser key**: restrict it to *HTTP referrers*, add your domain (`https://your-app.vercel.app/*`), and allow only the Maps JavaScript API. Put it in `NEXT_PUBLIC_GOOGLE_MAPS_KEY`.
   - **Server key**: restrict it to Places API (New), Routes API and Geocoding API. Put it in `GOOGLE_MAPS_API_KEY`.
4. Under **Quotas**, set a daily cap on each API. That's your protection against a surprise bill if the app goes viral.
5. Redeploy.

## Before a big launch

- **Free routing**: the public OSRM server is a demo service and is not meant for heavy traffic. Either switch on Google, or point `OSRM_URL` at your own OSRM server.
- **Free search**: Photon (komoot) is fine at moderate volume. Google Places is the production option.
- **Database**: Supabase's free tier handles a lot. The floods endpoint is cached for 10 s at Vercel's edge, so thousands of people opening the app don't turn into thousands of database calls.

## How the logic works

- **Merging reports**: a report within 150 m of a live spot joins that spot. The spot's depth is the most-reported depth in the last 45 minutes, and ties go deeper.
- **When a spot clears**: after 3 hours without a new report, or when two people say the water's gone (one is enough if the last report is over an hour old).
- **What counts as on a route**: the spot is within 70 m of the route line.
- **Choosing the recommended route**: every route gets a flood score based on depth, vehicle and how many people confirmed it. A slower route wins if it saves more than about 1.5 minutes per point of flood score.
- **What "too deep" means**: knee-deep blocks a two-wheeler, and waist-deep blocks a car.
- **Spam limits**: each browser can send 1 report per 20 s and 30 per hour, each IP 120 per hour, and nobody can report the same spot twice in 10 minutes. IPs are stored only as a one-way hash.

All reports are kept, not deleted, so you can analyse them after the rains (worst spots, worst wards, how long water stays).

## Demo data (a simulated storm)

The database has 500 sample reports (`seed = true`) across 66 real Bengaluru flood hotspots: Silk Board, Sai Layout, Manyata, Hennur, ORR Bellandur, the KR Circle and Panathur underpasses, Varthur Kodi and others. They're spread over a 2.5-hour evening storm. Low-lying spots flood first and deepest, and some minor spots have already cleared. Every point is snapped onto a real road so the route check picks it up.

Live spots expire 3 hours after their last report, so the demo storm disappears on its own. To bring it back, run this in the Supabase SQL editor. It moves the whole storm forward so it ends "now":

```sql
select neeru.replay_seed();
```

**Before you launch publicly, delete it.** People will make travel decisions from this map, so fake reports must never go live:

```sql
delete from neeru.spots where seed;
```

## Useful SQL (Supabase SQL editor)

```sql
-- Most-flooded spots this season
select label, count(*) as reports, max(r.created_at) as last
from neeru.reports r join neeru.spots s on s.id = r.spot_id
where r.kind = 'flooded' group by label order by reports desc limit 20;

-- Wipe everything (for example after testing)
delete from neeru.spots;
```
