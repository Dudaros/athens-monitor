CREATE TABLE IF NOT EXISTS incidents (
    id UUID PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    severity TEXT,
    confidence DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    source TEXT NOT NULL,
    first_seen_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_first_seen ON incidents(first_seen_at);
CREATE INDEX IF NOT EXISTS idx_incidents_lat_lng ON incidents(lat, lng);
