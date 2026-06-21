-- Camada 16: Transporte compartilhado (pool por corredor, desvio limitado)

CREATE TABLE IF NOT EXISTS shared_corridor_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID REFERENCES service_regions(id) ON DELETE SET NULL,
  max_pickup_radius_km DOUBLE PRECISION NOT NULL DEFAULT 2.5,
  max_dropoff_radius_km DOUBLE PRECISION NOT NULL DEFAULT 3.0,
  max_bearing_diff_deg DOUBLE PRECISION NOT NULL DEFAULT 45,
  max_detour_min DOUBLE PRECISION NOT NULL DEFAULT 12,
  max_wait_min INT NOT NULL DEFAULT 3,
  max_bookings_per_pool INT NOT NULL DEFAULT 2,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO shared_corridor_config (id, region_id)
VALUES (
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000020'
)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS shared_ride_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID REFERENCES service_regions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN (
    'waiting', 'ready', 'matching', 'assigned', 'in_progress', 'completed', 'cancelled'
  )),
  primary_ride_id UUID REFERENCES rides(id) ON DELETE SET NULL,
  booking_count INT NOT NULL DEFAULT 0,
  max_bookings INT NOT NULL DEFAULT 2,
  wait_expires_at TIMESTAMPTZ,
  matched_at TIMESTAMPTZ,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shared_pools_status ON shared_ride_pools(status, wait_expires_at);

CREATE TABLE IF NOT EXISTS shared_ride_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID NOT NULL REFERENCES shared_ride_pools(id) ON DELETE CASCADE,
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  passenger_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pickup_lat DOUBLE PRECISION NOT NULL,
  pickup_lng DOUBLE PRECISION NOT NULL,
  dropoff_lat DOUBLE PRECISION NOT NULL,
  dropoff_lng DOUBLE PRECISION NOT NULL,
  pickup_order INT NOT NULL DEFAULT 1 CHECK (pickup_order > 0),
  passenger_count INT NOT NULL DEFAULT 1,
  has_large_baggage BOOLEAN NOT NULL DEFAULT FALSE,
  base_fare_centavos INT NOT NULL,
  discount_centavos INT NOT NULL DEFAULT 0,
  final_fare_centavos INT NOT NULL,
  detour_km DOUBLE PRECISION NOT NULL DEFAULT 0,
  detour_min DOUBLE PRECISION NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ride_id)
);

CREATE INDEX IF NOT EXISTS idx_shared_bookings_pool ON shared_ride_bookings(pool_id, status);
CREATE INDEX IF NOT EXISTS idx_shared_bookings_passenger ON shared_ride_bookings(passenger_id, created_at DESC);
