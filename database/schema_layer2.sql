-- Camada 2: realtime, pricing dinâmico e antifraude

CREATE TABLE IF NOT EXISTS event_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  producer TEXT NOT NULL DEFAULT 'core-node',
  schema_version INT NOT NULL DEFAULT 1,
  idempotency_key TEXT,
  payload_json JSONB NOT NULL DEFAULT '{}',
  trace_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  delivery_status TEXT NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'published', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_outbox_idempotency ON event_outbox(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_outbox_pending ON event_outbox(delivery_status, occurred_at) WHERE delivery_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_event_outbox_aggregate ON event_outbox(aggregate_type, aggregate_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS fraud_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ride_id UUID REFERENCES rides(id) ON DELETE SET NULL,
  signal_type TEXT NOT NULL CHECK (signal_type IN (
    'CODE_VERIFY_FAIL',
    'CODE_COOLDOWN',
    'GPS_JUMP',
    'GPS_STALE',
    'RAPID_CANCEL',
    'PAYMENT_FAIL',
    'DEVICE_ANOMALY'
  )),
  severity TEXT NOT NULL DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  score_delta NUMERIC(6, 4) NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fraud_signals_user ON fraud_signals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_signals_ride ON fraud_signals(ride_id) WHERE ride_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fraud_signals_type ON fraud_signals(signal_type, created_at DESC);

CREATE TABLE IF NOT EXISTS fraud_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'cleared', 'confirmed')),
  risk_score NUMERIC(6, 4) NOT NULL DEFAULT 0,
  summary TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fraud_cases_user ON fraud_cases(user_id, status);

CREATE TABLE IF NOT EXISTS gps_integrity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ride_id UUID REFERENCES rides(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('JUMP', 'STALE', 'IMPOSSIBLE_SPEED', 'OFF_ROUTE')),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gps_integrity_driver ON gps_integrity_events(driver_id, created_at DESC);

CREATE TABLE IF NOT EXISTS websocket_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL,
  last_checkpoint_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disconnected_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ws_sessions_user ON websocket_sessions(user_id) WHERE disconnected_at IS NULL;

-- Região padrão Vale do Itajaí (sem PostGIS — polygon_json)
INSERT INTO pricing_regions (id, city_id, name, priority, is_active, base_fare_centavos, distance_rate_centavos_km, time_rate_centavos_min, minimum_fare_centavos, booking_fee_centavos)
SELECT '00000000-0000-4000-8000-000000000010', 'vale-itajai', 'Vale do Itajaí', 1, TRUE, 500, 220, 35, 800, 150
WHERE NOT EXISTS (SELECT 1 FROM pricing_regions WHERE city_id = 'vale-itajai');
