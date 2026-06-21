import { getCategory } from '../domain/rideCategories.js';
import type { RideCategoryCode } from '../domain/types.js';
import { buildEngineQuote } from '../pricing/pricingEngineService.js';
import { createScheduledRide } from '../scheduling/scheduleService.js';
import {
  type CollectiveBookingRecord,
  type CollectiveCategoryCode,
  driverHasCollectiveCert,
  getCollectiveBooking,
  insertCollectiveBooking,
  listCollectiveBookingsForPassenger,
} from './collectiveStore.js';

const LARGE_GROUP_THRESHOLD = 15;
const MIN_SCHEDULE_LEAD_MS = 30 * 60 * 1000;

export interface CollectiveQuoteInput {
  categoryCode: CollectiveCategoryCode;
  distanceKm: number;
  durationMin: number;
  passengerCount: number;
  baggageCount?: number;
  isAirportShuttle?: boolean;
  isLargeGroup?: boolean;
  fromLat?: number;
  fromLng?: number;
  toLat?: number;
  toLng?: number;
}

export interface CollectiveQuoteResult {
  categoryCode: CollectiveCategoryCode;
  categoryName: string;
  baseFareCentavos: number;
  collectiveMultiplier: number;
  finalFareCentavos: number;
  passengerCount: number;
  maxPassengers: number;
  baggageCount: number;
  maxBaggagePerPassenger: number;
  requiresScheduling: boolean;
  multiplierBreakdown: Record<string, number>;
}

function assertCategory(code: string): asserts code is CollectiveCategoryCode {
  if (code !== 'van' && code !== 'micro_onibus') {
    throw new Error('Categoria deve ser van ou micro_onibus');
  }
}

export function validateCollectiveCapacity(params: {
  categoryCode: CollectiveCategoryCode;
  passengerCount: number;
  baggageCount?: number;
}) {
  const category = getCategory(params.categoryCode);
  if (!category) throw new Error('Categoria inválida');

  if (params.passengerCount < category.passengerLimitMin) {
    throw new Error(`Mínimo de ${category.passengerLimitMin} passageiro(s)`);
  }
  if (params.passengerCount > category.passengerLimitMax) {
    throw new Error(`Máximo de ${category.passengerLimitMax} passageiros para ${category.name}`);
  }

  const baggage = params.baggageCount ?? 0;
  if (params.categoryCode === 'van' && baggage > params.passengerCount) {
    throw new Error('Van: até 1 mala média por passageiro');
  }
}

export function computeCollectiveMultipliers(
  categoryCode: CollectiveCategoryCode,
  opts: { isAirportShuttle?: boolean; isLargeGroup?: boolean; passengerCount: number },
): Record<string, number> {
  const category = getCategory(categoryCode)!;
  const sm = category.specificMultipliers;
  const breakdown: Record<string, number> = {};

  if (categoryCode === 'van') {
    breakdown.group_coordination = sm.group_coordination ?? 1.06;
    if (opts.isAirportShuttle) breakdown.airport_shuttle = sm.airport_shuttle ?? 1.1;
  } else {
    breakdown.reservation = sm.reservation ?? 1.08;
    const largeGroup = opts.isLargeGroup || opts.passengerCount >= LARGE_GROUP_THRESHOLD;
    if (largeGroup) breakdown.large_group = sm.large_group ?? 1.12;
  }

  return breakdown;
}

function applyMultipliers(baseFare: number, breakdown: Record<string, number>): number {
  let fare = baseFare;
  for (const mult of Object.values(breakdown)) {
    fare = Math.round(fare * mult);
  }
  return fare;
}

export async function quoteCollectiveTransport(input: CollectiveQuoteInput): Promise<CollectiveQuoteResult> {
  assertCategory(input.categoryCode);
  validateCollectiveCapacity({
    categoryCode: input.categoryCode,
    passengerCount: input.passengerCount,
    baggageCount: input.baggageCount,
  });

  const category = getCategory(input.categoryCode)!;
  const engine = await buildEngineQuote({
    categoryCode: input.categoryCode as RideCategoryCode,
    distanceKm: input.distanceKm,
    durationMin: input.durationMin,
    fromLat: input.fromLat,
    fromLng: input.fromLng,
    toLat: input.toLat,
    toLng: input.toLng,
  });

  const multiplierBreakdown = computeCollectiveMultipliers(input.categoryCode, {
    isAirportShuttle: input.isAirportShuttle,
    isLargeGroup: input.isLargeGroup,
    passengerCount: input.passengerCount,
  });

  const combinedMult = Object.values(multiplierBreakdown).reduce((a, b) => a * b, 1);
  const finalFare = applyMultipliers(engine.passengerFareCentavos, multiplierBreakdown);

  return {
    categoryCode: input.categoryCode,
    categoryName: category.name,
    baseFareCentavos: engine.passengerFareCentavos,
    collectiveMultiplier: Math.round(combinedMult * 1000) / 1000,
    finalFareCentavos: finalFare,
    passengerCount: input.passengerCount,
    maxPassengers: category.passengerLimitMax,
    baggageCount: input.baggageCount ?? 0,
    maxBaggagePerPassenger: input.categoryCode === 'van' ? 1 : 2,
    requiresScheduling: category.requiresScheduling,
    multiplierBreakdown,
  };
}

export async function bookCollectiveTransport(input: {
  passengerId: string;
  categoryCode: CollectiveCategoryCode;
  pickupLat: number;
  pickupLng: number;
  pickupAddress?: string;
  dropoffLat: number;
  dropoffLng: number;
  dropoffAddress?: string;
  scheduledAt: Date;
  passengerCount: number;
  baggageCount?: number;
  isAirportShuttle?: boolean;
  isLargeGroup?: boolean;
  groupLabel?: string;
  pickupNotes?: string;
  paymentMethodId?: string;
  distanceKm: number;
  durationMin: number;
}): Promise<{ booking: CollectiveBookingRecord; scheduleId: string }> {
  assertCategory(input.categoryCode);
  const category = getCategory(input.categoryCode)!;

  if (category.requiresScheduling && !input.scheduledAt) {
    throw new Error('Van e micro-ônibus exigem agendamento');
  }

  const lead = input.scheduledAt.getTime() - Date.now();
  if (lead < MIN_SCHEDULE_LEAD_MS) {
    throw new Error('Agendamento coletivo requer pelo menos 30 minutos de antecedência');
  }

  if (input.categoryCode === 'micro_onibus' && lead < 2 * 60 * 60 * 1000) {
    throw new Error('Micro-ônibus: agendamento preferencial com mínimo de 2 horas');
  }

  validateCollectiveCapacity({
    categoryCode: input.categoryCode,
    passengerCount: input.passengerCount,
    baggageCount: input.baggageCount,
  });

  const quote = await quoteCollectiveTransport({
    categoryCode: input.categoryCode,
    distanceKm: input.distanceKm,
    durationMin: input.durationMin,
    passengerCount: input.passengerCount,
    baggageCount: input.baggageCount,
    isAirportShuttle: input.isAirportShuttle,
    isLargeGroup: input.isLargeGroup,
    fromLat: input.pickupLat,
    fromLng: input.pickupLng,
    toLat: input.dropoffLat,
    toLng: input.dropoffLng,
  });

  const schedule = await createScheduledRide({
    passengerId: input.passengerId,
    categoryCode: input.categoryCode,
    pickupLat: input.pickupLat,
    pickupLng: input.pickupLng,
    pickupAddress: input.pickupAddress,
    dropoffLat: input.dropoffLat,
    dropoffLng: input.dropoffLng,
    dropoffAddress: input.dropoffAddress,
    scheduledAt: input.scheduledAt,
    paymentMethodId: input.paymentMethodId,
    estimatedFareCentavos: quote.finalFareCentavos,
    dispatchLeadMinutes: input.categoryCode === 'micro_onibus' ? 30 : 20,
  });

  const booking = await insertCollectiveBooking({
    passengerId: input.passengerId,
    categoryCode: input.categoryCode,
    scheduledRideId: schedule.id,
    passengerCount: input.passengerCount,
    baggageCount: input.baggageCount ?? 0,
    isAirportShuttle: input.isAirportShuttle ?? false,
    isLargeGroup: input.isLargeGroup ?? input.passengerCount >= LARGE_GROUP_THRESHOLD,
    groupLabel: input.groupLabel,
    pickupNotes: input.pickupNotes,
    estimatedFareCentavos: quote.finalFareCentavos,
    multiplierBreakdown: quote.multiplierBreakdown,
  });

  return { booking, scheduleId: schedule.id };
}

export function toPublicCollectiveQuote(q: CollectiveQuoteResult) {
  return {
    categoryCode: q.categoryCode,
    categoryName: q.categoryName,
    baseFareCentavos: q.baseFareCentavos,
    collectiveMultiplier: q.collectiveMultiplier,
    finalFareCentavos: q.finalFareCentavos,
    passengerCount: q.passengerCount,
    maxPassengers: q.maxPassengers,
    baggageCount: q.baggageCount,
    requiresScheduling: q.requiresScheduling,
    multiplierBreakdown: q.multiplierBreakdown,
  };
}

export function toPublicCollectiveBooking(b: CollectiveBookingRecord) {
  return {
    id: b.id,
    categoryCode: b.categoryCode,
    scheduledRideId: b.scheduledRideId,
    rideId: b.rideId,
    passengerCount: b.passengerCount,
    baggageCount: b.baggageCount,
    isAirportShuttle: b.isAirportShuttle,
    isLargeGroup: b.isLargeGroup,
    groupLabel: b.groupLabel,
    estimatedFareCentavos: b.estimatedFareCentavos,
    multiplierBreakdown: b.multiplierBreakdown,
    status: b.status,
    createdAt: b.createdAt.toISOString(),
  };
}

export { getCollectiveBooking, listCollectiveBookingsForPassenger, driverHasCollectiveCert };
