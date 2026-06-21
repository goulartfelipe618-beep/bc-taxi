-- Camada 18: Transporte adaptado (PCD) — necessidade do passageiro, match por compatibilidade

CREATE TABLE IF NOT EXISTS accessibility_need_catalog (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  requires_wheelchair_vehicle BOOLEAN NOT NULL DEFAULT FALSE,
  requires_pcd_driver_opt_in BOOLEAN NOT NULL DEFAULT TRUE,
  assistive_baggage_free BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0
);

INSERT INTO accessibility_need_catalog (code, label, description, requires_wheelchair_vehicle, requires_pcd_driver_opt_in, assistive_baggage_free, sort_order)
VALUES
  ('wheelchair', 'Cadeira de rodas', 'Veículo com espaço e acesso para cadeira de rodas', TRUE, TRUE, TRUE, 1),
  ('walker', 'Andador ou bengala', 'Tempo extra de embarque; não exige adaptação veicular', FALSE, TRUE, TRUE, 2),
  ('mobility_aid', 'Muletas ou aparelho ortopédico', 'Itens assistivos não contam como bagagem tarifável', FALSE, TRUE, TRUE, 3),
  ('visual_assistance', 'Apoio visual', 'Motorista com treinamento inclusivo', FALSE, TRUE, TRUE, 4),
  ('hearing_assistance', 'Apoio auditivo', 'Motorista com treinamento inclusivo', FALSE, TRUE, TRUE, 5)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE rides ADD COLUMN IF NOT EXISTS accessibility_need_code TEXT
  REFERENCES accessibility_need_catalog(code) ON DELETE SET NULL;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS assistive_device_count INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS ride_accessibility_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  need_code TEXT NOT NULL REFERENCES accessibility_need_catalog(code),
  assistive_device_count INT NOT NULL DEFAULT 0,
  notes TEXT,
  matched_driver_capability JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ride_id)
);

CREATE INDEX IF NOT EXISTS idx_ride_accessibility_need ON ride_accessibility_requests(need_code, created_at DESC);

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS accessibility_capabilities TEXT[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS driver_accessibility_profiles (
  driver_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  capabilities TEXT[] NOT NULL DEFAULT '{}',
  pcd_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
