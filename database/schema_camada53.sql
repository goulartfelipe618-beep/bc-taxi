-- Camada 53: Agendamento passageiro produção — dashboard, reagendamento, lembretes (guia §14, §94, §708–713)

CREATE TABLE IF NOT EXISTS passenger_schedule_production_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID REFERENCES service_regions(id) ON DELETE SET NULL,
  config_version TEXT NOT NULL DEFAULT 'camada53-v1',
  min_lead_minutes INT NOT NULL DEFAULT 30,
  max_lead_days INT NOT NULL DEFAULT 30,
  default_dispatch_lead_minutes INT NOT NULL DEFAULT 15,
  reschedule_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  reminders_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  reminder_minutes_before INT NOT NULL DEFAULT 60,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO passenger_schedule_production_config (region_id, config_version)
SELECT '00000000-0000-4000-8000-000000000020', 'camada53-bc-v1'
WHERE NOT EXISTS (
  SELECT 1 FROM passenger_schedule_production_config WHERE config_version = 'camada53-bc-v1'
);

CREATE TABLE IF NOT EXISTS schedule_reminder_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_ride_id UUID NOT NULL REFERENCES scheduled_rides(id) ON DELETE CASCADE,
  passenger_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL DEFAULT 'pre_dispatch' CHECK (reminder_type IN ('pre_dispatch', 'dispatch_soon')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scheduled_ride_id, reminder_type)
);

CREATE INDEX IF NOT EXISTS idx_schedule_reminder_passenger
  ON schedule_reminder_events(passenger_id, sent_at DESC);
