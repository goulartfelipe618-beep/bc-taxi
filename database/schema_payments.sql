-- Pagamentos BC Taxi

CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method_type TEXT NOT NULL CHECK (method_type IN ('pix', 'card', 'debit', 'cash')),
  label TEXT NOT NULL,
  last_four TEXT,
  brand TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_user ON payment_methods(user_id) WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID REFERENCES rides(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_method_id UUID REFERENCES payment_methods(id),
  payment_method_type TEXT NOT NULL CHECK (payment_method_type IN ('pix', 'card', 'debit', 'cash')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'authorized', 'captured', 'voided', 'failed', 'requires_action'
  )),
  amount_authorized_centavos INT NOT NULL DEFAULT 0,
  amount_captured_centavos INT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  provider TEXT NOT NULL DEFAULT 'demo',
  provider_ref TEXT,
  failure_reason TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_intents_ride ON payment_intents(ride_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_user ON payment_intents(user_id, status);

ALTER TABLE rides ADD COLUMN IF NOT EXISTS payment_intent_id UUID REFERENCES payment_intents(id);
CREATE INDEX IF NOT EXISTS idx_rides_payment_intent ON rides(payment_intent_id) WHERE payment_intent_id IS NOT NULL;
