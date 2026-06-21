-- Camada 17: Rotas múltiplas com tarifa por estratégia + seleção do passageiro

ALTER TABLE rides ADD COLUMN IF NOT EXISTS route_request_id UUID REFERENCES route_requests(id) ON DELETE SET NULL;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS route_strategy TEXT
  CHECK (route_strategy IS NULL OR route_strategy IN ('fastest', 'shortest', 'economical', 'less_traffic'));

ALTER TABLE route_alternatives ADD COLUMN IF NOT EXISTS estimated_fare_centavos INT;
ALTER TABLE route_alternatives ADD COLUMN IF NOT EXISTS traffic_surcharge_centavos INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS route_selection_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  request_id UUID NOT NULL REFERENCES route_requests(id) ON DELETE CASCADE,
  ride_id UUID REFERENCES rides(id) ON DELETE SET NULL,
  strategy TEXT NOT NULL CHECK (strategy IN ('fastest', 'shortest', 'economical', 'less_traffic')),
  category_code TEXT,
  estimated_fare_centavos INT NOT NULL,
  previous_strategy TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_route_selection_user ON route_selection_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_route_selection_request ON route_selection_events(request_id, created_at DESC);
