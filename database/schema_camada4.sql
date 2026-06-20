-- Camada 4: localização do motorista, heartbeat e sessões online (guia §813-829)
-- Estende driver_online_sessions de schema_match.sql (não recria a tabela).

ALTER TABLE drivers ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ;

ALTER TABLE driver_online_sessions ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE driver_online_sessions ADD COLUMN IF NOT EXISTS last_lat DOUBLE PRECISION;
ALTER TABLE driver_online_sessions ADD COLUMN IF NOT EXISTS last_lng DOUBLE PRECISION;
ALTER TABLE driver_online_sessions ADD COLUMN IF NOT EXISTS heartbeat_count INT NOT NULL DEFAULT 0;
ALTER TABLE driver_online_sessions ADD COLUMN IF NOT EXISTS ended_reason TEXT;
ALTER TABLE driver_online_sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_driver_sessions_active
  ON driver_online_sessions(driver_id, last_heartbeat_at DESC)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_drivers_heartbeat
  ON drivers(is_online, last_heartbeat_at)
  WHERE is_online = TRUE;

CREATE TABLE IF NOT EXISTS driver_location_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES driver_online_sessions(id) ON DELETE SET NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  heading DOUBLE PRECISION,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_location_samples_driver_time
  ON driver_location_samples(driver_id, recorded_at DESC);
