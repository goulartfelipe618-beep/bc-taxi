-- Camada 32: Aeroporto — fila virtual georreferenciada (guia §841–845)

CREATE TABLE IF NOT EXISTS airport_queue_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID NOT NULL REFERENCES airport_zones(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  terminal_code TEXT,
  center_lat DOUBLE PRECISION NOT NULL,
  center_lng DOUBLE PRECISION NOT NULL,
  radius_m INT NOT NULL DEFAULT 450 CHECK (radius_m > 0),
  allowed_categories TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_airport_queue_pools_zone
  ON airport_queue_pools(zone_id) WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS airport_queue_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID NOT NULL REFERENCES airport_queue_pools(id) ON DELETE CASCADE,
  zone_id UUID NOT NULL REFERENCES airport_zones(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  queue_position INT NOT NULL CHECK (queue_position > 0),
  terminal_code TEXT,
  categories_json JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'offered', 'exited', 'expired')),
  entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  exited_at TIMESTAMPTZ,
  exit_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_airport_queue_active_driver
  ON airport_queue_entries(driver_id) WHERE status IN ('waiting', 'offered');

CREATE INDEX IF NOT EXISTS idx_airport_queue_zone_waiting
  ON airport_queue_entries(zone_id, queue_position) WHERE status = 'waiting';

CREATE TABLE IF NOT EXISTS airport_queue_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID REFERENCES airport_zones(id) ON DELETE SET NULL,
  pool_id UUID REFERENCES airport_queue_pools(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ride_id UUID REFERENCES rides(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'entered',
    'exited',
    'position_updated',
    'offered',
    'accepted',
    'skipped'
  )),
  queue_position INT,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_airport_queue_events_zone
  ON airport_queue_events(zone_id, created_at DESC);

-- Bolsão homologado — Aeroporto NVT (MAIN)
INSERT INTO airport_queue_pools (
  id, zone_id, name, terminal_code, center_lat, center_lng, radius_m, allowed_categories
)
VALUES (
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000301',
  'Bolsão aplicativos NVT',
  'MAIN',
  -26.8799,
  -48.6514,
  450,
  ARRAY['aeroporto', 'economico', 'comfort', 'executivo', 'black', 'suv']
)
ON CONFLICT (id) DO NOTHING;
