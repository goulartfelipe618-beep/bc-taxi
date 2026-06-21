-- Camada 27: Antifraude produção — bloqueios, device graph, revisão automática (guia §534–565, §647–654)

CREATE TABLE IF NOT EXISTS fraud_enforcement_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT,
  block_scope TEXT NOT NULL CHECK (block_scope IN (
    'ride_request',
    'driver_online',
    'payout',
    'promo',
    'login',
    'all'
  )),
  reason_code TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('auto', 'admin', 'case_review')),
  source_ref TEXT,
  risk_score NUMERIC(6, 4),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  CONSTRAINT fraud_block_target CHECK (user_id IS NOT NULL OR device_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_fraud_blocks_user_active
  ON fraud_enforcement_blocks(user_id, block_scope) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_fraud_blocks_device_active
  ON fraud_enforcement_blocks(device_id, block_scope) WHERE is_active = TRUE AND device_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS device_location_trust (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  trust_score NUMERIC(5, 4) NOT NULL DEFAULT 1.0,
  gps_jump_count_7d INT NOT NULL DEFAULT 0,
  stale_gps_count_7d INT NOT NULL DEFAULT 0,
  last_gps_event_at TIMESTAMPTZ,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_device_location_trust_device
  ON device_location_trust(device_id, trust_score);

ALTER TABLE fraud_cases ADD COLUMN IF NOT EXISTS priority INT NOT NULL DEFAULT 50;
ALTER TABLE fraud_cases ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (review_status IN ('pending', 'auto_reviewed', 'human_queue', 'closed'));
ALTER TABLE fraud_cases ADD COLUMN IF NOT EXISTS auto_action TEXT
  CHECK (auto_action IS NULL OR auto_action IN ('none', 'restrict', 'block', 'clear'));
ALTER TABLE fraud_cases ADD COLUMN IF NOT EXISTS reason_codes TEXT[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS fraud_case_auto_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES fraud_cases(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('clear', 'restrict', 'block', 'escalate')),
  reason_codes TEXT[] NOT NULL DEFAULT '{}',
  risk_score NUMERIC(6, 4) NOT NULL,
  linked_account_count INT NOT NULL DEFAULT 0,
  deterministic_rules_version TEXT NOT NULL DEFAULT 'v1',
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fraud_case_reviews_case
  ON fraud_case_auto_reviews(case_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fraud_cases_review_queue
  ON fraud_cases(review_status, priority DESC) WHERE status IN ('open', 'reviewing');
