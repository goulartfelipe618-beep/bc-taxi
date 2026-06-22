-- Camada 45: Ride tracking produção — ETA com rota ativa, polyline, snapshots (guia §719–729, §816–817, §322–329)

CREATE TABLE IF NOT EXISTS ride_tracking_production_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID REFERENCES service_regions(id) ON DELETE SET NULL,
  poll_interval_ms INT NOT NULL DEFAULT 5000,
  eta_stale_threshold_seconds INT NOT NULL DEFAULT 90,
  use_active_route_eta BOOLEAN NOT NULL DEFAULT TRUE,
  snapshot_sample_rate_bps INT NOT NULL DEFAULT 1000,
  config_version TEXT NOT NULL DEFAULT 'camada45-v1',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO ride_tracking_production_config (region_id, config_version)
SELECT '00000000-0000-4000-8000-000000000020', 'camada45-bc-v1'
WHERE NOT EXISTS (
  SELECT 1 FROM ride_tracking_production_config WHERE config_version = 'camada45-bc-v1'
);

CREATE TABLE IF NOT EXISTS ride_tracking_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  target TEXT NOT NULL CHECK (target IN ('pickup', 'dropoff')),
  eta_seconds INT NOT NULL,
  distance_m INT,
  eta_source TEXT NOT NULL CHECK (eta_source IN ('haversine', 'active_route', 'blended')),
  driver_lat DOUBLE PRECISION,
  driver_lng DOUBLE PRECISION,
  route_eta_seconds INT,
  deviation_m DOUBLE PRECISION,
  config_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ride_tracking_snapshots_ride
  ON ride_tracking_snapshots(ride_id, created_at DESC);
