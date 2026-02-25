import { ATHENS, ATHENS_ANCHORS, ATHENS_KEYWORDS, ATTICA_BBOX } from "../config/monitorConfig.js";
import { stableHash } from "./hash.js";

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

export function inferAthensCoordinates(text, seedInput = "") {
  const normalized = (text || "").toLowerCase();

  const anchor = ATHENS_ANCHORS.find((candidate) => normalized.includes(candidate.key));
  if (anchor) {
    return { lat: anchor.lat, lng: anchor.lng };
  }

  const seed = stableHash(`${text}:${seedInput}`);
  const latOffset = ((seed % 1000) / 1000 - 0.5) * 0.18;
  const lngOffset = (((Math.floor(seed / 1000) % 1000) / 1000) - 0.5) * 0.22;

  return {
    lat: ATHENS.lat + latOffset,
    lng: ATHENS.lng + lngOffset,
  };
}
