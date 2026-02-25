const ATHENS = { lat: 37.9838, lng: 23.7275 };
const CATEGORY_COLORS = {
  fire: "#ff3b30",
  explosion: "#ff8a00",
  protest: "#ffd84d",
  crime: "#47c4ff",
  accident: "#a064ff",
  general: "#6b6b80",
};

const CATEGORY_KEYWORDS = {
  protest: ["protest", "demonstration", "rally", "strike", "riot", "march", "πορεία", "απεργία"],
  fire: ["fire", "blaze", "wildfire", "arson", "φωτιά", "πυρκαγιά"],
  explosion: ["explosion", "bomb", "blast", "explosive", "έκρηξη"],
  crime: ["murder", "shooting", "robbery", "stabbing", "arrest", "crime", "attack", "gang"],
  accident: ["crash", "accident", "collision", "derail", "flood", "earthquake", "ατύχημα"],
};

let allIncidents = [];
let currentFilter = "all";
let map;
let markersLayer;

function initMap() {
  map = L.map("map", {
    center: [ATHENS.lat, ATHENS.lng],
    zoom: 11,
    zoomControl: true,
  });

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: "© OpenStreetMap contributors © CARTO",
    subdomains: "abcd",
    maxZoom: 19,
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);

  const centerIcon = L.divIcon({
    className: "",
    html: "<div style=\"width:8px;height:8px;background:#e8ff47;border-radius:50%;box-shadow:0 0 10px #e8ff47;\"></div>",
    iconSize: [8, 8],
    iconAnchor: [4, 4],
  });

  L.marker([ATHENS.lat, ATHENS.lng], { icon: centerIcon })
    .bindTooltip("Athens Center", { permanent: false })
    .addTo(map);
}

function updateClock() {
  const now = new Date();
  document.getElementById("live-time").textContent = now.toLocaleTimeString("el-GR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function setRefreshingState(refreshing) {
  const refreshButton = document.querySelector(".refresh-btn");
  if (!refreshButton) return;
  refreshButton.classList.toggle("spinning", refreshing);
}

function updateSourceStatus(health) {
  const statusEl = document.getElementById("source-status");
  if (!statusEl) return;

  if (!health || !health.source) {
    statusEl.textContent = "Sources: --";
    return;
  }

  const state = health.lastSuccess ? "warm" : "cold";
  statusEl.textContent = `Source: ${health.source} (${state})`;
}

function sanitizeUrl(url) {
  if (!url) return "#";
  try {
    return new URL(url).toString();
  } catch {
    return "#";
  }
}

function escapeHtml(text = "") {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function tagClass(category) {
  const known = new Set(["protest", "fire", "explosion", "crime", "accident", "high", "medium", "low"]);
  return known.has(category) ? category : "default";
}

function categoryClass(category) {
  const known = new Set(["protest", "fire", "explosion", "crime", "accident"]);
  return known.has(category) ? category : "default";
}

function inferCategory(title, source) {
  if (String(source || "").toLowerCase() === "meteo") {
    return "accident";
  }

  const normalized = String(title || "").toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return category;
    }
  }
  return "general";
}

function getTimeAgo(dateInput) {
  const date = new Date(dateInput || Date.now());
  const mins = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

function mapRowToIncident(row) {
  const category = inferCategory(row.title, row.source);
  const maybeUrl = sanitizeUrl(row.description);

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    url: maybeUrl === "#" ? null : maybeUrl,
    lat: Number(row.lat),
    lng: Number(row.lng),
    severity: row.severity || "low",
    confidence: Number(row.confidence || 0.5),
    source: row.source || "gdelt",
    category,
    timeAgo: getTimeAgo(row.lastSeenAt || row.updatedAt),
  };
}

async function loadIncidents() {
  const listEl = document.getElementById("incident-list");
  listEl.innerHTML = '<div class="loading-state"><div class="spinner"></div>Fetching Athens incidents...</div>';
  setRefreshingState(true);

  try {
    const [incidentsResponse, healthResponse] = await Promise.all([
      fetch("/api/incidents?status=active&min_confidence=0.7", {
        headers: { Accept: "application/json" },
      }),
      fetch("/api/health", { headers: { Accept: "application/json" } }),
    ]);

    if (!incidentsResponse.ok) {
      throw new Error(`API failed with status ${incidentsResponse.status}`);
    }

    const rows = await incidentsResponse.json();
    const health = healthResponse.ok ? await healthResponse.json() : null;

    allIncidents = Array.isArray(rows) ? rows.map(mapRowToIncident) : [];

    renderIncidents();
    renderMarkers();
    updateStats();
    updateSourceStatus(health);
  } catch {
    updateSourceStatus(null);
    listEl.innerHTML = `<div class="empty-msg">
      ⚠ Could not load live incidents.<br><br>
      Check API/worker logs.
    </div>`;

    allIncidents = [];
    renderMarkers();
    updateStats();
  } finally {
    setRefreshingState(false);
  }
}

function getFilteredIncidents() {
  if (currentFilter === "all") return allIncidents;
  return allIncidents.filter((incident) => incident.category === currentFilter);
}

function renderIncidents() {
  const listEl = document.getElementById("incident-list");
  const filtered = getFilteredIncidents();

  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="empty-msg">No incidents found<br>for this filter.</div>';
    return;
  }

  listEl.innerHTML = filtered
    .map(
      (incident, idx) => `
      <div class="incident-card category-${categoryClass(incident.category)}" onclick="focusIncident(${idx})" style="animation-delay:${idx * 0.03}s">
        <div class="inc-title">${escapeHtml(incident.title || "Unnamed incident")}</div>
        <div class="inc-meta">
          <span class="inc-tag tag-${tagClass(incident.category)}">${escapeHtml(incident.category || "general")}</span>
          <span class="inc-tag tag-${tagClass(incident.severity || "low")}">${escapeHtml(incident.severity || "low")}</span>
          <span class="inc-source">${escapeHtml(incident.source || "")}</span>
          <span class="inc-time">${escapeHtml(incident.timeAgo || "now")}</span>
        </div>
      </div>
    `,
    )
    .join("");
}

function renderMarkers() {
  markersLayer.clearLayers();

  getFilteredIncidents().forEach((incident) => {
    const color = CATEGORY_COLORS[incident.category] || CATEGORY_COLORS.general;

    const icon = L.divIcon({
      className: "",
      html: `<div style="
        width: 10px;
        height: 10px;
        background: ${color};
        border-radius: 50%;
        border: 2px solid rgba(255,255,255,0.2);
        box-shadow: 0 0 8px ${color}88;
        cursor: pointer;
      "></div>`,
      iconSize: [10, 10],
      iconAnchor: [5, 5],
    });

    const marker = L.marker([incident.lat, incident.lng], { icon });

    marker.bindPopup(
      `
      <div class="popup-title">${escapeHtml(incident.title || "Incident")}</div>
      <div class="popup-meta">
        <span class="inc-tag tag-${tagClass(incident.category)}" style="font-family:monospace;font-size:9px;padding:2px 6px;border-radius:2px;">${escapeHtml(incident.category || "general")}</span>
        <span style="font-size:9px;color:#6b6b80;">${escapeHtml(incident.timeAgo || "now")}</span>
      </div>
      <div style="font-size:9px;color:#6b6b80;margin-bottom:6px;">
        Confidence: ${(incident.confidence * 100).toFixed(0)}%
      </div>
      ${incident.description && !incident.url ? `<div style="font-size:10px;color:#8c8ca3;">${escapeHtml(incident.description)}</div>` : ""}
      ${incident.url ? `<a href="${incident.url}" target="_blank" rel="noopener noreferrer" class="popup-link">→ Open source</a>` : ""}
      `,
      { maxWidth: 260 },
    );

    markersLayer.addLayer(marker);
  });
}

function updateStats() {
  const total = allIncidents.length;
  const high = allIncidents.filter((incident) => incident.severity === "high").length;

  document.getElementById("stat-total").textContent = total;
  document.getElementById("stat-high").textContent = high;
  document.getElementById("stat-hours").textContent = "db";
}

function focusIncident(idx) {
  const incident = getFilteredIncidents()[idx];
  if (!incident || !Number.isFinite(incident.lat) || !Number.isFinite(incident.lng)) {
    return;
  }

  map.setView([incident.lat, incident.lng], 14, { animate: true });
}

function setFilter(filter, button) {
  currentFilter = filter;
  document.querySelectorAll(".filter-btn").forEach((btn) => btn.classList.remove("active"));
  button.classList.add("active");
  renderIncidents();
  renderMarkers();
}

window.loadIncidents = loadIncidents;
window.focusIncident = focusIncident;
window.setFilter = setFilter;

window.onload = () => {
  initMap();
  updateClock();
  setInterval(updateClock, 1000);
  loadIncidents();
};
