-- Camada 34: PostGIS praças + categorias por região (guia §600–601, §694–697)

CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE service_regions ADD COLUMN IF NOT EXISTS boundary geography(Polygon, 4326);
ALTER TABLE service_regions ADD COLUMN IF NOT EXISTS pricing_region_id UUID REFERENCES pricing_regions(id) ON DELETE SET NULL;

ALTER TABLE pricing_regions ADD COLUMN IF NOT EXISTS boundary geography(Polygon, 4326);

CREATE INDEX IF NOT EXISTS idx_service_regions_boundary
  ON service_regions USING GIST (boundary);

CREATE INDEX IF NOT EXISTS idx_pricing_regions_boundary
  ON pricing_regions USING GIST (boundary);

CREATE TABLE IF NOT EXISTS service_region_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID NOT NULL REFERENCES service_regions(id) ON DELETE CASCADE,
  category_code TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  display_priority INT NOT NULL DEFAULT 0,
  config_version TEXT NOT NULL DEFAULT 'camada34-v1',
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (region_id, category_code)
);

CREATE INDEX IF NOT EXISTS idx_service_region_categories_region
  ON service_region_categories(region_id, display_priority DESC)
  WHERE is_enabled = TRUE;

-- Polígono operacional BC / Vale (retângulo aproximado ~25 km)
UPDATE service_regions
SET
  boundary = ST_SetSRID(
    ST_MakeEnvelope(-48.78, -27.10, -48.48, -26.88, 4326),
    4326
  )::geography,
  pricing_region_id = '00000000-0000-4000-8000-000000000010'
WHERE id = '00000000-0000-4000-8000-000000000020';

UPDATE pricing_regions
SET boundary = ST_SetSRID(
  ST_MakeEnvelope(-48.85, -27.15, -48.40, -26.82, 4326),
  4326
)::geography
WHERE id = '00000000-0000-4000-8000-000000000010';

INSERT INTO service_region_categories (region_id, category_code, is_enabled, display_priority, config_version)
VALUES
  ('00000000-0000-4000-8000-000000000020', 'moto', TRUE, 10, 'camada34-bc-v1'),
  ('00000000-0000-4000-8000-000000000020', 'economico', TRUE, 100, 'camada34-bc-v1'),
  ('00000000-0000-4000-8000-000000000020', 'comfort', TRUE, 90, 'camada34-bc-v1'),
  ('00000000-0000-4000-8000-000000000020', 'executivo', TRUE, 80, 'camada34-bc-v1'),
  ('00000000-0000-4000-8000-000000000020', 'suv', TRUE, 70, 'camada34-bc-v1'),
  ('00000000-0000-4000-8000-000000000020', 'pet', TRUE, 60, 'camada34-bc-v1'),
  ('00000000-0000-4000-8000-000000000020', 'aeroporto', TRUE, 85, 'camada34-bc-v1'),
  ('00000000-0000-4000-8000-000000000020', 'corporativo', TRUE, 75, 'camada34-bc-v1'),
  ('00000000-0000-4000-8000-000000000020', 'compartilhado', TRUE, 50, 'camada34-bc-v1'),
  ('00000000-0000-4000-8000-000000000020', 'pcd', TRUE, 95, 'camada34-bc-v1'),
  ('00000000-0000-4000-8000-000000000020', 'black', FALSE, 40, 'camada34-bc-v1'),
  ('00000000-0000-4000-8000-000000000020', 'van', FALSE, 30, 'camada34-bc-v1'),
  ('00000000-0000-4000-8000-000000000020', 'micro_onibus', FALSE, 20, 'camada34-bc-v1'),
  ('00000000-0000-4000-8000-000000000020', 'entrega', TRUE, 55, 'camada34-bc-v1')
ON CONFLICT (region_id, category_code) DO UPDATE SET
  is_enabled = EXCLUDED.is_enabled,
  display_priority = EXCLUDED.display_priority,
  config_version = EXCLUDED.config_version;
