-- Camada 8: Pricing engine versionado + PSP / PIX / ledgers (guia §400–471, §622–646)

CREATE TABLE IF NOT EXISTS pricing_rule_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  version_label TEXT NOT NULL DEFAULT 'v1',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO pricing_rule_sets (id, name, version_label)
VALUES ('00000000-0000-4000-8000-000000000030', 'BC Taxi Default', '2026.1')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS pricing_rule_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_set_id UUID NOT NULL REFERENCES pricing_rule_sets(id) ON DELETE CASCADE,
  category_code TEXT NOT NULL REFERENCES ride_categories(code),
  region_id UUID NOT NULL REFERENCES pricing_regions(id),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  base_fare_centavos INT NOT NULL,
  distance_rate_centavos_km INT NOT NULL,
  time_rate_centavos_min INT NOT NULL,
  minimum_fare_centavos INT NOT NULL,
  booking_fee_centavos INT NOT NULL DEFAULT 150,
  traffic_coefficient NUMERIC(8, 4) NOT NULL DEFAULT 12,
  take_rate_bps INT NOT NULL DEFAULT 2200,
  driver_dynamic_share_bps INT NOT NULL DEFAULT 7500,
  regulatory_fee_centavos INT NOT NULL DEFAULT 0,
  config_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pricing_rule_versions_lookup
  ON pricing_rule_versions(region_id, category_code, effective_from DESC);

CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_intent_id UUID NOT NULL REFERENCES payment_intents(id) ON DELETE CASCADE,
  txn_type TEXT NOT NULL CHECK (txn_type IN ('authorize', 'capture', 'void', 'refund')),
  amount_centavos INT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  provider TEXT NOT NULL,
  provider_ref TEXT,
  idempotency_key TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'succeeded' CHECK (status IN ('pending', 'succeeded', 'failed')),
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_intent ON payment_transactions(payment_intent_id, created_at DESC);

ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_payment_intents_idempotency ON payment_intents(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS pix_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_intent_id UUID NOT NULL REFERENCES payment_intents(id) ON DELETE CASCADE,
  txid TEXT NOT NULL UNIQUE,
  qr_code_payload TEXT NOT NULL,
  qr_code_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'cancelled')),
  amount_centavos INT NOT NULL,
  paid_at TIMESTAMPTZ,
  webhook_received_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pix_charges_intent ON pix_charges(payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_pix_charges_txid ON pix_charges(txid);

CREATE TABLE IF NOT EXISTS cash_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_intent_id UUID NOT NULL REFERENCES payment_intents(id) ON DELETE CASCADE,
  ride_id UUID REFERENCES rides(id) ON DELETE SET NULL,
  driver_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  amount_centavos INT NOT NULL,
  confirmed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata_json JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS driver_payout_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ride_id UUID REFERENCES rides(id) ON DELETE SET NULL,
  payment_intent_id UUID REFERENCES payment_intents(id) ON DELETE SET NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('ride_payout', 'toll_repass', 'incentive', 'adjustment')),
  amount_centavos INT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  description TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_payout_ledger_driver ON driver_payout_ledger(driver_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS platform_fee_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID REFERENCES rides(id) ON DELETE SET NULL,
  payment_intent_id UUID REFERENCES payment_intents(id) ON DELETE SET NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('take_rate', 'booking_fee', 'regulatory_fee', 'dynamic_share', 'adjustment')),
  amount_centavos INT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  description TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_fee_ledger_ride ON platform_fee_ledger(ride_id, created_at DESC);

-- Seed pricing rules for default region + economico/comfort (others inherit via app logic)
INSERT INTO pricing_rule_versions (
  rule_set_id, category_code, region_id,
  base_fare_centavos, distance_rate_centavos_km, time_rate_centavos_min,
  minimum_fare_centavos, booking_fee_centavos, traffic_coefficient,
  take_rate_bps, driver_dynamic_share_bps, regulatory_fee_centavos
)
SELECT
  '00000000-0000-4000-8000-000000000030',
  c.code,
  '00000000-0000-4000-8000-000000000010',
  500, 220, 35, 800, 150, 12, 2200, 7500, 50
FROM ride_categories c
WHERE c.is_passenger_ride = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM pricing_rule_versions v
    WHERE v.category_code = c.code
      AND v.region_id = '00000000-0000-4000-8000-000000000010'
  );

-- Pedágio exemplo (Camada 6 catalog)
INSERT INTO route_toll_catalog (region_id, name, lat, lng, cost_centavos)
SELECT '00000000-0000-4000-8000-000000000020', 'Pedágio BR-101 BC', -26.95, -48.60, 850
WHERE NOT EXISTS (SELECT 1 FROM route_toll_catalog WHERE name = 'Pedágio BR-101 BC');
