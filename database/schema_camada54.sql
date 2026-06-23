-- Camada 54: Reputação passageiro produção — KPIs, benefícios, insights (guia §115–184, §890–894)

CREATE TABLE IF NOT EXISTS passenger_reputation_production_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID REFERENCES service_regions(id) ON DELETE SET NULL,
  config_version TEXT NOT NULL DEFAULT 'camada54-v1',
  kpi_dashboard_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  tier_progress_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  insights_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  benefits_panel_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  history_months INT NOT NULL DEFAULT 12,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO passenger_reputation_production_config (region_id, config_version)
SELECT '00000000-0000-4000-8000-000000000020', 'camada54-bc-v1'
WHERE NOT EXISTS (
  SELECT 1 FROM passenger_reputation_production_config WHERE config_version = 'camada54-bc-v1'
);

CREATE TABLE IF NOT EXISTS passenger_reputation_insight_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  insight_code TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'success')),
  dismissed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_passenger_reputation_insights_user
  ON passenger_reputation_insight_events(passenger_user_id, created_at DESC);
