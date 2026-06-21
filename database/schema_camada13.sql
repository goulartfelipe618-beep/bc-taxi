-- Camada 13: Eventos externos + observabilidade (guia §871–874, §902–906)

CREATE TABLE IF NOT EXISTS event_surge_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID REFERENCES service_regions(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('show', 'sports', 'festival', 'conference', 'other')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  center_lat DOUBLE PRECISION NOT NULL,
  center_lng DOUBLE PRECISION NOT NULL,
  radius_km DOUBLE PRECISION NOT NULL DEFAULT 3 CHECK (radius_km > 0),
  intensity_index DOUBLE PRECISION NOT NULL DEFAULT 0.5 CHECK (intensity_index BETWEEN 0 AND 1),
  impacted_categories TEXT[],
  source TEXT NOT NULL DEFAULT 'backoffice',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_event_surge_active ON event_surge_inputs(is_active, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS ride_decision_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  decision_type TEXT NOT NULL,
  stage TEXT,
  payload_json JSONB NOT NULL DEFAULT '{}',
  trace_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ride_decision_logs_ride ON ride_decision_logs(ride_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ops_metrics_hourly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_hour TIMESTAMPTZ NOT NULL,
  region_id UUID,
  category_code TEXT,
  request_to_assign_ms_avg INT,
  accept_rate NUMERIC(5, 4),
  cancel_rate NUMERIC(5, 4),
  pickup_eta_ms_avg INT,
  pricing_conversion_rate NUMERIC(5, 4),
  payment_failure_rate NUMERIC(5, 4),
  ride_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ops_metrics_hourly_bucket
  ON ops_metrics_hourly(bucket_hour, COALESCE(region_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(category_code, ''));

CREATE TABLE IF NOT EXISTS ops_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  summary TEXT NOT NULL,
  metric_value NUMERIC,
  threshold_value NUMERIC,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ops_alerts_open ON ops_alerts(status, created_at DESC) WHERE status = 'open';

INSERT INTO event_surge_inputs (
  id, region_id, event_name, event_type, starts_at, ends_at,
  center_lat, center_lng, radius_km, intensity_index, impacted_categories, source
)
VALUES (
  '00000000-0000-4000-8000-000000000200',
  '00000000-0000-4000-8000-000000000020',
  'Show Arena BC — Verão',
  'show',
  NOW() - INTERVAL '2 hours',
  NOW() + INTERVAL '30 days',
  -26.9905,
  -48.6348,
  4.5,
  0.72,
  ARRAY['economico', 'comfort', 'executivo', 'suv'],
  'seed'
)
ON CONFLICT (id) DO NOTHING;
