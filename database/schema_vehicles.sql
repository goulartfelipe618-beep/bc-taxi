-- Veículos, documentos e compliance do motorista (guia §594–604, §821–824)

CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plate TEXT NOT NULL,
  renavam_hash TEXT,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year INT NOT NULL CHECK (year >= 1990 AND year <= 2100),
  color TEXT,
  body_type TEXT NOT NULL DEFAULT 'hatch',
  seat_count INT NOT NULL DEFAULT 4 CHECK (seat_count > 0),
  trunk_capacity_l INT,
  wheelchair_accessible BOOLEAN NOT NULL DEFAULT FALSE,
  pet_ready BOOLEAN NOT NULL DEFAULT FALSE,
  comfort_approved BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending_review')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_plate_active
  ON vehicles(plate) WHERE deleted_at IS NULL AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_vehicles_driver ON vehicles(driver_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS vehicle_categories (
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  category_code TEXT NOT NULL REFERENCES ride_categories(code),
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (vehicle_id, category_code)
);

CREATE TABLE IF NOT EXISTS driver_categories (
  driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_code TEXT NOT NULL REFERENCES ride_categories(code),
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (driver_id, category_code)
);

CREATE TABLE IF NOT EXISTS driver_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN (
    'CNH', 'IDENTITY', 'EAR_PROOF', 'DEFENSIVE_TRAINING', 'EXECUTIVE_TRAINING',
    'PET_TRAINING', 'PCD_TRAINING', 'AIRPORT_TRAINING', 'B2B_BILLING'
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  document_number_hash TEXT,
  expires_at DATE,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_documents_active
  ON driver_documents(driver_id, doc_type) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS vehicle_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN (
    'CRLV', 'INSURANCE', 'COMFORT_CHECKLIST', 'PCD_ADAPTATION', 'AIRPORT_AUTHORIZATION', 'INSPECTION'
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  expires_at DATE,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_documents_active
  ON vehicle_documents(vehicle_id, doc_type) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS driver_training_certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  certification_code TEXT NOT NULL,
  completed_at DATE NOT NULL,
  expires_at DATE,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (driver_id, certification_code)
);

CREATE TABLE IF NOT EXISTS driver_operational_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  flag_code TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  reason TEXT,
  expires_at TIMESTAMPTZ,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_flags_active ON driver_operational_flags(driver_id) WHERE is_active = TRUE;

ALTER TABLE drivers ADD COLUMN IF NOT EXISTS primary_vehicle_id UUID REFERENCES vehicles(id);
