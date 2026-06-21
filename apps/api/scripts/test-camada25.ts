process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const {
    computeEliteDynamicBonusPct,
    computeDriverPayoutBreakdown,
    saveDriverPayoutSettlement,
    getDriverPayoutSettlement,
    getDriverPayoutSummary,
    __testResetPayoutMemory,
  } = await import('../src/payments/driverPayoutService.js');
  const { getActivePricingRule, seedMemoryPricingRule } = await import('../src/pricing/pricingRuleStore.js');
  const { buildEngineQuote } = await import('../src/pricing/pricingEngineService.js');

  __testResetPayoutMemory();

  if (computeEliteDynamicBonusPct('elite') !== 0.03) throw new Error('Elite bonus pct wrong');
  if (computeEliteDynamicBonusPct('premium') !== 0.02) throw new Error('Premium bonus pct wrong');

  seedMemoryPricingRule({
    id: 'test-rule-payout',
    ruleSetId: 'test-set',
    categoryCode: 'comfort',
    regionId: '00000000-0000-4000-8000-000000000010',
    baseFareCentavos: 500,
    distanceRateCentavosKm: 220,
    timeRateCentavosMin: 35,
    minimumFareCentavos: 800,
    bookingFeeCentavos: 150,
    trafficCoefficient: 12,
    takeRateBps: 2200,
    driverDynamicShareBps: 7500,
    regulatoryFeeCentavos: 50,
  });

  const rule = await getActivePricingRule('comfort');
  if (rule.driverDynamicShareBps !== 7500) throw new Error('Pricing rule seed failed');

  const quote = await buildEngineQuote({
    categoryCode: 'comfort',
    distanceKm: 12,
    durationMin: 25,
    dynamicMultiplier: 1.35,
    tollsCentavos: 850,
    airportFeeCentavos: 1200,
    trafficIndex: 0.4,
  });

  const driverId = randomUUID();
  const rideId = randomUUID();

  const breakdown = await computeDriverPayoutBreakdown({
    quote,
    driverUserId: driverId,
    rideId,
    reputationTier: 'elite',
    passengerDiscountCentavos: 500,
  });

  if (breakdown.driverGrossCentavos <= 0) throw new Error('Driver gross missing');
  if (breakdown.eliteBonusCentavos <= 0) throw new Error('Elite bonus should apply');
  if (breakdown.airportShareCentavos <= 0) throw new Error('Airport share missing');
  if (breakdown.driverDynamicShareBps < 7800) throw new Error('Premium category should use 78% dynamic share');
  console.log('Driver payout:', breakdown.labels.driverPayout, 'elite bonus:', breakdown.eliteBonusCentavos);

  await saveDriverPayoutSettlement({ breakdown, paymentIntentId: randomUUID() });
  const saved = await getDriverPayoutSettlement(rideId);
  if (!saved || saved.driverGrossCentavos !== breakdown.driverGrossCentavos) {
    throw new Error('Settlement persistence failed');
  }

  const summary = await getDriverPayoutSummary(driverId);
  if (summary.rideCount !== 1) throw new Error('Summary ride count wrong');

  console.log('Camada 25 advanced driver payout tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
