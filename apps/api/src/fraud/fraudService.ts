import { pool } from '../db.js';
import { useMemory } from '../stores/memoryMatchStore.js';
import { emitEvent } from '../realtime/eventBus.js';
import { assertNotFraudBlocked } from './fraudEnforcementService.js';
import { upsertFraudCase, processPendingFraudCases } from './fraudCaseReviewService.js';
import { recordLocationTrustEvent } from './locationTrustService.js';

export type FraudSignalType =
  | 'CODE_VERIFY_FAIL'
  | 'CODE_COOLDOWN'
  | 'GPS_JUMP'
  | 'GPS_STALE'
  | 'RAPID_CANCEL'
  | 'PAYMENT_FAIL'
  | 'DEVICE_ANOMALY'
  | 'SUSPICIOUS_RIDE_PATTERN';

const memorySignals: Array<{ userId: string; score: number }> = [];
const RISK_THRESHOLD = 0.75;

const severityByType: Record<FraudSignalType, { severity: string; delta: number }> = {
  CODE_VERIFY_FAIL: { severity: 'medium', delta: 0.08 },
  CODE_COOLDOWN: { severity: 'high', delta: 0.15 },
  GPS_JUMP: { severity: 'high', delta: 0.12 },
  GPS_STALE: { severity: 'low', delta: 0.04 },
  RAPID_CANCEL: { severity: 'medium', delta: 0.06 },
  PAYMENT_FAIL: { severity: 'medium', delta: 0.05 },
  DEVICE_ANOMALY: { severity: 'high', delta: 0.1 },
  SUSPICIOUS_RIDE_PATTERN: { severity: 'high', delta: 0.1 },
};

export async function recordFraudSignal(input: {
  userId?: string;
  rideId?: string;
  deviceId?: string;
  signalType: FraudSignalType;
  metadata?: Record<string, unknown>;
}) {
  const cfg = severityByType[input.signalType];
  if (!input.userId) return { recorded: false };

  if (useMemory()) {
    const existing = memorySignals.find((s) => s.userId === input.userId);
    if (existing) existing.score += cfg.delta;
    else memorySignals.push({ userId: input.userId, score: cfg.delta });
  } else {
    await pool.query(
      `INSERT INTO fraud_signals (user_id, ride_id, signal_type, severity, score_delta, metadata_json)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [input.userId, input.rideId ?? null, input.signalType, cfg.severity, cfg.delta, JSON.stringify(input.metadata ?? {})],
    );
  }

  await emitEvent(
    'FRAUD_SIGNAL',
    'user',
    input.userId,
    { signalType: input.signalType, severity: cfg.severity, rideId: input.rideId },
    { userIds: [input.userId], rideId: input.rideId },
  );

  void import('../observability/traceService.js').then(({ recordTraceSpan, generateTraceId }) =>
    recordTraceSpan({
      traceId: generateTraceId(),
      rideId: input.rideId,
      spanName: `fraud_${input.signalType.toLowerCase()}`,
      component: 'fraud',
      status: cfg.severity === 'high' ? 'degraded' : 'ok',
      metadata: input.metadata,
    }),
  );

  const riskScore = await getUserRiskScore(input.userId);
  if (riskScore >= RISK_THRESHOLD) {
    if (input.signalType === 'GPS_JUMP') {
      const { revokeReputationBenefits } = await import('../reviews/revocationService.js');
      await revokeReputationBenefits({
        userId: input.userId,
        userRole: 'driver',
        reason: 'GPS falso ou salto anômalo confirmado',
        sourceType: 'gps_spoof',
        sourceRef: input.rideId,
      });
      const { setRegionConservativeMode } = await import('../pricing/dynamicPricingGuardStore.js');
      const { config } = await import('../config.js');
      await setRegionConservativeMode(config.defaultPricingRegionId, true);
    }

    const fraudCase = await upsertFraudCase({
      userId: input.userId,
      riskScore,
      summary: `Risco elevado: ${input.signalType}`,
      reasonCodes: [input.signalType],
    });
    void processPendingFraudCases(1);

    const { enforceFromRiskScore } = await import('./fraudEnforcementService.js');
    await enforceFromRiskScore({
      userId: input.userId,
      deviceId: input.deviceId,
      riskScore,
      reasonCodes: [input.signalType],
      userRole: input.signalType.startsWith('GPS') ? 'driver' : undefined,
      rideId: input.rideId,
    });

    if (input.deviceId && input.signalType.startsWith('GPS')) {
      await recordLocationTrustEvent({
        userId: input.userId,
        deviceId: input.deviceId,
        eventType: input.signalType === 'GPS_JUMP' ? 'GPS_JUMP' : 'GPS_STALE',
      });
    }

    void fraudCase;
  }

  return { recorded: true, riskScore };
}

export async function getUserRiskScore(userId: string): Promise<number> {
  if (useMemory()) {
    return memorySignals.find((s) => s.userId === userId)?.score ?? 0;
  }
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(score_delta), 0) AS total FROM fraud_signals
     WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days'`,
    [userId],
  );
  return Math.min(1, Number(rows[0]?.total ?? 0));
}

export async function checkGpsIntegrity(input: {
  driverId: string;
  rideId?: string;
  lat: number;
  lng: number;
  prevLat?: number;
  prevLng?: number;
  prevAt?: Date;
}) {
  if (input.prevLat == null || input.prevLng == null || !input.prevAt) return;

  const dtSec = (Date.now() - input.prevAt.getTime()) / 1000;
  if (dtSec > 120) {
    await recordFraudSignal({
      userId: input.driverId,
      rideId: input.rideId,
      signalType: 'GPS_STALE',
      metadata: { dtSec },
    });
    await emitEvent('GPS_INTEGRITY_ALERT', 'driver', input.driverId, { type: 'STALE', rideId: input.rideId }, {
      driverId: input.driverId,
      rideId: input.rideId,
    });
    return;
  }

  const dLat = input.lat - input.prevLat;
  const dLng = input.lng - input.prevLng;
  const distKm = Math.sqrt(dLat * dLat + dLng * dLng) * 111;
  const speedKmh = dtSec > 0 ? (distKm / dtSec) * 3600 : 0;

  if (speedKmh > 180) {
    if (!useMemory()) {
      await pool.query(
        `INSERT INTO gps_integrity_events (driver_id, ride_id, event_type, lat, lng, metadata_json)
         VALUES ($1,$2,'IMPOSSIBLE_SPEED',$3,$4,$5)`,
        [input.driverId, input.rideId ?? null, input.lat, input.lng, JSON.stringify({ speedKmh })],
      );
    }
    await recordFraudSignal({
      userId: input.driverId,
      rideId: input.rideId,
      signalType: 'GPS_JUMP',
      metadata: { speedKmh },
    });
    await emitEvent('GPS_INTEGRITY_ALERT', 'driver', input.driverId, { type: 'IMPOSSIBLE_SPEED', speedKmh }, {
      driverId: input.driverId,
      rideId: input.rideId,
    });
  }
}

export async function assertUserNotBlocked(userId: string, deviceId?: string) {
  await assertNotFraudBlocked({ userId, deviceId, blockScope: 'ride_request' });
  const score = await getUserRiskScore(userId);
  if (score >= 0.95) {
    throw new Error('Conta temporariamente restrita por análise de risco');
  }
}
