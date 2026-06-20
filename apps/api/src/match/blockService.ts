import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';
import { BLOCK_DURATIONS, redisBlockKey } from '../domain/match.js';
import type { BlockType } from '../domain/types.js';
import { matchCache } from './cacheStore.js';

export async function isPairBlocked(passengerId: string, driverId: string): Promise<boolean> {
  const cacheKey = redisBlockKey(passengerId, driverId);
  const cached = await matchCache.get(cacheKey);
  if (cached === '1') return true;

  if (config.useMemoryDb) {
    const { memoryBlockStore } = await import('../stores/memoryMatchStore.js');
    return memoryBlockStore.isBlocked(passengerId, driverId);
  }

  const result = await pool.query(
    `SELECT 1 FROM ride_match_blocks
     WHERE passenger_id = $1 AND driver_id = $2 AND expires_at > NOW()
     LIMIT 1`,
    [passengerId, driverId],
  );
  const blocked = (result.rowCount ?? 0) > 0;
  if (blocked) await matchCache.set(cacheKey, '1', 300);
  return blocked;
}

export async function createMatchBlock(params: {
  passengerId: string;
  driverId: string;
  rideId?: string;
  blockType: BlockType;
  reasonCode?: string;
  durationSeconds: number;
  metadata?: Record<string, unknown>;
}) {
  const expiresAt = new Date(Date.now() + params.durationSeconds * 1000);
  const ttl = params.durationSeconds;

  await matchCache.set(redisBlockKey(params.passengerId, params.driverId), '1', ttl);

  if (config.useMemoryDb) {
    const { memoryBlockStore } = await import('../stores/memoryMatchStore.js');
    memoryBlockStore.addBlock({ ...params, expiresAt });
    return randomUUID();
  }

  const result = await pool.query(
    `INSERT INTO ride_match_blocks
      (passenger_id, driver_id, ride_id, block_type, reason_code, metadata_json, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id`,
    [
      params.passengerId,
      params.driverId,
      params.rideId ?? null,
      params.blockType,
      params.reasonCode ?? null,
      JSON.stringify(params.metadata ?? {}),
      expiresAt,
    ],
  );
  return result.rows[0].id as string;
}

export async function blockPassengerCancelledDriver(passengerId: string, driverId: string, rideId: string) {
  return createMatchBlock({
    passengerId,
    driverId,
    rideId,
    blockType: 'PASSENGER_CANCEL_DRIVER_24H',
    reasonCode: 'passenger_cancel_after_assign',
    durationSeconds: BLOCK_DURATIONS.PASSENGER_CANCEL_DRIVER_24H,
  });
}

export async function blockDriverCancelledPassengerRedispatch(
  passengerId: string,
  driverId: string,
  rideId: string,
  escalationLevel: 1 | 2 | 3 = 1,
) {
  const duration =
    escalationLevel >= 3
      ? BLOCK_DURATIONS.PAIR_RISK_BLOCK_7D
      : escalationLevel >= 2
        ? BLOCK_DURATIONS.PAIR_RISK_BLOCK_24H
        : BLOCK_DURATIONS.DRIVER_CANCEL_PASSENGER_REDISPATCH;

  return createMatchBlock({
    passengerId,
    driverId,
    rideId,
    blockType: escalationLevel >= 2 ? 'PAIR_RISK_BLOCK' : 'DRIVER_CANCEL_PASSENGER_REDISPATCH',
    reasonCode: 'driver_cancel_after_accept',
    durationSeconds: duration,
    metadata: { escalationLevel },
  });
}

export async function countPairDriverCancelBlocks(
  passengerId: string,
  driverId: string,
  withinDays: number,
): Promise<number> {
  if (config.useMemoryDb) {
    const { memoryBlockStore } = await import('../stores/memoryMatchStore.js');
    return memoryBlockStore.blocks.filter(
      (b) =>
        b.passengerId === passengerId &&
        b.driverId === driverId &&
        ['DRIVER_CANCEL_PASSENGER_REDISPATCH', 'PAIR_RISK_BLOCK'].includes(b.blockType),
    ).length;
  }

  const result = await pool.query(
    `SELECT COUNT(*)::int AS c FROM ride_match_blocks
     WHERE passenger_id = $1 AND driver_id = $2
       AND block_type IN ('DRIVER_CANCEL_PASSENGER_REDISPATCH', 'PAIR_RISK_BLOCK')
       AND reason_code = 'driver_cancel_after_accept'
       AND created_at > NOW() - ($3::text || ' days')::interval`,
    [passengerId, driverId, withinDays],
  );
  return result.rows[0]?.c ?? 0;
}

export async function resolveDriverCancelEscLevel(
  passengerId: string,
  driverId: string,
): Promise<1 | 2 | 3> {
  const in7 = await countPairDriverCancelBlocks(passengerId, driverId, 7);
  const in30 = await countPairDriverCancelBlocks(passengerId, driverId, 30);
  if (in30 >= 3) return 3;
  if (in7 >= 1) return 2;
  return 1;
}
