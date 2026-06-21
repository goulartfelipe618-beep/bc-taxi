-- Camada 31: Match engine produção — timeout handler, rotação sequencial, trail auditável (guia §736–774)

ALTER TABLE ride_match_attempts ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE ride_match_attempts ADD COLUMN IF NOT EXISTS sequential_cursor INT NOT NULL DEFAULT 0;
ALTER TABLE ride_match_attempts ADD COLUMN IF NOT EXISTS aging_bonus_applied NUMERIC(5, 4) NOT NULL DEFAULT 0;
ALTER TABLE ride_match_attempts ADD COLUMN IF NOT EXISTS no_supply_reason TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_match_attempts_idempotency
  ON ride_match_attempts(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS match_offer_timeout_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  attempt_id UUID REFERENCES ride_match_attempts(id) ON DELETE SET NULL,
  offer_id UUID REFERENCES ride_offers(id) ON DELETE SET NULL,
  stage_number INT NOT NULL,
  action_taken TEXT NOT NULL CHECK (action_taken IN (
    'expire_offers',
    'rotate_sequential',
    'expand_stage',
    'no_drivers'
  )),
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_timeout_events_ride
  ON match_offer_timeout_events(ride_id, created_at DESC);

CREATE TABLE IF NOT EXISTS match_pending_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  attempt_id UUID NOT NULL REFERENCES ride_match_attempts(id) ON DELETE CASCADE,
  stage_index INT NOT NULL,
  strategy TEXT NOT NULL CHECK (strategy IN ('sequential', 'parallel')),
  passenger_reputation NUMERIC(4, 2) NOT NULL DEFAULT 4.7,
  due_at TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_pending_schedules_due
  ON match_pending_schedules(due_at) WHERE processed_at IS NULL;
