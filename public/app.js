const ATHENS = { lat: 37.9838, lng: 23.7275 };
const WINDOW_MINUTES = 24 * 60;
const API_LIMIT = 140;

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

function updateSourceStatus(providerStatus = [], stale = false) {
  const statusEl = document.getElementById("source-status");
  if (!statusEl) return;

  if (providerStatus.length === 0) {
    statusEl.textContent = "Sources: --";
    return;
  }

  const okCount = providerStatus.filter((source) => source.status === "ok").length;
  statusEl.textContent = stale
    ? `Sources: ${okCount}/${providerStatus.length} (stale)`
    : `Sources: ${okCount}/${providerStatus.length}`;
}

function sanitizeUrl(url) {
  if (!url) return "#";
  try {
    const parsed = new URL(url);
    return parsed.toString();
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

async function loadIncidents() {
  const listEl = document.getElementById("incident-list");
  listEl.innerHTML = '<div class="loading-state"><div class="spinner"></div>Fetching Athens incidents...</div>';
  setRefreshingState(true);

  try {
    const url = `/api/incidents?windowMinutes=${WINDOW_MINUTES}&limit=${API_LIMIT}`;
    const response = await fetch(url, { headers: { Accept: "application/json" } });

    if (!response.ok) {
      throw new Error(`API failed with status ${response.status}`);
    }

    const data = await response.json();
    allIncidents = Array.isArray(data.incidents) ? data.incidents : [];

    renderIncidents();
    renderMarkers();
    updateStats(data);
    updateSourceStatus(data.providerStatus, Boolean(data.stale));
  } catch {
    updateSourceStatus([]);
    listEl.innerHTML = `<div class="empty-msg">
      ⚠ Could not load live incidents.<br><br>
      Check server logs or provider availability.
    </div>`;

    allIncidents = [];
    renderMarkers();
    updateStats({ totals: { total: 0, high: 0 }, windowMinutes: WINDOW_MINUTES });
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
      <div class="incident-card ${escapeHtml(incident.severity || "low")}" onclick="focusIncident(${idx})" style="animation-delay:${idx * 0.03}s">
        <div class="inc-title">${escapeHtml(incident.title || "Unnamed incident")}</div>
        <div class="inc-meta">
          <span class="inc-tag tag-${tagClass(incident.category)}">${escapeHtml(incident.category || "general")}</span>
          <span class="inc-tag tag-${tagClass(incident.severity || "low")}">${escapeHtml(incident.severity || "low")}</span>
          <span class="inc-source">${escapeHtml(incident.domain || incident.source || "")}</span>
          <span class="inc-time">${escapeHtml(incident.timeAgo || "now")}</span>
        </div>
      </div>
    `,
    )
    .join("");
}

function renderMarkers() {
  markersLayer.clearLayers();

  const colors = {
    high: "#ff4747",
    medium: "#ff9f47",
    low: "#47c4ff",
    general: "#6b6b80",
  };

  getFilteredIncidents().forEach((incident) => {
    const color = colors[incident.severity] || colors.general;

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
    const safeUrl = sanitizeUrl(incident.url);

    marker.bindPopup(
      `
      <div class="popup-title">${escapeHtml(incident.title || "Incident")}</div>
      <div class="popup-meta">
        <span class="inc-tag tag-${tagClass(incident.category)}" style="font-family:monospace;font-size:9px;padding:2px 6px;border-radius:2px;">${escapeHtml(incident.category || "general")}</span>
        <span style="font-size:9px;color:#6b6b80;">${escapeHtml(incident.timeAgo || "now")}</span>
      </div>
      ${safeUrl !== "#" ? `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="popup-link">→ Read article</a>` : ""}
      `,
      { maxWidth: 260 },
    );

    markersLayer.addLayer(marker);
  });
}

function updateStats(data) {
  const total = Number(data?.totals?.total || 0);
  const high = Number(data?.totals?.high || 0);
  const hours = Math.max(1, Math.floor(Number(data?.windowMinutes || WINDOW_MINUTES) / 60));

  document.getElementById("stat-total").textContent = total;
  document.getElementById("stat-high").textContent = high;
  document.getElementById("stat-hours").textContent = `${hours}h`;
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
