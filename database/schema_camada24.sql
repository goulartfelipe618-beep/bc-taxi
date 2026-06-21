-- Camada 24: Pricing dinâmico avançado — anti-abuso, histerese, auditoria, lock por corrida (guia §346–399)

CREATE TABLE IF NOT EXISTS dynamic_pricing_region_guards (
  region_id UUID PRIMARY KEY REFERENCES pricing_regions(id) ON DELETE CASCADE,
  regulatory_max_multiplier NUMERIC(8, 4) NOT NULL DEFAULT 2.50,
  min_sample_requests INT NOT NULL DEFAULT 5,
  min_online_drivers INT NOT NULL DEFAULT 3,
  conservative_mode BOOLEAN NOT NULL DEFAULT FALSE,
  conservative_max_multiplier NUMERIC(8, 4) NOT NULL DEFAULT 1.15,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO dynamic_pricing_region_guards (region_id, regulatory_max_multiplier)
VALUES ('00000000-0000-4000-8000-000000000010', 2.50)
ON CONFLICT (region_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS dynamic_pricing_calculation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID NOT NULL REFERENCES pricing_regions(id) ON DELETE CASCADE,
  category_code TEXT NOT NULL REFERENCES ride_categories(code),
  multiplier_raw NUMERIC(8, 4) NOT NULL,
  multiplier_effective NUMERIC(8, 4) NOT NULL,
  previous_multiplier NUMERIC(8, 4),
  factors_json JSONB NOT NULL DEFAULT '{}',
  guard_flags JSONB NOT NULL DEFAULT '[]',
  calculation_version TEXT NOT NULL DEFAULT 'camada24-v1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dynamic_pricing_calc_logs
  ON dynamic_pricing_calculation_logs(region_id, category_code, created_at DESC);

CREATE TABLE IF NOT EXISTS ride_dynamic_locks (
  ride_id UUID PRIMARY KEY REFERENCES rides(id) ON DELETE CASCADE,
  region_id UUID NOT NULL REFERENCES pricing_regions(id),
  category_code TEXT NOT NULL REFERENCES ride_categories(code),
  locked_multiplier NUMERIC(8, 4) NOT NULL,
  factors_json JSONB NOT NULL DEFAULT '{}',
  calculation_log_id UUID REFERENCES dynamic_pricing_calculation_logs(id) ON DELETE SET NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ride_dynamic_locks_category
  ON ride_dynamic_locks(category_code, locked_at DESC);

ALTER TABLE dynamic_pricing_snapshots ADD COLUMN IF NOT EXISTS guard_flags JSONB NOT NULL DEFAULT '[]';
ALTER TABLE dynamic_pricing_snapshots ADD COLUMN IF NOT EXISTS calculation_version TEXT NOT NULL DEFAULT 'camada24-v1';
