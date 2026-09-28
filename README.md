# Bangalore Reporting

Civic apps for Bengaluru, built to put citizen data where the city (and the press) can see it.

| Folder | App | What it does |
|---|---|---|
| [`neeru-app/`](neeru-app) | **Neeru** | Live map of flooded roads. Enter where you're going, and it checks every route against depth reports from people standing in the water. |
| [`gaadi-app/`](gaadi-app) | **Gaadi Bantha?** | "Did the garbage van come?" One tap a day per street, a public report card for all 369 GBA wards, and photo reports of garbage spots with one-tap WhatsApp complaints to the city. |
| `neeru-demo.html` | Neeru prototype | The first single-file clickable demo. |

Both apps are Next.js 16 + Supabase and deploy to Vercel. Each folder has its own README with setup, deploy steps and how the numbers work.

## Run locally

```bash
cd neeru-app   # or gaadi-app
npm install
cp .env.example .env.local   # then fill in your Supabase URL and key
npm run dev
```

Data sources: OpenStreetMap (map tiles via OpenFreeMap, Nominatim, Photon, OSRM), GBA ward boundaries (Dec 2025 delimitation) via OpenCity. All report data comes from residents and is not official.
