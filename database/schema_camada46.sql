-- Camada 46: Ride lifecycle produção — geofence chegada, timer espera, códigos dupla validação (guia §720–729)

CREATE TABLE IF NOT EXISTS ride_lifecycle_production_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID REFERENCES service_regions(id) ON DELETE SET NULL,
  pickup_geofence_radius_m INT NOT NULL DEFAULT 120,
  auto_arrival_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  auto_arrival_min_dwell_seconds INT NOT NULL DEFAULT 5,
  lifecycle_poll_interval_ms INT NOT NULL DEFAULT 3000,
  wait_timer_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  config_version TEXT NOT NULL DEFAULT 'camada46-v1',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO ride_lifecycle_production_config (region_id, config_version)
SELECT '00000000-0000-4000-8000-000000000020', 'camada46-bc-v1'
WHERE NOT EXISTS (
  SELECT 1 FROM ride_lifecycle_production_config WHERE config_version = 'camada46-bc-v1'
);

CREATE TABLE IF NOT EXISTS ride_lifecycle_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'geofence_enter', 'geofence_exit', 'auto_arrived', 'manual_arrived',
    'code_verified', 'ride_started', 'wait_tick'
  )),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  payload_json JSONB NOT NULL DEFAULT '{}',
  config_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ride_lifecycle_events_ride
  ON ride_lifecycle_events(ride_id, created_at DESC);
