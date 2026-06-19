import { createHmac, randomInt } from 'node:crypto';
import { config } from '../config.js';
import type { CodeRole } from './types.js';

export function generateSixDigitCode(): string {
  return String(randomInt(100000, 1000000));
}

export function hashRideCode(code: string, rideId: string, role: CodeRole): string {
  const payload = `${code}:${rideId}:${role}`;
  return createHmac('sha256', config.rideCodeSecret).update(payload).digest('hex');
}

export function verifyCodeHash(
  code: string,
  rideId: string,
  role: CodeRole,
  expectedHash: string,
): boolean {
  const hash = hashRideCode(code, rideId, role);
  return hash === expectedHash;
}
