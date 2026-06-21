-- Camada 12: Corporativo B2B + Entrega (guia §846–855)

CREATE TABLE IF NOT EXISTS corporate_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tax_id TEXT,
  billing_email TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS corporate_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES corporate_accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('employee', 'manager', 'admin')),
  approval_status TEXT NOT NULL DEFAULT 'approved' CHECK (approval_status IN ('pending', 'approved', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, user_id)
);

CREATE TABLE IF NOT EXISTS corporate_cost_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES corporate_accounts(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (account_id, code)
);

CREATE TABLE IF NOT EXISTS corporate_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES corporate_accounts(id) ON DELETE CASCADE UNIQUE,
  allowed_category_codes TEXT[] NOT NULL DEFAULT ARRAY['corporativo', 'comfort', 'executivo'],
  max_fare_centavos INT,
  block_public_promos BOOLEAN NOT NULL DEFAULT TRUE,
  weekday_start_hour INT NOT NULL DEFAULT 6 CHECK (weekday_start_hour BETWEEN 0 AND 23),
  weekday_end_hour INT NOT NULL DEFAULT 22 CHECK (weekday_end_hour BETWEEN 0 AND 23),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS corporate_invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES corporate_accounts(id) ON DELETE CASCADE,
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  cost_center_id UUID REFERENCES corporate_cost_centers(id) ON DELETE SET NULL,
  passenger_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_centavos INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'invoiced', 'paid', 'void')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ride_id)
);

CREATE INDEX IF NOT EXISTS idx_corporate_invoice_account ON corporate_invoice_lines(account_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS delivery_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE UNIQUE,
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_description TEXT NOT NULL,
  declared_weight_kg NUMERIC(8, 2),
  declared_value_centavos INT,
  is_fragile BOOLEAN NOT NULL DEFAULT FALSE,
  is_priority BOOLEAN NOT NULL DEFAULT FALSE,
  pickup_pin_hash TEXT NOT NULL,
  dropoff_pin_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'pickup_confirmed', 'in_transit', 'delivered', 'cancelled')),
  wait_minutes_pickup INT NOT NULL DEFAULT 0,
  wait_minutes_dropoff INT NOT NULL DEFAULT 0,
  insurance_fee_centavos INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS delivery_proof_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_job_id UUID NOT NULL REFERENCES delivery_jobs(id) ON DELETE CASCADE,
  proof_type TEXT NOT NULL CHECK (proof_type IN ('pickup_pin', 'dropoff_pin', 'pickup_photo', 'dropoff_photo')),
  proof_value TEXT,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_jobs_requester ON delivery_jobs(requester_id, created_at DESC);

INSERT INTO corporate_accounts (id, name, tax_id, billing_email)
VALUES ('00000000-0000-4000-8000-000000000100', 'BC Taxi Demo Corp', '12.345.678/0001-99', 'financeiro@bctaxi.demo')
ON CONFLICT (id) DO NOTHING;

INSERT INTO corporate_policies (account_id, allowed_category_codes, max_fare_centavos)
VALUES ('00000000-0000-4000-8000-000000000100', ARRAY['corporativo', 'comfort', 'executivo'], 15000)
ON CONFLICT (account_id) DO NOTHING;

INSERT INTO corporate_cost_centers (id, account_id, code, label)
VALUES
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000100', 'VENDAS', 'Vendas'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000100', 'TI', 'Tecnologia')
ON CONFLICT (id) DO NOTHING;
