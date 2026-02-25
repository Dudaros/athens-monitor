import { CATEGORY_KEYWORDS } from "../config/monitorConfig.js";

export function classifyIncident(title) {
  const normalized = (title || "").toLowerCase();
  let category = "general";

  for (const [candidate, words] of Object.entries(CATEGORY_KEYWORDS)) {
    if (words.some((word) => normalized.includes(word))) {
      category = candidate;
      break;
    }
  }

  let severity = "low";
  if (category === "explosion" || category === "fire") {
    severity = "high";
  } else if (category === "protest" || category === "crime") {
    severity = "medium";
  }

  return { category, severity };
}

export function getTimeAgoText(date) {
  const parsed = date instanceof Date ? date : new Date(date);
  const ageMins = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 60000));

  if (ageMins < 60) return `${ageMins}m ago`;
  if (ageMins < 1440) return `${Math.floor(ageMins / 60)}h ago`;
  return `${Math.floor(ageMins / 1440)}d ago`;
}
