const ALLOWED_CATEGORY_KEYWORDS = {
  fire: ["φωτιά", "πυρκαγιά", "fire", "blaze", "wildfire", "arson", "καίει", "εμπρησμός", "καπνός", "καπνιά"],
  explosion: ["έκρηξη", "explosion", "bomb", "blast", "βόμβα"],
  protest: [
    "διαδήλωση",
    "πορεία",
    "απεργία",
    "protest",
    "demonstration",
    "strike",
    "riot",
    "march",
    "μπλοκ",
    "συγκέντρωση",
    "αποκλεισμός",
    "επεισόδια",
  ],
  accident: [
    "τροχαίο",
    "accident",
    "crash",
    "flood",
    "πλημμύρα",
    "σεισμός",
    "earthquake",
    "gas leak",
    "αέριο",
    "derail",
    "έκρηξη αερίου",
    "τραυματίες",
    "εγκλωβισμένος",
  ],
  crime: ["ένοπλη", "οπλισμένος", "κλοπή οχήματος"],
  infrastructure: [
    "blackout",
    "διακοπή ρεύματος",
    "διακοπή νερού",
    "outage",
    "μετρό ακυρώσεις",
    "οασα",
  ],
  weather_alert: [
    "καταιγίδα",
    "θυελλώδεις",
    "χαλάζι",
    "πλημμυρικά",
    "meteoalarm",
    "κίτρινη προειδοποίηση",
    "πορτοκαλί",
  ],
};

const REJECT_ALWAYS_KEYWORDS = [
  // Hard rejections: politics, economy, sports, entertainment.
  "πολιτικ",
  "εκλογ",
  "βουλ",
  "υπουργ",
  "οικονομ",
  "χρηματιστ",
  "αθλη",
  "σκορ",
  "γκολ",
  "μεταγραφ",
  "ψυχαγωγ",
  "τραγουδ",
  "ηθοποι",
  "election",
  "parliament",
  "minister",
  "economy",
  "stock",
  "market",
  "sports",
  "score",
  "goal",
  "transfer",
  "entertainment",
  "singer",
  "actor",
  "movie",
  "tv show",
];

const TITLE_REJECT_STEMS = [
  "εκλογ",
  "βουλ",
  "υπουργ",
  "χρηματιστ",
  "σκορ",
  "γκολ",
  "μεταγραφ",
  "τραγουδ",
  "ηθοποι",
];

const ATTICA_LOCATION_TERMS = [
  "athens greece",
  "athens, greece",
  "athina",
  "attica",
  "attiki",
  "piraeus",
  "πειραι",
  "κηφισ",
  "kifiss",
  "glyfada",
  "γλυφαδ",
  "marous",
  "μαρουσ",
  "chalandr",
  "χαλανδρ",
  "kallithea",
  "καλλιθε",
  "nea smyrn",
  "νεα σμυρν",
  "perister",
  "περιστερ",
  "galats",
  "γαλατσ",
  "pentel",
  "πεντελ",
  "zograf",
  "ζωγραφ",
  "athens metro",
  "οασα",
];

function normalizeText(input) {
  return String(input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKeywordMap(map) {
  const result = {};
  for (const [category, keywords] of Object.entries(map)) {
    result[category] = keywords.map((keyword) => normalizeText(keyword));
  }
  return result;
}

const NORMALIZED_ALLOWED_KEYWORDS = normalizeKeywordMap(ALLOWED_CATEGORY_KEYWORDS);
const NORMALIZED_REJECT_KEYWORDS = REJECT_ALWAYS_KEYWORDS.map((keyword) => normalizeText(keyword));
const NORMALIZED_TITLE_REJECT_STEMS = TITLE_REJECT_STEMS.map((keyword) => normalizeText(keyword));
const NORMALIZED_ATTICA_LOCATION_TERMS = ATTICA_LOCATION_TERMS.map((keyword) => normalizeText(keyword));

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesKeyword(normalizedText, normalizedKeyword) {
  if (!normalizedKeyword) return false;

  if (normalizedKeyword.includes(" ")) {
    return normalizedText.includes(normalizedKeyword);
  }

  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}])${escapeRegex(normalizedKeyword)}[\\p{L}\\p{N}]*(?=[^\\p{L}\\p{N}]|$)`,
    "u",
  );

  return pattern.test(normalizedText);
}

function findAllowedMatches(normalizedText) {
  const matchedCategories = {};
  const uniqueKeywordMatches = new Set();

  for (const [category, keywords] of Object.entries(NORMALIZED_ALLOWED_KEYWORDS)) {
    const matched = keywords.filter((keyword) => matchesKeyword(normalizedText, keyword));
    if (matched.length > 0) {
      matchedCategories[category] = matched;
      matched.forEach((keyword) => uniqueKeywordMatches.add(keyword));
    }
  }

  return {
    matchedCategories,
    matchedKeywordCount: uniqueKeywordMatches.size,
    matchedKeywords: [...uniqueKeywordMatches],
  };
}

function hasRejectedTerms(normalizedTitle, normalizedBody) {
  if (NORMALIZED_TITLE_REJECT_STEMS.some((stem) => normalizedTitle.includes(stem))) {
    return true;
  }

  return NORMALIZED_REJECT_KEYWORDS.some(
    (keyword) => normalizedTitle.includes(keyword) || normalizedBody.includes(keyword),
  );
}

export function evaluateIncidentInclusion({
  title = "",
  description = "",
  locationMatchInAttica = false,
}) {
  const normalizedTitle = normalizeText(title);
  const normalizedBody = normalizeText(`${title} ${description}`);

  if (hasRejectedTerms(normalizedTitle, normalizedBody)) {
    return {
      accepted: false,
      reason: "rejected_keyword",
      matchedCategories: {},
      matchedKeywordCount: 0,
      matchedKeywords: [],
    };
  }

  const matchResult = findAllowedMatches(normalizedBody);

  if (matchResult.matchedKeywordCount === 0) {
    return {
      accepted: false,
      reason: "no_allowed_category_match",
      ...matchResult,
    };
  }

  const meetsThreshold = matchResult.matchedKeywordCount >= 1;

  return {
    accepted: meetsThreshold,
    reason: meetsThreshold ? "accepted" : "below_keyword_location_threshold",
    ...matchResult,
  };
}

export function hasAtticaLocationSignal(text) {
  const normalized = normalizeText(text);
  return NORMALIZED_ATTICA_LOCATION_TERMS.some((term) => normalized.includes(term));
}

export const INCIDENT_FILTER_MODEL = {
  allowedCategories: ALLOWED_CATEGORY_KEYWORDS,
  rejectedKeywords: REJECT_ALWAYS_KEYWORDS,
  titleRejectedStems: TITLE_REJECT_STEMS,
};
