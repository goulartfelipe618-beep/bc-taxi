-- Camada 29: Corridas suspeitas — micro-corridas, loops, duração anômala, cancelamentos coordenados (guia §549–554)

CREATE TABLE IF NOT EXISTS suspicious_ride_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID REFERENCES rides(id) ON DELETE CASCADE,
  passenger_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES users(id) ON DELETE SET NULL,
  flag_type TEXT NOT NULL CHECK (flag_type IN (
    'MICRO_RIDE_REPEAT',
    'PAIR_LOOP',
    'TOO_FAST_COMPLETE',
    'TOO_SLOW_COMPLETE',
    'EXTREME_ROUTE_DEVIATION',
    'COORDINATED_CANCEL'
  )),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  risk_score NUMERIC(5, 4) NOT NULL DEFAULT 0.5,
  summary TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'cleared', 'confirmed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suspicious_ride_flags_ride ON suspicious_ride_flags(ride_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_suspicious_ride_flags_pair
  ON suspicious_ride_flags(passenger_id, driver_id, flag_type) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_suspicious_ride_flags_status ON suspicious_ride_flags(status, created_at DESC);

CREATE TABLE IF NOT EXISTS ride_pair_pattern_stats (
  passenger_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  completed_count_7d INT NOT NULL DEFAULT 0,
  micro_ride_count_7d INT NOT NULL DEFAULT 0,
  cancelled_count_48h INT NOT NULL DEFAULT 0,
  completed_count_24h INT NOT NULL DEFAULT 0,
  last_completed_at TIMESTAMPTZ,
  last_cancelled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (passenger_id, driver_id)
);

ALTER TABLE fraud_signals DROP CONSTRAINT IF EXISTS fraud_signals_signal_type_check;
ALTER TABLE fraud_signals ADD CONSTRAINT fraud_signals_signal_type_check
  CHECK (signal_type IN (
    'CODE_VERIFY_FAIL',
    'CODE_COOLDOWN',
    'GPS_JUMP',
    'GPS_STALE',
    'RAPID_CANCEL',
    'PAYMENT_FAIL',
    'DEVICE_ANOMALY',
    'SUSPICIOUS_RIDE_PATTERN'
  ));
