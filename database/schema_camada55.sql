-- Camada 55: Ajuda e segurança produção — centro de ajuda, contactos de confiança, partilha de viagem (guia §500, §534–565, §647, §906)

CREATE TABLE IF NOT EXISTS safety_help_production_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID REFERENCES service_regions(id) ON DELETE SET NULL,
  config_version TEXT NOT NULL DEFAULT 'camada55-v1',
  help_center_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  safety_tools_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  trusted_contacts_max INT NOT NULL DEFAULT 5,
  ride_share_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  emergency_hotline TEXT NOT NULL DEFAULT '190',
  support_phone TEXT NOT NULL DEFAULT '0800 000 0000',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO safety_help_production_config (region_id, config_version)
SELECT '00000000-0000-4000-8000-000000000020', 'camada55-bc-v1'
WHERE NOT EXISTS (
  SELECT 1 FROM safety_help_production_config WHERE config_version = 'camada55-bc-v1'
);

CREATE TABLE IF NOT EXISTS user_trusted_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone_masked TEXT NOT NULL,
  relationship_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_trusted_contacts_user
  ON user_trusted_contacts(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS help_inquiry_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_code TEXT NOT NULL,
  search_query TEXT,
  channel TEXT NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app', 'phone', 'chat')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_help_inquiry_events_user
  ON help_inquiry_events(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS safety_share_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ride_id UUID REFERENCES rides(id) ON DELETE SET NULL,
  share_token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_safety_share_events_user
  ON safety_share_events(user_id, created_at DESC);
