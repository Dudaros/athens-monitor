# Athens Monitor

Athens Monitor is a real-time city incident monitoring system focused on one practical question:

## Product Definition

PRODUCT DEFINITION
==================
Athens Monitor answers one question:
"Is anything happening in Athens right now that changes your day?"

This question is the filter for everything:
- Fire on Parnitha? YES - allergies, kids outside
- Metro strike? YES - changes how you get to work
- Riots at Syntagma? YES - you avoid the area
- Rape in Kallithea? NO - tragic but doesn't change your day
- Minister's statement? NO
- 4.2R earthquake? YES - you want to know

If an incident doesn't change a citizen's behavior or movement
in Athens today, it doesn't belong on the map.

This drives: what sources we add, what the filter allows,
what UI we build, what we reject.

![Athens Monitor Dashboard](docs/images/athens-monitor-dashboard.png)

## Architecture Overview

The system uses separated services with persistent storage for incidents and in-memory caching for live weather snapshots:

1. Ingestion Worker
- Polls external providers on fixed schedules
- Normalizes raw items into a common incident schema
- Applies explicit inclusion filtering for GDELT
- Writes incidents to PostgreSQL with idempotent upsert logic

2. PostgreSQL Database
- Source of truth for incidents
- Indexed for status, time, and geospatial-like coordinate queries
- Persists data across container restarts via Docker volumes

3. API Service
- Read-only incident retrieval from PostgreSQL
- Exposes health/source status and weather snapshot endpoints
- Serves frontend assets

4. Weather Cache Layer
- OpenWeather snapshot is polled independently every 30 minutes
- Stored separately from incidents
- Read through `GET /api/weather`

5. Frontend Monitor UI
- Leaflet dark map + incident panel
- 28px persistent status bar (weather widgets, Greek north-star tagline, source pills)
- Live source state indicators: `ok`, `stale`, `error`

## Providers and Polling Cadence

- `gdelt`: every 15 minutes (core poll group)
- `meteo` (Open-Meteo severe weather incidents): every 15 minutes (core poll group)
- `usgs` (earthquakes in Greece bbox): every 5 minutes (dedicated poll group)
- `openweather` (weather snapshot + UV + moon + alerts for Athens): every 30 minutes (separate weather poll loop)

Startup behavior:
- Worker fetches incidents immediately on startup (warm DB)
- API fetches weather immediately on startup via weather worker hook (warm weather cache)
- On provider failures/timeouts/rate-limit responses, stale data remains available and next scheduled cycle retries automatically

## Data Contracts

### Incident schema (stored in PostgreSQL)

Each incident row includes:
- `id` (UUID)
- `title`
- `description`
- `lat`, `lng`
- `severity` (`low`, `medium`, `high`)
- `confidence`
- `source` (`gdelt`, `meteo`, `usgs`)
- `firstSeenAt`, `lastSeenAt`
- `status` (`active` by default)
- `createdAt`, `updatedAt`

### Weather cache schema (`GET /api/weather`)

```json
{
  "temp": 19.2,
  "feelsLike": 18.6,
  "description": "clear sky",
  "uvi": 2.7,
  "windSpeed": 14.4,
  "windDeg": 240,
  "humidity": 62,
  "moonPhase": 0.51,
  "moonSymbol": "🌕",
  "updatedAt": "2026-02-25T21:00:00.000Z"
}
```

## Filtering Model (GDELT)

The GDELT pipeline uses explicit inclusion before normalization:

Allowed categories include keywords for:
- fire
- explosion
- protest
- accident
- infrastructure
- weather_alert
- crime (public-impact terms)

Hard rejections remain for non-operational noise:
- politics
- economy
- sports
- entertainment

Threshold:
- minimum 1 allowed keyword match

Operational telemetry:
- each poll cycle logs filter pass/fail totals to tune precision

## API Reference

### `GET /api/incidents`

Reads from PostgreSQL only.

Query params:
- `status` (default: `active`)
- `min_confidence` (example: `0.7`)
- `since` (ISO timestamp)
- `source` (`gdelt`, `meteo`, `usgs`)

Example:

```bash
curl "http://localhost:3000/api/incidents?status=active&min_confidence=0.7"
```

### `GET /api/weather`

Reads latest weather snapshot from in-memory weather cache.

Example:

```bash
curl "http://localhost:3000/api/weather"
```

### `GET /api/health`

Returns service health plus per-source status and weather poll/cache status.

Example fields:
- top-level: `status`, `service`, `now`, `lastSuccess`, `cachedCount`, `nextPoll`
- `sources.gdelt|meteo|usgs`: `status`, `lastSuccess`, `cachedCount`, `nextPoll`
- `weather`: `source`, `lastSuccess`, `cachedCount`, `nextPoll`, `status`, `lastError`

Example:

```bash
curl "http://localhost:3000/api/health"
```

## Local Run (Docker)

### Requirements

- Docker
- Docker Compose

### 1. Configure environment

Create `.env` from `.env.example` and set values:

```env
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/athens_monitor
APP_PORT=3000
POLL_SOURCES=gdelt,meteo,usgs
OPENWEATHER_API_KEY=your_openweather_key_here
```

### 2. Start stack

From project root:

```bash
docker compose up --build
```

This starts:
- `postgres`
- `api`
- `worker`

### 3. Open app

- UI: `http://localhost:3000`
- Health: `http://localhost:3000/api/health`
- Incidents: `http://localhost:3000/api/incidents`
- Weather: `http://localhost:3000/api/weather`

## Operations Notes

- If `OPENWEATHER_API_KEY` is missing, `/api/weather` returns placeholders and `/api/health.weather.status` reports `error` with `lastError`.
- USGS does not require an API key.
- GDELT may occasionally rate-limit (429). Architecture is poll-based to protect request path; API serves persisted data.

## Design Principles

- Persistent incident storage (PostgreSQL)
- Idempotent ingestion and deterministic IDs
- Service separation (worker/API)
- Read-optimized API for map frontends
- Controlled source onboarding with explicit filtering model

## Future Directions

- Additional civic-impact providers (transport, official alerts, civil protection)
- Better geolocation confidence and geospatial indexing
- Historical analytics and trend layers
- Deployment hardening for higher traffic
