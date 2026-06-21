-- Camada 25: Repasse motorista avançado — breakdown, bônus Elite, incentivos (guia §400–423)

CREATE TABLE IF NOT EXISTS driver_payout_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  driver_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_intent_id UUID REFERENCES payment_intents(id) ON DELETE SET NULL,
  category_code TEXT NOT NULL REFERENCES ride_categories(code),
  passenger_gross_centavos INT NOT NULL,
  driver_gross_centavos INT NOT NULL,
  platform_fee_centavos INT NOT NULL,
  base_component_centavos INT NOT NULL DEFAULT 0,
  distance_component_centavos INT NOT NULL DEFAULT 0,
  time_component_centavos INT NOT NULL DEFAULT 0,
  dynamic_share_centavos INT NOT NULL DEFAULT 0,
  elite_bonus_centavos INT NOT NULL DEFAULT 0,
  toll_repass_centavos INT NOT NULL DEFAULT 0,
  airport_share_centavos INT NOT NULL DEFAULT 0,
  traffic_surcharge_centavos INT NOT NULL DEFAULT 0,
  passenger_discount_centavos INT NOT NULL DEFAULT 0,
  incentive_preview_centavos INT NOT NULL DEFAULT 0,
  dynamic_multiplier NUMERIC(8, 4) NOT NULL DEFAULT 1,
  driver_dynamic_share_bps INT NOT NULL DEFAULT 7500,
  reputation_tier TEXT,
  breakdown_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ride_id)
);

CREATE INDEX IF NOT EXISTS idx_driver_payout_settlements_driver
  ON driver_payout_settlements(driver_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS driver_incentive_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ride_id UUID REFERENCES rides(id) ON DELETE SET NULL,
  incentive_type TEXT NOT NULL CHECK (incentive_type IN ('mission', 'guarantee', 'elite_bonus', 'airport_bonus')),
  amount_centavos INT NOT NULL CHECK (amount_centavos > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'held', 'cancelled')),
  reason TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_driver_incentive_grants_driver
  ON driver_incentive_grants(driver_user_id, status, created_at DESC);

ALTER TABLE driver_payout_ledger ADD COLUMN IF NOT EXISTS settlement_id UUID REFERENCES driver_payout_settlements(id) ON DELETE SET NULL;
