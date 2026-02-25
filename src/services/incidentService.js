import { listIncidents } from "../db/incidentsRepository.js";

const GDELT_NOISE_TERMS = [
  "casting",
  "tourism",
  "box office",
  "movie",
  "tv show",
  "celebrity",
  "horoscope",
  "recipe",
  "real estate",
  "stock market",
  "crypto",
  "transfer news",
  "lifestyle",
  "opinion",
  "interview",
];

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
  if (String(row?.source || "").toLowerCase() !== "gdelt") {
    return true;
  }

  const normalizedTitle = String(row?.title || "").toLowerCase();
  return !GDELT_NOISE_TERMS.some((term) => normalizedTitle.includes(term));
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
