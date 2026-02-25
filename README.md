# Athens Monitor

Athens-focused live incident monitor with a map-first UI and a source-adapter backend.

This first version keeps the existing visual identity while introducing a scalable architecture:
- Browser talks only to local API (`/api/incidents`)
- Providers are modular (`src/services/providers/*`)
- Events are normalized into one schema before rendering
- Fetching is bounded, cached, and fault-tolerant for partial source failures
- Geocoding is now location-aware (anchor matching + Nominatim fallback)
- Duplicate stories are collapsed with headline similarity, not just URL matching
- UI markers/cards use a semantic legend by category
- Background polling worker refreshes GDELT every 15 minutes; API serves cache only

## Run

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000).

## Current source

- `gdelt` provider (`src/services/providers/gdeltProvider.js`)

## API

- `GET /api/health`
- `GET /api/incidents?windowMinutes=1440&limit=120&category=all&sources=gdelt`

Query limits are validated server-side:
- `windowMinutes`: 60 to 4320
- `limit`: 20 to 400

## Architecture

- `public/index.html`: UI shell (same aesthetic)
- `public/app.js`: map + filters + rendering
- `src/server.js`: web server + API routes
- `src/services/incidentService.js`: aggregation, normalization, dedupe, caching
- `src/services/geocodingService.js`: location resolver (anchors + Nominatim)
- `src/services/pollingWorker.js`: startup warmup + 15-minute refresh scheduler
- `src/services/providers/`: one file per data provider
- `src/utils/`: classification/geolocation helpers

## Geocoding

- Provider: OpenStreetMap Nominatim (`src/services/geocodingService.js`)
- Flow: source coordinates (if valid in Attica) -> local anchor match -> Nominatim lookup -> Athens center (explicitly marked as approximate)
- Optional env:
  - `NOMINATIM_CONTACT=you@example.com` (recommended for API courtesy)

## Incremental roadmap

1. Add weather risk provider (e.g. meteo alerts) using the same event schema.
2. Add official civil protection/police feeds where APIs exist.
3. Add camera overlay metadata (not streams first): status + location + thumbnail link.
4. Add queue/caching layer (Redis) and source polling workers for higher traffic.
5. Add persistence (PostgreSQL + PostGIS) and trend/history views.

## Notes

- GDELT response quality varies; fallback geolocation is currently deterministic around Athens when only text is available.
- GDELT can throttle requests (`429`). The service uses a short TTL cache and marks source errors in the UI instead of crashing.
- This is intentionally source-conservative; we should onboard each new feed one by one with validation.
