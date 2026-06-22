-- Camada 37: Compartilhado produção — janela temporal, tarifa marginal, SLA desvio (guia §836–840)

ALTER TABLE shared_corridor_config ADD COLUMN IF NOT EXISTS min_passenger_reputation NUMERIC(4, 2) NOT NULL DEFAULT 4.50;
ALTER TABLE shared_corridor_config ADD COLUMN IF NOT EXISTS marginal_rate_centavos_km INT NOT NULL DEFAULT 120;
ALTER TABLE shared_corridor_config ADD COLUMN IF NOT EXISTS config_version TEXT NOT NULL DEFAULT 'camada37-v1';

CREATE TABLE IF NOT EXISTS shared_temporal_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID REFERENCES service_regions(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_minute INT NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute INT NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  config_version TEXT NOT NULL DEFAULT 'camada37-v1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_minute > start_minute)
);

CREATE INDEX IF NOT EXISTS idx_shared_temporal_windows_region
  ON shared_temporal_windows(region_id, day_of_week)
  WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS shared_marginal_fare_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID NOT NULL REFERENCES shared_ride_pools(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES shared_ride_bookings(id) ON DELETE CASCADE,
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  direct_km NUMERIC(8, 3) NOT NULL,
  marginal_km NUMERIC(8, 3) NOT NULL,
  marginal_fare_centavos INT NOT NULL DEFAULT 0,
  detour_discount_centavos INT NOT NULL DEFAULT 0,
  final_fare_centavos INT NOT NULL,
  config_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (booking_id)
);

CREATE INDEX IF NOT EXISTS idx_shared_marginal_fare_pool
  ON shared_marginal_fare_allocations(pool_id, created_at DESC);

ALTER TABLE shared_ride_bookings ADD COLUMN IF NOT EXISTS marginal_fare_centavos INT NOT NULL DEFAULT 0;
ALTER TABLE shared_ride_bookings ADD COLUMN IF NOT EXISTS reputation_tier TEXT;
ALTER TABLE shared_ride_bookings ADD COLUMN IF NOT EXISTS pricing_config_version TEXT;

ALTER TABLE shared_ride_pools ADD COLUMN IF NOT EXISTS combined_route_km NUMERIC(8, 3);
ALTER TABLE shared_ride_pools ADD COLUMN IF NOT EXISTS sla_detour_min NUMERIC(6, 2);
ALTER TABLE shared_ride_pools ADD COLUMN IF NOT EXISTS pricing_config_version TEXT;

CREATE TABLE IF NOT EXISTS shared_pool_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID NOT NULL REFERENCES shared_ride_pools(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'pool_created',
    'booking_joined',
    'marginal_fare_applied',
    'pool_ready',
    'sla_detour_ok',
    'sla_detour_violation',
    'temporal_blocked',
    'eligibility_blocked'
  )),
  config_version TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shared_pool_events_pool
  ON shared_pool_events(pool_id, created_at DESC);

UPDATE shared_corridor_config
SET min_passenger_reputation = 4.68,
    marginal_rate_centavos_km = 115,
    config_version = 'camada37-bc-v1'
WHERE id = '00000000-0000-4000-8000-000000000401';

-- BC: compartilhado ativo 06:00–23:00 todos os dias
INSERT INTO shared_temporal_windows (id, region_id, day_of_week, start_minute, end_minute, config_version)
VALUES
  ('00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000020', 0, 360, 1380, 'camada37-bc-v1'),
  ('00000000-0000-4000-8000-000000000702', '00000000-0000-4000-8000-000000000020', 1, 360, 1380, 'camada37-bc-v1'),
  ('00000000-0000-4000-8000-000000000703', '00000000-0000-4000-8000-000000000020', 2, 360, 1380, 'camada37-bc-v1'),
  ('00000000-0000-4000-8000-000000000704', '00000000-0000-4000-8000-000000000020', 3, 360, 1380, 'camada37-bc-v1'),
  ('00000000-0000-4000-8000-000000000705', '00000000-0000-4000-8000-000000000020', 4, 360, 1380, 'camada37-bc-v1'),
  ('00000000-0000-4000-8000-000000000706', '00000000-0000-4000-8000-000000000020', 5, 360, 1380, 'camada37-bc-v1'),
  ('00000000-0000-4000-8000-000000000707', '00000000-0000-4000-8000-000000000020', 6, 360, 1380, 'camada37-bc-v1')
ON CONFLICT (id) DO NOTHING;
