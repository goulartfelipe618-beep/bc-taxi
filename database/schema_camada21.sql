-- Camada 21: Van / Micro-ônibus — transporte coletivo agendado (guia §83–98)

CREATE TABLE IF NOT EXISTS collective_transport_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_code TEXT NOT NULL CHECK (category_code IN ('van', 'micro_onibus')),
  scheduled_ride_id UUID REFERENCES scheduled_rides(id) ON DELETE SET NULL,
  ride_id UUID REFERENCES rides(id) ON DELETE SET NULL,
  passenger_count INT NOT NULL CHECK (passenger_count >= 1),
  baggage_count INT NOT NULL DEFAULT 0 CHECK (baggage_count >= 0),
  is_airport_shuttle BOOLEAN NOT NULL DEFAULT FALSE,
  is_large_group BOOLEAN NOT NULL DEFAULT FALSE,
  group_label TEXT,
  pickup_notes TEXT,
  estimated_fare_centavos INT NOT NULL,
  multiplier_breakdown JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'dispatched', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_collective_bookings_passenger
  ON collective_transport_bookings(passenger_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_collective_bookings_schedule
  ON collective_transport_bookings(scheduled_ride_id)
  WHERE scheduled_ride_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS driver_collective_certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  certification_type TEXT NOT NULL CHECK (certification_type IN ('collective_light', 'micro_bus')),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (driver_user_id, certification_type)
);

CREATE INDEX IF NOT EXISTS idx_driver_collective_certs_active
  ON driver_collective_certifications(driver_user_id)
  WHERE is_active = TRUE;
