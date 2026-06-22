-- Camada 44: Conta passageiro produção — perfil, carteira, mensagens, segurança (guia §708–713, §655–659)

CREATE TABLE IF NOT EXISTS passenger_account_production_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID REFERENCES service_regions(id) ON DELETE SET NULL,
  config_version TEXT NOT NULL DEFAULT 'camada44-v1',
  wallet_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  inbox_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  profile_edit_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO passenger_account_production_config (region_id, config_version)
SELECT '00000000-0000-4000-8000-000000000020', 'camada44-bc-v1'
WHERE NOT EXISTS (
  SELECT 1 FROM passenger_account_production_config WHERE config_version = 'camada44-bc-v1'
);

CREATE TABLE IF NOT EXISTS passenger_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  gender TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
  identity_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (identity_status IN ('pending', 'verified', 'rejected')),
  two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  recovery_phone TEXT,
  password_changed_at TIMESTAMPTZ,
  preferred_language TEXT NOT NULL DEFAULT 'pt-BR',
  config_version TEXT NOT NULL DEFAULT 'camada44-v1',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS passenger_wallet_accounts (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance_centavos INT NOT NULL DEFAULT 0 CHECK (balance_centavos >= 0),
  currency TEXT NOT NULL DEFAULT 'BRL',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS passenger_wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'credit', 'debit', 'ride_payment', 'refund', 'topup', 'promo_credit'
  )),
  title TEXT NOT NULL,
  amount_centavos INT NOT NULL,
  balance_after_centavos INT,
  reference_type TEXT,
  reference_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_passenger_wallet_tx_user
  ON passenger_wallet_transactions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS passenger_inbox_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'system',
  title TEXT NOT NULL,
  preview TEXT NOT NULL,
  body TEXT NOT NULL,
  icon_type TEXT NOT NULL DEFAULT 'info',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_passenger_inbox_user
  ON passenger_inbox_messages(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS passenger_profile_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_passenger_profile_events_user
  ON passenger_profile_events(user_id, created_at DESC);
