-- Camada 36: PSP produção — roteamento por método, fila de retry, reconciliação (guia §867–870)

CREATE TABLE IF NOT EXISTS psp_provider_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID REFERENCES service_regions(id) ON DELETE CASCADE,
  method_type TEXT NOT NULL CHECK (method_type IN ('pix', 'card', 'debit', 'cash')),
  provider_code TEXT NOT NULL CHECK (provider_code IN ('demo', 'stripe', 'mercadopago', 'pagarme', 'http')),
  priority INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  config_version TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_psp_provider_configs_active
  ON psp_provider_configs(COALESCE(region_id, '00000000-0000-0000-0000-000000000000'::uuid), method_type)
  WHERE is_active = TRUE AND effective_to IS NULL;

CREATE TABLE IF NOT EXISTS payment_psp_retry_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL CHECK (job_type IN ('capture', 'void', 'refund', 'webhook_replay')),
  payment_intent_id UUID REFERENCES payment_intents(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_ref TEXT,
  payload_json JSONB NOT NULL DEFAULT '{}',
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'dead')),
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_psp_retry_due
  ON payment_psp_retry_jobs(next_attempt_at ASC)
  WHERE status IN ('pending', 'processing');

CREATE TABLE IF NOT EXISTS payment_reconciliation_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  snapshot_date DATE NOT NULL,
  intent_count INT NOT NULL DEFAULT 0,
  captured_centavos BIGINT NOT NULL DEFAULT 0,
  refunded_centavos BIGINT NOT NULL DEFAULT 0,
  pending_webhooks INT NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, snapshot_date)
);

INSERT INTO psp_provider_configs (
  id, region_id, method_type, provider_code, priority, config_version, metadata_json
)
VALUES
  (
    '00000000-0000-4000-8000-000000000601',
    '00000000-0000-4000-8000-000000000020',
    'pix',
    'mercadopago',
    0,
    'camada36-bc-v1',
    '{"notes":"PIX BC via Mercado Pago"}'
  ),
  (
    '00000000-0000-4000-8000-000000000602',
    '00000000-0000-4000-8000-000000000020',
    'card',
    'stripe',
    0,
    'camada36-bc-v1',
    '{"notes":"Cartão BC via Stripe"}'
  ),
  (
    '00000000-0000-4000-8000-000000000603',
    '00000000-0000-4000-8000-000000000020',
    'debit',
    'stripe',
    0,
    'camada36-bc-v1',
    '{"notes":"Débito BC via Stripe"}'
  ),
  (
    '00000000-0000-4000-8000-000000000604',
    '00000000-0000-4000-8000-000000000020',
    'cash',
    'demo',
    0,
    'camada36-bc-v1',
    '{"notes":"Dinheiro — liquidação offline"}'
  )
ON CONFLICT (id) DO NOTHING;
