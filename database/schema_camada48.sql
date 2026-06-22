-- Camada 48: Ride cancellation produção — preview taxa, isenções, impacto reputação (guia §831–835)

CREATE TABLE IF NOT EXISTS ride_cancellation_production_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID REFERENCES service_regions(id) ON DELETE SET NULL,
  passenger_cancel_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  driver_cancel_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  preview_required BOOLEAN NOT NULL DEFAULT TRUE,
  waive_on_safety_reason BOOLEAN NOT NULL DEFAULT TRUE,
  waive_on_fraud_reason BOOLEAN NOT NULL DEFAULT TRUE,
  driver_reputation_penalty_after_arrival BOOLEAN NOT NULL DEFAULT TRUE,
  config_version TEXT NOT NULL DEFAULT 'camada48-v1',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO ride_cancellation_production_config (region_id, config_version)
SELECT '00000000-0000-4000-8000-000000000020', 'camada48-bc-v1'
WHERE NOT EXISTS (
  SELECT 1 FROM ride_cancellation_production_config WHERE config_version = 'camada48-bc-v1'
);

CREATE TABLE IF NOT EXISTS ride_cancellation_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  cancelled_by TEXT NOT NULL CHECK (cancelled_by IN ('passenger', 'driver', 'system')),
  prior_status TEXT NOT NULL,
  fee_centavos INT NOT NULL DEFAULT 0,
  fee_waived BOOLEAN NOT NULL DEFAULT FALSE,
  reason_code TEXT,
  reputation_impact BOOLEAN NOT NULL DEFAULT FALSE,
  policy_version TEXT NOT NULL,
  config_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ride_id)
);

CREATE INDEX IF NOT EXISTS idx_ride_cancellation_snapshots_ride
  ON ride_cancellation_snapshots(ride_id, created_at DESC);
