-- Camada 38: Corporativo B2B produção — faturamento consolidado, aprovações, regiões (guia §846–850)

ALTER TABLE corporate_policies ADD COLUMN IF NOT EXISTS approval_threshold_centavos INT;
ALTER TABLE corporate_policies ADD COLUMN IF NOT EXISTS allowed_region_ids UUID[];
ALTER TABLE corporate_policies ADD COLUMN IF NOT EXISTS require_cost_center BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE corporate_policies ADD COLUMN IF NOT EXISTS config_version TEXT NOT NULL DEFAULT 'camada38-v1';

CREATE TABLE IF NOT EXISTS corporate_billing_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES corporate_accounts(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed', 'sent', 'paid', 'void')),
  total_centavos BIGINT NOT NULL DEFAULT 0,
  line_count INT NOT NULL DEFAULT 0,
  config_version TEXT NOT NULL,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_corporate_statements_account
  ON corporate_billing_statements(account_id, period_end DESC);

ALTER TABLE corporate_invoice_lines ADD COLUMN IF NOT EXISTS statement_id UUID REFERENCES corporate_billing_statements(id) ON DELETE SET NULL;
ALTER TABLE corporate_invoice_lines ADD COLUMN IF NOT EXISTS captured_amount_centavos INT;
ALTER TABLE corporate_invoice_lines ADD COLUMN IF NOT EXISTS policy_version TEXT;

CREATE TABLE IF NOT EXISTS corporate_ride_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES corporate_accounts(id) ON DELETE CASCADE,
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  requester_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cost_center_id UUID REFERENCES corporate_cost_centers(id) ON DELETE SET NULL,
  quoted_fare_centavos INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  decided_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  decision_reason TEXT,
  policy_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  UNIQUE (ride_id)
);

CREATE INDEX IF NOT EXISTS idx_corporate_ride_approvals_pending
  ON corporate_ride_approvals(account_id, status, created_at DESC)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS corporate_policy_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES corporate_accounts(id) ON DELETE CASCADE,
  ride_id UUID REFERENCES rides(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'policy_blocked',
    'approval_requested',
    'approval_granted',
    'approval_rejected',
    'invoice_captured',
    'statement_closed'
  )),
  policy_version TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_corporate_policy_events_account
  ON corporate_policy_events(account_id, created_at DESC);

UPDATE corporate_policies
SET approval_threshold_centavos = 12000,
    allowed_region_ids = ARRAY['00000000-0000-4000-8000-000000000020'::uuid],
    require_cost_center = TRUE,
    config_version = 'camada38-bc-v1'
WHERE account_id = '00000000-0000-4000-8000-000000000100';
