# Athens Monitor Study Guide

This guide is focused on what was implemented in this project so you can learn by reading and modifying real code.

## Learning Order

1. System architecture and data flow
2. Docker and container networking
3. PostgreSQL schema and indexing
4. Worker ingestion and idempotent upserts
5. API query filtering and validation
6. Reliability basics (health checks, retries, stale data behavior)

## 1) Understand the Whole Flow First

Goal: Be able to explain how data moves end-to-end.

Read these files in this order:

- `docker-compose.yml`
- `src/services/pollingWorker.js`
- `src/services/ingestionService.js`
- `src/db/incidentsRepository.js`
- `src/server.js`

What to understand:

- Worker fetches GDELT every 15 minutes
- Worker normalizes and upserts incidents into Postgres
- API reads from Postgres only
- Health endpoint reports cache status from DB

Practice:

- Draw a simple diagram: `GDELT -> Worker -> Postgres -> API -> Frontend`

## 2) Docker + Compose

Goal: Understand service separation and container communication.

Read:

- `Dockerfile`
- `docker-compose.yml`
- `.env.example`

What to understand:

- Why API and worker use the same image but different commands
- Why DB host is `postgres` (service name), not `localhost`
- How volumes persist data across restarts
- Why `depends_on` with health checks matters

Practice:

- Change `APP_PORT` to `3200` and run again
- Stop only the worker and observe API behavior

## 3) PostgreSQL Schema + Indexes

Goal: Understand data modeling for incident systems.

Read:

- `sql/init.sql`

What to understand:

- Meaning of `first_seen_at` vs `last_seen_at`
- Why `status`, `first_seen_at`, and `(lat,lng)` indexes exist
- Why `id UUID PRIMARY KEY` enables idempotent upserts

Practice SQL (inside DB):

- Count active incidents
- Query most recent 20 incidents
- Query incidents above confidence 0.8

## 4) Idempotent Ingestion + Upsert Logic

Goal: Understand safe writes from repeated polling.

Read:

- `src/services/ingestionService.js`
- `src/db/incidentsRepository.js`

What to understand:

- Deterministic UUID generation strategy
- Normalization, deduplication, confidence assignment
- `INSERT ... ON CONFLICT (id) DO UPDATE` pattern

Practice:

- Log an incident ID seed and verify same story gets same ID across polls
- Add a new confidence rule and inspect DB output changes

## 5) API Read Path and Filters

Goal: Build confidence with read-optimized APIs.

Read:

- `src/services/incidentService.js`
- `src/server.js`

What to understand:

- `GET /api/incidents` filters: `status`, `min_confidence`, `since`
- Validation behavior and 400 responses
- Why API avoids calling external providers directly

Practice:

- Call `/api/incidents?status=active&min_confidence=0.7`
- Call `/api/incidents?since=<recent timestamp>`
- Intentionally pass invalid `min_confidence` and inspect error handling

## 6) Reliability and Operational Basics

Goal: Learn production habits, not just coding.

Read:

- Worker logs in `docker compose logs worker`
- Health response from `/api/health`

What to understand:

- How failures (429/timeouts) are isolated to worker
- How stale but persistent DB data keeps API useful
- Why polling and serving are separated

Practice:

- Simulate provider failure and confirm API still serves DB data
- Restart containers and confirm row count persistence

## Suggested Weekly Plan

Week 1:

- Run stack, read core files, explain architecture in your own words

Week 2:

- Deep dive Postgres schema + SQL queries

Week 3:

- Modify ingestion rules (confidence/category) and validate output

Week 4:

- Add one new API filter or endpoint and write SQL for it

## Skill Checklist

You should be able to do these without help:

- Run and debug `docker compose` services
- Explain idempotent upsert and why it is required
- Query incidents from Postgres with filters
- Trace one incident from provider fetch to DB row to API response
- Diagnose worker/API failures using logs and health endpoints
