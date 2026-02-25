import { v5 as uuidv5 } from "uuid";
import {
  DEFAULT_WINDOW_MINUTES,
  GEOCODER_MAX_LOOKUPS_PER_REQUEST,
  MAX_LIMIT,
} from "../config/monitorConfig.js";
import { classifyIncident } from "../utils/classification.js";
import { isInsideAttica, textLooksAthensRelevant } from "../utils/geolocation.js";
import { areLikelyDuplicateHeadlines } from "../utils/headlineSimilarity.js";
import { fetchGdeltIncidents } from "./providers/gdeltProvider.js";
import { resolveIncidentCoordinates } from "./geocodingService.js";

const INCIDENT_UUID_NAMESPACE = "d3f27d9c-5fc3-40c4-9f39-31eac5fdbf66";

function parseDate(input) {
  if (typeof input === "string") {
    const gdeltMatch = input.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
    if (gdeltMatch) {
      const [, year, month, day, hour, minute, second] = gdeltMatch;
      return new Date(
        Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)),
      );
    }
  }

  const candidate = new Date(input || Date.now());
  if (Number.isNaN(candidate.getTime())) {
    return new Date();
  }

  return candidate;
}

function normalizeUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    parsed.searchParams.delete("utm_source");
    parsed.searchParams.delete("utm_medium");
    parsed.searchParams.delete("utm_campaign");
    parsed.searchParams.delete("utm_term");
    parsed.searchParams.delete("utm_content");
    return parsed.toString();
  } catch {
    return raw;
  }
}

function toConfidence(locationConfidence) {
  if (locationConfidence === "source") return 0.95;
  if (locationConfidence === "anchor") return 0.85;
  if (locationConfidence === "geocoded") return 0.75;
  return 0.5;
}

function deterministicIncidentId({ source, canonicalUrl, title, lat, lng }) {
  const latKey = Number(lat).toFixed(5);
  const lngKey = Number(lng).toFixed(5);
  const titleKey = String(title || "").toLowerCase().replace(/\s+/g, " ").trim();
  const seed = `${source}|${canonicalUrl || titleKey}|${latKey}|${lngKey}`;
  return uuidv5(seed, INCIDENT_UUID_NAMESPACE);
}

async function normalizeIncident(rawIncident, allowRemoteLookup = false) {
  const title = String(rawIncident?.title || "Athens event").trim();
  const source = String(rawIncident?.source || "gdelt").trim();
  const description = rawIncident?.description ? String(rawIncident.description).trim() : null;
  const publishedAtDate = parseDate(rawIncident?.publishedAt);

  const lat = Number(rawIncident?.lat);
  const lng = Number(rawIncident?.lng);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

  const textBlob = `${title} ${rawIncident?.domain || ""} ${rawIncident?.queryHint || ""}`;
  const looksRelevant = textLooksAthensRelevant(textBlob);

  let coordinates = null;
  if (hasCoords && isInsideAttica(lat, lng)) {
    coordinates = {
      lat,
      lng,
      locationConfidence: "source",
    };
  } else if (looksRelevant) {
    coordinates = await resolveIncidentCoordinates({
      title,
      queryHint: rawIncident?.queryHint,
      allowRemoteLookup,
    });
  }

  if (!coordinates) {
    return null;
  }

  const { severity } = classifyIncident(title);
  const canonicalUrl = normalizeUrl(rawIncident?.url);
  const firstSeenAt = publishedAtDate.toISOString();
  const lastSeenAt = new Date().toISOString();

  return {
    id: deterministicIncidentId({
      source,
      canonicalUrl,
      title,
      lat: coordinates.lat,
      lng: coordinates.lng,
    }),
    title,
    description,
    lat: coordinates.lat,
    lng: coordinates.lng,
    severity,
    confidence: toConfidence(coordinates.locationConfidence),
    source,
    firstSeenAt,
    lastSeenAt,
    status: "active",
    _publishedAt: firstSeenAt,
    _url: canonicalUrl,
  };
}

function dedupeIncidents(incidents) {
  const seenUrls = new Set();
  const kept = [];

  for (const incident of incidents) {
    if (incident._url && seenUrls.has(incident._url)) {
      continue;
    }

    const duplicateByHeadline = kept.some((existingIncident) => {
      const hoursBetween =
        Math.abs(
          new Date(existingIncident._publishedAt).getTime() - new Date(incident._publishedAt).getTime(),
        ) / (1000 * 60 * 60);

      if (hoursBetween > 72) {
        return false;
      }

      return areLikelyDuplicateHeadlines(existingIncident.title, incident.title);
    });

    if (duplicateByHeadline) {
      continue;
    }

    if (incident._url) {
      seenUrls.add(incident._url);
    }

    kept.push(incident);
  }

  return kept;
}

function stripInternalFields(incident) {
  const { _publishedAt, _url, ...publicIncident } = incident;
  return publicIncident;
}

export async function fetchNormalizedGdeltIncidents(options = {}) {
  const windowMinutes = Number(options.windowMinutes) || DEFAULT_WINDOW_MINUTES;
  const limit = Number(options.limit) || MAX_LIMIT;

  const rawIncidents = await fetchGdeltIncidents({ windowMinutes, limit });

  const normalized = (
    await Promise.all(
      rawIncidents.map((rawIncident, index) =>
        normalizeIncident(rawIncident, index < GEOCODER_MAX_LOOKUPS_PER_REQUEST),
      ),
    )
  ).filter(Boolean);

  const deduped = dedupeIncidents(
    [...normalized].sort((a, b) => new Date(b._publishedAt).getTime() - new Date(a._publishedAt).getTime()),
  ).slice(0, limit);

  return deduped.map(stripInternalFields);
}
