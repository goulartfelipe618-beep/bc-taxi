-- Camada 42: Backoffice ops produção — console unificado, fila de tarefas, ações auditadas (guia §734, §872, §906)

CREATE TABLE IF NOT EXISTS backoffice_production_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID REFERENCES pricing_regions(id) ON DELETE SET NULL,
  task_queue_limit INT NOT NULL DEFAULT 50,
  critical_alert_auto_escalate_minutes INT NOT NULL DEFAULT 30,
  config_version TEXT NOT NULL DEFAULT 'camada42-v1',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO backoffice_production_config (region_id, config_version)
SELECT '00000000-0000-4000-8000-000000000010', 'camada42-bc-v1'
WHERE NOT EXISTS (
  SELECT 1 FROM backoffice_production_config WHERE config_version = 'camada42-bc-v1'
);

CREATE TABLE IF NOT EXISTS backoffice_operator_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_label TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'alert_acknowledged',
    'alert_resolved',
    'fraud_case_cleared',
    'fraud_case_confirmed',
    'driver_delivery_restricted',
    'corporate_approval_granted',
    'task_dismissed'
  )),
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  result_status TEXT NOT NULL CHECK (result_status IN ('ok', 'failed', 'skipped')),
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backoffice_operator_actions_created
  ON backoffice_operator_actions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_backoffice_operator_actions_target
  ON backoffice_operator_actions(target_type, target_id, created_at DESC);
