-- Ciclo de vida da corrida: códigos de início e timestamps

ALTER TABLE rides ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS ride_start_code_pairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  issue_number INT NOT NULL DEFAULT 1 CHECK (issue_number BETWEEN 1 AND 4),
  passenger_code_hash TEXT NOT NULL,
  driver_code_hash TEXT NOT NULL,
  passenger_verified_at TIMESTAMPTZ,
  driver_verified_at TIMESTAMPTZ,
  passenger_attempts INT NOT NULL DEFAULT 0 CHECK (passenger_attempts >= 0),
  driver_attempts INT NOT NULL DEFAULT 0 CHECK (driver_attempts >= 0),
  cooldown_until TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ride_start_codes_ride ON ride_start_code_pairs(ride_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ride_start_codes_active ON ride_start_code_pairs(ride_id)
  WHERE is_active = TRUE;

