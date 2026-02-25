import { DEFAULT_WINDOW_MINUTES, MAX_LIMIT } from "../config/monitorConfig.js";
import { closeDatabase, waitForDatabase } from "../db/postgres.js";
import { upsertIncidents } from "../db/incidentsRepository.js";
import { fetchNormalizedIncidents } from "./ingestionService.js";
import { fetchOpenWeatherSnapshot } from "./providers/openWeatherProvider.js";
import { setWeatherCache, setWeatherNextPoll, setWeatherPollError } from "./weatherCache.js";

const CORE_POLL_INTERVAL_MS = 15 * 60 * 1000;
const USGS_POLL_INTERVAL_MS = 5 * 60 * 1000;
const WEATHER_POLL_INTERVAL_MS = 30 * 60 * 1000;

const DEFAULT_SOURCES = ["gdelt", "meteo", "usgs"];

const INCIDENT_POLL_GROUPS = [
  {
    name: "core",
    intervalMs: CORE_POLL_INTERVAL_MS,
    sources: ["gdelt", "meteo"],
  },
  {
    name: "usgs",
    intervalMs: USGS_POLL_INTERVAL_MS,
    sources: ["usgs"],
  },
];

const groupState = new Map(
  INCIDENT_POLL_GROUPS.map((group) => [
    group.name,
    {
      timer: null,
      inFlight: false,
    },
  ]),
);

let weatherPollTimer = null;
let weatherPollInFlight = false;

function resolvePollSources() {
  const envSources = process.env.POLL_SOURCES;
  if (!envSources) return DEFAULT_SOURCES;

  const parsed = envSources
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return parsed.length > 0 ? parsed : DEFAULT_SOURCES;
}

function resolveSourcesForGroup(group) {
  const enabled = new Set(resolvePollSources());
  return group.sources.filter((source) => enabled.has(source));
}

async function pollIncidentsForSources({ sources, reason, groupName }) {
  if (!Array.isArray(sources) || sources.length === 0) {
    return;
  }

  const state = groupState.get(groupName);
  if (!state || state.inFlight) {
    return;
  }

  state.inFlight = true;

  try {
    const incidents = await fetchNormalizedIncidents({
      windowMinutes: DEFAULT_WINDOW_MINUTES,
      limit: MAX_LIMIT,
      sources,
    });

    const result = await upsertIncidents(incidents);

    // eslint-disable-next-line no-console
    console.log(
      `[pollingWorker] ${reason} ${groupName} success: sources=${sources.join(",")} fetched=${incidents.length} upserted=${result.upserted} at ${new Date().toISOString()}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown poll error";
    // eslint-disable-next-line no-console
    console.error(`[pollingWorker] ${reason} ${groupName} failed: ${message}`);
  } finally {
    state.inFlight = false;
  }
}

function scheduleNextGroupPoll(group) {
  const state = groupState.get(group.name);
  if (!state) {
    return;
  }

  state.timer = setTimeout(async () => {
    await pollIncidentsForSources({
      sources: resolveSourcesForGroup(group),
      reason: "scheduled",
      groupName: group.name,
    });

    scheduleNextGroupPoll(group);
  }, group.intervalMs);
}

async function pollWeatherOnce(reason = "scheduled") {
  if (weatherPollInFlight) {
    return;
  }

  weatherPollInFlight = true;

  try {
    const weatherPayload = await fetchOpenWeatherSnapshot();
    setWeatherCache(weatherPayload.weatherCache);

    // eslint-disable-next-line no-console
    console.log(
      `[pollingWorker] ${reason} weather success: alerts=${weatherPayload.alerts.length} updatedAt=${weatherPayload.weatherCache.updatedAt}`,
    );
  } catch (error) {
    setWeatherPollError(error);
    const message = error instanceof Error ? error.message : "Unknown weather poll error";
    // eslint-disable-next-line no-console
    console.error(`[pollingWorker] ${reason} weather failed: ${message}`);
  } finally {
    weatherPollInFlight = false;
  }
}

function scheduleNextWeatherPoll() {
  const nextPoll = new Date(Date.now() + WEATHER_POLL_INTERVAL_MS).toISOString();
  setWeatherNextPoll(nextPoll);

  weatherPollTimer = setTimeout(async () => {
    await pollWeatherOnce("scheduled");
    scheduleNextWeatherPoll();
  }, WEATHER_POLL_INTERVAL_MS);
}

export async function startPollingWorker() {
  await waitForDatabase();

  await Promise.all(
    INCIDENT_POLL_GROUPS.map((group) =>
      pollIncidentsForSources({
        sources: resolveSourcesForGroup(group),
        reason: "startup",
        groupName: group.name,
      }),
    ),
  );

  INCIDENT_POLL_GROUPS.forEach((group) => {
    scheduleNextGroupPoll(group);
  });
}

export async function startWeatherPollingWorker() {
  await pollWeatherOnce("startup");
  scheduleNextWeatherPoll();
}

export async function stopPollingWorker() {
  for (const state of groupState.values()) {
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
  }

  await closeDatabase();
}

export async function stopWeatherPollingWorker() {
  if (weatherPollTimer) {
    clearTimeout(weatherPollTimer);
    weatherPollTimer = null;
  }
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
