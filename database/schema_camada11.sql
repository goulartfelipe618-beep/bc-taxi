-- Camada 11: Cupons/promoções + agendamento + admin dashboard (guia §412, §533, §653, §872)

CREATE TABLE IF NOT EXISTS promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value INT NOT NULL,
  max_discount_centavos INT,
  min_fare_centavos INT NOT NULL DEFAULT 0,
  max_redemptions INT,
  max_per_user INT NOT NULL DEFAULT 1,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_to TIMESTAMPTZ,
  category_codes TEXT[],
  cofunded_bps INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scheduled_rides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_code TEXT NOT NULL REFERENCES ride_categories(code),
  pickup_lat DOUBLE PRECISION NOT NULL,
  pickup_lng DOUBLE PRECISION NOT NULL,
  pickup_address TEXT,
  dropoff_lat DOUBLE PRECISION NOT NULL,
  dropoff_lng DOUBLE PRECISION NOT NULL,
  dropoff_address TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'dispatched', 'cancelled', 'failed')),
  ride_id UUID REFERENCES rides(id) ON DELETE SET NULL,
  payment_method_id UUID,
  estimated_fare_centavos INT,
  promo_code TEXT,
  discount_centavos INT NOT NULL DEFAULT 0,
  dispatch_lead_minutes INT NOT NULL DEFAULT 15,
  dispatched_at TIMESTAMPTZ,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_rides_passenger ON scheduled_rides(passenger_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_scheduled_rides_dispatch ON scheduled_rides(status, scheduled_at)
  WHERE status IN ('pending', 'confirmed');

CREATE TABLE IF NOT EXISTS coupon_redemption_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ride_id UUID REFERENCES rides(id) ON DELETE SET NULL,
  scheduled_ride_id UUID REFERENCES scheduled_rides(id) ON DELETE SET NULL,
  discount_centavos INT NOT NULL,
  fare_before_centavos INT NOT NULL,
  fare_after_centavos INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'voided')),
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupon_redemption_user ON coupon_redemption_audit(user_id, promo_code_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemption_promo ON coupon_redemption_audit(promo_code_id, created_at DESC);

INSERT INTO promo_codes (code, label, discount_type, discount_value, max_discount_centavos, max_per_user, valid_to)
VALUES
  ('BCTAXI10', '10% de desconto', 'percent', 10, 800, 5, NOW() + INTERVAL '365 days'),
  ('PRIMEIRA15', 'R$ 15 na primeira corrida', 'fixed', 1500, NULL, 1, NOW() + INTERVAL '365 days')
ON CONFLICT (code) DO NOTHING;
