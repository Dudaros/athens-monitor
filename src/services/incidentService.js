import { listIncidents } from "../db/incidentsRepository.js";
import { isInsideAttica } from "../utils/geolocation.js";
import { evaluateIncidentInclusion, hasAtticaLocationSignal } from "../utils/incidentFilter.js";

function parseMinConfidence(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return undefined;
  }

  const parsed = Number.parseFloat(String(rawValue));
  if (Number.isNaN(parsed)) {
    throw new Error("min_confidence must be a valid number");
  }

  return parsed;
}

function parseSince(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return undefined;
  }

  const parsed = new Date(String(rawValue));
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("since must be a valid timestamp");
  }

  return parsed.toISOString();
}

function parseSource(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return undefined;
  }

  const source = String(rawValue).trim().toLowerCase();
  if (!source) return undefined;

  return source;
}

function shouldKeepRow(row) {
  const source = String(row?.source || "").toLowerCase();
  if (source !== "gdelt") {
    return true;
  }

  const title = String(row?.title || "");
  const description = String(row?.description || "");
  const lat = Number(row?.lat);
  const lng = Number(row?.lng);
  const confidence = Number(row?.confidence || 0);

  const hasSourceLocationInAttica =
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    confidence >= 0.85 &&
    isInsideAttica(lat, lng);
  const hasTextLocationInAttica = hasAtticaLocationSignal(`${title} ${description}`);

  const inclusion = evaluateIncidentInclusion({
    title,
    description,
    locationMatchInAttica: hasSourceLocationInAttica || hasTextLocationInAttica,
  });

  return inclusion.accepted;
}

export async function getIncidents(filters = {}) {
  const normalizedFilters = {
    status: String(filters.status || "active").trim(),
    minConfidence: parseMinConfidence(filters.minConfidence),
    since: parseSince(filters.since),
    source: parseSource(filters.source),
  };

  const rows = await listIncidents(normalizedFilters);
  return rows.filter(shouldKeepRow);
}
