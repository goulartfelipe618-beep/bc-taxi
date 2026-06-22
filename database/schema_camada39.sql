-- Camada 39: Entrega produção — espera tarifada, multiplicadores, prova foto, restrições (guia §59–66, §851–855)

CREATE TABLE IF NOT EXISTS delivery_production_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID REFERENCES pricing_regions(id) ON DELETE SET NULL,
  min_driver_reputation NUMERIC(4, 2) NOT NULL DEFAULT 4.50,
  max_declared_weight_kg NUMERIC(8, 2) NOT NULL DEFAULT 30,
  fragile_multiplier NUMERIC(6, 4) NOT NULL DEFAULT 1.08,
  priority_multiplier NUMERIC(6, 4) NOT NULL DEFAULT 1.18,
  insurance_rate_bps INT NOT NULL DEFAULT 200,
  insurance_fee_cap_centavos INT NOT NULL DEFAULT 2000,
  pickup_included_wait_minutes INT NOT NULL DEFAULT 5,
  pickup_wait_per_minute_centavos INT NOT NULL DEFAULT 80,
  dropoff_included_wait_minutes INT NOT NULL DEFAULT 5,
  dropoff_wait_per_minute_centavos INT NOT NULL DEFAULT 80,
  config_version TEXT NOT NULL DEFAULT 'camada39-v1',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO delivery_production_config (
  region_id, config_version, pickup_included_wait_minutes, dropoff_included_wait_minutes
)
SELECT '00000000-0000-4000-8000-000000000010', 'camada39-bc-v1', 5, 5
WHERE NOT EXISTS (
  SELECT 1 FROM delivery_production_config WHERE config_version = 'camada39-bc-v1'
);

CREATE TABLE IF NOT EXISTS delivery_driver_restrictions (
  driver_user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  restricted_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS delivery_wait_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_job_id UUID NOT NULL REFERENCES delivery_jobs(id) ON DELETE CASCADE,
  phase TEXT NOT NULL CHECK (phase IN ('pickup', 'dropoff')),
  wait_minutes INT NOT NULL CHECK (wait_minutes >= 0),
  fee_centavos INT NOT NULL CHECK (fee_centavos >= 0),
  policy_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (delivery_job_id, phase)
);

CREATE TABLE IF NOT EXISTS delivery_job_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_job_id UUID NOT NULL REFERENCES delivery_jobs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'job_created',
    'pickup_confirmed',
    'dropoff_confirmed',
    'wait_fee_assessed',
    'fare_settled',
    'driver_restricted',
    'package_blocked'
  )),
  policy_version TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_job_events_job
  ON delivery_job_events(delivery_job_id, created_at DESC);

ALTER TABLE delivery_jobs ADD COLUMN IF NOT EXISTS estimated_fare_centavos INT;
ALTER TABLE delivery_jobs ADD COLUMN IF NOT EXISTS wait_fee_pickup_centavos INT NOT NULL DEFAULT 0;
ALTER TABLE delivery_jobs ADD COLUMN IF NOT EXISTS wait_fee_dropoff_centavos INT NOT NULL DEFAULT 0;
ALTER TABLE delivery_jobs ADD COLUMN IF NOT EXISTS final_fare_centavos INT;
ALTER TABLE delivery_jobs ADD COLUMN IF NOT EXISTS policy_version TEXT;
