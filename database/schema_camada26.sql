-- Camada 26: Observabilidade operacional — saúde plataforma, alertas WS/rota/fraude, tracing (guia §902–906)

CREATE TABLE IF NOT EXISTS platform_health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID REFERENCES service_regions(id) ON DELETE SET NULL,
  ws_connections INT NOT NULL DEFAULT 0,
  ws_passenger_connections INT NOT NULL DEFAULT 0,
  ws_driver_connections INT NOT NULL DEFAULT 0,
  redis_connected BOOLEAN NOT NULL DEFAULT FALSE,
  active_rides_in_progress INT NOT NULL DEFAULT 0,
  route_recalc_count_15m INT NOT NULL DEFAULT 0,
  fraud_signal_count_15m INT NOT NULL DEFAULT 0,
  payment_failure_rate NUMERIC(8, 4),
  metadata_json JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_health_captured
  ON platform_health_snapshots(captured_at DESC);

CREATE TABLE IF NOT EXISTS ops_trace_spans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id TEXT NOT NULL,
  ride_id UUID REFERENCES rides(id) ON DELETE CASCADE,
  span_name TEXT NOT NULL,
  component TEXT NOT NULL CHECK (component IN ('api', 'redis', 'ws', 'psp', 'match', 'route', 'fraud')),
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'error', 'degraded')),
  duration_ms INT,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ops_trace_spans_trace ON ops_trace_spans(trace_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ops_trace_spans_ride ON ops_trace_spans(ride_id, created_at DESC);

ALTER TABLE ops_alerts ADD COLUMN IF NOT EXISTS component TEXT;
ALTER TABLE ops_alerts ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;
ALTER TABLE ops_alerts ADD COLUMN IF NOT EXISTS acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ops_alerts_component
  ON ops_alerts(component, status) WHERE status = 'open';
