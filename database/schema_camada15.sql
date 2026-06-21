-- Camada 15: Aeroporto simplificado (estilo Uber — sem fila virtual)
-- Detecção georreferenciada, taxa operacional opcional (default 0), pressão dinâmica local.

CREATE TABLE IF NOT EXISTS airport_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID REFERENCES service_regions(id) ON DELETE SET NULL,
  iata_code TEXT,
  name TEXT NOT NULL,
  terminal_code TEXT,
  center_lat DOUBLE PRECISION NOT NULL,
  center_lng DOUBLE PRECISION NOT NULL,
  radius_km DOUBLE PRECISION NOT NULL DEFAULT 2.5 CHECK (radius_km > 0),
  pickup_instructions TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_airport_zones_active ON airport_zones(is_active);

CREATE TABLE IF NOT EXISTS airport_terminal_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID NOT NULL REFERENCES airport_zones(id) ON DELETE CASCADE,
  fee_centavos INT NOT NULL DEFAULT 0 CHECK (fee_centavos >= 0),
  fee_label TEXT NOT NULL DEFAULT 'Taxa aeroportuária',
  applies_to TEXT NOT NULL DEFAULT 'pickup' CHECK (applies_to IN ('pickup', 'dropoff', 'both')),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_airport_terminal_fees_zone ON airport_terminal_fees(zone_id, is_active);

CREATE TABLE IF NOT EXISTS ride_airport_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID REFERENCES rides(id) ON DELETE CASCADE,
  pickup_zone_id UUID REFERENCES airport_zones(id) ON DELETE SET NULL,
  dropoff_zone_id UUID REFERENCES airport_zones(id) ON DELETE SET NULL,
  airport_fee_centavos INT NOT NULL DEFAULT 0,
  airport_pressure NUMERIC(8, 4) NOT NULL DEFAULT 0,
  pricing_mode TEXT NOT NULL DEFAULT 'standard'
    CHECK (pricing_mode IN ('standard', 'airport_category')),
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ride_airport_snapshots_ride ON ride_airport_snapshots(ride_id, created_at DESC);

-- Aeroporto Ministro Victor Konder (NVT) — Navegantes/SC
INSERT INTO airport_zones (
  id, region_id, iata_code, name, terminal_code,
  center_lat, center_lng, radius_km, pickup_instructions
)
VALUES (
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000020',
  'NVT',
  'Aeroporto Ministro Victor Konder',
  'MAIN',
  -26.8799,
  -48.6514,
  3.0,
  'Desembarque na área oficial de aplicativos. Aguarde o motorista no ponto indicado pelo app.'
)
ON CONFLICT (id) DO NOTHING;

-- Taxa 0 por padrão (modelo Uber — preço normal da corrida)
INSERT INTO airport_terminal_fees (id, zone_id, fee_centavos, fee_label, applies_to)
VALUES (
  '00000000-0000-4000-8000-000000000302',
  '00000000-0000-4000-8000-000000000301',
  0,
  'Taxa aeroportuária',
  'pickup'
)
ON CONFLICT (id) DO NOTHING;
