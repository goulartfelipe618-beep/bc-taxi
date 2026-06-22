-- Camada 47: Ride completion produção — tarifa rota real, captura, recibo e avaliações (guia §730–735)

CREATE TABLE IF NOT EXISTS ride_completion_production_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID REFERENCES service_regions(id) ON DELETE SET NULL,
  use_actual_route_fare BOOLEAN NOT NULL DEFAULT TRUE,
  fare_blend_weight_bps INT NOT NULL DEFAULT 7000,
  min_trip_duration_seconds INT NOT NULL DEFAULT 60,
  receipt_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  review_obligations_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  completion_poll_interval_ms INT NOT NULL DEFAULT 5000,
  config_version TEXT NOT NULL DEFAULT 'camada47-v1',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO ride_completion_production_config (region_id, config_version)
SELECT '00000000-0000-4000-8000-000000000020', 'camada47-bc-v1'
WHERE NOT EXISTS (
  SELECT 1 FROM ride_completion_production_config WHERE config_version = 'camada47-bc-v1'
);

CREATE TABLE IF NOT EXISTS ride_completion_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  base_fare_centavos INT NOT NULL,
  wait_fee_centavos INT NOT NULL DEFAULT 0,
  total_fare_centavos INT NOT NULL,
  fare_source TEXT NOT NULL CHECK (fare_source IN ('estimated', 'actual_route', 'blended')),
  route_distance_m INT,
  route_duration_s INT,
  trip_duration_s INT,
  receipt_id UUID,
  config_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ride_id)
);

CREATE INDEX IF NOT EXISTS idx_ride_completion_snapshots_ride
  ON ride_completion_snapshots(ride_id, created_at DESC);
