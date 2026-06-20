-- Camada 7: reputação completa (guia §115–184)

CREATE TABLE IF NOT EXISTS review_tags (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  applies_to TEXT NOT NULL CHECK (applies_to IN ('driver', 'passenger', 'both')),
  is_positive BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO review_tags (code, label, applies_to, is_positive) VALUES
  ('pontualidade', 'Pontualidade', 'both', TRUE),
  ('cordialidade', 'Cordialidade', 'both', TRUE),
  ('direcao', 'Direção segura', 'driver', TRUE),
  ('limpeza', 'Limpeza', 'driver', TRUE),
  ('respeito', 'Respeito', 'both', TRUE),
  ('seguranca', 'Segurança', 'both', TRUE),
  ('comportamento', 'Bom comportamento', 'both', TRUE),
  ('localizacao_incorreta', 'Localização incorreta', 'both', FALSE),
  ('atraso', 'Atraso', 'both', FALSE),
  ('bagagem', 'Bagagem', 'both', TRUE),
  ('pet', 'Pet', 'both', TRUE),
  ('pcd', 'Atendimento PCD', 'driver', TRUE),
  ('pagamento', 'Pagamento', 'passenger', TRUE),
  ('rota', 'Rota', 'driver', TRUE)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS ride_review_tag_links (
  review_id UUID NOT NULL REFERENCES ride_reviews(id) ON DELETE CASCADE,
  tag_code TEXT NOT NULL REFERENCES review_tags(code) ON DELETE CASCADE,
  PRIMARY KEY (review_id, tag_code)
);

CREATE INDEX IF NOT EXISTS idx_ride_review_tags_review ON ride_review_tag_links(review_id);

CREATE TABLE IF NOT EXISTS driver_reputation_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  direct_score NUMERIC(5, 4) NOT NULL,
  operational_stability NUMERIC(5, 4) NOT NULL DEFAULT 0,
  pickup_punctuality NUMERIC(5, 4) NOT NULL DEFAULT 0,
  route_adherence NUMERIC(5, 4) NOT NULL DEFAULT 0,
  document_quality NUMERIC(5, 4) NOT NULL DEFAULT 0,
  composite_score NUMERIC(5, 4) NOT NULL,
  tier TEXT NOT NULL,
  review_count INT NOT NULL DEFAULT 0,
  weighted_review_count NUMERIC(10, 4) NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_driver_rep_snapshots ON driver_reputation_snapshots(driver_user_id, snapshot_at DESC);

CREATE TABLE IF NOT EXISTS passenger_reputation_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  direct_score NUMERIC(5, 4) NOT NULL,
  boarding_presence NUMERIC(5, 4) NOT NULL DEFAULT 0,
  payment_success NUMERIC(5, 4) NOT NULL DEFAULT 0,
  late_cancel_index NUMERIC(5, 4) NOT NULL DEFAULT 0,
  behavior_index NUMERIC(5, 4) NOT NULL DEFAULT 0,
  composite_score NUMERIC(5, 4) NOT NULL,
  tier TEXT NOT NULL,
  review_count INT NOT NULL DEFAULT 0,
  weighted_review_count NUMERIC(10, 4) NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_passenger_rep_snapshots ON passenger_reputation_snapshots(passenger_user_id, snapshot_at DESC);

ALTER TABLE users ADD COLUMN IF NOT EXISTS reputation_tier TEXT NOT NULL DEFAULT 'confiavel';
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS reputation_tier TEXT NOT NULL DEFAULT 'confiavel';
ALTER TABLE users ADD COLUMN IF NOT EXISTS reputation_monitoring BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS reputation_monitoring BOOLEAN NOT NULL DEFAULT FALSE;
