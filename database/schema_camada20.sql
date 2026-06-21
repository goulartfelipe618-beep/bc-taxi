-- Camada 20: Reputação produção — obrigações de avaliação, badges, revogação de benefícios (guia §115–184)

CREATE TABLE IF NOT EXISTS ride_review_obligations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  reviewer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewed_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewer_role TEXT NOT NULL CHECK (reviewer_role IN ('passenger', 'driver')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  review_id UUID REFERENCES ride_reviews(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ride_id, reviewer_user_id)
);

CREATE INDEX IF NOT EXISTS idx_review_obligations_reviewer_pending
  ON ride_review_obligations(reviewer_user_id, expires_at)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS reputation_badges (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  applies_to TEXT NOT NULL CHECK (applies_to IN ('driver', 'passenger', 'both')),
  tier_required TEXT,
  min_reviews INT,
  icon TEXT
);

INSERT INTO reputation_badges (code, label, description, applies_to, tier_required, min_reviews, icon) VALUES
  ('elite_passenger', 'Passageiro Elite', 'Reputação Elite na plataforma', 'passenger', 'elite', NULL, 'star'),
  ('premium_passenger', 'Passageiro Premium', 'Reputação Premium na plataforma', 'passenger', 'premium', NULL, 'star_half'),
  ('elite_driver', 'Motorista Elite', 'Reputação Elite com excelência operacional', 'driver', 'elite', 50, 'verified'),
  ('premium_driver', 'Motorista Premium', 'Reputação Premium com histórico sólido', 'driver', 'premium', 20, 'shield'),
  ('five_star_streak', 'Sequência 5 estrelas', '10 avaliações consecutivas com 5 estrelas', 'both', NULL, 10, 'local_fire_department'),
  ('trusted_payer', 'Pagador confiável', 'Histórico consistente de pagamentos bem-sucedidos', 'passenger', 'confiavel', NULL, 'payments')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS user_reputation_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_code TEXT NOT NULL REFERENCES reputation_badges(code) ON DELETE CASCADE,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata_json JSONB NOT NULL DEFAULT '{}',
  UNIQUE (user_id, badge_code)
);

CREATE INDEX IF NOT EXISTS idx_user_rep_badges_user ON user_reputation_badges(user_id, awarded_at DESC);

CREATE TABLE IF NOT EXISTS reputation_benefit_revocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_role TEXT NOT NULL CHECK (user_role IN ('passenger', 'driver')),
  reason TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('fraud', 'gps_spoof', 'admin', 'policy')),
  source_ref TEXT,
  revoked_until TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rep_revocations_active
  ON reputation_benefit_revocations(user_id, user_role)
  WHERE is_active = TRUE;
