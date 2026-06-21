import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { useMemory } from '../stores/memoryMatchStore.js';
import { haversineMeters } from '../match/eligibility.js';
import type { RideRecord } from '../match/types.js';
import { recordFraudSignal } from './fraudService.js';
import { recordTraceSpan, generateTraceId } from '../observability/traceService.js';

export type SuspiciousFlagType =
  | 'MICRO_RIDE_REPEAT'
  | 'PAIR_LOOP'
  | 'TOO_FAST_COMPLETE'
  | 'TOO_SLOW_COMPLETE'
  | 'EXTREME_ROUTE_DEVIATION'
  | 'COORDINATED_CANCEL';

export interface SuspiciousRideFlag {
  id: string;
  rideId?: string;
  passengerId: string;
  driverId?: string;
  flagType: SuspiciousFlagType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  summary: string;
  metadata?: Record<string, unknown>;
  status: string;
  createdAt: Date;
}

interface PairStats {
  passengerId: string;
  driverId: string;
  completedCount7d: number;
  microRideCount7d: number;
  cancelledCount48h: number;
  completedCount24h: number;
  lastCompletedAt?: Date;
  lastCancelledAt?: Date;
}

const MICRO_RIDE_KM = 0.8;
const MICRO_RIDE_REPEAT_MIN = 3;
const PAIR_LOOP_24H_MIN = 4;
const COORDINATED_CANCEL_48H_MIN = 3;
const TOO_FAST_MIN_DISTANCE_M = 2000;
const TOO_FAST_MAX_DURATION_SEC = 120;
const EXTREME_DEVIATION_M = 1500;

const memoryFlags: SuspiciousRideFlag[] = [];
const memoryPairStats = new Map<string, PairStats>();
const memoryCompletedRides: Array<{
  rideId: string;
  passengerId: string;
  driverId: string;
  distanceM: number;
  durationSec: number;
  completedAt: Date;
}> = [];
const memoryCancelledRides: Array<{
  rideId: string;
  passengerId: string;
  driverId: string;
  cancelledAt: Date;
}> = [];

function pairKey(passengerId: string, driverId: string) {
  return `${passengerId}:${driverId}`;
}

function rideDistanceM(ride: RideRecord): number {
  return haversineMeters(ride.pickupLat, ride.pickupLng, ride.dropoffLat, ride.dropoffLng);
}

function rideDurationSec(ride: RideRecord): number | null {
  if (!ride.startedAt || !ride.completedAt) return null;
  return Math.max(0, (ride.completedAt.getTime() - ride.startedAt.getTime()) / 1000);
}

async function saveFlag(input: Omit<SuspiciousRideFlag, 'id' | 'createdAt' | 'status'>): Promise<SuspiciousRideFlag> {
  const flag: SuspiciousRideFlag = {
    id: randomUUID(),
    status: 'open',
    createdAt: new Date(),
    ...input,
  };

  if (useMemory()) {
    memoryFlags.push(flag);
  } else {
    const { rows } = await pool.query(
      `INSERT INTO suspicious_ride_flags
         (ride_id, passenger_id, driver_id, flag_type, severity, risk_score, summary, metadata_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, created_at`,
      [
        input.rideId ?? null,
        input.passengerId,
        input.driverId ?? null,
        input.flagType,
        input.severity,
        input.riskScore,
        input.summary,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    flag.id = rows[0].id as string;
    flag.createdAt = new Date(rows[0].created_at as string);
  }

  const traceId = generateTraceId();
  await recordTraceSpan({
    traceId,
    rideId: input.rideId,
    spanName: `suspicious_ride_${input.flagType.toLowerCase()}`,
    component: 'fraud',
    status: input.severity === 'critical' ? 'error' : 'degraded',
    metadata: { flagType: input.flagType, riskScore: input.riskScore },
  });

  if (input.riskScore >= 0.55) {
    const targetUserId = input.driverId ?? input.passengerId;
    await recordFraudSignal({
      userId: targetUserId,
      rideId: input.rideId,
      signalType: 'SUSPICIOUS_RIDE_PATTERN',
      metadata: { flagType: input.flagType, summary: input.summary },
    });
  }

  return flag;
}

async function upsertPairStats(input: {
  passengerId: string;
  driverId: string;
  completed?: { distanceM: number; at: Date };
  cancelled?: Date;
}) {
  const key = pairKey(input.passengerId, input.driverId);
  const now = Date.now();
  const day7 = now - 7 * 24 * 60 * 60 * 1000;
  const day1 = now - 24 * 60 * 60 * 1000;
  const hours48 = now - 48 * 60 * 60 * 1000;

  if (useMemory()) {
    if (input.completed) {
      memoryCompletedRides.push({
        rideId: randomUUID(),
        passengerId: input.passengerId,
        driverId: input.driverId,
        distanceM: input.completed.distanceM,
        durationSec: 0,
        completedAt: input.completed.at,
      });
    }
    if (input.cancelled) {
      memoryCancelledRides.push({
        rideId: randomUUID(),
        passengerId: input.passengerId,
        driverId: input.driverId,
        cancelledAt: input.cancelled,
      });
    }

    const completedRecent = memoryCompletedRides.filter(
      (r) =>
        r.passengerId === input.passengerId &&
        r.driverId === input.driverId &&
        r.completedAt.getTime() >= day7,
    );
    const stats: PairStats = {
      passengerId: input.passengerId,
      driverId: input.driverId,
      completedCount7d: completedRecent.length,
      microRideCount7d: completedRecent.filter((r) => r.distanceM < MICRO_RIDE_KM * 1000).length,
      cancelledCount48h: memoryCancelledRides.filter(
        (r) =>
          r.passengerId === input.passengerId &&
          r.driverId === input.driverId &&
          r.cancelledAt.getTime() >= hours48,
      ).length,
      completedCount24h: completedRecent.filter((r) => r.completedAt.getTime() >= day1).length,
      lastCompletedAt: input.completed?.at,
      lastCancelledAt: input.cancelled,
    };
    memoryPairStats.set(key, stats);
    return stats;
  }

  if (input.completed) {
    const isMicro = input.completed.distanceM < MICRO_RIDE_KM * 1000;
    await pool.query(
      `INSERT INTO ride_pair_pattern_stats
         (passenger_id, driver_id, completed_count_7d, micro_ride_count_7d, completed_count_24h, last_completed_at, updated_at)
       VALUES ($1,$2,1,$3,1,$4,NOW())
       ON CONFLICT (passenger_id, driver_id) DO UPDATE SET
         completed_count_7d = ride_pair_pattern_stats.completed_count_7d + 1,
         micro_ride_count_7d = ride_pair_pattern_stats.micro_ride_count_7d + $5,
         completed_count_24h = ride_pair_pattern_stats.completed_count_24h + 1,
         last_completed_at = EXCLUDED.last_completed_at,
         updated_at = NOW()`,
      [input.passengerId, input.driverId, isMicro ? 1 : 0, input.completed.at, isMicro ? 1 : 0],
    );
  }

  if (input.cancelled) {
    await pool.query(
      `INSERT INTO ride_pair_pattern_stats
         (passenger_id, driver_id, cancelled_count_48h, last_cancelled_at, updated_at)
       VALUES ($1,$2,1,$3,NOW())
       ON CONFLICT (passenger_id, driver_id) DO UPDATE SET
         cancelled_count_48h = ride_pair_pattern_stats.cancelled_count_48h + 1,
         last_cancelled_at = EXCLUDED.last_cancelled_at,
         updated_at = NOW()`,
      [input.passengerId, input.driverId, input.cancelled],
    );
  }

  const { rows } = await pool.query(
    `SELECT * FROM ride_pair_pattern_stats WHERE passenger_id = $1 AND driver_id = $2`,
    [input.passengerId, input.driverId],
  );
  const row = rows[0] as Record<string, unknown> | undefined;
  return {
    passengerId: input.passengerId,
    driverId: input.driverId,
    completedCount7d: Number(row?.completed_count_7d ?? 0),
    microRideCount7d: Number(row?.micro_ride_count_7d ?? 0),
    cancelledCount48h: Number(row?.cancelled_count_48h ?? 0),
    completedCount24h: Number(row?.completed_count_24h ?? 0),
    lastCompletedAt: row?.last_completed_at ? new Date(row.last_completed_at as string) : undefined,
    lastCancelledAt: row?.last_cancelled_at ? new Date(row.last_cancelled_at as string) : undefined,
  };
}

async function getMaxRouteDeviation(rideId: string): Promise<number> {
  if (useMemory()) return 0;
  const { rows } = await pool.query(
    `SELECT COALESCE(MAX(deviation_m), 0) AS max_dev FROM route_recalculation_events WHERE ride_id = $1`,
    [rideId],
  );
  return Number(rows[0]?.max_dev ?? 0);
}

export async function analyzeCompletedRide(ride: RideRecord): Promise<SuspiciousRideFlag[]> {
  if (!ride.driverId || ride.status !== 'COMPLETED') return [];

  const flags: SuspiciousRideFlag[] = [];
  const distanceM = rideDistanceM(ride);
  const durationSec = rideDurationSec(ride);

  const stats = await upsertPairStats({
    passengerId: ride.passengerId,
    driverId: ride.driverId,
    completed: { distanceM, at: ride.completedAt ?? new Date() },
  });

  if (distanceM < MICRO_RIDE_KM * 1000 && stats.microRideCount7d >= MICRO_RIDE_REPEAT_MIN) {
    flags.push(
      await saveFlag({
        rideId: ride.id,
        passengerId: ride.passengerId,
        driverId: ride.driverId,
        flagType: 'MICRO_RIDE_REPEAT',
        severity: 'high',
        riskScore: 0.72,
        summary: 'Micro-corridas repetidas entre o mesmo par passageiro-motorista',
        metadata: { distanceM, microRideCount7d: stats.microRideCount7d },
      }),
    );
  }

  if (stats.completedCount24h >= PAIR_LOOP_24H_MIN) {
    flags.push(
      await saveFlag({
        rideId: ride.id,
        passengerId: ride.passengerId,
        driverId: ride.driverId,
        flagType: 'PAIR_LOOP',
        severity: 'critical',
        riskScore: 0.88,
        summary: 'Loop de corridas entre o mesmo par em 24 horas',
        metadata: { completedCount24h: stats.completedCount24h },
      }),
    );
  }

  if (durationSec != null && durationSec < TOO_FAST_MAX_DURATION_SEC && distanceM > TOO_FAST_MIN_DISTANCE_M) {
    flags.push(
      await saveFlag({
        rideId: ride.id,
        passengerId: ride.passengerId,
        driverId: ride.driverId,
        flagType: 'TOO_FAST_COMPLETE',
        severity: 'high',
        riskScore: 0.8,
        summary: 'Corrida concluída rápida demais para a distância percorrida',
        metadata: { durationSec, distanceM },
      }),
    );
  }

  if (durationSec != null && distanceM > 500) {
    const expectedSec = Math.max(180, (distanceM / 1000 / 25) * 3600);
    if (durationSec > expectedSec * 2.8) {
      flags.push(
        await saveFlag({
          rideId: ride.id,
          passengerId: ride.passengerId,
          driverId: ride.driverId,
          flagType: 'TOO_SLOW_COMPLETE',
          severity: 'medium',
          riskScore: 0.58,
          summary: 'Corrida concluída lenta demais sem justificativa aparente',
          metadata: { durationSec, expectedSec, distanceM },
        }),
      );
    }
  }

  const maxDeviation = await getMaxRouteDeviation(ride.id);
  if (maxDeviation >= EXTREME_DEVIATION_M) {
    flags.push(
      await saveFlag({
        rideId: ride.id,
        passengerId: ride.passengerId,
        driverId: ride.driverId,
        flagType: 'EXTREME_ROUTE_DEVIATION',
        severity: 'high',
        riskScore: 0.75,
        summary: 'Desvio extremo de rota incompatível com trajeto plausível',
        metadata: { maxDeviationM: maxDeviation },
      }),
    );
  }

  return flags;
}

export async function analyzeCancelledRide(ride: RideRecord): Promise<SuspiciousRideFlag[]> {
  if (!ride.driverId) return [];

  const stats = await upsertPairStats({
    passengerId: ride.passengerId,
    driverId: ride.driverId,
    cancelled: new Date(),
  });

  if (stats.cancelledCount48h < COORDINATED_CANCEL_48H_MIN) return [];

  return [
    await saveFlag({
      rideId: ride.id,
      passengerId: ride.passengerId,
      driverId: ride.driverId,
      flagType: 'COORDINATED_CANCEL',
      severity: 'high',
      riskScore: 0.7,
      summary: 'Cancelamentos coordenados frequentes entre o mesmo par',
      metadata: { cancelledCount48h: stats.cancelledCount48h },
    }),
  ];
}

export async function listSuspiciousRideFlags(input?: {
  status?: string;
  limit?: number;
}): Promise<SuspiciousRideFlag[]> {
  const limit = Math.min(100, input?.limit ?? 50);

  if (useMemory()) {
    return memoryFlags
      .filter((f) => !input?.status || f.status === input.status)
      .slice(-limit)
      .reverse();
  }

  const params: unknown[] = [];
  let sql = `SELECT * FROM suspicious_ride_flags`;
  if (input?.status) {
    params.push(input.status);
    sql += ` WHERE status = $1`;
  }
  params.push(limit);
  sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;

  const { rows } = await pool.query(sql, params);
  return rows.map((row) => ({
    id: row.id as string,
    rideId: (row.ride_id as string) ?? undefined,
    passengerId: row.passenger_id as string,
    driverId: (row.driver_id as string) ?? undefined,
    flagType: row.flag_type as SuspiciousFlagType,
    severity: row.severity as SuspiciousRideFlag['severity'],
    riskScore: Number(row.risk_score),
    summary: row.summary as string,
    metadata: (row.metadata_json as Record<string, unknown>) ?? {},
    status: row.status as string,
    createdAt: new Date(row.created_at as string),
  }));
}

export async function getSuspiciousFlagsForRide(rideId: string): Promise<SuspiciousRideFlag[]> {
  if (useMemory()) return memoryFlags.filter((f) => f.rideId === rideId);
  const { rows } = await pool.query(
    `SELECT * FROM suspicious_ride_flags WHERE ride_id = $1 ORDER BY created_at DESC`,
    [rideId],
  );
  return rows.map((row) => ({
    id: row.id as string,
    rideId: row.ride_id as string,
    passengerId: row.passenger_id as string,
    driverId: (row.driver_id as string) ?? undefined,
    flagType: row.flag_type as SuspiciousFlagType,
    severity: row.severity as SuspiciousRideFlag['severity'],
    riskScore: Number(row.risk_score),
    summary: row.summary as string,
    metadata: (row.metadata_json as Record<string, unknown>) ?? {},
    status: row.status as string,
    createdAt: new Date(row.created_at as string),
  }));
}

export function __testResetSuspiciousRideMemory() {
  memoryFlags.length = 0;
  memoryPairStats.clear();
  memoryCompletedRides.length = 0;
  memoryCancelledRides.length = 0;
}

export function __testSeedPairCompletions(input: {
  passengerId: string;
  driverId: string;
  count: number;
  distanceM: number;
}) {
  for (let i = 0; i < input.count; i++) {
    memoryCompletedRides.push({
      rideId: randomUUID(),
      passengerId: input.passengerId,
      driverId: input.driverId,
      distanceM: input.distanceM,
      durationSec: 600,
      completedAt: new Date(Date.now() - i * 60_000),
    });
  }
}
