import { getCategory } from '../domain/rideCategories.js';
import { getTier, driverBlockedCategories } from '../domain/reputation.js';
import { computeMatchScore } from '../domain/match.js';
import type { RideCategoryCode } from '../domain/types.js';
import { isPairBlocked } from './blockService.js';
import { isDriverCompliantForCategory } from '../fleet/complianceService.js';
import type { DriverRecord, PassengerContext, RideRecord, ScoredCandidate } from './types.js';

const LOCATION_SLA_SECONDS = 120;

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function estimateEtaSeconds(distanceM: number): number {
  const avgSpeedMs = 8.3; // ~30 km/h urbano
  return Math.max(60, Math.round(distanceM / avgSpeedMs));
}

function isLocationFresh(driver: DriverRecord): boolean {
  if (driver.lat == null || driver.lng == null || !driver.locationUpdatedAt) return false;
  return Date.now() - driver.locationUpdatedAt.getTime() <= LOCATION_SLA_SECONDS * 1000;
}

function driverSupportsCategory(driver: DriverRecord, categoryCode: string): number {
  if (driver.enabledCategories.includes(categoryCode)) return 1.0;
  const category = getCategory(categoryCode as RideCategoryCode);
  if (!category) return 0;
  if (category.inheritsBaseCategory && driver.enabledCategories.includes(category.inheritsBaseCategory)) {
    return 0.85;
  }
  return 0;
}

function passesCategoryHardRules(driver: DriverRecord, ride: RideRecord): boolean {
  const category = getCategory(ride.categoryCode as RideCategoryCode);
  if (!category) return false;

  const blocked = driverBlockedCategories(driver.reputationScore);
  if (blocked.includes('*') || blocked.includes(ride.categoryCode)) return false;

  if (driver.reputationScore < category.driverRequirements.minRating) return false;
  if (
    category.driverRequirements.minCompletedRides != null &&
    driver.completedRides < category.driverRequirements.minCompletedRides
  ) {
    return false;
  }
  if (
    category.driverRequirements.maxCancellationRate != null &&
    driver.cancellationRate > category.driverRequirements.maxCancellationRate
  ) {
    return false;
  }
  if (
    category.driverRequirements.minAcceptanceRate != null &&
    driver.acceptanceRate < category.driverRequirements.minAcceptanceRate
  ) {
    return false;
  }

  if (ride.needsWheelchair && !driver.wheelchairAccessible) return false;
  if (ride.hasPet && !driver.petReady) return false;
  if (category.code === 'comfort' && !driver.comfortApproved) return false;
  if (ride.passengerCount > category.passengerLimitMax) return false;

  return driverSupportsCategory(driver, ride.categoryCode) > 0;
}

export async function filterEligibleDrivers(
  drivers: DriverRecord[],
  ride: RideRecord,
  passenger: PassengerContext,
  radiusM: number,
): Promise<DriverRecord[]> {
  const eligible: DriverRecord[] = [];

  for (const driver of drivers) {
    if (!driver.isOnline || driver.operationalStatus !== 'online') continue;
    if (driver.activeRideId) continue;
    if (!isLocationFresh(driver)) continue;
    if (!passesCategoryHardRules(driver, ride)) continue;

    const distanceM = haversineMeters(ride.pickupLat, ride.pickupLng, driver.lat!, driver.lng!);
    if (distanceM > radiusM) continue;

    if (await isPairBlocked(passenger.passengerId, driver.userId)) continue;
    if (!(await isDriverCompliantForCategory(driver.userId, ride.categoryCode))) continue;

    eligible.push(driver);
  }

  return eligible;
}

export function scoreCandidates(
  drivers: DriverRecord[],
  ride: RideRecord,
  passenger: PassengerContext,
  radiusM: number,
): ScoredCandidate[] {
  const category = getCategory(ride.categoryCode as RideCategoryCode);
  const etaMaxStage = estimateEtaSeconds(radiusM);
  const passengerTier = getTier(passenger.reputationScore);
  const isPassengerElite = passengerTier === 'elite' || passengerTier === 'premium';

  const scored: ScoredCandidate[] = drivers.map((driver) => {
    const distanceM = haversineMeters(ride.pickupLat, ride.pickupLng, driver.lat!, driver.lng!);
    const etaPickupS = estimateEtaSeconds(distanceM);
    const compatibility = driverSupportsCategory(driver, ride.categoryCode);
    const driverTier = getTier(driver.reputationScore);

    const featureVector = {
      distanceM,
      etaPickupS,
      reputation: driver.reputationScore,
      acceptance: driver.acceptanceRate,
      cancellation: driver.cancellationRate,
      onlineMinutes: driver.onlineMinutesToday,
      completedRides: driver.completedRides,
      compatibility,
    };

    const score = computeMatchScore({
      etaPickupSeconds: etaPickupS,
      etaMaxStageSeconds: etaMaxStage,
      rating: driver.reputationScore,
      acceptanceRate: driver.acceptanceRate,
      cancellationRate: driver.cancellationRate,
      onlineMinutesToday: driver.onlineMinutesToday,
      completedRides: driver.completedRides,
      compatibility,
      isPassengerElite,
      isDriverElite: driverTier === 'elite' || driverTier === 'premium',
      isCorporate: ride.isCorporate,
      isPcdAdapted: ride.needsWheelchair && driver.wheelchairAccessible,
      isShared: ride.isShared,
    });

    return { driver, score, etaPickupS, distanceM, compatibility, featureVector };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

export function usesSequentialOffer(categoryCode: string): boolean {
  const category = getCategory(categoryCode as RideCategoryCode);
  if (!category) return false;
  return category.isPremium || category.code === 'aeroporto' || category.code === 'corporativo';
}

export function getRadiusStages(categoryCode: string): number[] {
  const category = getCategory(categoryCode as RideCategoryCode);
  return category?.searchRadiusStagesM ?? [800, 1500, 2500, 4000, 6500, 10000];
}

export function getOfferTimeoutSeconds(categoryCode: string): number {
  const category = getCategory(categoryCode as RideCategoryCode);
  return category?.offerTimeoutSeconds ?? 8;
}
