-- Camada 40: Realtime produção — GPS throttle UI, WS checkpoint replay, push dedup (guia §775–818)

CREATE TABLE IF NOT EXISTS realtime_production_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID REFERENCES pricing_regions(id) ON DELETE SET NULL,
  gps_ui_min_interval_ms INT NOT NULL DEFAULT 3000,
  gps_smooth_factor NUMERIC(4, 3) NOT NULL DEFAULT 0.35,
  push_dedup_window_seconds INT NOT NULL DEFAULT 60,
  ws_replay_limit INT NOT NULL DEFAULT 50,
  config_version TEXT NOT NULL DEFAULT 'camada40-v1',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO realtime_production_config (region_id, config_version)
SELECT '00000000-0000-4000-8000-000000000010', 'camada40-bc-v1'
WHERE NOT EXISTS (
  SELECT 1 FROM realtime_production_config WHERE config_version = 'camada40-bc-v1'
);

CREATE TABLE IF NOT EXISTS push_delivery_dedup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  dedup_key TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, event_type, dedup_key)
);

CREATE INDEX IF NOT EXISTS idx_push_delivery_dedup_sent
  ON push_delivery_dedup(user_id, sent_at DESC);

CREATE TABLE IF NOT EXISTS websocket_event_acks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL,
  acked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_ws_event_acks_user
  ON websocket_event_acks(user_id, acked_at DESC);

ALTER TABLE websocket_sessions ADD COLUMN IF NOT EXISTS last_checkpoint_iso TEXT;
