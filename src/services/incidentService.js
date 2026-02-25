import { listIncidents } from "../db/incidentsRepository.js";

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

export async function getIncidents(filters = {}) {
  const normalizedFilters = {
    status: String(filters.status || "active").trim(),
    minConfidence: parseMinConfidence(filters.minConfidence),
    since: parseSince(filters.since),
  };

  return listIncidents(normalizedFilters);
}
