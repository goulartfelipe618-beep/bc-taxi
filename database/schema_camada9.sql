-- Camada 9: PostGIS match + antifraude avançado (guia §647–654, §741–743)

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS device_fingerprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  platform TEXT,
  app_version TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_device_fingerprints_device ON device_fingerprints(device_id);
CREATE INDEX IF NOT EXISTS idx_device_fingerprints_user ON device_fingerprints(user_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS account_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id_a UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id_b UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL CHECK (link_type IN ('shared_device', 'shared_payment', 'behavioral')),
  confidence NUMERIC(5, 4) NOT NULL DEFAULT 0.5,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT account_links_distinct CHECK (user_id_a <> user_id_b),
  UNIQUE (user_id_a, user_id_b, link_type)
);

CREATE INDEX IF NOT EXISTS idx_account_links_users ON account_links(user_id_a, user_id_b);

CREATE TABLE IF NOT EXISTS risk_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ride_id UUID REFERENCES rides(id) ON DELETE SET NULL,
  decision TEXT NOT NULL CHECK (decision IN ('allow', 'review', 'challenge', 'block')),
  risk_score NUMERIC(5, 4) NOT NULL,
  reason_codes TEXT[] NOT NULL DEFAULT '{}',
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_decisions_user ON risk_decisions(user_id, created_at DESC);

-- Geografia do motorista para match espacial (ST_DWithin)
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS location geography(Point, 4326);

CREATE INDEX IF NOT EXISTS idx_drivers_location_gist ON drivers USING GIST (location);

UPDATE drivers
SET location = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
WHERE lat IS NOT NULL AND lng IS NOT NULL AND location IS NULL;

CREATE OR REPLACE FUNCTION sync_driver_location_geog()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
    NEW.location := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_drivers_location_geog ON drivers;
CREATE TRIGGER trg_drivers_location_geog
  BEFORE INSERT OR UPDATE OF lat, lng ON drivers
  FOR EACH ROW EXECUTE FUNCTION sync_driver_location_geog();
