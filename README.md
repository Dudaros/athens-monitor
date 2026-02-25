# Athens Monitor

Athens Monitor is a real-time city incident monitoring system that ingests external event sources, normalizes data, stores it persistently, and exposes a read-optimized API for map-based visualization and analytics.

The project is designed with production-oriented architecture principles, including containerization, service separation, and persistent storage.

![Athens Monitor Dashboard](docs/images/athens-monitor-dashboard.png)

## Product Definition

PRODUCT DEFINITION
==================
Athens Monitor answers one question:
"Is anything happening in Athens right now that changes your day?"

This question is the filter for everything:
- Fire on Parnitha? YES — allergies, kids outside
- Metro strike? YES — changes how you get to work
- Riots at Syntagma? YES — you avoid the area
- Rape in Kallithea? NO — tragic but doesn't change your day
- Minister's statement? NO
- 4.2R earthquake? YES — you want to know

If an incident doesn't change a citizen's behavior or movement
in Athens today, it doesn't belong on the map.

This drives: what sources we add, what the filter allows,
what UI we build, what we reject.

## Architecture Overview

The system consists of three core components:

### 1. Ingestion Worker

- Polls external data sources on a schedule
- Normalizes incident data
- Writes to PostgreSQL using idempotent upsert logic
- Runs independently from the web API

### 2. PostgreSQL Database

- Persistent storage for all incidents
- Indexed for time and status filtering
- Designed to support future analytics and scaling

### 3. API Service

- Read-only service for incident retrieval
- Supports filtering by:
  - status
  - confidence
  - time range
- Optimized for map-based frontends

## Data Model

Each incident record contains:

- Unique ID (UUID)
- Title and description
- Latitude and longitude
- Severity
- Confidence score
- Source identifier
- First and last seen timestamps
- Lifecycle status (active/resolved/expired)

The system is designed to support historical queries and future analytical extensions.

## Running Locally

The entire system runs via Docker.

### Requirements

- Docker
- Docker Compose

### Start the system

```bash
docker compose up --build
```

This starts:

- API service
- Ingestion worker
- PostgreSQL database

Data is persisted via Docker volumes.

## Design Principles

- Persistent storage (no in-memory production state)
- Idempotent ingestion
- Service separation (worker and API)
- Containerized deployment
- Scalable read-oriented API design

## Future Directions

The current architecture supports:

- Multi-source ingestion
- Analytical transformation layers
- Geospatial extensions
- Historical trend analysis
- Scalable cloud deployment

## API Filters

`GET /api/incidents` supports:

- `status` (default: `active`)
- `min_confidence` (example: `0.7`)
- `since` (ISO timestamp)
- `source` (example: `gdelt` or `meteo`)
