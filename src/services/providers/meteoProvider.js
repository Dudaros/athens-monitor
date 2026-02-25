import { FETCH_TIMEOUT_MS, METEO_LOCATIONS } from "../../config/monitorConfig.js";

const OPEN_METEO_ENDPOINT = "https://api.open-meteo.com/v1/forecast";

const WEATHER_CODE_LABELS = {
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Severe thunderstorm with hail",
  65: "Heavy rain",
  67: "Freezing rain",
  75: "Heavy snow",
  82: "Violent rain showers",
  86: "Heavy snow showers",
};

function buildOpenMeteoUrl({ lat, lng }) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: "weather_code,wind_speed_10m",
    hourly: "precipitation_probability,wind_speed_10m,weather_code",
    forecast_days: "1",
    timezone: "auto",
  });

  return `${OPEN_METEO_ENDPOINT}?${params.toString()}`;
}

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`Open-Meteo request failed (${response.status})`);
  }
  return response.json();
}

function toMaxNumeric(values = []) {
  return values.reduce((max, value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return max;
    return num > max ? num : max;
  }, 0);
}

function hasSevereCode(codes = []) {
  return codes.some((code) => [95, 96, 99, 65, 67, 75, 82, 86].includes(Number(code)));
}

function toWeatherLabel(currentCode) {
  const code = Number(currentCode);
  return WEATHER_CODE_LABELS[code] || "Weather risk";
}

function toSeverity({ maxWind, maxPrecipProb, currentCode }) {
  const severeCode = [95, 96, 99].includes(Number(currentCode));

  if (maxWind >= 60 || severeCode || maxPrecipProb >= 90) return "high";
  if (maxWind >= 40 || maxPrecipProb >= 70) return "medium";
  return "low";
}

function toAlertTitle({ locationName, severity, weatherLabel, maxWind }) {
  if (severity === "high") {
    return `Meteo Alert: ${weatherLabel} risk in ${locationName}`;
  }

  if (maxWind >= 40) {
    return `Meteo Alert: Strong winds expected in ${locationName}`;
  }

  return `Meteo Alert: Rain risk in ${locationName}`;
}

function shouldCreateAlert({ maxWind, maxPrecipProb, hourlyCodes }) {
  return maxWind >= 40 || maxPrecipProb >= 70 || hasSevereCode(hourlyCodes);
}

function toDescription({ maxWind, maxPrecipProb }) {
  return `Forecast max wind ${Math.round(maxWind)} km/h, rain probability up to ${Math.round(maxPrecipProb)}%`;
}

function buildIncidentFromSnapshot(snapshot, fallbackMode = false) {
  const severity = fallbackMode ? "low" : snapshot.severity;

  return {
    title: fallbackMode
      ? `Meteo Snapshot: Calm conditions in ${snapshot.locationName}`
      : snapshot.title,
    description: fallbackMode
      ? `Current wind ${Math.round(snapshot.currentWind)} km/h, rain probability up to ${Math.round(snapshot.maxPrecipProb)}%`
      : snapshot.description,
    url: snapshot.url,
    domain: "open-meteo.com",
    publishedAt: new Date().toISOString(),
    lat: snapshot.lat,
    lng: snapshot.lng,
    severity,
    source: "meteo",
    queryHint: snapshot.locationName,
  };
}

export async function fetchMeteoIncidents() {
  const results = await Promise.allSettled(
    METEO_LOCATIONS.map(async (location) => {
      const url = buildOpenMeteoUrl({ lat: location.lat, lng: location.lng });
      const data = await fetchJson(url);

      const hourly = data?.hourly || {};
      const current = data?.current || {};

      const maxWind = toMaxNumeric(hourly.wind_speed_10m);
      const maxPrecipProb = toMaxNumeric(hourly.precipitation_probability);
      const hourlyCodes = Array.isArray(hourly.weather_code) ? hourly.weather_code : [];
      const currentCode = Number(current.weather_code);
      const currentWind = Number(current.wind_speed_10m || 0);

      const severity = toSeverity({ maxWind, maxPrecipProb, currentCode });
      const weatherLabel = toWeatherLabel(currentCode);

      return {
        locationName: location.name,
        lat: location.lat,
        lng: location.lng,
        url,
        currentWind,
        maxPrecipProb,
        severity,
        title: toAlertTitle({
          locationName: location.name,
          severity,
          weatherLabel,
          maxWind,
        }),
        description: toDescription({ maxWind, maxPrecipProb }),
        isAlert: shouldCreateAlert({ maxWind, maxPrecipProb, hourlyCodes }),
      };
    }),
  );

  const snapshots = results
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value)
    .filter(Boolean);

  const alerts = snapshots
    .filter((snapshot) => snapshot.isAlert)
    .map((snapshot) => buildIncidentFromSnapshot(snapshot, false));

  if (alerts.length > 0) {
    return alerts;
  }

  if (snapshots.length === 0) {
    return [];
  }

  return [buildIncidentFromSnapshot(snapshots[0], true)];
}
