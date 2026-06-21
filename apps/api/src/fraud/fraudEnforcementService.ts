import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { useMemory } from '../stores/memoryMatchStore.js';
import { emitEvent } from '../realtime/eventBus.js';
import { recordTraceSpan, generateTraceId } from '../observability/traceService.js';

export type BlockScope = 'ride_request' | 'driver_online' | 'payout' | 'promo' | 'login' | 'all';

export interface FraudBlock {
  id: string;
  userId?: string;
  deviceId?: string;
  blockScope: BlockScope;
  reasonCode: string;
  summary: string;
  sourceType: 'auto' | 'admin' | 'case_review';
  sourceRef?: string;
  riskScore?: number;
  expiresAt?: Date;
  isActive: boolean;
  createdAt: Date;
}

const memoryBlocks: FraudBlock[] = [];

function mapRow(row: Record<string, unknown>): FraudBlock {
  return {
    id: row.id as string,
    userId: (row.user_id as string) ?? undefined,
    deviceId: (row.device_id as string) ?? undefined,
    blockScope: row.block_scope as BlockScope,
    reasonCode: row.reason_code as string,
    summary: row.summary as string,
    sourceType: row.source_type as FraudBlock['sourceType'],
    sourceRef: (row.source_ref as string) ?? undefined,
    riskScore: row.risk_score != null ? Number(row.risk_score) : undefined,
    expiresAt: row.expires_at ? new Date(row.expires_at as string) : undefined,
    isActive: Boolean(row.is_active),
    createdAt: new Date(row.created_at as string),
  };
}

function isBlockActive(block: FraudBlock, now = new Date()): boolean {
  if (!block.isActive) return false;
  if (block.expiresAt && block.expiresAt <= now) return false;
  return true;
}

export async function applyFraudBlock(input: {
  userId?: string;
  deviceId?: string;
  blockScope: BlockScope;
  reasonCode: string;
  summary: string;
  sourceType: FraudBlock['sourceType'];
  sourceRef?: string;
  riskScore?: number;
  expiresAt?: Date;
}): Promise<FraudBlock | null> {
  if (!input.userId && !input.deviceId) return null;

  const existing = await listActiveBlocks({
    userId: input.userId,
    deviceId: input.deviceId,
    blockScope: input.blockScope,
  });
  if (existing.length > 0) return existing[0] ?? null;

  let block: FraudBlock = {
    id: randomUUID(),
    userId: input.userId,
    deviceId: input.deviceId,
    blockScope: input.blockScope,
    reasonCode: input.reasonCode,
    summary: input.summary,
    sourceType: input.sourceType,
    sourceRef: input.sourceRef,
    riskScore: input.riskScore,
    expiresAt: input.expiresAt,
    isActive: true,
    createdAt: new Date(),
  };

  if (useMemory()) {
    memoryBlocks.push(block);
  } else {
    const { rows } = await pool.query(
      `INSERT INTO fraud_enforcement_blocks
         (user_id, device_id, block_scope, reason_code, summary, source_type, source_ref, risk_score, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        input.userId ?? null,
        input.deviceId ?? null,
        input.blockScope,
        input.reasonCode,
        input.summary,
        input.sourceType,
        input.sourceRef ?? null,
        input.riskScore ?? null,
        input.expiresAt ?? null,
      ],
    );
    block = mapRow(rows[0] as Record<string, unknown>);
  }

  const traceId = generateTraceId();
  await recordTraceSpan({
    traceId,
    spanName: 'fraud_block_applied',
    component: 'fraud',
    metadata: {
      blockScope: input.blockScope,
      reasonCode: input.reasonCode,
      userId: input.userId,
      deviceId: input.deviceId,
    },
  });

  if (input.userId) {
    await emitEvent(
      'FRAUD_BLOCK_APPLIED',
      'user',
      input.userId,
      { blockScope: input.blockScope, reasonCode: input.reasonCode, summary: input.summary },
      { userIds: [input.userId] },
    );
  }

  return block;
}

export async function listActiveBlocks(input: {
  userId?: string;
  deviceId?: string;
  blockScope?: BlockScope;
}): Promise<FraudBlock[]> {
  const now = new Date();

  if (useMemory()) {
    return memoryBlocks.filter((b) => {
      if (!isBlockActive(b, now)) return false;
      if (input.userId && b.userId !== input.userId) return false;
      if (input.deviceId && b.deviceId !== input.deviceId) return false;
      if (input.blockScope && b.blockScope !== input.blockScope && b.blockScope !== 'all') return false;
      return true;
    });
  }

  const clauses: string[] = ['is_active = TRUE', '(expires_at IS NULL OR expires_at > NOW())'];
  const params: unknown[] = [];
  let idx = 1;

  if (input.userId) {
    clauses.push(`user_id = $${idx++}`);
    params.push(input.userId);
  }
  if (input.deviceId) {
    clauses.push(`device_id = $${idx++}`);
    params.push(input.deviceId);
  }
  if (input.blockScope) {
    clauses.push(`(block_scope = $${idx} OR block_scope = 'all')`);
    params.push(input.blockScope);
    idx++;
  }

  const { rows } = await pool.query(
    `SELECT * FROM fraud_enforcement_blocks WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC`,
    params,
  );
  return rows.map((r) => mapRow(r as Record<string, unknown>));
}

export async function assertNotFraudBlocked(input: {
  userId: string;
  deviceId?: string;
  blockScope: BlockScope;
}) {
  const userBlocks = await listActiveBlocks({ userId: input.userId, blockScope: input.blockScope });
  if (userBlocks.some((b) => b.blockScope === input.blockScope || b.blockScope === 'all')) {
    throw new Error('Conta temporariamente restrita por análise de risco');
  }

  if (input.deviceId) {
    const deviceBlocks = await listActiveBlocks({ deviceId: input.deviceId, blockScope: input.blockScope });
    if (deviceBlocks.length > 0) {
      throw new Error('Dispositivo restrito por análise de risco');
    }
  }
}

export async function enforceFromRiskScore(input: {
  userId: string;
  deviceId?: string;
  riskScore: number;
  reasonCodes: string[];
  userRole?: 'passenger' | 'driver';
  rideId?: string;
}): Promise<FraudBlock[]> {
  const applied: FraudBlock[] = [];

  if (input.riskScore >= 0.95) {
    const block = await applyFraudBlock({
      userId: input.userId,
      deviceId: input.deviceId,
      blockScope: 'all',
      reasonCode: 'RISK_SCORE_CRITICAL',
      summary: 'Bloqueio automático por score crítico de risco',
      sourceType: 'auto',
      sourceRef: input.rideId,
      riskScore: input.riskScore,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    if (block) applied.push(block);
  } else if (input.riskScore >= 0.85) {
    const block = await applyFraudBlock({
      userId: input.userId,
      blockScope: 'ride_request',
      reasonCode: 'RISK_SCORE_HIGH',
      summary: 'Solicitação de corrida bloqueada por risco elevado',
      sourceType: 'auto',
      sourceRef: input.rideId,
      riskScore: input.riskScore,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });
    if (block) applied.push(block);
  }

  if (input.deviceId && input.reasonCodes.includes('MULTI_ACCOUNT_DEVICE')) {
    const block = await applyFraudBlock({
      deviceId: input.deviceId,
      blockScope: 'promo',
      reasonCode: 'SHARED_DEVICE_ABUSE',
      summary: 'Promoções bloqueadas em dispositivo compartilhado',
      sourceType: 'auto',
      riskScore: input.riskScore,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    if (block) applied.push(block);
  }

  if (input.userRole === 'driver' && input.reasonCodes.includes('GPS_LOW_TRUST')) {
    const block = await applyFraudBlock({
      userId: input.userId,
      blockScope: 'driver_online',
      reasonCode: 'GPS_LOW_TRUST',
      summary: 'Motorista bloqueado por baixa confiança de localização',
      sourceType: 'auto',
      riskScore: input.riskScore,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    if (block) applied.push(block);
  }

  return applied;
}

export function __testResetEnforcementMemory() {
  memoryBlocks.length = 0;
}
