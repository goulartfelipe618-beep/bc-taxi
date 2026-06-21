-- Camada 22: Endereços inteligentes — aliases, popularidade, ranking (guia §254–286)

ALTER TABLE place_cache ADD COLUMN IF NOT EXISTS context_json JSONB NOT NULL DEFAULT '{}';
ALTER TABLE place_cache ADD COLUMN IF NOT EXISTS accuracy TEXT;

ALTER TABLE user_place_history ADD COLUMN IF NOT EXISTS session_token TEXT;

CREATE TABLE IF NOT EXISTS place_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  feature_id TEXT,
  label TEXT NOT NULL,
  address_text TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, alias)
);

CREATE INDEX IF NOT EXISTS idx_place_aliases_user ON place_aliases(user_id, alias);

CREATE TABLE IF NOT EXISTS place_popularity_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_cluster TEXT NOT NULL DEFAULT 'default',
  feature_id TEXT,
  label TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  pickup_count INT NOT NULL DEFAULT 0,
  dropoff_count INT NOT NULL DEFAULT 0,
  search_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (region_cluster, feature_id)
);

CREATE INDEX IF NOT EXISTS idx_place_popularity_cluster
  ON place_popularity_stats(region_cluster, search_count DESC);

INSERT INTO place_popularity_stats (region_cluster, feature_id, label, lat, lng, pickup_count, dropoff_count, search_count)
VALUES
  ('bc-vale', 'mock-shopping-neumarkt', 'Shopping Neumarkt', -26.9182, -49.0685, 420, 380, 890),
  ('bc-vale', 'mock-aeroporto-navegantes', 'Aeroporto Navegantes', -26.8799, -48.6514, 310, 290, 650),
  ('bc-vale', 'mock-centro-blumenau', 'Centro Blumenau', -26.9194, -49.0661, 520, 510, 1200)
ON CONFLICT (region_cluster, feature_id) DO NOTHING;
