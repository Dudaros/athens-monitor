import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getIncidents } from "./services/incidentService.js";
import { getPollingStatus, startPollingWorker } from "./services/pollingWorker.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "../public");

const app = express();
const port = Number.parseInt(process.env.PORT || "3000", 10);

app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);
app.use(morgan(process.env.NODE_ENV === "development" ? "dev" : "combined"));
app.use(express.json({ limit: "100kb" }));
app.use(express.static(publicDir));

app.get("/api/health", (_req, res) => {
  const cache = getPollingStatus();

  res.json({
    status: "ok",
    service: "athens-monitor",
    now: new Date().toISOString(),
    source: cache.source,
    lastSuccess: cache.lastSuccess,
    cachedCount: cache.cachedCount,
    nextPoll: cache.nextPoll,
    cache,
  });
});

app.get("/api/incidents", async (req, res) => {
  try {
    const data = await getIncidents({
      windowMinutes: req.query.windowMinutes,
      limit: req.query.limit,
      category: req.query.category,
      sources: req.query.sources,
    });

    res.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    res.status(502).json({
      error: "Failed to load incidents",
      message,
    });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.resolve(publicDir, "index.html"));
});

async function bootstrap() {
  await startPollingWorker();

  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Athens Monitor server running on http://localhost:${port}`);
  });
}

bootstrap().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  // eslint-disable-next-line no-console
  console.error(`Failed to start server: ${message}`);
  process.exit(1);
});
