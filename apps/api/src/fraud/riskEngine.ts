import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';
import { useMemory } from '../stores/memoryMatchStore.js';
import { recordFraudSignal } from './fraudService.js';

export type RiskDecision = 'allow' | 'review' | 'challenge' | 'block';

export interface RiskEvaluation {
  decision: RiskDecision;
  riskScore: number;
  reasonCodes: string[];
}

const memoryDevices = new Map<string, Set<string>>();
const memoryLinks: Array<{ userA: string; userB: string }> = [];
const memoryDecisions: RiskEvaluation[] = [];

export async function recordDeviceFingerprint(input: {
  userId: string;
  deviceId: string;
  platform?: string;
  appVersion?: string;
  metadata?: Record<string, unknown>;
}) {
  if (!input.deviceId) return;

  if (useMemory()) {
    const users = memoryDevices.get(input.deviceId) ?? new Set();
    for (const otherUserId of users) {
      if (otherUserId !== input.userId) {
        memoryLinks.push({ userA: input.userId, userB: otherUserId });
      }
    }
    users.add(input.userId);
    memoryDevices.set(input.deviceId, users);
    return;
  }

  await pool.query(
    `INSERT INTO device_fingerprints (user_id, device_id, platform, app_version, metadata_json, last_seen_at)
     VALUES ($1,$2,$3,$4,$5,NOW())
     ON CONFLICT (user_id, device_id) DO UPDATE SET
       platform = COALESCE(EXCLUDED.platform, device_fingerprints.platform),
       app_version = COALESCE(EXCLUDED.app_version, device_fingerprints.app_version),
       metadata_json = EXCLUDED.metadata_json,
       last_seen_at = NOW()`,
    [
      input.userId,
      input.deviceId,
      input.platform ?? null,
      input.appVersion ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );

  const { rows } = await pool.query(
    `SELECT user_id FROM device_fingerprints WHERE device_id = $1 AND user_id <> $2 LIMIT 5`,
    [input.deviceId, input.userId],
  );

  for (const row of rows) {
    const otherUserId = row.user_id as string;
    const [a, b] = input.userId < otherUserId ? [input.userId, otherUserId] : [otherUserId, input.userId];
    await pool.query(
      `INSERT INTO account_links (user_id_a, user_id_b, link_type, confidence, metadata_json)
       VALUES ($1,$2,'shared_device',0.85,$3)
       ON CONFLICT (user_id_a, user_id_b, link_type) DO NOTHING`,
      [a, b, JSON.stringify({ deviceId: input.deviceId })],
    );
  }
}

async function countRecentPayments(userId: string): Promise<number> {
  if (useMemory()) return 0;
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM payment_intents
     WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
    [userId],
  );
  return rows[0]?.c ?? 0;
}

async function countLinkedAccounts(userId: string): Promise<number> {
  if (useMemory()) {
    return memoryLinks.filter((l) => l.userA === userId || l.userB === userId).length;
  }
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM account_links WHERE user_id_a = $1 OR user_id_b = $1`,
    [userId],
  );
  return rows[0]?.c ?? 0;
}

export async function evaluateRideRisk(input: {
  userId: string;
  deviceId?: string;
  paymentMethodType?: string;
  amountCentavos?: number;
  rideId?: string;
}): Promise<RiskEvaluation> {
  if (input.deviceId) {
    await recordDeviceFingerprint({ userId: input.userId, deviceId: input.deviceId });
  }

  const reasonCodes: string[] = [];
  let riskScore = 0;

  const linkedAccounts = await countLinkedAccounts(input.userId);
  if (linkedAccounts >= 2) {
    riskScore += 0.25;
    reasonCodes.push('MULTI_ACCOUNT_DEVICE');
  }

  const recentPayments = await countRecentPayments(input.userId);
  if (recentPayments >= 5) {
    riskScore += 0.2;
    reasonCodes.push('PAYMENT_VELOCITY');
    await recordFraudSignal({
      userId: input.userId,
      rideId: input.rideId,
      signalType: 'PAYMENT_FAIL',
      metadata: { recentPayments, kind: 'velocity' },
    });
  }

  if (input.amountCentavos != null && input.amountCentavos > 50000) {
    riskScore += 0.1;
    reasonCodes.push('HIGH_VALUE_RIDE');
  }

  if (input.paymentMethodType === 'cash' && input.amountCentavos != null && input.amountCentavos > 15000) {
    riskScore += 0.15;
    reasonCodes.push('CASH_HIGH_VALUE');
  }

  riskScore = Math.min(1, riskScore);

  let decision: RiskDecision = 'allow';
  if (riskScore >= 0.85) decision = 'block';
  else if (riskScore >= 0.55) decision = 'challenge';
  else if (riskScore >= 0.35) decision = 'review';

  const evaluation: RiskEvaluation = { decision, riskScore, reasonCodes };

  if (useMemory()) {
    memoryDecisions.push(evaluation);
    return evaluation;
  }

  await pool.query(
    `INSERT INTO risk_decisions (id, user_id, ride_id, decision, risk_score, reason_codes, metadata_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      randomUUID(),
      input.userId,
      input.rideId ?? null,
      decision,
      riskScore,
      reasonCodes,
      JSON.stringify({ paymentMethodType: input.paymentMethodType }),
    ],
  );

  return evaluation;
}

export async function getLatestRiskDecision(userId: string): Promise<RiskEvaluation | null> {
  if (useMemory()) return memoryDecisions.at(-1) ?? null;
  const { rows } = await pool.query(
    `SELECT decision, risk_score, reason_codes FROM risk_decisions
     WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  if (!rows[0]) return null;
  return {
    decision: rows[0].decision as RiskDecision,
    riskScore: Number(rows[0].risk_score),
    reasonCodes: (rows[0].reason_codes as string[]) ?? [],
  };
}
