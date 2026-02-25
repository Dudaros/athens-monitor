import {
  ATHENS,
  ATHENS_ANCHORS,
  ATTICA_BBOX,
  FETCH_TIMEOUT_MS,
  NOMINATIM_MIN_INTERVAL_MS,
} from "../config/monitorConfig.js";
import { isInsideAttica } from "../utils/geolocation.js";

const GEO_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const geocodeCache = new Map();
let lastNominatimRequestMs = 0;

function normalizeText(input) {
  return String(input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function withAliasDefaults(anchor) {
  return {
    ...anchor,
    aliases: Array.isArray(anchor.aliases) && anchor.aliases.length > 0 ? anchor.aliases : [anchor.key],
  };
}

function findAnchorMatch(text) {
  const normalized = normalizeText(text);

  for (const rawAnchor of ATHENS_ANCHORS) {
    const anchor = withAliasDefaults(rawAnchor);
    const aliases = anchor.aliases.map((value) => normalizeText(value));

    if (aliases.some((alias) => alias && normalized.includes(alias))) {
      return {
        lat: anchor.lat,
        lng: anchor.lng,
        locationLabel: anchor.key,
        locationConfidence: "anchor",
      };
    }
  }

  return null;
}

function extractLocationHint(title) {
  const normalizedTitle = String(title || "").replace(/[|•]/g, " ");
  const prepositionPattern =
    /(?:\bin\b|\bnear\b|\bat\b|\bστο\b|\bστη\b|\bστην\b|\bσε\b)\s+([A-Za-z\u0370-\u03FF\s'-]{3,40})/i;

  const match = normalizedTitle.match(prepositionPattern);
  if (!match) return "";

  return String(match[1] || "")
    .split(/[,.;:!?]/)[0]
    .trim();
}

function wait(ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function geocodeByNominatim(query) {
  const cacheKey = normalizeText(query);
  const now = Date.now();

  const cached = geocodeCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const delayMs = NOMINATIM_MIN_INTERVAL_MS - (now - lastNominatimRequestMs);
  await wait(delayMs);
  lastNominatimRequestMs = Date.now();

  const params = new URLSearchParams({
    q: `${query}, Athens, Greece`,
    format: "jsonv2",
    limit: "3",
    countrycodes: "gr",
    addressdetails: "0",
    bounded: "1",
    viewbox: `${ATTICA_BBOX.minLng},${ATTICA_BBOX.maxLat},${ATTICA_BBOX.maxLng},${ATTICA_BBOX.minLat}`,
  });

  const nominatimContact = process.env.NOMINATIM_CONTACT;
  if (nominatimContact) {
    params.set("email", nominatimContact);
  }

  const endpoint = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      "User-Agent": "athens-monitor/0.1",
      "Accept-Language": "el,en",
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim request failed (${response.status})`);
  }

  const payload = await response.json();
  const firstValid = (Array.isArray(payload) ? payload : [])
    .map((item) => ({
      lat: Number(item?.lat),
      lng: Number(item?.lon),
      locationLabel: String(item?.display_name || query),
    }))
    .find((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng) && isInsideAttica(item.lat, item.lng));

  geocodeCache.set(cacheKey, {
    expiresAt: Date.now() + GEO_CACHE_TTL_MS,
    value: firstValid || null,
  });

  return firstValid || null;
}

export async function resolveIncidentCoordinates({ title, queryHint = "", allowRemoteLookup = false }) {
  const textBlob = `${title} ${queryHint}`;

  const anchorMatch = findAnchorMatch(textBlob);
  if (anchorMatch) return anchorMatch;

  if (!allowRemoteLookup) {
    return {
      lat: ATHENS.lat,
      lng: ATHENS.lng,
      locationLabel: "Athens (approx)",
      locationConfidence: "approx",
    };
  }

  const locationHint = extractLocationHint(title);
  if (!locationHint) {
    return {
      lat: ATHENS.lat,
      lng: ATHENS.lng,
      locationLabel: "Athens (approx)",
      locationConfidence: "approx",
    };
  }

  try {
    const geocoded = await geocodeByNominatim(locationHint);
    if (geocoded) {
      return {
        ...geocoded,
        locationConfidence: "geocoded",
      };
    }
  } catch {
    // Keep service resilient when geocoder is unavailable.
  }

  return {
    lat: ATHENS.lat,
    lng: ATHENS.lng,
    locationLabel: "Athens (approx)",
    locationConfidence: "approx",
  };
}
