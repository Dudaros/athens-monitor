import { pool } from "./postgres.js";

const UPSERT_SQL = `
INSERT INTO incidents (
  id,
  title,
  description,
  lat,
  lng,
  severity,
  confidence,
  source,
  first_seen_at,
  last_seen_at,
  status
)
VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
)
ON CONFLICT (id)
DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng,
  severity = EXCLUDED.severity,
  confidence = EXCLUDED.confidence,
  source = EXCLUDED.source,
  last_seen_at = EXCLUDED.last_seen_at,
  updated_at = NOW();
`;

export async function upsertIncidents(incidents) {
  if (!Array.isArray(incidents) || incidents.length === 0) {
    return { upserted: 0 };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const incident of incidents) {
      await client.query(UPSERT_SQL, [
        incident.id,
        incident.title,
        incident.description,
        incident.lat,
        incident.lng,
        incident.severity,
        incident.confidence,
        incident.source,
        incident.firstSeenAt,
        incident.lastSeenAt,
        incident.status,
      ]);
    }

    await client.query("COMMIT");
    return { upserted: incidents.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listIncidents(filters = {}) {
  const whereClauses = [];
  const values = [];

  if (filters.status) {
    values.push(filters.status);
    whereClauses.push(`status = $${values.length}`);
  }

  if (typeof filters.minConfidence === "number") {
    values.push(filters.minConfidence);
    whereClauses.push(`confidence >= $${values.length}`);
  }

  if (filters.since) {
    values.push(filters.since);
    whereClauses.push(`last_seen_at >= $${values.length}`);
  }

  if (filters.source) {
    values.push(filters.source);
    whereClauses.push(`source = $${values.length}`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const sql = `
    SELECT
      id,
      title,
      description,
      lat,
      lng,
      severity,
      confidence,
      source,
      first_seen_at AS "firstSeenAt",
      last_seen_at AS "lastSeenAt",
      status,
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM incidents
    ${whereSql}
    ORDER BY last_seen_at DESC;
  `;

  const result = await pool.query(sql, values);
  return result.rows;
}

export async function getIncidentsHealthSnapshot() {
  const result = await pool.query(`
    SELECT
      MAX(last_seen_at) AS last_success,
      COUNT(*) FILTER (WHERE status = 'active')::INTEGER AS cached_count,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT source), NULL) AS active_sources
    FROM incidents;
  `);

  const row = result.rows[0] || {};
  return {
    source:
      Array.isArray(row.active_sources) && row.active_sources.length > 0
        ? row.active_sources.join(",")
        : "none",
    lastSuccess: row.last_success ? new Date(row.last_success).toISOString() : null,
    cachedCount: Number(row.cached_count || 0),
  };
}

export async function listIncidentsHealthBySource() {
  const result = await pool.query(`
    SELECT
      source,
      MAX(last_seen_at) AS last_success,
      COUNT(*) FILTER (WHERE status = 'active')::INTEGER AS cached_count
    FROM incidents
    GROUP BY source;
  `);

  return result.rows.map((row) => ({
    source: String(row.source || "").toLowerCase(),
    lastSuccess: row.last_success ? new Date(row.last_success).toISOString() : null,
    cachedCount: Number(row.cached_count || 0),
  }));
}
