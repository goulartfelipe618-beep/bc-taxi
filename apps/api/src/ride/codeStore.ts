import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';
import { generateSixDigitCode, hashRideCode, verifyCodeHash } from './codeCrypto.js';
import type { CodePairRecord, CodeRole, IssuedCodes, VerificationPublic } from './types.js';
import { CODE_CONFIG } from './types.js';

const pairsByRide = new Map<string, CodePairRecord>();
const plainCodes = new Map<string, { passenger: string; driver: string }>();

function computeExpiry(arrivedAt?: Date) {
  const now = Date.now();
  const baseExpiry = now + CODE_CONFIG.expiryMs;
  if (arrivedAt) {
    const arrivalExpiry = arrivedAt.getTime() + CODE_CONFIG.arrivalExpiryMs;
    return new Date(Math.min(baseExpiry, arrivalExpiry));
  }
  return new Date(baseExpiry);
}

function mapPairRow(row: Record<string, unknown>): CodePairRecord {
  return {
    id: row.id as string,
    rideId: row.ride_id as string,
    issueNumber: Number(row.issue_number),
    passengerCodeHash: row.passenger_code_hash as string,
    driverCodeHash: row.driver_code_hash as string,
    passengerVerifiedAt: row.passenger_verified_at
      ? new Date(row.passenger_verified_at as string)
      : undefined,
    driverVerifiedAt: row.driver_verified_at
      ? new Date(row.driver_verified_at as string)
      : undefined,
    passengerAttempts: Number(row.passenger_attempts),
    driverAttempts: Number(row.driver_attempts),
    cooldownUntil: row.cooldown_until ? new Date(row.cooldown_until as string) : undefined,
    expiresAt: new Date(row.expires_at as string),
    isActive: Boolean(row.is_active),
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function useMemoryCodes() {
  return config.useMemoryDb;
}

export function toVerificationPublic(pair: CodePairRecord): VerificationPublic {
  return {
    rideId: pair.rideId,
    passengerVerified: Boolean(pair.passengerVerifiedAt),
    driverVerified: Boolean(pair.driverVerifiedAt),
    bothVerified: Boolean(pair.passengerVerifiedAt && pair.driverVerifiedAt),
    expiresAt: pair.expiresAt.toISOString(),
    reissueCount: pair.issueNumber,
    maxReissues: CODE_CONFIG.maxReissues,
    cooldownUntil: pair.cooldownUntil?.toISOString(),
    attemptsRemaining: {
      passenger: Math.max(0, CODE_CONFIG.maxAttempts - pair.passengerAttempts),
      driver: Math.max(0, CODE_CONFIG.maxAttempts - pair.driverAttempts),
    },
  };
}

export async function getActivePair(rideId: string): Promise<CodePairRecord | null> {
  if (useMemoryCodes()) {
    const pair = pairsByRide.get(rideId);
    return pair?.isActive ? pair : null;
  }
  const result = await pool.query(
    `SELECT * FROM ride_start_code_pairs WHERE ride_id = $1 AND is_active = TRUE LIMIT 1`,
    [rideId],
  );
  return result.rowCount ? mapPairRow(result.rows[0]) : null;
}

export async function issueStartCodes(rideId: string, arrivedAt?: Date): Promise<IssuedCodes> {
  const existing = await getActivePair(rideId);
  const issueNumber = existing ? existing.issueNumber + 1 : 1;
  if (issueNumber > CODE_CONFIG.maxReissues) {
    throw new Error('Limite de reemissão de códigos atingido');
  }

  const passengerCode = generateSixDigitCode();
  const driverCode = generateSixDigitCode();
  const now = new Date();
  const expiresAt = computeExpiry(arrivedAt);

  const record: CodePairRecord = {
    id: randomUUID(),
    rideId,
    issueNumber,
    passengerCodeHash: hashRideCode(passengerCode, rideId, 'passenger'),
    driverCodeHash: hashRideCode(driverCode, rideId, 'driver'),
    passengerAttempts: 0,
    driverAttempts: 0,
    expiresAt,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  if (useMemoryCodes()) {
    if (existing) existing.isActive = false;
    pairsByRide.set(rideId, record);
    plainCodes.set(rideId, { passenger: passengerCode, driver: driverCode });
    return { pair: record, passengerCode, driverCode };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE ride_start_code_pairs SET is_active = FALSE, updated_at = NOW()
       WHERE ride_id = $1 AND is_active = TRUE`,
      [rideId],
    );
    await client.query(
      `INSERT INTO ride_start_code_pairs (
        id, ride_id, issue_number, passenger_code_hash, driver_code_hash, expires_at
      ) VALUES ($1,$2,$3,$4,$5,$6)`,
      [record.id, rideId, issueNumber, record.passengerCodeHash, record.driverCodeHash, expiresAt],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  return { pair: record, passengerCode, driverCode };
}

export async function reissueStartCodes(rideId: string, arrivedAt?: Date): Promise<IssuedCodes> {
  const active = await getActivePair(rideId);
  if (active && active.issueNumber >= CODE_CONFIG.maxReissues) {
    throw new Error('Limite de reemissão de códigos atingido');
  }
  return issueStartCodes(rideId, arrivedAt);
}

function isInCooldown(pair: CodePairRecord) {
  return pair.cooldownUntil != null && pair.cooldownUntil.getTime() > Date.now();
}

async function persistPair(pair: CodePairRecord) {
  if (useMemoryCodes()) {
    pairsByRide.set(pair.rideId, pair);
    return;
  }
  await pool.query(
    `UPDATE ride_start_code_pairs SET
      passenger_verified_at = $2,
      driver_verified_at = $3,
      passenger_attempts = $4,
      driver_attempts = $5,
      cooldown_until = $6,
      updated_at = NOW()
     WHERE id = $1`,
    [
      pair.id,
      pair.passengerVerifiedAt ?? null,
      pair.driverVerifiedAt ?? null,
      pair.passengerAttempts,
      pair.driverAttempts,
      pair.cooldownUntil ?? null,
    ],
  );
}

export async function validateStartCode(
  rideId: string,
  role: CodeRole,
  code: string,
): Promise<{ ok: true; pair: CodePairRecord } | { ok: false; reason: string; cooldownUntil?: Date }> {
  const pair = await getActivePair(rideId);
  if (!pair) return { ok: false, reason: 'Códigos não emitidos para esta corrida' };
  if (!pair.isActive) return { ok: false, reason: 'Códigos inativos' };
  if (pair.expiresAt.getTime() <= Date.now()) return { ok: false, reason: 'Códigos expirados' };
  if (isInCooldown(pair)) {
    return { ok: false, reason: 'Cooldown ativo após tentativas inválidas', cooldownUntil: pair.cooldownUntil };
  }

  const attemptsKey = role === 'passenger' ? 'passengerAttempts' : 'driverAttempts';
  const verifiedKey = role === 'passenger' ? 'passengerVerifiedAt' : 'driverVerifiedAt';
  const hashKey = role === 'passenger' ? 'passengerCodeHash' : 'driverCodeHash';

  if (pair[verifiedKey]) {
    return { ok: true, pair };
  }

  const valid = verifyCodeHash(code, rideId, role, pair[hashKey]);
  if (!valid) {
    pair[attemptsKey] += 1;
    if (pair[attemptsKey] >= CODE_CONFIG.maxAttempts) {
      pair.cooldownUntil = new Date(Date.now() + CODE_CONFIG.cooldownMs);
    }
    pair.updatedAt = new Date();
    await persistPair(pair);
    const remaining = CODE_CONFIG.maxAttempts - pair[attemptsKey];
    if (remaining <= 0) {
      return {
        ok: false,
        reason: 'Muitas tentativas inválidas — cooldown ativado',
        cooldownUntil: pair.cooldownUntil,
      };
    }
    return { ok: false, reason: `Código inválido (${remaining} tentativa(s) restante(s))` };
  }

  pair[verifiedKey] = new Date();
  pair.updatedAt = new Date();
  await persistPair(pair);
  return { ok: true, pair };
}

/** Apenas para testes em memória — expõe códigos em claro. */
export function getPlainCodesForTest(rideId: string) {
  return plainCodes.get(rideId) ?? null;
}

export async function getVerificationStatus(rideId: string): Promise<VerificationPublic | null> {
  const pair = await getActivePair(rideId);
  if (!pair) return null;
  return toVerificationPublic(pair);
}

export async function bothCodesVerified(rideId: string): Promise<boolean> {
  const pair = await getActivePair(rideId);
  return Boolean(pair?.passengerVerifiedAt && pair?.driverVerifiedAt);
}
