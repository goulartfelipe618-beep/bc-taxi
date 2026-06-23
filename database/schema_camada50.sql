-- Camada 50: Atividade de corridas produção — histórico passageiro/motorista, recibos, filtros (guia §730–735)

CREATE TABLE IF NOT EXISTS ride_activity_production_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID REFERENCES service_regions(id) ON DELETE SET NULL,
  config_version TEXT NOT NULL DEFAULT 'camada50-v1',
  default_page_size INT NOT NULL DEFAULT 30,
  max_page_size INT NOT NULL DEFAULT 100,
  include_cancelled BOOLEAN NOT NULL DEFAULT TRUE,
  include_receipt_links BOOLEAN NOT NULL DEFAULT TRUE,
  driver_earnings_visible BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO ride_activity_production_config (region_id, config_version)
SELECT '00000000-0000-4000-8000-000000000020', 'camada50-bc-v1'
WHERE NOT EXISTS (
  SELECT 1 FROM ride_activity_production_config WHERE config_version = 'camada50-bc-v1'
);

CREATE TABLE IF NOT EXISTS ride_activity_pins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, ride_id)
);

CREATE INDEX IF NOT EXISTS idx_ride_activity_pins_user
  ON ride_activity_pins(user_id, pinned_at DESC);
