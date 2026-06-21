import type { AiInsightOutput, AiUseCase } from './types.js';

export function generateDeterministicInsight(
  useCase: AiUseCase,
  features: Record<string, unknown>,
): AiInsightOutput {
  switch (useCase) {
    case 'fraud_case_summary': {
      const flagCount = Number(features.openFlagCount ?? features.flagCount ?? 0);
      const topTypes = (features.topFlagTypes as string[]) ?? [];
      return {
        summary:
          flagCount >= 5
            ? 'Volume elevado de flags abertos — priorizar revisão humana de clusters de micro-corridas e loops.'
            : 'Casos de fraude dentro da faixa operacional; revisão amostral recomendada.',
        confidence: 0.72,
        modelVersion: 'deterministic-v1',
        payload: {
          priority: flagCount >= 5 ? 'high' : 'medium',
          suggestedClusters: topTypes.length ? topTypes : ['MICRO_RIDE_REPEAT', 'PAIR_LOOP'],
          advisoryOnly: true,
        },
      };
    }
    case 'demand_forecast': {
      const rides15m = Number(features.activeRides ?? 0);
      const hour = new Date().getHours();
      const isPeak = hour >= 17 && hour <= 20;
      return {
        summary: isPeak
          ? 'Pico vespertino projetado — aumento de demanda nas próximas 2 horas.'
          : 'Demanda estável na janela atual.',
        confidence: 0.68,
        modelVersion: 'deterministic-v1',
        payload: {
          projectedRidesNextHour: Math.max(1, Math.round(rides15m * (isPeak ? 1.35 : 1.05))),
          peakHours: isPeak ? [17, 18, 19, 20] : [],
          advisoryOnly: true,
        },
      };
    }
    case 'dynamic_pressure_hint': {
      const pressure = Number(features.demandPressure ?? 1);
      const band = pressure >= 1.4 ? [1.15, 1.35] : pressure >= 1.1 ? [1.05, 1.2] : [1.0, 1.08];
      return {
        summary: `Pressão dinâmica estimada ${pressure.toFixed(2)} — faixa consultiva ${band[0]}–${band[1]}x.`,
        confidence: 0.65,
        modelVersion: 'deterministic-v1',
        payload: { suggestedMultiplierBand: band, advisoryOnly: true, notAuthoritative: true },
      };
    }
    case 'review_sentiment': {
      const avgStars = Number(features.avgStars ?? 4.5);
      const sentiment = avgStars >= 4.5 ? 'positive' : avgStars >= 3.5 ? 'neutral' : 'negative';
      return {
        summary: `Sentimento agregado ${sentiment} (média ${avgStars.toFixed(1)} estrelas).`,
        confidence: 0.7,
        modelVersion: 'deterministic-v1',
        payload: {
          sentiment,
          themes: ['pontualidade', 'direção', 'limpeza'],
          toxicityRisk: avgStars < 3 ? 'elevated' : 'low',
          advisoryOnly: true,
        },
      };
    }
    case 'ops_supply_insight': {
      const wsConnections = Number(features.wsConnections ?? 0);
      const activeRides = Number(features.activeRides ?? 0);
      const gap = activeRides > 0 && wsConnections === 0;
      return {
        summary: gap
          ? 'Possível gap de supply/WS — verificar conectividade de motoristas online.'
          : 'Abastecimento operacional dentro do esperado.',
        confidence: 0.74,
        modelVersion: 'deterministic-v1',
        payload: {
          supplyGapDetected: gap,
          suggestedActions: gap ? ['check_ws_health', 'nudge_drivers_online'] : ['monitor'],
          advisoryOnly: true,
        },
      };
    }
    default:
      return {
        summary: 'Insight determinístico indisponível para este caso.',
        confidence: 0.5,
        modelVersion: 'deterministic-v1',
        payload: { advisoryOnly: true },
      };
  }
}
