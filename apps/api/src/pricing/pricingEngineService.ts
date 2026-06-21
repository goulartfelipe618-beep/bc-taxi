import { getCategory } from '../domain/rideCategories.js';
import { clampDynamic, computeQuote, DEFAULT_PRICING_REGION } from '../domain/pricing.js';
import type { PricingRegionDefaults, QuoteRequest, QuoteResult, RideCategoryCode } from '../domain/types.js';
import { config } from '../config.js';
import { getActivePricingRule, type PricingRuleVersion } from './pricingRuleStore.js';
import { estimateTollsCentavos } from './tollService.js';
import { resolveAirportContext, toPublicContext } from '../airport/airportService.js';

export interface EngineQuoteInput {
  categoryCode: RideCategoryCode;
  distanceKm: number;
  durationMin: number;
  dynamicMultiplier?: number;
  trafficIndex?: number;
  tollsCentavos?: number;
  airportFeeCentavos?: number;
  addonsCentavos?: number;
  discountsCentavos?: number;
  regionId?: string;
  rideId?: string;
  fromLat?: number;
  fromLng?: number;
  toLat?: number;
  toLng?: number;
}

export interface EngineQuoteResult extends QuoteResult {
  ruleVersionId: string;
  regionId: string;
  regulatoryFeeCentavos: number;
  trafficSurchargeCentavos: number;
  platformFeeCentavos: number;
  tollNames: string[];
  airportContext?: ReturnType<typeof toPublicContext>;
}

function ruleToRegion(rule: PricingRuleVersion): PricingRegionDefaults {
  return {
    baseFareCentavos: rule.baseFareCentavos,
    distanceRateCentavosKm: rule.distanceRateCentavosKm,
    timeRateCentavosMin: rule.timeRateCentavosMin,
    minimumFareCentavos: rule.minimumFareCentavos,
    bookingFeeCentavos: rule.bookingFeeCentavos,
    trafficCoefficient: rule.trafficCoefficient,
  };
}

function applyRuleOverrides(base: QuoteResult, rule: PricingRuleVersion, extras: {
  trafficSurchargeCentavos: number;
  regulatoryFeeCentavos: number;
  discountsCentavos: number;
  tollNames: string[];
}): EngineQuoteResult {
  const takeRate = rule.takeRateBps / 10000;
  const driverDynamicShare = rule.driverDynamicShareBps / 10000;
  const category = getCategory(base.categoryCode)!;

  const baseComponent = base.breakdown.base + base.breakdown.distance + base.breakdown.time;
  const fareBeforeFees =
    base.passengerFareCentavos -
    base.breakdown.bookingFee +
    extras.trafficSurchargeCentavos -
    extras.discountsCentavos;

  const dynamicDelta = Math.max(0, fareBeforeFees - Math.max(base.breakdown.minimum, baseComponent));
  const driverBase = baseComponent * (1 - takeRate);
  const driverDynamic = dynamicDelta * driverDynamicShare;
  const estimatedDriverPayout = Math.round(
    driverBase + driverDynamic + base.breakdown.tolls + extras.trafficSurchargeCentavos,
  );

  const platformTake = Math.round(baseComponent * takeRate);
  const platformDynamic = Math.round(dynamicDelta * (1 - driverDynamicShare));
  const platformFeeCentavos =
    platformTake + platformDynamic + base.breakdown.bookingFee + extras.regulatoryFeeCentavos;

  return {
    ...base,
    passengerFareCentavos: Math.max(
      0,
      base.passengerFareCentavos + extras.trafficSurchargeCentavos + extras.regulatoryFeeCentavos - extras.discountsCentavos,
    ),
    estimatedDriverPayoutCentavos: estimatedDriverPayout,
    ruleVersionId: rule.id,
    regionId: rule.regionId,
    regulatoryFeeCentavos: extras.regulatoryFeeCentavos,
    trafficSurchargeCentavos: extras.trafficSurchargeCentavos,
    platformFeeCentavos,
    tollNames: extras.tollNames,
    breakdown: {
      ...base.breakdown,
      trafficSurcharge: extras.trafficSurchargeCentavos,
      regulatoryFee: extras.regulatoryFeeCentavos,
      discounts: extras.discountsCentavos,
      platformFee: platformFeeCentavos,
    },
  };
}

export async function buildEngineQuote(input: EngineQuoteInput): Promise<EngineQuoteResult> {
  const regionId = input.regionId
    ?? (input.fromLat != null && input.fromLng != null
      ? await (
          await import('../region/serviceRegionGeoService.js')
        ).resolvePricingRegionIdAtPoint(input.fromLat, input.fromLng)
      : config.defaultPricingRegionId);
  const rule = await getActivePricingRule(input.categoryCode, regionId);
  const region = ruleToRegion(rule);

  const airportContext = await resolveAirportContext({
    fromLat: input.fromLat,
    fromLng: input.fromLng,
    toLat: input.toLat,
    toLng: input.toLng,
    categoryCode: input.categoryCode,
    airportFeeOverrideCentavos: input.airportFeeCentavos,
  });
  const airportFeeCentavos =
    input.airportFeeCentavos ?? airportContext.airportFeeCentavos;

  let tollsCentavos = input.tollsCentavos;
  let tollNames: string[] = [];
  if (tollsCentavos == null && input.fromLat != null && input.fromLng != null && input.toLat != null && input.toLng != null) {
    const tollEstimate = await estimateTollsCentavos({
      fromLat: input.fromLat,
      fromLng: input.fromLng,
      toLat: input.toLat,
      toLng: input.toLng,
      distanceKm: input.distanceKm,
    });
    tollsCentavos = tollEstimate.tollsCentavos;
    tollNames = tollEstimate.tollNames;
  }

  const trafficIndex = input.trafficIndex ?? 0;
  const trafficSurchargeCentavos = Math.round(trafficIndex * rule.trafficCoefficient);

  const dynamicMultiplier =
    input.dynamicMultiplier ??
    (await import('./rideDynamicLockService.js').then(({ resolveDynamicMultiplierForRide }) =>
      resolveDynamicMultiplierForRide({
        rideId: input.rideId,
        categoryCode: input.categoryCode,
        regionId,
        context: { lat: input.fromLat, lng: input.fromLng },
      }),
    ));

  const category = getCategory(input.categoryCode);
  if (!category) throw new Error(`Categoria inválida: ${input.categoryCode}`);

  const dynamicCap = await (
    await import('../config/operationalParamsService.js')
  ).resolveDynamicCap(input.categoryCode, regionId);

  const req: QuoteRequest = {
    categoryCode: input.categoryCode,
    distanceKm: input.distanceKm,
    durationMin: input.durationMin,
    dynamicMultiplier: clampDynamic(dynamicMultiplier, dynamicCap),
    tollsCentavos: tollsCentavos ?? 0,
    airportFeeCentavos,
    addonsCentavos: (input.addonsCentavos ?? 0) + trafficSurchargeCentavos,
  };

  const base = computeQuote(req, region);
  const result = applyRuleOverrides(base, rule, {
    trafficSurchargeCentavos,
    regulatoryFeeCentavos: rule.regulatoryFeeCentavos,
    discountsCentavos: input.discountsCentavos ?? 0,
    tollNames,
  });
  return {
    ...result,
    airportContext: toPublicContext(airportContext),
  };
}

export async function quoteWithEngine(
  categoryCode: RideCategoryCode,
  distanceKm: number,
  durationMin: number,
  context?: {
    lat?: number;
    lng?: number;
    toLat?: number;
    toLng?: number;
    trafficIndex?: number;
    rideId?: string;
  },
) {
  return buildEngineQuote({
    categoryCode,
    distanceKm,
    durationMin,
    fromLat: context?.lat,
    fromLng: context?.lng,
    toLat: context?.toLat,
    toLng: context?.toLng,
    trafficIndex: context?.trafficIndex,
    rideId: context?.rideId,
  });
}
