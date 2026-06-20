-- Camada 6: Rotas inteligentes + clima regional (guia §287–346, §631–638)

CREATE TABLE IF NOT EXISTS service_regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id TEXT NOT NULL DEFAULT 'balneario-camboriu',
  name TEXT NOT NULL,
  center_lat DOUBLE PRECISION NOT NULL,
  center_lng DOUBLE PRECISION NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO service_regions (id, city_id, name, center_lat, center_lng)
VALUES ('00000000-0000-4000-8000-000000000020', 'balneario-camboriu', 'Balneário Camboriú / BC', -26.9905, -48.6348)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS weather_region_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID NOT NULL REFERENCES service_regions(id) ON DELETE CASCADE,
  weather_state TEXT NOT NULL CHECK (weather_state IN ('CLEAR', 'LIGHT_RAIN', 'MODERATE_RAIN', 'HEAVY_RAIN', 'STORM')),
  intensity_index DOUBLE PRECISION NOT NULL DEFAULT 0,
  weather_pressure DOUBLE PRECISION NOT NULL DEFAULT 0,
  precipitation_mm DOUBLE PRECISION,
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0.85,
  source TEXT NOT NULL DEFAULT 'open-meteo',
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_json JSONB
);

CREATE INDEX IF NOT EXISTS idx_weather_region_snapshots ON weather_region_snapshots(region_id, snapshot_at DESC);

CREATE TABLE IF NOT EXISTS route_toll_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID REFERENCES service_regions(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  cost_centavos INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS route_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  from_lat DOUBLE PRECISION NOT NULL,
  from_lng DOUBLE PRECISION NOT NULL,
  to_lat DOUBLE PRECISION NOT NULL,
  to_lng DOUBLE PRECISION NOT NULL,
  waypoints_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  selected_strategy TEXT NOT NULL DEFAULT 'fastest',
  distance_m INT NOT NULL,
  eta_seconds INT NOT NULL,
  tolls_total_centavos INT NOT NULL DEFAULT 0,
  traffic_level_index DOUBLE PRECISION NOT NULL DEFAULT 0,
  incident_count INT NOT NULL DEFAULT 0,
  deviation_risk_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  route_polyline JSONB,
  source TEXT NOT NULL DEFAULT 'mapbox',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_route_requests_user ON route_requests(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS route_alternatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES route_requests(id) ON DELETE CASCADE,
  strategy TEXT NOT NULL CHECK (strategy IN ('fastest', 'shortest', 'economical', 'less_traffic')),
  distance_m INT NOT NULL,
  eta_seconds INT NOT NULL,
  tolls_total_centavos INT NOT NULL DEFAULT 0,
  traffic_level_index DOUBLE PRECISION NOT NULL DEFAULT 0,
  incident_count INT NOT NULL DEFAULT 0,
  deviation_risk_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  generalized_cost DOUBLE PRECISION NOT NULL,
  route_polyline JSONB,
  is_recommended BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (request_id, strategy)
);

CREATE INDEX IF NOT EXISTS idx_route_alternatives_request ON route_alternatives(request_id);

CREATE TABLE IF NOT EXISTS active_route_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL UNIQUE REFERENCES rides(id) ON DELETE CASCADE,
  request_id UUID REFERENCES route_requests(id) ON DELETE SET NULL,
  strategy TEXT NOT NULL DEFAULT 'fastest',
  distance_m INT NOT NULL,
  eta_seconds INT NOT NULL,
  tolls_total_centavos INT NOT NULL DEFAULT 0,
  traffic_level_index DOUBLE PRECISION NOT NULL DEFAULT 0,
  route_polyline JSONB,
  last_recalculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS route_recalculation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  active_route_id UUID REFERENCES active_route_states(id) ON DELETE SET NULL,
  reason_code TEXT NOT NULL,
  eta_delta_seconds INT,
  previous_eta_seconds INT,
  new_eta_seconds INT,
  metadata_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_route_recalc_ride ON route_recalculation_events(ride_id, created_at DESC);
