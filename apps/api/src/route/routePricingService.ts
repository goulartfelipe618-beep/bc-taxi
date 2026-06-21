import { formatFare } from '../domain/pricing.js';
import type { RideCategoryCode } from '../domain/types.js';
import { buildEngineQuote } from '../pricing/pricingEngineService.js';
import type { RouteAlternative, RouteStrategy } from './types.js';

export interface RouteFareEstimate {
  strategy: RouteStrategy;
  passengerFareCentavos: number;
  trafficSurchargeCentavos: number;
  tollsCentavos: number;
  passengerFareLabel: string;
  etaMinutes: number;
  distanceKm: number;
}

export async function estimateFareForAlternative(
  categoryCode: RideCategoryCode,
  alt: RouteAlternative,
  context: { fromLat: number; fromLng: number; toLat: number; toLng: number },
): Promise<RouteFareEstimate> {
  const distanceKm = alt.distanceM / 1000;
  const durationMin = alt.etaSeconds / 60;
  const quote = await buildEngineQuote({
    categoryCode,
    distanceKm,
    durationMin,
    tollsCentavos: alt.tollsTotalCentavos,
    trafficIndex: alt.trafficLevelIndex,
    fromLat: context.fromLat,
    fromLng: context.fromLng,
    toLat: context.toLat,
    toLng: context.toLng,
  });

  return {
    strategy: alt.strategy,
    passengerFareCentavos: quote.passengerFareCentavos,
    trafficSurchargeCentavos: quote.trafficSurchargeCentavos,
    tollsCentavos: alt.tollsTotalCentavos,
    passengerFareLabel: formatFare(quote.passengerFareCentavos),
    etaMinutes: Math.round(durationMin),
    distanceKm: Math.round(distanceKm * 10) / 10,
  };
}

export async function estimateFaresForAlternatives(
  categoryCode: RideCategoryCode,
  alternatives: RouteAlternative[],
  context: { fromLat: number; fromLng: number; toLat: number; toLng: number },
): Promise<RouteFareEstimate[]> {
  return Promise.all(alternatives.map((alt) => estimateFareForAlternative(categoryCode, alt, context)));
}
