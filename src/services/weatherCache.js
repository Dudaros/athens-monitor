const WEATHER_POLL_INTERVAL_MS = 30 * 60 * 1000;

const EMPTY_WEATHER_CACHE = {
  temp: null,
  feelsLike: null,
  description: null,
  uvi: null,
  windSpeed: null,
  windDeg: null,
  humidity: null,
  moonPhase: null,
  moonSymbol: "—",
  updatedAt: null,
};

let weatherCache = { ...EMPTY_WEATHER_CACHE };

let weatherMeta = {
  lastSuccess: null,
  lastError: null,
  nextPoll: null,
};

export function getWeatherCache() {
  return { ...weatherCache };
}

export function setWeatherCache(snapshot) {
  const updatedAt = snapshot?.updatedAt || new Date().toISOString();
  weatherCache = {
    ...EMPTY_WEATHER_CACHE,
    ...snapshot,
    updatedAt,
  };

  weatherMeta = {
    ...weatherMeta,
    lastSuccess: updatedAt,
    lastError: null,
  };
}

export function setWeatherPollError(error) {
  const message = error instanceof Error ? error.message : String(error || "Unknown weather error");
  weatherMeta = {
    ...weatherMeta,
    lastError: message,
  };
}

export function setWeatherNextPoll(nextPollIso) {
  weatherMeta = {
    ...weatherMeta,
    nextPoll: nextPollIso || null,
  };
}

function toStatus({ lastSuccess, lastError }) {
  if (!lastSuccess) {
    return lastError ? "error" : "stale";
  }

  const ageMs = Date.now() - new Date(lastSuccess).getTime();
  if (Number.isFinite(ageMs) && ageMs <= WEATHER_POLL_INTERVAL_MS * 2) {
    return "ok";
  }

  return lastError ? "error" : "stale";
}

export function getWeatherHealthSnapshot() {
  return {
    source: "openweather",
    lastSuccess: weatherMeta.lastSuccess,
    cachedCount: weatherCache.updatedAt ? 1 : 0,
    nextPoll: weatherMeta.nextPoll,
    status: toStatus(weatherMeta),
    lastError: weatherMeta.lastError,
  };
}
