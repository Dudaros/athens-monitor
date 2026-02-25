import { FETCH_TIMEOUT_MS } from "../../config/monitorConfig.js";

const USGS_ENDPOINT = "https://earthquake.usgs.gov/fdsnws/event/1/query";

function buildUsgsUrl() {
  const params = new URLSearchParams({
    format: "geojson",
    minmagnitude: "2.0",
    minlatitude: "36.0",
    maxlatitude: "42.0",
    minlongitude: "19.0",
    maxlongitude: "29.0",
  });

  return `${USGS_ENDPOINT}?${params.toString()}`;
}

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`USGS request failed (${response.status})`);
  }

  return response.json();
}

function toSeverity(magnitude) {
  const mag = Number(magnitude);
  if (!Number.isFinite(mag)) return "low";
  if (mag < 3) return "low";
  if (mag < 4) return "medium";
  return "high";
}

function toMagnitudeLabel(magnitude) {
  const mag = Number(magnitude);
  if (!Number.isFinite(mag)) return "N/A";
  return mag.toFixed(1);
}

function normalizeFeature(feature) {
  const magnitude = Number(feature?.properties?.mag);
  const place = String(feature?.properties?.place || "Ελλάδα");
  const coordinates = Array.isArray(feature?.geometry?.coordinates) ? feature.geometry.coordinates : [];
  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const eventTime = Number(feature?.properties?.time);
  const publishedAt = Number.isFinite(eventTime) ? new Date(eventTime).toISOString() : new Date().toISOString();

  return {
    title: `Σεισμός Μ${toMagnitudeLabel(magnitude)} — ${place}`,
    description: `USGS seismic event near ${place}`,
    url: String(feature?.properties?.url || ""),
    domain: "earthquake.usgs.gov",
    publishedAt,
    lat,
    lng,
    severity: toSeverity(magnitude),
    category: "accident",
    source: "usgs",
    queryHint: place,
  };
}

export async function fetchUsgsIncidents() {
  const url = buildUsgsUrl();
  const data = await fetchJson(url);
  const features = Array.isArray(data?.features) ? data.features : [];

  return features.map(normalizeFeature).filter(Boolean);
}
