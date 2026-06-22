-- Camada 43: Client bootstrap produção + perfis documento/categoria + geo-go match (guia §593–604, §736–743)

CREATE TABLE IF NOT EXISTS category_requirement_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID NOT NULL REFERENCES service_regions(id) ON DELETE CASCADE,
  category_code TEXT NOT NULL,
  min_driver_reputation NUMERIC(4, 2) NOT NULL DEFAULT 4.50,
  location_freshness_seconds INT NOT NULL DEFAULT 120,
  required_driver_doc_types TEXT[] NOT NULL DEFAULT ARRAY['CNH'],
  required_vehicle_doc_types TEXT[] NOT NULL DEFAULT ARRAY['CRLV', 'INSURANCE'],
  optional_driver_doc_types TEXT[] NOT NULL DEFAULT '{}',
  min_completed_rides INT NOT NULL DEFAULT 0,
  config_version TEXT NOT NULL DEFAULT 'camada43-v1',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (region_id, category_code)
);

CREATE INDEX IF NOT EXISTS idx_category_requirement_profiles_region
  ON category_requirement_profiles(region_id, category_code)
  WHERE is_active = TRUE;

INSERT INTO category_requirement_profiles (
  region_id, category_code, min_driver_reputation, location_freshness_seconds,
  required_driver_doc_types, required_vehicle_doc_types, optional_driver_doc_types,
  min_completed_rides, config_version
)
VALUES
  ('00000000-0000-4000-8000-000000000020', 'economico', 4.50, 120, ARRAY['CNH'], ARRAY['CRLV', 'INSURANCE'], '{}', 0, 'camada43-bc-v1'),
  ('00000000-0000-4000-8000-000000000020', 'comfort', 4.75, 90, ARRAY['CNH'], ARRAY['CRLV', 'INSURANCE', 'COMFORT_CHECKLIST'], '{}', 20, 'camada43-bc-v1'),
  ('00000000-0000-4000-8000-000000000020', 'executivo', 4.80, 90, ARRAY['CNH'], ARRAY['CRLV', 'INSURANCE', 'COMFORT_CHECKLIST'], '{}', 50, 'camada43-bc-v1'),
  ('00000000-0000-4000-8000-000000000020', 'aeroporto', 4.70, 60, ARRAY['CNH', 'AIRPORT_BADGE'], ARRAY['CRLV', 'INSURANCE', 'AIRPORT_PERMIT'], '{}', 30, 'camada43-bc-v1'),
  ('00000000-0000-4000-8000-000000000020', 'corporativo', 4.75, 120, ARRAY['CNH', 'B2B_BILLING'], ARRAY['CRLV', 'INSURANCE'], '{}', 10, 'camada43-bc-v1'),
  ('00000000-0000-4000-8000-000000000020', 'entrega', 4.40, 150, ARRAY['CNH'], ARRAY['CRLV', 'INSURANCE'], '{}', 0, 'camada43-bc-v1'),
  ('00000000-0000-4000-8000-000000000020', 'moto', 4.55, 90, ARRAY['CNH'], ARRAY['CRLV', 'INSURANCE'], '{}', 0, 'camada43-bc-v1')
ON CONFLICT (region_id, category_code) DO UPDATE SET
  min_driver_reputation = EXCLUDED.min_driver_reputation,
  location_freshness_seconds = EXCLUDED.location_freshness_seconds,
  required_driver_doc_types = EXCLUDED.required_driver_doc_types,
  required_vehicle_doc_types = EXCLUDED.required_vehicle_doc_types,
  optional_driver_doc_types = EXCLUDED.optional_driver_doc_types,
  min_completed_rides = EXCLUDED.min_completed_rides,
  config_version = EXCLUDED.config_version;

CREATE TABLE IF NOT EXISTS client_production_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID REFERENCES service_regions(id) ON DELETE SET NULL,
  config_version TEXT NOT NULL DEFAULT 'camada43-v1',
  use_api_payment_methods BOOLEAN NOT NULL DEFAULT TRUE,
  use_api_profile BOOLEAN NOT NULL DEFAULT TRUE,
  use_api_categories BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO client_production_config (region_id, config_version)
SELECT '00000000-0000-4000-8000-000000000020', 'camada43-bc-v1'
WHERE NOT EXISTS (
  SELECT 1 FROM client_production_config WHERE config_version = 'camada43-bc-v1'
);

CREATE TABLE IF NOT EXISTS geo_go_match_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID REFERENCES service_regions(id) ON DELETE SET NULL,
  mode TEXT NOT NULL DEFAULT 'internal' CHECK (mode IN ('internal', 'external')),
  external_base_url TEXT,
  location_freshness_default_seconds INT NOT NULL DEFAULT 120,
  heartbeat_max_age_seconds INT NOT NULL DEFAULT 45,
  config_version TEXT NOT NULL DEFAULT 'camada43-v1',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO geo_go_match_config (region_id, mode, config_version)
SELECT '00000000-0000-4000-8000-000000000020', 'internal', 'camada43-bc-v1'
WHERE NOT EXISTS (
  SELECT 1 FROM geo_go_match_config WHERE config_version = 'camada43-bc-v1'
);

CREATE TABLE IF NOT EXISTS geo_go_match_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID REFERENCES rides(id) ON DELETE SET NULL,
  category_code TEXT,
  region_id UUID REFERENCES service_regions(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('nearby_query', 'external_fallback', 'sla_filtered')),
  candidate_count INT NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  config_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_geo_go_match_events_created
  ON geo_go_match_events(created_at DESC);
