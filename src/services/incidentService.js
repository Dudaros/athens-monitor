import {
  DEFAULT_LIMIT,
  DEFAULT_WINDOW_MINUTES,
  GEOCODER_MAX_LOOKUPS_PER_REQUEST,
  MAX_LIMIT,
  MAX_WINDOW_MINUTES,
} from "../config/monitorConfig.js";
import { classifyIncident, getTimeAgoText } from "../utils/classification.js";
import { isInsideAttica, textLooksAthensRelevant } from "../utils/geolocation.js";
import { areLikelyDuplicateHeadlines } from "../utils/headlineSimilarity.js";
import { resolveIncidentCoordinates } from "./geocodingService.js";
import { fetchGdeltIncidents } from "./providers/gdeltProvider.js";

const providers = {
  gdelt: fetchGdeltIncidents,
};

let cache = {
  incidents: [],
  fetchedAt: null,
  windowMinutes: DEFAULT_WINDOW_MINUTES,
  providerStatus: [{ source: "gdelt", status: "idle", count: 0 }],
  stale: true,
  staleAt: null,
  lastSuccess: null,
  lastAttempt: null,
  lastError: null,
};

function parseDate(input) {
  if (typeof input === "string") {
    const gdeltMatch = input.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
    if (gdeltMatch) {
      const [, year, month, day, hour, minute, second] = gdeltMatch;
      return new Date(
        Date.UTC(
          Number(year),
          Number(month) - 1,
          Number(day),
          Number(hour),
          Number(minute),
          Number(second),
        ),
      );
    }
  }

  const candidate = new Date(input || Date.now());
  if (Number.isNaN(candidate.getTime())) {
    return new Date();
  }
  return candidate;
}

function coerceWindowMinutes(rawWindow) {
  const parsed = Number.parseInt(rawWindow, 10);
  if (Number.isNaN(parsed)) return DEFAULT_WINDOW_MINUTES;
  return Math.max(60, Math.min(MAX_WINDOW_MINUTES, parsed));
}

function coerceLimit(rawLimit) {
  const parsed = Number.parseInt(rawLimit, 10);
  if (Number.isNaN(parsed)) return DEFAULT_LIMIT;
  return Math.max(20, Math.min(MAX_LIMIT, parsed));
}

function coerceSources(rawSources) {
  if (!rawSources) return ["gdelt"];

  const requested = String(rawSources)
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const selected = requested.filter((value) => providers[value]);
  return selected.length > 0 ? selected : ["gdelt"];
}

async function normalizeIncident(rawIncident, allowRemoteLookup = false) {
  const title = String(rawIncident?.title || "Athens event").trim();
  const url = String(rawIncident?.url || "").trim();
  const domain = String(rawIncident?.domain || rawIncident?.source || "source").trim();
  const source = String(rawIncident?.source || "unknown").trim();
  const publishedAtDate = parseDate(rawIncident?.publishedAt);

  const lat = Number(rawIncident?.lat);
  const lng = Number(rawIncident?.lng);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

  const textBlob = `${title} ${domain} ${rawIncident?.queryHint || ""}`;
  const looksRelevant = textLooksAthensRelevant(textBlob);

  let coordinates = null;
  if (hasCoords && isInsideAttica(lat, lng)) {
    coordinates = {
      lat,
      lng,
      locationLabel: "Source coordinates",
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

  const { category, severity } = classifyIncident(title);

  return {
    id: `${source}:${url || title}:${publishedAtDate.toISOString()}`,
    title,
    url,
    domain,
    source,
    category,
    severity,
    lat: coordinates.lat,
    lng: coordinates.lng,
    locationLabel: coordinates.locationLabel,
    locationConfidence: coordinates.locationConfidence,
    publishedAt: publishedAtDate.toISOString(),
    timeAgo: getTimeAgoText(publishedAtDate),
  };
}

function dedupeIncidents(incidents) {
  const seenUrls = new Set();
  const kept = [];

  for (const incident of incidents) {
    if (incident.url && seenUrls.has(incident.url)) {
      continue;
    }

    const duplicateByHeadline = kept.some((existingIncident) => {
      const hoursBetween =
        Math.abs(
          new Date(existingIncident.publishedAt).getTime() -
            new Date(incident.publishedAt).getTime(),
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

    if (incident.url) {
      seenUrls.add(incident.url);
    }
    kept.push(incident);
  }

  return kept;
}

function firstErrorMessage(providerStatus) {
  const errorProvider = providerStatus.find((provider) => provider.status === "error");
  return errorProvider?.error || "Provider refresh failed";
}

export async function refreshIncidentCache(options = {}) {
  const windowMinutes = coerceWindowMinutes(options.windowMinutes);
  const limit = coerceLimit(options.limit ?? MAX_LIMIT);
  const sources = coerceSources(options.sources);

  cache.lastAttempt = new Date().toISOString();

  const fetchResults = await Promise.allSettled(
    sources.map(async (sourceName) => {
      const incidents = await providers[sourceName]({ windowMinutes, limit });
      return { sourceName, incidents };
    }),
  );

  const providerStatus = fetchResults.map((result, idx) => {
    const sourceName = sources[idx];
    if (result.status === "fulfilled") {
      return {
        source: sourceName,
        status: "ok",
        count: result.value.incidents.length,
      };
    }

    return {
      source: sourceName,
      status: "error",
      count: 0,
      error:
        result.reason instanceof Error
          ? result.reason.message
          : "Unknown provider error",
    };
  });

  const hasSuccessfulProvider = fetchResults.some(
    (result) => result.status === "fulfilled",
  );

  if (!hasSuccessfulProvider) {
    cache = {
      ...cache,
      stale: true,
      staleAt: new Date().toISOString(),
      providerStatus,
      lastError: firstErrorMessage(providerStatus),
    };

    throw new Error(cache.lastError);
  }

  const rawIncidents = fetchResults
    .filter((result) => result.status === "fulfilled")
    .flatMap((result) => result.value.incidents);

  const normalized = (
    await Promise.all(
      rawIncidents.map((rawIncident, index) =>
        normalizeIncident(rawIncident, index < GEOCODER_MAX_LOOKUPS_PER_REQUEST),
      ),
    )
  ).filter(Boolean);

  const deduped = dedupeIncidents(
    [...normalized].sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    ),
  ).slice(0, limit);

  const nowIso = new Date().toISOString();
  cache = {
    incidents: deduped,
    fetchedAt: nowIso,
    windowMinutes,
    providerStatus,
    stale: false,
    staleAt: null,
    lastSuccess: nowIso,
    lastAttempt: cache.lastAttempt,
    lastError: null,
  };

  return {
    source: "gdelt",
    fetchedAt: cache.fetchedAt,
    cachedCount: cache.incidents.length,
  };
}

export function getIncidentCacheStatus() {
  return {
    source: "gdelt",
    lastSuccess: cache.lastSuccess,
    cachedCount: cache.incidents.length,
    stale: cache.stale,
    staleAt: cache.staleAt,
    lastAttempt: cache.lastAttempt,
    lastError: cache.lastError,
  };
}

export async function getIncidents(options = {}) {
  const windowMinutes = coerceWindowMinutes(options.windowMinutes);
  const limit = coerceLimit(options.limit);
  const category = String(options.category || "all").toLowerCase();
  const sources = coerceSources(options.sources);

  const sourceSupported = sources.includes("gdelt");
  const sourceIncidents = sourceSupported ? cache.incidents : [];
  const minTimestamp = Date.now() - windowMinutes * 60 * 1000;

  const withinWindow = sourceIncidents.filter(
    (incident) => new Date(incident.publishedAt).getTime() >= minTimestamp,
  );

  const byCategory =
    category === "all"
      ? withinWindow
      : withinWindow.filter((incident) => incident.category === category);

  const incidents = byCategory.slice(0, limit).map((incident) => ({
    ...incident,
    timeAgo: getTimeAgoText(new Date(incident.publishedAt)),
  }));

  return {
    fetchedAt: cache.fetchedAt,
    windowMinutes,
    incidents,
    totals: {
      total: incidents.length,
      high: incidents.filter((incident) => incident.severity === "high").length,
    },
    providerStatus: cache.providerStatus,
    stale: cache.stale || !cache.lastSuccess,
    staleAt: cache.staleAt,
  };
}
