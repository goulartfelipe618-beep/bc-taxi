-- Camada 30: OpenAI assíncrono — inferências consultivas, feature store, recomendações versionadas (guia §566–589)

CREATE TABLE IF NOT EXISTS ai_feature_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_set_id TEXT NOT NULL UNIQUE,
  use_case TEXT NOT NULL CHECK (use_case IN (
    'fraud_case_summary',
    'demand_forecast',
    'dynamic_pressure_hint',
    'review_sentiment',
    'ops_supply_insight'
  )),
  region_id UUID REFERENCES service_regions(id) ON DELETE SET NULL,
  features_json JSONB NOT NULL DEFAULT '{}',
  pii_masked BOOLEAN NOT NULL DEFAULT TRUE,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_feature_snapshots_use_case
  ON ai_feature_snapshots(use_case, captured_at DESC);

CREATE TABLE IF NOT EXISTS ai_inference_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  use_case TEXT NOT NULL CHECK (use_case IN (
    'fraud_case_summary',
    'demand_forecast',
    'dynamic_pressure_hint',
    'review_sentiment',
    'ops_supply_insight'
  )),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  input_feature_set_id TEXT NOT NULL,
  model_version TEXT NOT NULL DEFAULT 'deterministic-v1',
  prompt_hash TEXT NOT NULL,
  confidence NUMERIC(5, 4),
  output_json JSONB,
  error_message TEXT,
  source_ref TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_inference_jobs_status ON ai_inference_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_inference_jobs_use_case ON ai_inference_jobs(use_case, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  use_case TEXT NOT NULL,
  region_id UUID REFERENCES service_regions(id) ON DELETE SET NULL,
  job_id UUID REFERENCES ai_inference_jobs(id) ON DELETE SET NULL,
  recommendation_version INT NOT NULL DEFAULT 1,
  model_version TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  input_feature_set_id TEXT NOT NULL,
  confidence NUMERIC(5, 4) NOT NULL,
  summary TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_recommendations_active
  ON ai_recommendations(use_case, region_id, created_at DESC) WHERE is_active = TRUE;
