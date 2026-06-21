import {
  RECALC_DEVIATION_THRESHOLD_M,
  RECALC_ETA_DELTA_SECONDS,
  RECALC_ETA_IMPROVEMENT_PCT,
  RECALC_RISK_IMPROVEMENT_PCT,
  RECALC_TRAFFIC_THRESHOLD,
  type RouteRecalcReasonCode,
} from './types.js';

export function computeIncidentRiskScore(trafficLevelIndex: number, incidentCount: number): number {
  return Math.min(1, trafficLevelIndex * 0.65 + incidentCount * 0.07);
}

export function shouldReplaceRoute(input: {
  currentEtaSeconds: number;
  candidateEtaSeconds: number;
  currentRiskScore: number;
  candidateRiskScore: number;
  reasonCode: RouteRecalcReasonCode;
}): boolean {
  const etaDelta = Math.abs(input.candidateEtaSeconds - input.currentEtaSeconds);
  const etaImprovementPct =
    input.currentEtaSeconds > 0
      ? (input.currentEtaSeconds - input.candidateEtaSeconds) / input.currentEtaSeconds
      : 0;
  const riskImprovementPct =
    input.currentRiskScore > 0
      ? (input.currentRiskScore - input.candidateRiskScore) / input.currentRiskScore
      : 0;

  if (input.reasonCode === 'DRIVER_DEVIATION') return true;
  if (input.reasonCode === 'ROAD_INCIDENT' || input.reasonCode === 'ROAD_CLOSURE') return true;
  if (input.reasonCode === 'MANUAL') return true;

  if (etaDelta >= RECALC_ETA_DELTA_SECONDS) return true;
  if (etaImprovementPct >= RECALC_ETA_IMPROVEMENT_PCT) return true;
  if (riskImprovementPct >= RECALC_RISK_IMPROVEMENT_PCT) return true;

  return false;
}

export function detectRecalcReason(input: {
  deviationM: number;
  currentTrafficIndex: number;
  candidateTrafficIndex: number;
  currentEtaSeconds: number;
  candidateEtaSeconds: number;
}): RouteRecalcReasonCode | null {
  if (input.deviationM >= RECALC_DEVIATION_THRESHOLD_M) return 'DRIVER_DEVIATION';
  if (input.candidateTrafficIndex >= RECALC_TRAFFIC_THRESHOLD && input.candidateTrafficIndex - input.currentTrafficIndex >= 0.12) {
    return 'TRAFFIC_UPDATE';
  }
  const etaDelta = Math.abs(input.candidateEtaSeconds - input.currentEtaSeconds);
  if (etaDelta >= RECALC_ETA_DELTA_SECONDS) return 'ETA_DRIFT';
  return null;
}

export const ROUTE_RECALC_REASON_LABELS: Record<RouteRecalcReasonCode, string> = {
  TRAFFIC_UPDATE: 'Trânsito atualizado na rota',
  DRIVER_DEVIATION: 'Desvio do motorista detectado',
  ETA_DRIFT: 'Tempo estimado alterado',
  ROAD_INCIDENT: 'Incidente na via à frente',
  ROAD_CLOSURE: 'Interdição viária detectada',
  MANUAL: 'Recálculo solicitado pelo motorista',
};
