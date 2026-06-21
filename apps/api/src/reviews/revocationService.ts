import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';
import { useMemory } from '../stores/memoryMatchStore.js';

export type RevocationSourceType = 'fraud' | 'gps_spoof' | 'admin' | 'policy';

export interface BenefitRevocationRecord {
  id: string;
  userId: string;
  userRole: 'passenger' | 'driver';
  reason: string;
  sourceType: RevocationSourceType;
  sourceRef?: string;
  revokedUntil?: Date;
  isActive: boolean;
  createdAt: Date;
}

const memoryRevocations = new Map<string, BenefitRevocationRecord[]>();

function mapRow(row: Record<string, unknown>): BenefitRevocationRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    userRole: row.user_role as 'passenger' | 'driver',
    reason: row.reason as string,
    sourceType: row.source_type as RevocationSourceType,
    sourceRef: (row.source_ref as string) ?? undefined,
    revokedUntil: row.revoked_until ? new Date(row.revoked_until as string) : undefined,
    isActive: Boolean(row.is_active),
    createdAt: new Date(row.created_at as string),
  };
}

function isRevocationActive(record: BenefitRevocationRecord, now = new Date()): boolean {
  if (!record.isActive) return false;
  if (record.revokedUntil && record.revokedUntil <= now) return false;
  return true;
}

export async function revokeReputationBenefits(params: {
  userId: string;
  userRole: 'passenger' | 'driver';
  reason: string;
  sourceType: RevocationSourceType;
  sourceRef?: string;
  revokedUntil?: Date;
}): Promise<BenefitRevocationRecord> {
  const record: BenefitRevocationRecord = {
    id: randomUUID(),
    userId: params.userId,
    userRole: params.userRole,
    reason: params.reason,
    sourceType: params.sourceType,
    sourceRef: params.sourceRef,
    revokedUntil: params.revokedUntil,
    isActive: true,
    createdAt: new Date(),
  };

  if (useMemory()) {
    const list = memoryRevocations.get(params.userId) ?? [];
    list.push(record);
    memoryRevocations.set(params.userId, list);
    return record;
  }

  const { rows } = await pool.query(
    `INSERT INTO reputation_benefit_revocations
       (user_id, user_role, reason, source_type, source_ref, revoked_until)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      params.userId,
      params.userRole,
      params.reason,
      params.sourceType,
      params.sourceRef ?? null,
      params.revokedUntil ?? null,
    ],
  );
  return mapRow(rows[0]);
}

export async function hasActiveBenefitRevocation(
  userId: string,
  role: 'passenger' | 'driver',
): Promise<BenefitRevocationRecord | null> {
  const now = new Date();

  if (useMemory()) {
    const list = memoryRevocations.get(userId) ?? [];
    return list.find((r) => r.userRole === role && isRevocationActive(r, now)) ?? null;
  }

  const { rows } = await pool.query(
    `SELECT * FROM reputation_benefit_revocations
     WHERE user_id = $1 AND user_role = $2 AND is_active = TRUE
       AND (revoked_until IS NULL OR revoked_until > NOW())
     ORDER BY created_at DESC LIMIT 1`,
    [userId, role],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function clearBenefitRevocation(revocationId: string): Promise<void> {
  if (useMemory()) {
    for (const list of memoryRevocations.values()) {
      const item = list.find((r) => r.id === revocationId);
      if (item) item.isActive = false;
    }
    return;
  }

  await pool.query(
    `UPDATE reputation_benefit_revocations SET is_active = FALSE WHERE id = $1`,
    [revocationId],
  );
}

export function stripBenefitsForRevocation<T extends Record<string, unknown>>(benefits: T): T {
  const neutral = { ...benefits };
  for (const key of Object.keys(neutral)) {
    if (key.toLowerCase().includes('bonus') || key.toLowerCase().includes('discount') || key.toLowerCase().includes('priority')) {
      (neutral as Record<string, unknown>)[key] = 0;
    }
  }
  if ('prepayRequired' in neutral) neutral.prepayRequired = true;
  return neutral;
}
