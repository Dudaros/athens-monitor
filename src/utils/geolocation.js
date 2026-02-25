import { ATHENS_KEYWORDS, ATTICA_BBOX } from "../config/monitorConfig.js";

export function isInsideAttica(lat, lng) {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    lat >= ATTICA_BBOX.minLat &&
    lat <= ATTICA_BBOX.maxLat &&
    lng >= ATTICA_BBOX.minLng &&
    lng <= ATTICA_BBOX.maxLng
  );
}

export function textLooksAthensRelevant(text) {
  const normalized = (text || "").toLowerCase();
  return ATHENS_KEYWORDS.some((keyword) => normalized.includes(keyword));
}
