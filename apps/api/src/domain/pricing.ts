import { getCategory } from './rideCategories.js';
import type { PricingRegionDefaults, QuoteRequest, QuoteResult, RideCategoryCode } from './types.js';

export const DEFAULT_PRICING_REGION: PricingRegionDefaults = {
  baseFareCentavos: 500,
  distanceRateCentavosKm: 220,
  timeRateCentavosMin: 35,
  minimumFareCentavos: 800,
  bookingFeeCentavos: 150,
  trafficCoefficient: 12,
};

export function computeDynamicMultiplierRaw(factors: {
  demandPressure: number;
  weatherPressure: number;
  eventPressure: number;
  airportPressure: number;
  trafficPressure: number;
  supplyShortage: number;
  timePressure: number;
  conversionPressure: number;
}): number {
  return (
    1 +
    0.28 * Math.max(0, factors.demandPressure - 1) +
    0.16 * factors.weatherPressure +
    0.12 * factors.eventPressure +
    0.1 * factors.airportPressure +
    0.14 * factors.trafficPressure +
    0.14 * factors.supplyShortage +
    0.04 * factors.timePressure +
    0.02 * factors.conversionPressure
  );
}

export function clampDynamic(multiplier: number, cap: number): number {
  return Math.max(1, Math.min(multiplier, cap));
}

export function computeQuote(req: QuoteRequest, region: PricingRegionDefaults = DEFAULT_PRICING_REGION): QuoteResult {
  const category = getCategory(req.categoryCode);
  if (!category) throw new Error(`Categoria inválida: ${req.categoryCode}`);

  const m = category.tariffMultipliers;
  const dynamic = clampDynamic(req.dynamicMultiplier ?? 1, category.dynamicCap);

  const base = region.baseFareCentavos * m.base;
  const distance = req.distanceKm * region.distanceRateCentavosKm * m.distance;
  const time = req.durationMin * region.timeRateCentavosMin * m.time;
  const minimum = region.minimumFareCentavos * m.minimum;
  const tolls = req.tollsCentavos ?? 0;
  const airport = req.airportFeeCentavos ?? 0;
  const addons = req.addonsCentavos ?? 0;

  const fareBeforeDiscount = Math.max(minimum, base + distance + time + tolls + airport + addons) * dynamic;
  const passengerFare = Math.round(fareBeforeDiscount + region.bookingFeeCentavos);

  const takeRate = (category.takeRateBpsMin + category.takeRateBpsMax) / 2 / 10000;
  const driverDynamicShare = category.driverDynamicShareBps / 10000;
  const dynamicDelta = Math.max(0, fareBeforeDiscount - Math.max(minimum, base + distance + time));
  const driverBase = (base + distance + time) * (1 - takeRate);
  const driverDynamic = dynamicDelta * driverDynamicShare;
  const estimatedDriverPayout = Math.round(driverBase + driverDynamic + tolls);

  return {
    categoryCode: req.categoryCode,
    categoryName: category.name,
    passengerFareCentavos: passengerFare,
    estimatedDriverPayoutCentavos: estimatedDriverPayout,
    dynamicMultiplier: dynamic,
    breakdown: {
      base: Math.round(base),
      distance: Math.round(distance),
      time: Math.round(time),
      minimum: Math.round(minimum),
      tolls,
      airport,
      addons,
      bookingFee: region.bookingFeeCentavos,
      dynamicMultiplier: dynamic,
    },
  };
}

export function formatFare(centavos: number): string {
  return `R$ ${(centavos / 100).toFixed(2).replace('.', ',')}`;
}

export function suggestCategoriesForContext(ctx: {
  passengers: number;
  hasLargeBaggage?: boolean;
  hasPet?: boolean;
  isAirport?: boolean;
  isCorporate?: boolean;
  needsWheelchair?: boolean;
}): RideCategoryCode[] {
  if (ctx.needsWheelchair) return ['pcd'];
  if (ctx.hasPet) return ['pet', 'suv', 'comfort'];
  if (ctx.isAirport) return ['aeroporto', 'executivo', 'comfort', 'economico'];
  if (ctx.isCorporate) return ['corporativo', 'executivo', 'comfort'];
  if (ctx.passengers > 4) return ['suv', 'van', 'micro_onibus'];
  if (ctx.hasLargeBaggage) return ['suv', 'comfort', 'economico'];
  if (ctx.passengers === 1 && !ctx.hasLargeBaggage) return ['moto', 'economico', 'compartilhado'];
  return ['economico', 'comfort', 'compartilhado'];
}
