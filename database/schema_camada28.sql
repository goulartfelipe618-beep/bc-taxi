-- Camada 28: Abuso de cupons — limites multi-identidade, incompatibilidade, score de elegibilidade (guia §555–559)

ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS promo_kind TEXT NOT NULL DEFAULT 'general';
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS campaign_id TEXT;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS incompatible_group TEXT;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS max_per_device INT;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS max_per_payment_fingerprint INT;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS max_per_region_daily INT;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES service_regions(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'promo_codes_promo_kind_check') THEN
    ALTER TABLE promo_codes ADD CONSTRAINT promo_codes_promo_kind_check
      CHECK (promo_kind IN ('general', 'acquisition', 'retention', 'referral'));
  END IF;
END $$;

UPDATE promo_codes SET promo_kind = 'acquisition', max_per_device = 1, max_per_payment_fingerprint = 1, incompatible_group = 'first_ride'
WHERE code = 'PRIMEIRA15';

UPDATE promo_codes SET incompatible_group = 'percent_stack', max_per_device = 3
WHERE code = 'BCTAXI10';

CREATE TABLE IF NOT EXISTS coupon_abuse_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  abuse_score NUMERIC(5, 4) NOT NULL DEFAULT 0,
  promo_eligibility_factor NUMERIC(5, 4) NOT NULL DEFAULT 1.0,
  blocked_until TIMESTAMPTZ,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coupon_abuse_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  promo_code_id UUID REFERENCES promo_codes(id) ON DELETE SET NULL,
  device_id TEXT,
  payment_fingerprint_hash TEXT,
  region_id UUID REFERENCES service_regions(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'VALIDATION_BLOCKED',
    'IDENTITY_REUSE',
    'DEVICE_LIMIT',
    'REGION_LIMIT',
    'INCOMPATIBLE_GROUP',
    'ELIGIBILITY_REDUCED'
  )),
  reason_code TEXT NOT NULL,
  abuse_delta NUMERIC(5, 4) NOT NULL DEFAULT 0.05,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupon_abuse_events_user
  ON coupon_abuse_events(user_id, created_at DESC);

ALTER TABLE coupon_redemption_audit ADD COLUMN IF NOT EXISTS device_id TEXT;
ALTER TABLE coupon_redemption_audit ADD COLUMN IF NOT EXISTS payment_fingerprint_hash TEXT;
ALTER TABLE coupon_redemption_audit ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES service_regions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_coupon_redemption_device
  ON coupon_redemption_audit(promo_code_id, device_id) WHERE device_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coupon_redemption_fingerprint
  ON coupon_redemption_audit(promo_code_id, payment_fingerprint_hash)
  WHERE payment_fingerprint_hash IS NOT NULL;
