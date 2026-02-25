import { FETCH_TIMEOUT_MS } from "../../config/monitorConfig.js";

const ATHENS_COORDS = { lat: 37.9838, lng: 23.7275 };
const OPENWEATHER_BASE_URL = "https://api.openweathermap.org/data/2.5";

function resolveApiKey() {
  const apiKey = String(process.env.OPENWEATHER_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("OPENWEATHER_API_KEY is required for OpenWeather provider");
  }

  return apiKey;
}

function buildUrl(path, params) {
  const qs = new URLSearchParams(params);
  return `${OPENWEATHER_BASE_URL}/${path}?${qs.toString()}`;
}

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`OpenWeather request failed (${response.status})`);
  }

  return response.json();
}

function mpsToKmh(value) {
  const speed = Number(value);
  if (!Number.isFinite(speed)) return null;
  return Number((speed * 3.6).toFixed(1));
}

function toMoonSymbol(moonPhase) {
  const phase = Number(moonPhase);
  if (!Number.isFinite(phase)) return "—";

  if (phase < 0.0625 || phase >= 0.9375) return "🌑";
  if (phase < 0.1875) return "🌒";
  if (phase < 0.3125) return "🌓";
  if (phase < 0.4375) return "🌔";
  if (phase < 0.5625) return "🌕";
  if (phase < 0.6875) return "🌖";
  if (phase < 0.8125) return "🌗";
  return "🌘";
}

function normalizeAlerts(rawAlerts = []) {
  if (!Array.isArray(rawAlerts)) return [];

  return rawAlerts.map((alert) => {
    const alertStart = Number(alert?.start);
    const publishedAt = Number.isFinite(alertStart)
      ? new Date(alertStart * 1000).toISOString()
      : new Date().toISOString();

    return {
      title: `OpenWeather Alert: ${String(alert?.event || "Weather warning")}`,
      description: String(alert?.description || "").trim() || null,
      url: "",
      domain: "openweathermap.org",
      publishedAt,
      lat: ATHENS_COORDS.lat,
      lng: ATHENS_COORDS.lng,
      severity: "high",
      category: "weather_alert",
      source: "openweather",
      queryHint: "Athens",
    };
  });
}

function toWeatherCache({ weatherData, onecallData, uviData }) {
  const currentWeather = Array.isArray(weatherData?.weather) ? weatherData.weather[0] : null;
  const moonPhase = Number(onecallData?.daily?.[0]?.moon_phase);
  const fallbackUvi = Number(onecallData?.current?.uvi);
  const directUvi = Number(uviData?.value);
  const uvi = Number.isFinite(directUvi) ? directUvi : Number.isFinite(fallbackUvi) ? fallbackUvi : null;

  return {
    temp: Number.isFinite(Number(weatherData?.main?.temp)) ? Number(weatherData.main.temp) : null,
    feelsLike: Number.isFinite(Number(weatherData?.main?.feels_like))
      ? Number(weatherData.main.feels_like)
      : null,
    description: currentWeather?.description || null,
    uvi,
    windSpeed: mpsToKmh(weatherData?.wind?.speed),
    windDeg: Number.isFinite(Number(weatherData?.wind?.deg)) ? Number(weatherData.wind.deg) : null,
    humidity: Number.isFinite(Number(weatherData?.main?.humidity))
      ? Number(weatherData.main.humidity)
      : null,
    moonPhase: Number.isFinite(moonPhase) ? moonPhase : null,
    moonSymbol: toMoonSymbol(moonPhase),
    updatedAt: new Date().toISOString(),
  };
}

export async function fetchOpenWeatherSnapshot() {
  const apiKey = resolveApiKey();
  const sharedParams = {
    lat: String(ATHENS_COORDS.lat),
    lon: String(ATHENS_COORDS.lng),
    appid: apiKey,
    units: "metric",
  };

  const weatherUrl = buildUrl("weather", sharedParams);
  const uviUrl = buildUrl("uvi", sharedParams);
  const onecallUrl = buildUrl("onecall", {
    ...sharedParams,
    exclude: "minutely,hourly",
  });

  const [weatherResult, uviResult, onecallResult] = await Promise.allSettled([
    fetchJson(weatherUrl),
    fetchJson(uviUrl),
    fetchJson(onecallUrl),
  ]);

  if (weatherResult.status !== "fulfilled") {
    throw weatherResult.reason;
  }

  const onecallData = onecallResult.status === "fulfilled" ? onecallResult.value : {};
  const uviData = uviResult.status === "fulfilled" ? uviResult.value : {};

  return {
    weatherCache: toWeatherCache({
      weatherData: weatherResult.value,
      onecallData,
      uviData,
    }),
    alerts: normalizeAlerts(onecallData?.alerts),
  };
}
