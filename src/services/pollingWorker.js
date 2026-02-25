import { DEFAULT_WINDOW_MINUTES, MAX_LIMIT } from "../config/monitorConfig.js";
import { getIncidentCacheStatus, refreshIncidentCache } from "./incidentService.js";

const POLL_INTERVAL_MS = 15 * 60 * 1000;

let workerStarted = false;
let pollTimer = null;
let pollInFlight = false;
let nextPoll = null;

async function runPoll(reason = "scheduled") {
  if (pollInFlight) {
    return false;
  }

  pollInFlight = true;

  try {
    const result = await refreshIncidentCache({
      windowMinutes: DEFAULT_WINDOW_MINUTES,
      limit: MAX_LIMIT,
      sources: ["gdelt"],
    });

    // eslint-disable-next-line no-console
    console.log(
      `[pollingWorker] ${reason} success: cached ${result.cachedCount} incidents at ${result.fetchedAt}`,
    );

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown poll error";
    // eslint-disable-next-line no-console
    console.error(`[pollingWorker] ${reason} failed: ${message}`);
    return false;
  } finally {
    pollInFlight = false;
  }
}

function scheduleNextPoll() {
  nextPoll = new Date(Date.now() + POLL_INTERVAL_MS).toISOString();

  pollTimer = setTimeout(async () => {
    await runPoll("scheduled");
    scheduleNextPoll();
  }, POLL_INTERVAL_MS);
}

export async function startPollingWorker() {
  if (workerStarted) {
    return;
  }

  workerStarted = true;

  // Warm cache immediately before serving user traffic.
  await runPoll("startup");
  scheduleNextPoll();
}

export function stopPollingWorker() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }

  workerStarted = false;
  nextPoll = null;
}

export function getPollingStatus() {
  const cacheStatus = getIncidentCacheStatus();

  return {
    source: cacheStatus.source,
    lastSuccess: cacheStatus.lastSuccess,
    cachedCount: cacheStatus.cachedCount,
    nextPoll,
    stale: cacheStatus.stale,
    staleAt: cacheStatus.staleAt,
    lastAttempt: cacheStatus.lastAttempt,
    lastError: cacheStatus.lastError,
  };
}
