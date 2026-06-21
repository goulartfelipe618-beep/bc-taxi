import { createHash, randomInt, randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';
import { createRideRequest, startMatching } from '../match/matchService.js';
import { getPassengerReputation } from '../reviews/reputationService.js';
import { quoteWithDynamicPricing } from '../pricing/dynamicPricingService.js';
import { authorizeRidePayment, attachIntentToRide } from '../payments/paymentService.js';
import { DEMO_PAYMENT_METHOD_IDS } from '../payments/paymentStore.js';
import { emitEvent } from '../realtime/eventBus.js';

export type DeliveryJobStatus = 'created' | 'pickup_confirmed' | 'in_transit' | 'delivered' | 'cancelled';

export interface DeliveryJobRecord {
  id: string;
  rideId: string;
  requesterId: string;
  packageDescription: string;
  declaredWeightKg?: number;
  declaredValueCentavos?: number;
  isFragile: boolean;
  isPriority: boolean;
  status: DeliveryJobStatus;
  waitMinutesPickup: number;
  waitMinutesDropoff: number;
  insuranceFeeCentavos: number;
  estimatedFareCentavos?: number;
  createdAt: Date;
}

const FORBIDDEN_KEYWORDS = ['explosivo', 'arma', 'drogas', 'inflamável', 'radioativo'];

const memoryJobs: DeliveryJobRecord[] = [];
const memoryProofs: Array<{ jobId: string; proofType: string; proofValue?: string; actorUserId?: string }> = [];
const memoryPinHashes = new Map<string, { pickup: string; dropoff: string }>();

function hashPin(pin: string) {
  return createHash('sha256').update(pin).digest('hex');
}

function generatePin() {
  return String(randomInt(100000, 999999));
}

export function validatePackageDeclaration(description: string): { ok: boolean; reason?: string } {
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

function computeDeliveryAddons(input: {
  isFragile: boolean;
  isPriority: boolean;
  declaredValueCentavos?: number;
}) {
  let addons = 0;
  if (input.isFragile) addons += 300;
  if (input.isPriority) addons += 500;
  if (input.declaredValueCentavos && input.declaredValueCentavos > 0) {
    addons += Math.min(Math.round(input.declaredValueCentavos * 0.02), 2000);
  }
  return addons;
}

function mapJob(row: Record<string, unknown>): DeliveryJobRecord {
  return {
    id: row.id as string,
    rideId: row.ride_id as string,
    requesterId: row.requester_id as string,
    packageDescription: row.package_description as string,
    declaredWeightKg: row.declared_weight_kg != null ? Number(row.declared_weight_kg) : undefined,
    declaredValueCentavos:
      row.declared_value_centavos != null ? Number(row.declared_value_centavos) : undefined,
    isFragile: Boolean(row.is_fragile),
    isPriority: Boolean(row.is_priority),
    status: row.status as DeliveryJobStatus,
    waitMinutesPickup: Number(row.wait_minutes_pickup ?? 0),
    waitMinutesDropoff: Number(row.wait_minutes_dropoff ?? 0),
    insuranceFeeCentavos: Number(row.insurance_fee_centavos ?? 0),
    estimatedFareCentavos: row.estimated_fare_centavos != null ? Number(row.estimated_fare_centavos) : undefined,
    createdAt: new Date(row.created_at as string),
  };
}

export function toPublicDeliveryJob(job: DeliveryJobRecord, pins?: { pickupPin?: string; dropoffPin?: string }) {
  return {
    id: job.id,
    rideId: job.rideId,
    packageDescription: job.packageDescription,
    declaredWeightKg: job.declaredWeightKg,
    declaredValueCentavos: job.declaredValueCentavos,
    isFragile: job.isFragile,
    isPriority: job.isPriority,
    status: job.status,
    insuranceFeeCentavos: job.insuranceFeeCentavos,
    estimatedFareCentavos: job.estimatedFareCentavos,
    pickupPin: pins?.pickupPin,
    dropoffPin: pins?.dropoffPin,
    createdAt: job.createdAt.toISOString(),
  };
}

export async function createDeliveryJob(input: {
  requesterId: string;
  pickupLat: number;
  pickupLng: number;
  pickupAddress?: string;
  dropoffLat: number;
  dropoffLng: number;
  dropoffAddress?: string;
  packageDescription: string;
  declaredWeightKg?: number;
  declaredValueCentavos?: number;
  isFragile?: boolean;
  isPriority?: boolean;
  distanceKm?: number;
  durationMin?: number;
  paymentMethodId?: string;
}) {
  const pkgCheck = validatePackageDeclaration(input.packageDescription);
  if (!pkgCheck.ok) throw new Error(pkgCheck.reason ?? 'Pacote inválido');

  const insuranceFeeCentavos = computeDeliveryAddons({
    isFragile: input.isFragile ?? false,
    isPriority: input.isPriority ?? false,
    declaredValueCentavos: input.declaredValueCentavos,
  });

  let baseFare = 3500;
  if (input.distanceKm && input.durationMin) {
    const quote = await quoteWithDynamicPricing('entrega', input.distanceKm, input.durationMin, {
      lat: input.pickupLat,
      lng: input.pickupLng,
    });
    baseFare = quote.passengerFareCentavos;
  }
  const estimatedFareCentavos = baseFare + insuranceFeeCentavos;

  const paymentMethodId = input.paymentMethodId ?? DEMO_PAYMENT_METHOD_IDS.pix;
  const { intent } = await authorizeRidePayment({
    userId: input.requesterId,
    paymentMethodId,
    amountCentavos: estimatedFareCentavos,
  });

  const rep = await getPassengerReputation(input.requesterId);
  const ride = await createRideRequest({
    passengerId: input.requesterId,
    categoryCode: 'entrega',
    pickupLat: input.pickupLat,
    pickupLng: input.pickupLng,
    pickupAddress: input.pickupAddress,
    dropoffLat: input.dropoffLat,
    dropoffLng: input.dropoffLng,
    dropoffAddress: input.dropoffAddress,
    passengerCount: 0,
    estimatedFareCentavos,
    passengerReputation: rep,
  });

  await attachIntentToRide(ride.id, intent.id);

  const pickupPin = generatePin();
  const dropoffPin = generatePin();
  const pickupHash = hashPin(pickupPin);
  const dropoffHash = hashPin(dropoffPin);

  const job: DeliveryJobRecord = {
    id: randomUUID(),
    rideId: ride.id,
    requesterId: input.requesterId,
    packageDescription: input.packageDescription,
    declaredWeightKg: input.declaredWeightKg,
    declaredValueCentavos: input.declaredValueCentavos,
    isFragile: input.isFragile ?? false,
    isPriority: input.isPriority ?? false,
    status: 'created',
    waitMinutesPickup: 0,
    waitMinutesDropoff: 0,
    insuranceFeeCentavos,
    estimatedFareCentavos,
    createdAt: new Date(),
  };

  if (config.useMemoryDb) {
    memoryJobs.push(job);
    memoryPinHashes.set(job.id, { pickup: pickupHash, dropoff: dropoffHash });
  } else {
    const { rows } = await pool.query(
      `INSERT INTO delivery_jobs (
        id, ride_id, requester_id, package_description, declared_weight_kg, declared_value_centavos,
        is_fragile, is_priority, pickup_pin_hash, dropoff_pin_hash, insurance_fee_centavos, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'created') RETURNING *`,
      [
        job.id,
        job.rideId,
        job.requesterId,
        job.packageDescription,
        job.declaredWeightKg ?? null,
        job.declaredValueCentavos ?? null,
        job.isFragile,
        job.isPriority,
        pickupHash,
        dropoffHash,
        insuranceFeeCentavos,
      ],
    );
    Object.assign(job, mapJob(rows[0]));
  }

  const matched = await startMatching(ride.id, rep);

  void emitEvent('DELIVERY_CREATED', 'delivery', job.id, { rideId: ride.id }, {
    userIds: [input.requesterId],
    rideId: ride.id,
  });

  return {
    job,
    ride: matched ?? ride,
    paymentIntentId: intent.id,
    pins: { pickupPin, dropoffPin },
  };
}

async function getJob(id: string): Promise<DeliveryJobRecord | null> {
  if (config.useMemoryDb) return memoryJobs.find((j) => j.id === id) ?? null;
  const { rows } = await pool.query(`SELECT * FROM delivery_jobs WHERE id = $1`, [id]);
  return rows[0] ? mapJob(rows[0]) : null;
}

export async function getDeliveryJob(id: string, userId: string) {
  const job = await getJob(id);
  if (!job) return null;
  if (job.requesterId !== userId) return null;
  return job;
}

export async function confirmDeliveryProof(input: {
  jobId: string;
  actorUserId: string;
  proofType: 'pickup_pin' | 'dropoff_pin';
  pin: string;
}) {
  const job = await getJob(input.jobId);
  if (!job) throw new Error('Entrega não encontrada');

  let pickupHash: string;
  let dropoffHash: string;
  if (config.useMemoryDb) {
    const hashes = memoryPinHashes.get(job.id);
    if (!hashes) throw new Error('PIN não configurado');
    pickupHash = hashes.pickup;
    dropoffHash = hashes.dropoff;
  } else {
    const { rows } = await pool.query(
      `SELECT pickup_pin_hash, dropoff_pin_hash FROM delivery_jobs WHERE id = $1`,
      [job.id],
    );
    if (!rows[0]) throw new Error('Entrega não encontrada');
    pickupHash = rows[0].pickup_pin_hash as string;
    dropoffHash = rows[0].dropoff_pin_hash as string;
  }

  const pinHash = hashPin(input.pin);
  if (input.proofType === 'pickup_pin') {
    if (pinHash !== pickupHash) throw new Error('PIN de coleta inválido');
    if (job.status !== 'created') throw new Error('Coleta já confirmada');
    job.status = 'pickup_confirmed';
  } else {
    if (pinHash !== dropoffHash) throw new Error('PIN de entrega inválido');
    if (job.status !== 'pickup_confirmed' && job.status !== 'in_transit') {
      throw new Error('Confirme a coleta antes da entrega');
    }
    job.status = 'delivered';
  }

  if (config.useMemoryDb) {
    memoryProofs.push({
      jobId: job.id,
      proofType: input.proofType,
      actorUserId: input.actorUserId,
    });
  } else {
    await pool.query(
      `UPDATE delivery_jobs SET status = $2, updated_at = NOW() WHERE id = $1`,
      [job.id, job.status],
    );
    await pool.query(
      `INSERT INTO delivery_proof_events (delivery_job_id, proof_type, actor_user_id)
       VALUES ($1,$2,$3)`,
      [job.id, input.proofType, input.actorUserId],
    );
  }

  void emitEvent(
    input.proofType === 'pickup_pin' ? 'DELIVERY_PICKUP_CONFIRMED' : 'DELIVERY_COMPLETED',
    'delivery',
    job.id,
    { rideId: job.rideId },
    { userIds: [job.requesterId], rideId: job.rideId },
  );

  return job;
}

export async function listRequesterDeliveries(requesterId: string) {
  if (config.useMemoryDb) {
    return memoryJobs.filter((j) => j.requesterId === requesterId).slice(0, 30);
  }
  const { rows } = await pool.query(
    `SELECT * FROM delivery_jobs WHERE requester_id = $1 ORDER BY created_at DESC LIMIT 30`,
    [requesterId],
  );
  return rows.map(mapJob);
}
