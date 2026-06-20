import type { RouteAlternative, RouteStrategy } from './types.js';

/** GeneralizedOperationalCost weights (guia §317) */
const GOC_WEIGHTS = {
  eta: 0.42,
  traffic: 0.22,
  toll: 0.14,
  incident: 0.12,
  distance: 0.1,
};

function normalize(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(1, Math.max(0, value / max));
}

export function computeGeneralizedCost(input: {
  etaSeconds: number;
  distanceM: number;
  tollsCentavos: number;
  trafficLevelIndex: number;
  incidentCount: number;
  strategy: RouteStrategy;
}): number {
  const etaNorm = normalize(input.etaSeconds, 3600);
  const distNorm = normalize(input.distanceM, 80000);
  const tollNorm = normalize(input.tollsCentavos, 5000);
  const trafficNorm = Math.min(1, input.trafficLevelIndex);
  const incidentNorm = normalize(input.incidentCount, 5);

  let cost =
    GOC_WEIGHTS.eta * etaNorm +
    GOC_WEIGHTS.traffic * trafficNorm +
    GOC_WEIGHTS.toll * tollNorm +
    GOC_WEIGHTS.incident * incidentNorm +
    GOC_WEIGHTS.distance * distNorm;

  switch (input.strategy) {
    case 'fastest':
      cost -= etaNorm * 0.08;
      break;
    case 'shortest':
      cost -= distNorm * 0.08;
      break;
    case 'economical':
      cost -= tollNorm * 0.06;
      cost += distNorm * 0.04;
      break;
    case 'less_traffic':
      cost -= trafficNorm * 0.1;
      break;
  }

  return Math.round(cost * 10000) / 10000;
}

export function deriveStrategyVariant(
  base: { distanceM: number; etaSeconds: number; tollsCentavos: number },
  strategy: RouteStrategy,
): Omit<RouteAlternative, 'geometry' | 'isRecommended'> {
  let distanceM = base.distanceM;
  let etaSeconds = base.etaSeconds;
  let tollsTotalCentavos = base.tollsCentavos;
  let trafficLevelIndex = 0.15;
  let incidentCount = 0;
  let deviationRiskScore = 0.05;

  switch (strategy) {
    case 'shortest':
      distanceM = Math.round(base.distanceM * 0.94);
      etaSeconds = Math.round(base.etaSeconds * 1.04);
      trafficLevelIndex = 0.22;
      deviationRiskScore = 0.08;
      break;
    case 'economical':
      distanceM = Math.round(base.distanceM * 1.02);
      etaSeconds = Math.round(base.etaSeconds * 1.08);
      tollsTotalCentavos = Math.max(0, Math.round(base.tollsCentavos * 0.6));
      trafficLevelIndex = 0.18;
      break;
    case 'less_traffic':
      distanceM = Math.round(base.distanceM * 1.06);
      etaSeconds = Math.round(base.etaSeconds * 1.05);
      trafficLevelIndex = 0.08;
      deviationRiskScore = 0.04;
      break;
    default:
      trafficLevelIndex = 0.12;
      break;
  }

  const generalizedCost = computeGeneralizedCost({
    etaSeconds,
    distanceM,
    tollsCentavos: tollsTotalCentavos,
    trafficLevelIndex,
    incidentCount,
    strategy,
  });

  return {
    strategy,
    distanceM,
    etaSeconds,
    tollsTotalCentavos,
    trafficLevelIndex,
    incidentCount,
    deviationRiskScore,
    generalizedCost,
  };
}

export function pickRecommended(alternatives: RouteAlternative[]): RouteAlternative {
  return alternatives.reduce((best, cur) => (cur.generalizedCost < best.generalizedCost ? cur : best));
}
