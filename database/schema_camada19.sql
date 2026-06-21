-- Camada 19: Pagamentos produção — tokenização, webhooks idempotentes, fila de estornos (guia §622–646)

ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS provider_ref TEXT;
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS provider_customer_id TEXT;
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS fingerprint_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_payment_methods_provider_ref
  ON payment_methods(user_id, provider, provider_ref)
  WHERE provider_ref IS NOT NULL AND is_active = TRUE;

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}',
  processed_at TIMESTAMPTZ,
  result_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_pending
  ON payment_webhook_events(created_at DESC)
  WHERE processed_at IS NULL;

CREATE TABLE IF NOT EXISTS payment_refund_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_intent_id UUID NOT NULL REFERENCES payment_intents(id) ON DELETE CASCADE,
  amount_centavos INT NOT NULL CHECK (amount_centavos > 0),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed')),
  provider_ref TEXT,
  idempotency_key TEXT UNIQUE,
  failure_reason TEXT,
  requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_refund_requests_intent
  ON payment_refund_requests(payment_intent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_refund_requests_status
  ON payment_refund_requests(status)
  WHERE status IN ('pending', 'processing');
