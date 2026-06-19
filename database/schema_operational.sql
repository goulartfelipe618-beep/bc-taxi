-- Domínio operacional BC Taxi (guia operacional)

CREATE TABLE IF NOT EXISTS ride_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  passenger_limit_min INT NOT NULL DEFAULT 0,
  passenger_limit_max INT NOT NULL DEFAULT 4,
  bag_policy_json JSONB NOT NULL DEFAULT '{}',
  is_shared BOOLEAN NOT NULL DEFAULT FALSE,
  is_premium BOOLEAN NOT NULL DEFAULT FALSE,
  is_passenger_ride BOOLEAN NOT NULL DEFAULT TRUE,
  requires_scheduling BOOLEAN NOT NULL DEFAULT FALSE,
  inherits_base_category TEXT,
  config_json JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT ride_categories_limits CHECK (passenger_limit_max >= passenger_limit_min)
);

CREATE INDEX IF NOT EXISTS idx_ride_categories_code ON ride_categories(code);
CREATE INDEX IF NOT EXISTS idx_ride_categories_active ON ride_categories(is_active) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS pricing_regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id TEXT,
  name TEXT NOT NULL,
  priority INT NOT NULL DEFAULT 0,
  polygon_json JSONB,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  base_fare_centavos INT NOT NULL DEFAULT 500,
  distance_rate_centavos_km INT NOT NULL DEFAULT 220,
  time_rate_centavos_min INT NOT NULL DEFAULT 35,
  minimum_fare_centavos INT NOT NULL DEFAULT 800,
  booking_fee_centavos INT NOT NULL DEFAULT 150,
  traffic_coefficient NUMERIC(8, 4) NOT NULL DEFAULT 12,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pricing_regions_city ON pricing_regions(city_id);

CREATE TABLE IF NOT EXISTS ride_match_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ride_id UUID,
  block_type TEXT NOT NULL CHECK (block_type IN (
    'PASSENGER_CANCEL_DRIVER_24H',
    'DRIVER_CANCEL_PASSENGER_REDISPATCH',
    'PAIR_RISK_BLOCK',
    'MANUAL_BLOCK'
  )),
  reason_code TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_match_blocks_pair ON ride_match_blocks(passenger_id, driver_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_match_blocks_expires ON ride_match_blocks(expires_at);

CREATE TABLE IF NOT EXISTS ride_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL,
  reviewer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewed_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewer_role TEXT NOT NULL CHECK (reviewer_role IN ('passenger', 'driver')),
  reviewed_role TEXT NOT NULL CHECK (reviewed_role IN ('passenger', 'driver')),
  stars INT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment TEXT,
  sentiment_score NUMERIC(5, 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ride_id, reviewer_user_id, reviewed_user_id)
);

CREATE INDEX IF NOT EXISTS idx_ride_reviews_reviewed ON ride_reviews(reviewed_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_saved_places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  place_type TEXT NOT NULL CHECK (place_type IN ('favorite', 'home', 'work')),
  label TEXT NOT NULL,
  mapbox_feature_id TEXT,
  address_text TEXT NOT NULL,
  point_lat DOUBLE PRECISION,
  point_lng DOUBLE PRECISION,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_saved_home ON user_saved_places(user_id) WHERE place_type = 'home' AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_saved_work ON user_saved_places(user_id) WHERE place_type = 'work' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_saved_places_user ON user_saved_places(user_id);

CREATE TABLE IF NOT EXISTS dynamic_pricing_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID REFERENCES pricing_regions(id),
  category_code TEXT NOT NULL REFERENCES ride_categories(code),
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  demand_pressure NUMERIC(8, 4) NOT NULL DEFAULT 1,
  weather_pressure NUMERIC(8, 4) NOT NULL DEFAULT 0,
  event_pressure NUMERIC(8, 4) NOT NULL DEFAULT 0,
  airport_pressure NUMERIC(8, 4) NOT NULL DEFAULT 0,
  traffic_pressure NUMERIC(8, 4) NOT NULL DEFAULT 0,
  supply_shortage NUMERIC(8, 4) NOT NULL DEFAULT 0,
  time_pressure NUMERIC(8, 4) NOT NULL DEFAULT 0,
  conversion_pressure NUMERIC(8, 4) NOT NULL DEFAULT 0,
  multiplier_raw NUMERIC(8, 4) NOT NULL DEFAULT 1,
  multiplier_effective NUMERIC(8, 4) NOT NULL DEFAULT 1,
  version INT NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_dynamic_pricing_region_cat ON dynamic_pricing_snapshots(region_id, category_code, snapshot_at DESC);

ALTER TABLE drivers ADD COLUMN IF NOT EXISTS reputation_score NUMERIC(5, 4) NOT NULL DEFAULT 5.0;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS completed_rides INT NOT NULL DEFAULT 0;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS acceptance_rate NUMERIC(5, 4) NOT NULL DEFAULT 1.0;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS cancellation_rate NUMERIC(5, 4) NOT NULL DEFAULT 0;
