process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const { createRideRequest, startMatching } = await import('../src/match/matchService.js');
  const { quoteWithDynamicPricing } = await import('../src/pricing/dynamicPricingService.js');
  const {
    getActiveGovernanceCatalog,
    captureRideGovernanceSnapshot,
    getRideGovernanceTrail,
    publishMatchScoringVersion,
  } = await import('../src/governance/governanceService.js');
  const { logRideDecision } = await import('../src/observability/decisionLogService.js');

  const catalog = await getActiveGovernanceCatalog();
  if (!catalog.matchScoring.versionLabel) throw new Error('Match version missing');
  if (!catalog.reputationFormula.versionLabel) throw new Error('Reputation version missing');
  console.log('Active rules:', catalog.pricingRuleSetLabel, catalog.matchScoring.versionLabel, catalog.reputationFormula.versionLabel);

  const quote = await quoteWithDynamicPricing('economico', 8, 20, { lat: -26.99, lng: -48.63 });
  const ride = await createRideRequest({
    passengerId: randomUUID(),
    categoryCode: 'economico',
    pickupLat: -26.99,
    pickupLng: -48.63,
    dropoffLat: -26.92,
    dropoffLng: -49.07,
    estimatedFareCentavos: quote.passengerFareCentavos,
  });

  await captureRideGovernanceSnapshot({
    rideId: ride.id,
    phase: 'quote',
    pricingRuleVersionId: quote.ruleVersionId,
    dynamicMultiplier: quote.dynamicMultiplier,
    quotedFareCentavos: quote.passengerFareCentavos,
  });

  await logRideDecision({ rideId: ride.id, decisionType: 'PRICING_QUOTED', payload: { ruleVersionId: quote.ruleVersionId } });
  await startMatching(ride.id);

  const trail = await getRideGovernanceTrail(ride.id);
  if (trail.snapshots.length < 2) throw new Error('Expected quote + match snapshots');
  if (trail.decisions.length < 1) throw new Error('Expected decision logs');

  const firstQuote = trail.snapshots.find((s) => s.phase === 'quote');
  const secondQuote = await captureRideGovernanceSnapshot({
    rideId: ride.id,
    phase: 'quote',
    pricingRuleVersionId: 'other-version',
    quotedFareCentavos: 9999,
  });
  if (firstQuote?.id !== secondQuote.id) throw new Error('Quote snapshot should be immutable');

  const newMatch = await publishMatchScoringVersion({
    versionLabel: 'match-test-' + Date.now(),
    weights: { d: 0.4, r: 0.2, a: 0.1, c: 0.1, t: 0.05, e: 0.05, k: 0.1 },
  });
  if (!newMatch.versionLabel.startsWith('match-test-')) throw new Error('Publish match version failed');

  console.log('Camada 14 governance versioning tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
