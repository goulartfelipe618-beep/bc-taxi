-- Camada 41: Observabilidade produção — tracing distribuído, SLO por dimensão, alertas configuráveis (guia §902–906)

CREATE TABLE IF NOT EXISTS observability_production_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID REFERENCES pricing_regions(id) ON DELETE SET NULL,
  payment_failure_threshold NUMERIC(8, 4) NOT NULL DEFAULT 0.15,
  cancel_rate_threshold NUMERIC(8, 4) NOT NULL DEFAULT 0.25,
  accept_rate_threshold NUMERIC(8, 4) NOT NULL DEFAULT 0.45,
  request_to_assign_ms_threshold INT NOT NULL DEFAULT 120000,
  route_recalc_spike_threshold INT NOT NULL DEFAULT 25,
  fraud_spike_threshold INT NOT NULL DEFAULT 12,
  trace_sample_rate_bps INT NOT NULL DEFAULT 10000,
  config_version TEXT NOT NULL DEFAULT 'camada41-v1',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO observability_production_config (region_id, config_version)
SELECT '00000000-0000-4000-8000-000000000010', 'camada41-bc-v1'
WHERE NOT EXISTS (
  SELECT 1 FROM observability_production_config WHERE config_version = 'camada41-bc-v1'
);

CREATE TABLE IF NOT EXISTS ops_slo_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_hour TIMESTAMPTZ NOT NULL,
  region_id UUID REFERENCES pricing_regions(id) ON DELETE SET NULL,
  category_code TEXT,
  reputation_tier TEXT,
  request_to_assign_ms_avg INT,
  accept_rate NUMERIC(8, 4),
  cancel_rate NUMERIC(8, 4),
  pickup_eta_ms_avg INT,
  pricing_conversion_rate NUMERIC(8, 4),
  payment_failure_rate NUMERIC(8, 4),
  ride_count INT NOT NULL DEFAULT 0,
  config_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ops_slo_snapshots_bucket
  ON ops_slo_snapshots(bucket_hour DESC, region_id, category_code, reputation_tier);

CREATE TABLE IF NOT EXISTS observability_production_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'slo_captured',
    'alert_triggered',
    'trace_sampled',
    'trace_linked'
  )),
  config_version TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_observability_production_events_type
  ON observability_production_events(event_type, created_at DESC);

ALTER TABLE ops_trace_spans ADD COLUMN IF NOT EXISTS parent_span_id UUID;
