-- Camada 33: Parâmetros operacionais configuráveis por região/categoria (guia §875–894)

CREATE TABLE IF NOT EXISTS operational_param_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  version_label TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operational_param_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  param_set_id UUID NOT NULL REFERENCES operational_param_sets(id) ON DELETE CASCADE,
  region_id UUID NOT NULL REFERENCES service_regions(id) ON DELETE CASCADE,
  category_code TEXT NOT NULL,
  config_version TEXT NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  dynamic_cap NUMERIC(6, 4),
  driver_dynamic_share_bps INT,
  search_radius_stages_m INT[],
  offer_timeout_seconds INT,
  cash_allowed_min_reputation NUMERIC(4, 2),
  premium_min_reputation NUMERIC(4, 2),
  arrival_wait_policy_json JSONB NOT NULL DEFAULT '{}',
  cancellation_fee_policy_json JSONB NOT NULL DEFAULT '{}',
  pcd_priority_rules_json JSONB NOT NULL DEFAULT '{}',
  airport_fee_rules_json JSONB NOT NULL DEFAULT '{}',
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operational_param_entries_lookup
  ON operational_param_entries(region_id, category_code, effective_from DESC);

CREATE TABLE IF NOT EXISTS user_segment_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID NOT NULL REFERENCES service_regions(id) ON DELETE CASCADE,
  reputation_tier TEXT NOT NULL,
  config_version TEXT NOT NULL,
  dispatch_priority_pct INT NOT NULL DEFAULT 0,
  allowed_payment_methods TEXT[] NOT NULL DEFAULT ARRAY['pix', 'card', 'cash'],
  promo_eligible BOOLEAN NOT NULL DEFAULT TRUE,
  shared_ride_eligible BOOLEAN NOT NULL DEFAULT TRUE,
  premium_category_eligible BOOLEAN NOT NULL DEFAULT TRUE,
  antifraud_level TEXT NOT NULL DEFAULT 'standard',
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_segment_policies_active
  ON user_segment_policies(region_id, reputation_tier)
  WHERE effective_to IS NULL;

CREATE TABLE IF NOT EXISTS ride_operational_config_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  region_id UUID REFERENCES service_regions(id) ON DELETE SET NULL,
  category_code TEXT NOT NULL,
  config_version TEXT NOT NULL,
  params_json JSONB NOT NULL DEFAULT '{}',
  segment_policy_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ride_operational_config_ride
  ON ride_operational_config_snapshots(ride_id, created_at DESC);

INSERT INTO operational_param_sets (id, name, version_label)
VALUES ('00000000-0000-4000-8000-000000000501', 'BC Operação v1', 'bc-ops-v1')
ON CONFLICT (version_label) DO NOTHING;

INSERT INTO operational_param_entries (
  id, param_set_id, region_id, category_code, config_version,
  dynamic_cap, driver_dynamic_share_bps, search_radius_stages_m, offer_timeout_seconds,
  cash_allowed_min_reputation, premium_min_reputation,
  arrival_wait_policy_json, cancellation_fee_policy_json,
  pcd_priority_rules_json, airport_fee_rules_json
)
VALUES (
  '00000000-0000-4000-8000-000000000502',
  '00000000-0000-4000-8000-000000000501',
  '00000000-0000-4000-8000-000000000020',
  'economico',
  'camada33-bc-economico-v1',
  2.40,
  7800,
  ARRAY[900, 1800, 3000, 5000, 8000, 12000],
  10,
  4.20,
  4.75,
  '{"includedWaitMinutes":3,"perMinuteCentavos":100}',
  '{"freeWindowSeconds":120,"feeCentavos":800}',
  '{"matchWeightBonus":0.10}',
  '{"terminalCongestionCap":1.18}'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_segment_policies (
  id, region_id, reputation_tier, config_version,
  dispatch_priority_pct, allowed_payment_methods,
  promo_eligible, shared_ride_eligible, premium_category_eligible, antifraud_level
)
VALUES
  (
    '00000000-0000-4000-8000-000000000503',
    '00000000-0000-4000-8000-000000000020',
    'restrito',
    'camada33-segment-v1',
    -20,
    ARRAY['pix'],
    FALSE,
    FALSE,
    FALSE,
    'elevated'
  ),
  (
    '00000000-0000-4000-8000-000000000504',
    '00000000-0000-4000-8000-000000000020',
    'elite',
    'camada33-segment-v1',
    16,
    ARRAY['pix', 'card', 'cash', 'corporate'],
    TRUE,
    TRUE,
    TRUE,
    'standard'
  )
ON CONFLICT (id) DO NOTHING;
