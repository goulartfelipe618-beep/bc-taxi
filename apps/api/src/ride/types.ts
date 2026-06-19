export type CodeRole = 'passenger' | 'driver';

export interface VerificationPublic {
  rideId: string;
  passengerVerified: boolean;
  driverVerified: boolean;
  bothVerified: boolean;
  expiresAt: string;
  reissueCount: number;
  maxReissues: number;
  cooldownUntil?: string;
  attemptsRemaining: { passenger: number; driver: number };
}

export type VerifyCodeResult =
  | { ok: true; role: CodeRole; started: boolean }
  | { ok: false; reason: string; cooldownUntil?: string };

export interface CodePairRecord {
  id: string;
  rideId: string;
  issueNumber: number;
  passengerCodeHash: string;
  driverCodeHash: string;
  passengerVerifiedAt?: Date;
  driverVerifiedAt?: Date;
  passengerAttempts: number;
  driverAttempts: number;
  cooldownUntil?: Date;
  expiresAt: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IssuedCodes {
  pair: CodePairRecord;
  passengerCode: string;
  driverCode: string;
}

export const CODE_CONFIG = {
  maxAttempts: 5,
  maxReissues: 3,
  cooldownMs: 2 * 60 * 1000,
  expiryMs: 15 * 60 * 1000,
  arrivalExpiryMs: 5 * 60 * 1000,
} as const;
