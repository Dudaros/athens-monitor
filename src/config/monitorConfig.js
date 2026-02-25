export const ATHENS = { lat: 37.9838, lng: 23.7275 };

export const ATTICA_BBOX = {
  minLat: 37.65,
  maxLat: 38.35,
  minLng: 23.2,
  maxLng: 24.25,
};

export const ATHENS_KEYWORDS = [
  "athens",
  "αθήνα",
  "attica",
  "attiki",
  "piraeus",
  "πειραιά",
  "kifissia",
  "glyfada",
  "nea smyrni",
  "kallithea",
  "chalandri",
  "halandri",
  "marousi",
  "iraklio",
  "heraklion",
  "galatsi",
  "peristeri",
  "exarcheia",
  "kolonaki",
  "syntagma",
  "omonia",
  "zografou",
  "attiki odos",
  "penteli",
];

export const CATEGORY_KEYWORDS = {
  protest: ["protest", "demonstration", "rally", "strike", "riot", "march", "unrest", "πορεία", "απεργία"],
  fire: ["fire", "blaze", "wildfire", "arson", "φωτιά", "πυρκαγιά"],
  explosion: ["explosion", "bomb", "blast", "explosive", "έκρηξη"],
  crime: ["murder", "shooting", "robbery", "stabbing", "arrest", "crime", "attack", "gang"],
  accident: ["crash", "accident", "collision", "derail", "flood", "earthquake", "ατύχημα"],
};

export const ATHENS_ANCHORS = [
  { key: "syntagma", lat: 37.9755, lng: 23.7348 },
  { key: "exarcheia", lat: 37.9867, lng: 23.7319 },
  { key: "kolonaki", lat: 37.9789, lng: 23.7439 },
  { key: "kypseli", lat: 37.9939, lng: 23.7329 },
  { key: "omonia", lat: 37.9843, lng: 23.7281 },
  { key: "piraeus", lat: 37.9439, lng: 23.6467 },
  { key: "kifissia", lat: 38.0741, lng: 23.8116 },
  { key: "glyfada", lat: 37.8629, lng: 23.7488 },
  { key: "chalandri", lat: 38.0217, lng: 23.7988 },
  { key: "marousi", lat: 38.0518, lng: 23.8050 },
  { key: "peristeri", lat: 38.0154, lng: 23.6917 },
  { key: "galatsi", lat: 38.0167, lng: 23.7500 },
  { key: "nea smyrni", lat: 37.9450, lng: 23.7110 },
  { key: "kallithea", lat: 37.9511, lng: 23.7006 },
  { key: "zografou", lat: 37.9717, lng: 23.7656 },
  { key: "penteli", lat: 38.0614, lng: 23.8694 },
  { key: "attiki odos", lat: 37.9908, lng: 23.6917 },
];

export const GDELT_QUERIES = [
  "(Athens OR Αθήνα OR Attica OR Αττική) (incident OR protest OR fire OR explosion OR crime OR police OR accident)",
];

export const CACHE_TTL_MS = 45_000;
export const FETCH_TIMEOUT_MS = 15_000;

export const DEFAULT_WINDOW_MINUTES = 24 * 60;
export const MAX_WINDOW_MINUTES = 72 * 60;
export const DEFAULT_LIMIT = 120;
export const MAX_LIMIT = 400;
