process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const { computeRouteDeviationM } = await import('../src/route/routeGeoUtils.js');
  const {
    shouldReplaceRoute,
    detectRecalcReason,
    ROUTE_RECALC_REASON_LABELS,
    computeIncidentRiskScore,
  } = await import('../src/route/routeRecalcPolicy.js');
  const { bindRouteToRide, recalculateActiveRoute } = await import('../src/route/routeService.js');
  const { RECALC_DEVIATION_THRESHOLD_M } = await import('../src/route/types.js');

  const polyline = {
    type: 'LineString' as const,
    coordinates: [
      [-49.0661, -26.9194],
      [-49.0685, -26.9182],
    ],
  };

  const onRoute = computeRouteDeviationM(-26.919, -49.0665, polyline);
  const offRoute = computeRouteDeviationM(-26.915, -49.05, polyline);
  if (onRoute > 100) throw new Error(`Expected near-route deviation, got ${onRoute}`);
  if (offRoute < RECALC_DEVIATION_THRESHOLD_M) throw new Error(`Expected large deviation, got ${offRoute}`);
  console.log('Deviation on-route:', Math.round(onRoute), 'm off-route:', Math.round(offRoute), 'm');

  const replace = shouldReplaceRoute({
    currentEtaSeconds: 900,
    candidateEtaSeconds: 720,
    currentRiskScore: 0.5,
    candidateRiskScore: 0.35,
    reasonCode: 'TRAFFIC_UPDATE',
  });
  if (!replace) throw new Error('Expected route replacement for ETA improvement');

  const deviationReason = detectRecalcReason({
    deviationM: 300,
    currentTrafficIndex: 0.4,
    candidateTrafficIndex: 0.5,
    currentEtaSeconds: 600,
    candidateEtaSeconds: 610,
  });
  if (deviationReason !== 'DRIVER_DEVIATION') throw new Error('Expected DRIVER_DEVIATION');

  const risk = computeIncidentRiskScore(0.8, 2);
  if (risk <= 0) throw new Error('Risk score missing');
  console.log('Incident risk score:', risk.toFixed(2));

  const rideId = randomUUID();
  await bindRouteToRide({
    rideId,
    fromLat: -26.9905,
    fromLng: -48.6348,
    toLat: -26.9194,
    toLng: -49.0661,
    strategy: 'fastest',
  });

  const manual = await recalculateActiveRoute({
    rideId,
    fromLat: -26.95,
    fromLng: -48.9,
    toLat: -26.9194,
    toLng: -49.0661,
    reasonCode: 'MANUAL',
  });
  if (!manual.applied) throw new Error('Manual recalc should apply');
  if (!manual.reasonLabel || !ROUTE_RECALC_REASON_LABELS.MANUAL) throw new Error('Missing reason label');
  console.log('Manual recalc ETA:', manual.state.etaSeconds, 's reason:', manual.reasonLabel);

  console.log('Camada 23 live route recalculation tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
