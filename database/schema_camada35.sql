-- Camada 35: Enforcement políticas operacionais — cancelamento, espera, cash/premium (guia §831–834, §875–883)

ALTER TABLE rides ADD COLUMN IF NOT EXISTS cancellation_fee_centavos INT NOT NULL DEFAULT 0;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS arrival_wait_fee_centavos INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS ride_policy_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  charge_type TEXT NOT NULL CHECK (charge_type IN ('cancellation_fee', 'arrival_wait_fee')),
  amount_centavos INT NOT NULL CHECK (amount_centavos >= 0),
  policy_version TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  charged_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'captured', 'waived', 'voided')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ride_policy_charges_ride
  ON ride_policy_charges(ride_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ride_policy_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'cancel_fee_assessed',
    'cancel_fee_waived',
    'cancel_fee_captured',
    'wait_fee_assessed',
    'wait_fee_captured',
    'cash_blocked',
    'premium_blocked'
  )),
  policy_version TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ride_policy_events_ride
  ON ride_policy_events(ride_id, created_at DESC);
