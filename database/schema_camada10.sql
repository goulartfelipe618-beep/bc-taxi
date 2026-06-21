-- Camada 10: Push notifications + recibos + admin ops (guia §655–659, §734)

CREATE TABLE IF NOT EXISTS user_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web', 'expo')),
  token TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user ON user_push_tokens(user_id) WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS push_notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed', 'skipped')),
  provider TEXT NOT NULL DEFAULT 'demo',
  provider_ref TEXT,
  payload_json JSONB NOT NULL DEFAULT '{}',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_notification_log_user ON push_notification_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_notification_log_event ON push_notification_log(event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS ride_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receipt_number TEXT NOT NULL UNIQUE,
  amount_centavos INT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  payment_method_type TEXT,
  breakdown_json JSONB NOT NULL DEFAULT '{}',
  html_content TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ride_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ride_receipts_ride ON ride_receipts(ride_id);
CREATE INDEX IF NOT EXISTS idx_ride_receipts_user ON ride_receipts(user_id, issued_at DESC);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_label TEXT NOT NULL DEFAULT 'admin-api',
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON admin_audit_log(created_at DESC);
