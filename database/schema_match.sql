-- Corridas e match engine

CREATE TABLE IF NOT EXISTS rides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES users(id),
  category_code TEXT NOT NULL REFERENCES ride_categories(code),
  status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN (
    'REQUESTED', 'OFFERING', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVED',
    'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_DRIVERS'
  )),
  pickup_lat DOUBLE PRECISION NOT NULL,
  pickup_lng DOUBLE PRECISION NOT NULL,
  pickup_address TEXT,
  dropoff_lat DOUBLE PRECISION NOT NULL,
  dropoff_lng DOUBLE PRECISION NOT NULL,
  dropoff_address TEXT,
  passenger_count INT NOT NULL DEFAULT 1,
  is_corporate BOOLEAN NOT NULL DEFAULT FALSE,
  is_shared BOOLEAN NOT NULL DEFAULT FALSE,
  has_pet BOOLEAN NOT NULL DEFAULT FALSE,
  needs_wheelchair BOOLEAN NOT NULL DEFAULT FALSE,
  estimated_fare_centavos INT,
  ride_version INT NOT NULL DEFAULT 1,
  match_stage INT NOT NULL DEFAULT 0,
  match_metadata_json JSONB NOT NULL DEFAULT '{}',
  assigned_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rides_passenger ON rides(passenger_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rides_driver ON rides(driver_id) WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rides_status ON rides(status);

ALTER TABLE drivers ADD COLUMN IF NOT EXISTS enabled_categories TEXT[] NOT NULL DEFAULT ARRAY['economico'];
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS active_ride_id UUID;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS online_minutes_today INT NOT NULL DEFAULT 0;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS operational_status TEXT NOT NULL DEFAULT 'offline'
  CHECK (operational_status IN ('offline', 'online', 'busy', 'paused', 'restricted'));
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS wheelchair_accessible BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS pet_ready BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS comfort_approved BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS ride_match_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  stage_number INT NOT NULL CHECK (stage_number > 0),
  search_radius_m INT NOT NULL CHECK (search_radius_m > 0),
  candidate_count INT NOT NULL DEFAULT 0,
  strategy TEXT NOT NULL CHECK (strategy IN ('sequential', 'parallel')),
  result_status TEXT NOT NULL DEFAULT 'pending' CHECK (result_status IN (
    'pending', 'offered', 'accepted', 'timeout', 'no_candidates', 'cancelled'
  )),
  score_version TEXT NOT NULL DEFAULT '1.0.0',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_match_attempts_ride ON ride_match_attempts(ride_id, stage_number);

CREATE TABLE IF NOT EXISTS ride_match_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES ride_match_attempts(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score NUMERIC(8, 6) NOT NULL,
  eta_pickup_s INT NOT NULL,
  distance_m INT NOT NULL,
  reputation_score NUMERIC(5, 4) NOT NULL,
  acceptance_score NUMERIC(5, 4) NOT NULL,
  cancellation_score NUMERIC(5, 4) NOT NULL,
  online_score NUMERIC(5, 4) NOT NULL,
  experience_score NUMERIC(5, 4) NOT NULL,
  compatibility_score NUMERIC(5, 4) NOT NULL,
  rank_position INT NOT NULL,
  feature_vector_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (attempt_id, driver_id)
);

CREATE INDEX IF NOT EXISTS idx_match_candidates_attempt ON ride_match_candidates(attempt_id, rank_position);

CREATE TABLE IF NOT EXISTS ride_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  attempt_id UUID NOT NULL REFERENCES ride_match_attempts(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  offer_batch INT NOT NULL DEFAULT 1,
  offer_type TEXT NOT NULL CHECK (offer_type IN ('sequential', 'parallel')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'accepted', 'rejected', 'expired', 'superseded', 'error'
  )),
  expires_at TIMESTAMPTZ NOT NULL,
  claim_token UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ride_offers_driver ON ride_offers(driver_id, status);
CREATE INDEX IF NOT EXISTS idx_ride_offers_ride ON ride_offers(ride_id);
CREATE INDEX IF NOT EXISTS idx_ride_offers_expires ON ride_offers(expires_at) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS ride_offer_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL REFERENCES ride_offers(id) ON DELETE CASCADE,
  response TEXT NOT NULL CHECK (response IN ('accepted', 'rejected', 'timeout', 'error')),
  responded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata_json JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_offer_responses_offer ON ride_offer_responses(offer_id);

CREATE TABLE IF NOT EXISTS driver_online_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  online_minutes INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_driver_sessions ON driver_online_sessions(driver_id, started_at DESC);

-- Índice espacial simples para motoristas online (lat/lng)
CREATE INDEX IF NOT EXISTS idx_drivers_online_location ON drivers(is_online, lat, lng)
  WHERE is_online = TRUE AND operational_status = 'online';
