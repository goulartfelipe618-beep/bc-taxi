-- Places: cache Mapbox + histórico confirmado (guia §255–286)

CREATE TABLE IF NOT EXISTS place_cache (
  feature_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  address_text TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  source TEXT NOT NULL DEFAULT 'mapbox',
  raw_json JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_place_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature_id TEXT,
  label TEXT NOT NULL,
  address_text TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  source TEXT NOT NULL DEFAULT 'mapbox',
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_place_history_user ON user_place_history(user_id, confirmed_at DESC);
