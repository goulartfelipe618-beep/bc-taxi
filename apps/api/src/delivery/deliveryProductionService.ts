import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';

const FORBIDDEN_KEYWORDS = ['explosivo', 'arma', 'drogas', 'inflamável', 'radioativo'];

function validatePackageDeclaration(description: string): { ok: boolean; reason?: string } {
  const lower = description.toLowerCase();
  for (const word of FORBIDDEN_KEYWORDS) {
    if (lower.includes(word)) {
      return { ok: false, reason: `Conteúdo proibido detectado: ${word}` };
    }
  }
  if (description.trim().length < 3) {
    return { ok: false, reason: 'Descreva o pacote' };
  }
  return { ok: true };
}

export interface DeliveryProductionConfig {
  minDriverReputation: number;
  maxDeclaredWeightKg: number;
  fragileMultiplier: number;
  priorityMultiplier: number;
  insuranceRateBps: number;
  insuranceFeeCapCentavos: number;
  pickupIncludedWaitMinutes: number;
  pickupWaitPerMinuteCentavos: number;
  dropoffIncludedWaitMinutes: number;
  dropoffWaitPerMinuteCentavos: number;
  configVersion: string;
}

export interface DeliveryFareBreakdown {
  baseFareCentavos: number;
  fragileSurchargeCentavos: number;
  prioritySurchargeCentavos: number;
  insuranceFeeCentavos: number;
  estimatedFareCentavos: number;
}

const memoryConfig: DeliveryProductionConfig = {
  minDriverReputation: 4.5,
  maxDeclaredWeightKg: 30,
  fragileMultiplier: 1.08,
  priorityMultiplier: 1.18,
  insuranceRateBps: 200,
  insuranceFeeCapCentavos: 2000,
  pickupIncludedWaitMinutes: 5,
  pickupWaitPerMinuteCentavos: 80,
  dropoffIncludedWaitMinutes: 5,
  dropoffWaitPerMinuteCentavos: 80,
  configVersion: 'camada39-memory-v1',
};

const memoryRestrictions = new Map<string, { reason: string; restrictedUntil?: Date }>();
const memoryWaitCharges = new Map<string, { pickup?: number; dropoff?: number }>();
const memoryEvents: Array<{ jobId: string; eventType: string }> = [];

export function seedMemoryDeliveryProductionConfig(cfg: Partial<DeliveryProductionConfig>) {
  Object.assign(memoryConfig, cfg);
}

export function seedMemoryDeliveryDriverRestriction(
  driverUserId: string,
  reason: string,
  restrictedUntil?: Date,
) {
  memoryRestrictions.set(driverUserId, { reason, restrictedUntil });
}

export async function getDeliveryProductionConfig(): Promise<DeliveryProductionConfig> {
  if (config.useMemoryDb) return { ...memoryConfig };

  const { rows } = await pool.query(
    `SELECT * FROM delivery_production_config WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1`,
  );
  const r = rows[0];
  if (!r) return { ...memoryConfig, configVersion: 'camada39-v1' };

  return {
    minDriverReputation: Number(r.min_driver_reputation),
    maxDeclaredWeightKg: Number(r.max_declared_weight_kg),
    fragileMultiplier: Number(r.fragile_multiplier),
    priorityMultiplier: Number(r.priority_multiplier),
    insuranceRateBps: Number(r.insurance_rate_bps),
    insuranceFeeCapCentavos: Number(r.insurance_fee_cap_centavos),
    pickupIncludedWaitMinutes: Number(r.pickup_included_wait_minutes),
    pickupWaitPerMinuteCentavos: Number(r.pickup_wait_per_minute_centavos),
    dropoffIncludedWaitMinutes: Number(r.dropoff_included_wait_minutes),
    dropoffWaitPerMinuteCentavos: Number(r.dropoff_wait_per_minute_centavos),
    configVersion: r.config_version as string,
  };
}

export function validatePackageDeclarationProduction(
  description: string,
  input: { declaredWeightKg?: number; maxWeightKg: number },
): { ok: boolean; reason?: string } {
  const base = validatePackageDeclaration(description);
  if (!base.ok) return base;

  if (input.declaredWeightKg != null && input.declaredWeightKg > input.maxWeightKg) {
    return { ok: false, reason: `Peso acima do limite operacional (${input.maxWeightKg} kg)` };
  }
  return { ok: true };
}

export function computeDeliveryProductionFare(
  baseFareCentavos: number,
  input: {
    isFragile: boolean;
    isPriority: boolean;
    declaredValueCentavos?: number;
  },
  cfg: DeliveryProductionConfig,
): DeliveryFareBreakdown {
  let fare = baseFareCentavos;
  const fragileSurchargeCentavos = input.isFragile
    ? Math.round(fare * (cfg.fragileMultiplier - 1))
    : 0;
  if (input.isFragile) fare += fragileSurchargeCentavos;

  const prioritySurchargeCentavos = input.isPriority
    ? Math.round(fare * (cfg.priorityMultiplier - 1))
    : 0;
  if (input.isPriority) fare += prioritySurchargeCentavos;

  let insuranceFeeCentavos = 0;
  if (input.declaredValueCentavos && input.declaredValueCentavos > 0) {
    insuranceFeeCentavos = Math.min(
      Math.round((input.declaredValueCentavos * cfg.insuranceRateBps) / 10_000),
      cfg.insuranceFeeCapCentavos,
    );
  }

  return {
    baseFareCentavos,
    fragileSurchargeCentavos,
    prioritySurchargeCentavos,
    insuranceFeeCentavos,
    estimatedFareCentavos: fare + insuranceFeeCentavos,
  };
}

export function computeDeliveryWaitFee(
  phase: 'pickup' | 'dropoff',
  waitMinutes: number,
  cfg: DeliveryProductionConfig,
): { feeCentavos: number; billableMinutes: number } {
  const included =
    phase === 'pickup' ? cfg.pickupIncludedWaitMinutes : cfg.dropoffIncludedWaitMinutes;
  const perMinute =
    phase === 'pickup' ? cfg.pickupWaitPerMinuteCentavos : cfg.dropoffWaitPerMinuteCentavos;
  const billableMinutes = Math.max(0, waitMinutes - included);
  return { feeCentavos: billableMinutes * perMinute, billableMinutes };
}

export async function isDriverRestrictedForDelivery(driverUserId: string): Promise<boolean> {
  if (config.useMemoryDb) {
    const r = memoryRestrictions.get(driverUserId);
    if (!r) return false;
    if (r.restrictedUntil && r.restrictedUntil.getTime() < Date.now()) return false;
    return true;
  }
  const { rows } = await pool.query(
    `SELECT 1 FROM delivery_driver_restrictions
     WHERE driver_user_id = $1 AND (restricted_until IS NULL OR restricted_until > NOW())`,
    [driverUserId],
  );
  return rows.length > 0;
}

export async function assertDeliveryDriverEligible(driverUserId: string, reputationScore: number) {
  const cfg = await getDeliveryProductionConfig();
  if (reputationScore < cfg.minDriverReputation) {
    throw new Error('Reputação insuficiente para entregas');
  }
  if (await isDriverRestrictedForDelivery(driverUserId)) {
    throw new Error('Motorista com restrição operacional para entregas');
  }
}

export async function recordDeliveryWaitMinutes(input: {
  jobId: string;
  phase: 'pickup' | 'dropoff';
  waitMinutes: number;
}) {
  const cfg = await getDeliveryProductionConfig();
  const { feeCentavos } = computeDeliveryWaitFee(input.phase, input.waitMinutes, cfg);

  if (config.useMemoryDb) {
    const existing = memoryWaitCharges.get(input.jobId) ?? {};
    existing[input.phase] = feeCentavos;
    memoryWaitCharges.set(input.jobId, existing);
    memoryEvents.push({ jobId: input.jobId, eventType: 'wait_fee_assessed' });
    return { feeCentavos, policyVersion: cfg.configVersion };
  }

  await pool.query(
    `INSERT INTO delivery_wait_charges (delivery_job_id, phase, wait_minutes, fee_centavos, policy_version)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (delivery_job_id, phase) DO UPDATE
       SET wait_minutes = EXCLUDED.wait_minutes,
           fee_centavos = EXCLUDED.fee_centavos,
           policy_version = EXCLUDED.policy_version`,
    [input.jobId, input.phase, input.waitMinutes, feeCentavos, cfg.configVersion],
  );

  const col = input.phase === 'pickup' ? 'wait_fee_pickup_centavos' : 'wait_fee_dropoff_centavos';
  await pool.query(`UPDATE delivery_jobs SET ${col} = $2, updated_at = NOW() WHERE id = $1`, [
    input.jobId,
    feeCentavos,
  ]);

  await recordDeliveryJobEvent(input.jobId, 'wait_fee_assessed', cfg.configVersion, {
    phase: input.phase,
    waitMinutes: input.waitMinutes,
    feeCentavos,
  });

  return { feeCentavos, policyVersion: cfg.configVersion };
}

export async function settleDeliveryJobFare(jobId: string, estimatedFareCentavos: number) {
  const cfg = await getDeliveryProductionConfig();
  let waitPickup = 0;
  let waitDropoff = 0;

  if (config.useMemoryDb) {
    const waits = memoryWaitCharges.get(jobId);
    waitPickup = waits?.pickup ?? 0;
    waitDropoff = waits?.dropoff ?? 0;
  } else {
    const { rows } = await pool.query(
      `SELECT wait_fee_pickup_centavos, wait_fee_dropoff_centavos FROM delivery_jobs WHERE id = $1`,
      [jobId],
    );
    waitPickup = Number(rows[0]?.wait_fee_pickup_centavos ?? 0);
    waitDropoff = Number(rows[0]?.wait_fee_dropoff_centavos ?? 0);
  }

  const finalFareCentavos = estimatedFareCentavos + waitPickup + waitDropoff;

  if (config.useMemoryDb) {
    memoryEvents.push({ jobId, eventType: 'fare_settled' });
  } else {
    await pool.query(
      `UPDATE delivery_jobs
       SET final_fare_centavos = $2, policy_version = $3, updated_at = NOW()
       WHERE id = $1`,
      [jobId, finalFareCentavos, cfg.configVersion],
    );
    await recordDeliveryJobEvent(jobId, 'fare_settled', cfg.configVersion, {
      estimatedFareCentavos,
      waitPickup,
      waitDropoff,
      finalFareCentavos,
    });
  }

  return { finalFareCentavos, waitPickup, waitDropoff, policyVersion: cfg.configVersion };
}

export async function confirmDeliveryPhotoProof(input: {
  jobId: string;
  proofType: 'pickup_photo' | 'dropoff_photo';
  photoRef: string;
  actorUserId: string;
}) {
  if (input.photoRef.trim().length < 8) {
    throw new Error('Referência da foto inválida');
  }

  const cfg = await getDeliveryProductionConfig();

  if (config.useMemoryDb) {
    memoryEvents.push({
      jobId: input.jobId,
      eventType: input.proofType === 'pickup_photo' ? 'pickup_confirmed' : 'dropoff_confirmed',
    });
    return { ok: true, proofType: input.proofType };
  }

  await pool.query(
    `INSERT INTO delivery_proof_events (delivery_job_id, proof_type, proof_value, actor_user_id)
     VALUES ($1,$2,$3,$4)`,
    [input.jobId, input.proofType, input.photoRef, input.actorUserId],
  );

  await recordDeliveryJobEvent(
    input.jobId,
    input.proofType === 'pickup_photo' ? 'pickup_confirmed' : 'dropoff_confirmed',
    cfg.configVersion,
    { proofType: input.proofType, photoRef: input.photoRef.slice(0, 64) },
  );

  return { ok: true, proofType: input.proofType };
}

async function recordDeliveryJobEvent(
  jobId: string,
  eventType: string,
  policyVersion: string,
  metadata: Record<string, unknown> = {},
) {
  if (config.useMemoryDb) {
    memoryEvents.push({ jobId, eventType });
    return;
  }
  await pool.query(
    `INSERT INTO delivery_job_events (delivery_job_id, event_type, policy_version, metadata_json)
     VALUES ($1,$2,$3,$4)`,
    [jobId, eventType, policyVersion, JSON.stringify(metadata)],
  );
}

export function __testResetDeliveryProductionMemory() {
  memoryRestrictions.clear();
  memoryWaitCharges.clear();
  memoryEvents.length = 0;
  Object.assign(memoryConfig, {
    minDriverReputation: 4.5,
    maxDeclaredWeightKg: 30,
    fragileMultiplier: 1.08,
    priorityMultiplier: 1.18,
    insuranceRateBps: 200,
    insuranceFeeCapCentavos: 2000,
    pickupIncludedWaitMinutes: 5,
    pickupWaitPerMinuteCentavos: 80,
    dropoffIncludedWaitMinutes: 5,
    dropoffWaitPerMinuteCentavos: 80,
    configVersion: 'camada39-memory-v1',
  });
}

export function __testGetDeliveryProductionEvents() {
  return memoryEvents;
}

export function __testGetDeliveryWaitFees(jobId: string) {
  return memoryWaitCharges.get(jobId);
}
