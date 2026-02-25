import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getIncidentsHealthSnapshot, listIncidentsHealthBySource } from "./db/incidentsRepository.js";
import { closeDatabase, waitForDatabase } from "./db/postgres.js";
import { getIncidents } from "./services/incidentService.js";
import { startWeatherPollingWorker, stopWeatherPollingWorker } from "./services/pollingWorker.js";
import { getWeatherCache, getWeatherHealthSnapshot } from "./services/weatherCache.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "../public");

const app = express();
const port = Number.parseInt(process.env.PORT || "3000", 10);
const POLL_INTERVAL_MS = 15 * 60 * 1000;
const SOURCE_INTERVAL_MS = {
  gdelt: 15 * 60 * 1000,
  meteo: 15 * 60 * 1000,
  usgs: 5 * 60 * 1000,
};

function toSourceState(lastSuccess, intervalMs) {
  if (!lastSuccess) {
    return "error";
  }

  const ageMs = Date.now() - new Date(lastSuccess).getTime();
  if (!Number.isFinite(ageMs)) {
    return "error";
  }

  if (ageMs <= intervalMs * 2) {
    return "ok";
  }

  if (ageMs <= intervalMs * 6) {
    return "stale";
  }

  return "error";
}

function buildSourceHealth(rows = []) {
  const bySource = new Map(rows.map((row) => [row.source, row]));

  return Object.entries(SOURCE_INTERVAL_MS).reduce((acc, [source, intervalMs]) => {
    const row = bySource.get(source);
    const lastSuccess = row?.lastSuccess || null;

    acc[source] = {
      status: toSourceState(lastSuccess, intervalMs),
      lastSuccess,
      cachedCount: Number(row?.cachedCount || 0),
      nextPoll: new Date(Date.now() + intervalMs).toISOString(),
    };

    return acc;
  }, {});
}

app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);
app.use(morgan(process.env.NODE_ENV === "development" ? "dev" : "combined"));
app.use(express.json({ limit: "100kb" }));
app.use(express.static(publicDir));

app.get("/api/health", async (_req, res) => {
  const nowIso = new Date().toISOString();
  const [snapshot, perSourceRows] = await Promise.all([
    getIncidentsHealthSnapshot(),
    listIncidentsHealthBySource(),
  ]);
  const nextPoll = new Date(Date.now() + POLL_INTERVAL_MS).toISOString();
  const weather = getWeatherHealthSnapshot();
  const sources = buildSourceHealth(perSourceRows);

  res.json({
    status: "ok",
    service: "athens-monitor",
    now: nowIso,
    source: snapshot.source,
    lastSuccess: snapshot.lastSuccess,
    cachedCount: snapshot.cachedCount,
    nextPoll,
    sources,
    weather,
  });
});

app.get("/api/weather", (_req, res) => {
  res.json(getWeatherCache());
});

app.get("/api/incidents", async (req, res) => {
  try {
    const rows = await getIncidents({
      status: req.query.status,
      minConfidence: req.query.min_confidence,
      since: req.query.since,
      source: req.query.source,
    });

    res.json(rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const statusCode = message.includes("must be a valid") ? 400 : 502;

    res.status(statusCode).json({
      error: "Failed to load incidents",
      message,
    });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.resolve(publicDir, "index.html"));
});

async function bootstrap() {
  await waitForDatabase();
  await startWeatherPollingWorker();

  const server = app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Athens Monitor API running on http://localhost:${port}`);
  });

  const shutdown = async () => {
    server.close(async () => {
      await stopWeatherPollingWorker();
      await closeDatabase();
      process.exit(0);
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

bootstrap().catch(async (error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  // eslint-disable-next-line no-console
  console.error(`Failed to start API: ${message}`);
  await closeDatabase();
  process.exit(1);
});
