-- Camada 14: Versionamento de regras + governança técnica (guia §897–901, §907–911)

CREATE TABLE IF NOT EXISTS match_scoring_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_label TEXT NOT NULL UNIQUE,
  weights_json JSONB NOT NULL,
  bonuses_json JSONB NOT NULL DEFAULT '{}',
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reputation_formula_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_label TEXT NOT NULL UNIQUE,
  config_json JSONB NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ride_governance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  phase TEXT NOT NULL CHECK (phase IN ('quote', 'match', 'settlement')),
  pricing_rule_version_id UUID REFERENCES pricing_rule_versions(id) ON DELETE SET NULL,
  pricing_rule_set_label TEXT,
  match_scoring_version_id UUID REFERENCES match_scoring_versions(id) ON DELETE SET NULL,
  reputation_formula_version_id UUID REFERENCES reputation_formula_versions(id) ON DELETE SET NULL,
  dynamic_multiplier NUMERIC(8, 4),
  quoted_fare_centavos INT,
  snapshot_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ride_id, phase)
);

CREATE INDEX IF NOT EXISTS idx_ride_governance_snapshots_ride ON ride_governance_snapshots(ride_id, phase);

INSERT INTO match_scoring_versions (id, version_label, weights_json, bonuses_json)
VALUES (
  '00000000-0000-4000-8000-000000000300',
  'match-2026.1',
  '{"d":0.32,"r":0.18,"a":0.12,"c":0.10,"t":0.08,"e":0.08,"k":0.12}'::jsonb,
  '{"passengerEliteBonus":0.06,"passengerPremiumBonus":0.03,"driverEliteBonus":0.05,"driverPremiumBonus":0.025,"corporateBonus":0.04}'::jsonb
)
ON CONFLICT (version_label) DO NOTHING;

INSERT INTO reputation_formula_versions (id, version_label, config_json)
VALUES (
  '00000000-0000-4000-8000-000000000301',
  'reputation-2026.1',
  '{"driverLambda":0.0025,"passengerLambda":0.0035,"freshnessBonus":1.05,"maxHistoricalWeightRatio":0.15,"driverBayesianM":50,"passengerBayesianM":20}'::jsonb
)
ON CONFLICT (version_label) DO NOTHING;
