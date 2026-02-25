import { v5 as uuidv5 } from "uuid";
import {
  DEFAULT_WINDOW_MINUTES,
  GEOCODER_MAX_LOOKUPS_PER_REQUEST,
  MAX_LIMIT,
} from "../config/monitorConfig.js";
import { classifyIncident } from "../utils/classification.js";
import { isInsideAttica, textLooksAthensRelevant } from "../utils/geolocation.js";
import { areLikelyDuplicateHeadlines } from "../utils/headlineSimilarity.js";
import { evaluateIncidentInclusion, hasAtticaLocationSignal } from "../utils/incidentFilter.js";
import { resolveIncidentCoordinates } from "./geocodingService.js";
import { fetchGdeltIncidents } from "./providers/gdeltProvider.js";
import { fetchMeteoIncidents } from "./providers/meteoProvider.js";
import { fetchUsgsIncidents } from "./providers/usgsProvider.js";

const INCIDENT_UUID_NAMESPACE = "d3f27d9c-5fc3-40c4-9f39-31eac5fdbf66";

const PROVIDERS = {
  gdelt: fetchGdeltIncidents,
  meteo: fetchMeteoIncidents,
  usgs: fetchUsgsIncidents,
};

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

function coerceSources(rawSources) {
  if (!rawSources) {
    return ["gdelt", "meteo", "usgs"];
  }

  const requested = Array.isArray(rawSources)
    ? rawSources
    : String(rawSources)
        .split(",")
        .map((value) => value.trim().toLowerCase());

  const selected = requested.filter((source) => PROVIDERS[source]);
  return selected.length > 0 ? selected : ["gdelt", "meteo", "usgs"];
}

async function normalizeIncident(rawIncident, allowRemoteLookup = false) {
  const title = String(rawIncident?.title || "Athens event").trim();
  const source = String(rawIncident?.source || "gdelt").trim();
  const canonicalUrl = normalizeUrl(rawIncident?.url);
  const description = rawIncident?.description
    ? String(rawIncident.description).trim()
    : canonicalUrl || null;
  const publishedAtDate = parseDate(rawIncident?.publishedAt);

  const lat = Number(rawIncident?.lat);
  const lng = Number(rawIncident?.lng);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

  const textBlob = `${title} ${rawIncident?.domain || ""} ${rawIncident?.queryHint || ""}`;
  const looksRelevant = textLooksAthensRelevant(textBlob);

  let coordinates = null;
  if (hasCoords && (isInsideAttica(lat, lng) || source.toLowerCase() === "usgs")) {
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

  const { severity: inferredSeverity } = classifyIncident(title);
  const severity = rawIncident?.severity || inferredSeverity;

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
      if (incident.source !== existingIncident.source) {
        return false;
      }

      const hoursBetween =
        Math.abs(
          new Date(existingIncident._publishedAt).getTime() -
            new Date(incident._publishedAt).getTime(),
        ) /
        (1000 * 60 * 60);

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

export async function fetchNormalizedIncidents(options = {}) {
  const windowMinutes = Number(options.windowMinutes) || DEFAULT_WINDOW_MINUTES;
  const limit = Number(options.limit) || MAX_LIMIT;
  const sources = coerceSources(options.sources);

  const fetchResults = await Promise.allSettled(
    sources.map(async (source) => {
      const incidents = await PROVIDERS[source]({ windowMinutes, limit });
      return incidents;
    }),
  );

  const successfulProviders = fetchResults.filter((result) => result.status === "fulfilled");
  const successfulPayloads = successfulProviders
    .filter((result) => result.status === "fulfilled")
    .flatMap((result) => result.value);

  if (successfulProviders.length === 0) {
    const failureMessage = fetchResults
      .filter((result) => result.status === "rejected")
      .map((result) => (result.reason instanceof Error ? result.reason.message : String(result.reason)))
      .join(" | ");

    throw new Error(failureMessage || "All providers failed");
  }

  const filterStats = {
    total: 0,
    passed: 0,
    failed: 0,
  };

  const filteredPayloads = successfulPayloads.filter((rawIncident) => {
    const source = String(rawIncident?.source || "").toLowerCase();
    if (source !== "gdelt") {
      return true;
    }

    filterStats.total += 1;

    const title = String(rawIncident?.title || "");
    const description = String(rawIncident?.description || "");
    const lat = Number(rawIncident?.lat);
    const lng = Number(rawIncident?.lng);
    const hasSourceLocationInAttica = Number.isFinite(lat) && Number.isFinite(lng) && isInsideAttica(lat, lng);
    const hasTextLocationInAttica = hasAtticaLocationSignal(`${title} ${description}`);

    const inclusion = evaluateIncidentInclusion({
      title,
      description,
      locationMatchInAttica: hasSourceLocationInAttica || hasTextLocationInAttica,
    });

    if (inclusion.accepted) {
      filterStats.passed += 1;
      return true;
    }

    filterStats.failed += 1;
    return false;
  });

  if (filterStats.total > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `[incidentFilter] cycle totals: total=${filterStats.total} passed=${filterStats.passed} failed=${filterStats.failed}`,
    );
  }

  const normalized = (
    await Promise.all(
      filteredPayloads.map((rawIncident, index) =>
        normalizeIncident(rawIncident, index < GEOCODER_MAX_LOOKUPS_PER_REQUEST),
      ),
    )
  ).filter(Boolean);

  const deduped = dedupeIncidents(
    [...normalized].sort(
      (a, b) => new Date(b._publishedAt).getTime() - new Date(a._publishedAt).getTime(),
    ),
  ).slice(0, limit);

  return deduped.map(stripInternalFields);
}

export async function fetchNormalizedGdeltIncidents(options = {}) {
  return fetchNormalizedIncidents({ ...options, sources: ["gdelt"] });
}
