-- Camada 23: Recálculo de rota live + monitoramento em tempo real (guia §314–330)

ALTER TABLE active_route_states ADD COLUMN IF NOT EXISTS driver_lat DOUBLE PRECISION;
ALTER TABLE active_route_states ADD COLUMN IF NOT EXISTS driver_lng DOUBLE PRECISION;
ALTER TABLE active_route_states ADD COLUMN IF NOT EXISTS deviation_m DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE active_route_states ADD COLUMN IF NOT EXISTS incident_risk_score DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE active_route_states ADD COLUMN IF NOT EXISTS live_monitor_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS route_live_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  active_route_id UUID REFERENCES active_route_states(id) ON DELETE SET NULL,
  driver_lat DOUBLE PRECISION NOT NULL,
  driver_lng DOUBLE PRECISION NOT NULL,
  deviation_m DOUBLE PRECISION NOT NULL DEFAULT 0,
  traffic_level_index DOUBLE PRECISION,
  eta_seconds INT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_route_live_snapshots_ride
  ON route_live_snapshots(ride_id, captured_at DESC);

ALTER TABLE route_recalculation_events ADD COLUMN IF NOT EXISTS reason_label TEXT;
ALTER TABLE route_recalculation_events ADD COLUMN IF NOT EXISTS deviation_m DOUBLE PRECISION;
ALTER TABLE route_recalculation_events ADD COLUMN IF NOT EXISTS risk_delta_pct DOUBLE PRECISION;
