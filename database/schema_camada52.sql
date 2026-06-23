-- Camada 52: Detalhe de atividade produção — recibo, re-reserva, ganhos motorista (guia §730–735, §708–713)

CREATE TABLE IF NOT EXISTS ride_activity_detail_production_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID REFERENCES service_regions(id) ON DELETE SET NULL,
  config_version TEXT NOT NULL DEFAULT 'camada52-v1',
  receipt_detail_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  rebook_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  driver_earnings_breakdown_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  timeline_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO ride_activity_detail_production_config (region_id, config_version)
SELECT '00000000-0000-4000-8000-000000000020', 'camada52-bc-v1'
WHERE NOT EXISTS (
  SELECT 1 FROM ride_activity_detail_production_config WHERE config_version = 'camada52-bc-v1'
);

CREATE TABLE IF NOT EXISTS ride_activity_rebook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ride_activity_rebook_user
  ON ride_activity_rebook_events(user_id, created_at DESC);
