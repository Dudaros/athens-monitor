const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "for",
  "from",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "to",
  "with",
  "στη",
  "στο",
  "στην",
  "των",
  "της",
  "τον",
  "των",
  "και",
  "σε",
  "από",
  "με",
  "για",
  "του",
  "την",
]);

function normalizeForTokens(input) {
  return String(input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0370-\u03ff\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeHeadline(headline) {
  const normalized = normalizeForTokens(headline);
  if (!normalized) return [];

  return normalized
    .split(" ")
    .filter((token) => token.length >= 3)
    .filter((token) => !STOPWORDS.has(token));
}

function jaccard(tokensA, tokensB) {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersection += 1;
    }
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function areLikelyDuplicateHeadlines(leftHeadline, rightHeadline) {
  const leftTokens = tokenizeHeadline(leftHeadline);
  const rightTokens = tokenizeHeadline(rightHeadline);

  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return false;
  }

  const similarity = jaccard(leftTokens, rightTokens);
  return similarity >= 0.75;
}
