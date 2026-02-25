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
  { key: "syntagma", aliases: ["syntagma", "σύνταγμα"], lat: 37.9755, lng: 23.7348 },
  { key: "exarcheia", aliases: ["exarcheia", "εξάρχεια"], lat: 37.9867, lng: 23.7319 },
  { key: "kolonaki", aliases: ["kolonaki", "κολωνάκι"], lat: 37.9789, lng: 23.7439 },
  { key: "kypseli", aliases: ["kypseli", "κυψέλη"], lat: 37.9939, lng: 23.7329 },
  { key: "omonia", aliases: ["omonia", "ομόνοια"], lat: 37.9843, lng: 23.7281 },
  { key: "piraeus", aliases: ["piraeus", "πειραιάς", "πειραιας"], lat: 37.9439, lng: 23.6467 },
  { key: "kifissia", aliases: ["kifissia", "κηφισιά", "κηφισια"], lat: 38.0741, lng: 23.8116 },
  { key: "glyfada", aliases: ["glyfada", "γλυφάδα", "γλυφαδα"], lat: 37.8629, lng: 23.7488 },
  { key: "chalandri", aliases: ["chalandri", "halandri", "χαλάνδρι", "χαλανδρι"], lat: 38.0217, lng: 23.7988 },
  { key: "marousi", aliases: ["marousi", "μαρούσι", "μαρουσι", "amarousio"], lat: 38.0518, lng: 23.8050 },
  { key: "peristeri", aliases: ["peristeri", "περιστέρι", "περιστερι"], lat: 38.0154, lng: 23.6917 },
  { key: "galatsi", aliases: ["galatsi", "γαλάτσι", "γαλατσι"], lat: 38.0167, lng: 23.7500 },
  { key: "nea smyrni", aliases: ["nea smyrni", "νέα σμύρνη", "νεα σμυρνη"], lat: 37.9450, lng: 23.7110 },
  { key: "kallithea", aliases: ["kallithea", "καλλιθέα", "καλλιθεα"], lat: 37.9511, lng: 23.7006 },
  { key: "zografou", aliases: ["zografou", "ζωγράφου", "ζωγραφου"], lat: 37.9717, lng: 23.7656 },
  { key: "penteli", aliases: ["penteli", "πεντέλη", "πεντελη"], lat: 38.0614, lng: 23.8694 },
  { key: "attiki odos", aliases: ["attiki odos", "αττική οδός", "αττικη οδος"], lat: 37.9908, lng: 23.6917 },
];

export const GDELT_QUERIES = [
  "(Athens OR Αθήνα OR Attica OR Αττική) (incident OR protest OR fire OR explosion OR crime OR police OR accident)",
];

export const METEO_LOCATIONS = [
  { name: "Athens Center", lat: 37.9838, lng: 23.7275 },
  { name: "Piraeus", lat: 37.9439, lng: 23.6467 },
  { name: "Kifissia", lat: 38.0741, lng: 23.8116 },
  { name: "Glyfada", lat: 37.8629, lng: 23.7488 },
  { name: "Penteli", lat: 38.0614, lng: 23.8694 },
];

export const CACHE_TTL_MS = 45_000;
export const FETCH_TIMEOUT_MS = 15_000;
export const NOMINATIM_MIN_INTERVAL_MS = 1_100;
export const GEOCODER_MAX_LOOKUPS_PER_REQUEST = 8;

export const DEFAULT_WINDOW_MINUTES = 24 * 60;
export const MAX_WINDOW_MINUTES = 72 * 60;
export const DEFAULT_LIMIT = 120;
export const MAX_LIMIT = 400;
