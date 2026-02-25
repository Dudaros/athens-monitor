import { DEFAULT_WINDOW_MINUTES, MAX_LIMIT } from "../config/monitorConfig.js";
import { closeDatabase, waitForDatabase } from "../db/postgres.js";
import { upsertIncidents } from "../db/incidentsRepository.js";
import { fetchNormalizedGdeltIncidents } from "./ingestionService.js";

const POLL_INTERVAL_MS = 15 * 60 * 1000;

let pollTimer = null;
let pollInFlight = false;

async function pollOnce(reason = "scheduled") {
  if (pollInFlight) {
    return;
  }

  pollInFlight = true;

  try {
    const incidents = await fetchNormalizedGdeltIncidents({
      windowMinutes: DEFAULT_WINDOW_MINUTES,
      limit: MAX_LIMIT,
    });

    const result = await upsertIncidents(incidents);

    // eslint-disable-next-line no-console
    console.log(
      `[pollingWorker] ${reason} success: fetched=${incidents.length} upserted=${result.upserted} at ${new Date().toISOString()}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown poll error";
    // eslint-disable-next-line no-console
    console.error(`[pollingWorker] ${reason} failed: ${message}`);
  } finally {
    pollInFlight = false;
  }
}

function scheduleNextPoll() {
  pollTimer = setTimeout(async () => {
    await pollOnce("scheduled");
    scheduleNextPoll();
  }, POLL_INTERVAL_MS);
}

export async function startPollingWorker() {
  await waitForDatabase();

  // Warm database immediately on startup.
  await pollOnce("startup");
  scheduleNextPoll();
}

export async function stopPollingWorker() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }

  await closeDatabase();
}

async function runAsProcess() {
  await startPollingWorker();

  const shutdown = async () => {
    await stopPollingWorker();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAsProcess().catch(async (error) => {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    // eslint-disable-next-line no-console
    console.error(`Worker startup failed: ${message}`);
    await closeDatabase();
    process.exit(1);
  });
}
