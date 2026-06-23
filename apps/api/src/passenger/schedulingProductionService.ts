import { config } from '../config.js';
import { formatFare } from '../domain/pricing.js';
import { getCategory } from '../domain/rideCategories.js';
import type { RideCategoryCode } from '../domain/types.js';
import { pool } from '../db.js';
import {
  cancelScheduledRide,
  createScheduledRide,
  listPassengerSchedules,
  type ScheduledRideRecord,
  toPublicScheduledRide,
} from '../scheduling/scheduleService.js';

export interface PassengerScheduleProductionConfig {
  configVersion: string;
  minLeadMinutes: number;
  maxLeadDays: number;
  defaultDispatchLeadMinutes: number;
  rescheduleEnabled: boolean;
  remindersEnabled: boolean;
  reminderMinutesBefore: number;
}

export interface EnrichedScheduledRide {
  id: string;
  categoryCode: string;
  categoryLabel: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  scheduledAt: string;
  scheduledLabel: string;
  dispatchAt: string;
  dispatchLabel: string;
  minutesUntilPickup: number;
  status: string;
  statusLabel: string;
  rideId?: string;
  estimatedFareCentavos?: number;
  fareLabel?: string;
  discountCentavos: number;
  promoCode?: string;
  canCancel: boolean;
  canReschedule: boolean;
}

const memoryConfig: PassengerScheduleProductionConfig = {
  configVersion: 'camada53-memory-v1',
  minLeadMinutes: 30,
  maxLeadDays: 30,
  defaultDispatchLeadMinutes: 15,
  rescheduleEnabled: true,
  remindersEnabled: true,
  reminderMinutesBefore: 60,
};

const memoryReminders = new Set<string>();

function formatScheduleDate(date: Date): string {
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).replace(',', ' ·');
}

function statusLabel(status: string): string {
  switch (status) {
    case 'confirmed':
      return 'Confirmado';
    case 'pending':
      return 'Pendente';
    case 'dispatched':
      return 'Despachado';
    case 'cancelled':
      return 'Cancelado';
    case 'failed':
      return 'Falhou';
    default:
      return status;
  }
}

export async function getPassengerScheduleProductionConfig(): Promise<PassengerScheduleProductionConfig> {
  if (config.useMemoryDb) return { ...memoryConfig };

  const { rows } = await pool.query(
    `SELECT * FROM passenger_schedule_production_config WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1`,
  );
  const r = rows[0];
  if (!r) return { ...memoryConfig, configVersion: 'camada53-v1' };
  return {
    configVersion: r.config_version as string,
    minLeadMinutes: Number(r.min_lead_minutes),
    maxLeadDays: Number(r.max_lead_days),
    defaultDispatchLeadMinutes: Number(r.default_dispatch_lead_minutes),
    rescheduleEnabled: Boolean(r.reschedule_enabled),
    remindersEnabled: Boolean(r.reminders_enabled),
    reminderMinutesBefore: Number(r.reminder_minutes_before),
  };
}

function assertScheduledAtForConfig(scheduledAt: Date, cfg: PassengerScheduleProductionConfig) {
  const deltaMs = scheduledAt.getTime() - Date.now();
  const minMs = cfg.minLeadMinutes * 60_000;
  const maxMs = cfg.maxLeadDays * 24 * 60 * 60_000;
  if (deltaMs < minMs) {
    throw new Error(`Agendamento deve ser com pelo menos ${cfg.minLeadMinutes} minutos de antecedência`);
  }
  if (deltaMs > maxMs) {
    throw new Error(`Agendamento limitado a ${cfg.maxLeadDays} dias`);
  }
}

function enrichSchedule(
  schedule: ScheduledRideRecord,
  cfg: PassengerScheduleProductionConfig,
): EnrichedScheduledRide {
  const category = getCategory(schedule.categoryCode as RideCategoryCode);
  const dispatchAt = new Date(schedule.scheduledAt.getTime() - schedule.dispatchLeadMinutes * 60_000);
  const minutesUntilPickup = Math.max(0, Math.round((schedule.scheduledAt.getTime() - Date.now()) / 60_000));
  const editable = schedule.status === 'confirmed' || schedule.status === 'pending';
  const leadOk = schedule.scheduledAt.getTime() - Date.now() > cfg.minLeadMinutes * 60_000;

  return {
    ...toPublicScheduledRide(schedule),
    categoryLabel: category?.name ?? schedule.categoryCode,
    scheduledLabel: formatScheduleDate(schedule.scheduledAt),
    dispatchAt: dispatchAt.toISOString(),
    dispatchLabel: formatScheduleDate(dispatchAt),
    minutesUntilPickup,
    statusLabel: statusLabel(schedule.status),
    fareLabel:
      schedule.estimatedFareCentavos != null ? formatFare(schedule.estimatedFareCentavos) : undefined,
    canCancel: editable,
    canReschedule: cfg.rescheduleEnabled && editable && leadOk,
  };
}

export async function getPassengerScheduleDashboard(passengerId: string) {
  const cfg = await getPassengerScheduleProductionConfig();
  const schedules = await listPassengerSchedules(passengerId);
  const enriched = schedules.map((s) => enrichSchedule(s, cfg));
  const now = Date.now();

  const upcoming = enriched
    .filter(
      (s) =>
        ['confirmed', 'pending', 'dispatched'].includes(s.status) &&
        new Date(s.scheduledAt).getTime() >= now - 60_000,
    )
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  const upcomingIds = new Set(upcoming.map((s) => s.id));
  const past = enriched
    .filter((s) => !upcomingIds.has(s.id))
    .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());

  const reminders = cfg.remindersEnabled
    ? upcoming
        .filter((s) => s.minutesUntilPickup <= cfg.reminderMinutesBefore && s.status === 'confirmed')
        .map((s) => ({
          scheduleId: s.id,
          title: 'Corrida agendada em breve',
          body: `Pickup às ${s.scheduledLabel} — ${s.dropoffAddress ?? 'destino'}`,
        }))
    : [];

  return {
    configVersion: cfg.configVersion,
    features: {
      rescheduleEnabled: cfg.rescheduleEnabled,
      remindersEnabled: cfg.remindersEnabled,
      minLeadMinutes: cfg.minLeadMinutes,
      maxLeadDays: cfg.maxLeadDays,
    },
    upcoming,
    past,
    reminders,
    stats: {
      upcomingCount: upcoming.length,
      pastCount: past.length,
    },
  };
}

export async function getPassengerScheduleDetail(passengerId: string, scheduleId: string) {
  const cfg = await getPassengerScheduleProductionConfig();
  const schedules = await listPassengerSchedules(passengerId);
  const schedule = schedules.find((s) => s.id === scheduleId);
  if (!schedule) throw new Error('Agendamento não encontrado');
  return enrichSchedule(schedule, cfg);
}

export async function createPassengerScheduleProduction(input: {
  passengerId: string;
  categoryCode: string;
  pickupLat: number;
  pickupLng: number;
  pickupAddress?: string;
  dropoffLat: number;
  dropoffLng: number;
  dropoffAddress?: string;
  scheduledAt: Date;
  paymentMethodId?: string;
  estimatedFareCentavos?: number;
  promoCode?: string;
  dispatchLeadMinutes?: number;
}) {
  const cfg = await getPassengerScheduleProductionConfig();
  assertScheduledAtForConfig(input.scheduledAt, cfg);

  const schedule = await createScheduledRide({
    ...input,
    dispatchLeadMinutes: input.dispatchLeadMinutes ?? cfg.defaultDispatchLeadMinutes,
  });

  return enrichSchedule(schedule, cfg);
}

export async function reschedulePassengerSchedule(
  passengerId: string,
  scheduleId: string,
  scheduledAt: Date,
) {
  const cfg = await getPassengerScheduleProductionConfig();
  if (!cfg.rescheduleEnabled) throw new Error('Reagendamento desabilitado');
  assertScheduledAtForConfig(scheduledAt, cfg);

  if (config.useMemoryDb) {
    const schedules = await listPassengerSchedules(passengerId);
    const schedule = schedules.find((s) => s.id === scheduleId);
    if (!schedule) throw new Error('Agendamento não encontrado');
    if (!['confirmed', 'pending'].includes(schedule.status)) {
      throw new Error('Agendamento não pode ser reagendado');
    }
    schedule.scheduledAt = scheduledAt;
    schedule.updatedAt = new Date();
    return enrichSchedule(schedule, cfg);
  }

  const { rows } = await pool.query(
    `UPDATE scheduled_rides SET scheduled_at = $3, updated_at = NOW()
     WHERE id = $1 AND passenger_id = $2 AND status IN ('confirmed', 'pending')
     RETURNING *`,
    [scheduleId, passengerId, scheduledAt],
  );
  if (!rows[0]) throw new Error('Agendamento não encontrado ou não reagendável');

  const schedule: ScheduledRideRecord = {
    id: rows[0].id as string,
    passengerId: rows[0].passenger_id as string,
    categoryCode: rows[0].category_code as string,
    pickupLat: Number(rows[0].pickup_lat),
    pickupLng: Number(rows[0].pickup_lng),
    pickupAddress: (rows[0].pickup_address as string) ?? undefined,
    dropoffLat: Number(rows[0].dropoff_lat),
    dropoffLng: Number(rows[0].dropoff_lng),
    dropoffAddress: (rows[0].dropoff_address as string) ?? undefined,
    scheduledAt: new Date(rows[0].scheduled_at as string),
    status: rows[0].status as ScheduledRideRecord['status'],
    rideId: (rows[0].ride_id as string) ?? undefined,
    paymentMethodId: (rows[0].payment_method_id as string) ?? undefined,
    estimatedFareCentavos:
      rows[0].estimated_fare_centavos != null ? Number(rows[0].estimated_fare_centavos) : undefined,
    promoCode: (rows[0].promo_code as string) ?? undefined,
    discountCentavos: Number(rows[0].discount_centavos ?? 0),
    dispatchLeadMinutes: Number(rows[0].dispatch_lead_minutes ?? 15),
    createdAt: new Date(rows[0].created_at as string),
    updatedAt: new Date(rows[0].updated_at as string),
  };

  return enrichSchedule(schedule, cfg);
}

export async function cancelPassengerScheduleProduction(
  passengerId: string,
  scheduleId: string,
  reason?: string,
) {
  const cfg = await getPassengerScheduleProductionConfig();
  const schedule = await cancelScheduledRide(scheduleId, passengerId, reason);
  return enrichSchedule(schedule, cfg);
}

export function __testResetPassengerScheduleProductionMemory() {
  memoryReminders.clear();
  Object.assign(memoryConfig, {
    configVersion: 'camada53-memory-v1',
    minLeadMinutes: 30,
    maxLeadDays: 30,
    defaultDispatchLeadMinutes: 15,
    rescheduleEnabled: true,
    remindersEnabled: true,
    reminderMinutesBefore: 60,
  });
}

export function seedMemoryPassengerScheduleProductionConfig(
  patch: Partial<PassengerScheduleProductionConfig> = {},
): PassengerScheduleProductionConfig {
  Object.assign(memoryConfig, patch);
  return { ...memoryConfig };
}
