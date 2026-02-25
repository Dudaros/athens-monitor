import { FETCH_TIMEOUT_MS, GDELT_QUERIES } from "../../config/monitorConfig.js";

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`GDELT request failed (${response.status})`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    const snippet = (await response.text()).slice(0, 120);
    throw new Error(`GDELT returned non-JSON response: ${snippet}`);
  }

  return response.json();
}

function normalizeDocArticle(article, queryHint) {
  return {
    title: article?.title || "Athens event",
    url: article?.url || "",
    domain: article?.domain || "gdeltproject.org",
    publishedAt: article?.seendate || new Date().toISOString(),
    lat: typeof article?._lat === "number" ? article._lat : null,
    lng: typeof article?._lng === "number" ? article._lng : null,
    source: "gdelt",
    queryHint,
  };
}

export async function fetchGdeltIncidents({ windowMinutes = 1440, limit = 120 }) {
  const boundedLimit = Math.max(20, Math.min(120, limit));

  const query = GDELT_QUERIES[0];
  const queryWithLang = `${query} (sourcelang:greek OR sourcelang:english)`;
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(queryWithLang)}&mode=artlist&maxrecords=${boundedLimit}&timespan=${windowMinutes}&sort=DateDesc&format=json`;

  const data = await fetchJson(url);
  const articles = Array.isArray(data?.articles) ? data.articles : [];

  return articles.map((article) => normalizeDocArticle(article, query));
}
