-- Camada 3: reputação de passageiros e eventos reputacionais (guia §115–153)

ALTER TABLE users ADD COLUMN IF NOT EXISTS reputation_score NUMERIC(5, 4) NOT NULL DEFAULT 5.0;

CREATE TABLE IF NOT EXISTS reputation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_role TEXT NOT NULL CHECK (user_role IN ('passenger', 'driver')),
  event_type TEXT NOT NULL,
  previous_score NUMERIC(5, 4),
  new_score NUMERIC(5, 4) NOT NULL,
  source_ride_id UUID,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reputation_events_user ON reputation_events(user_id, created_at DESC);
