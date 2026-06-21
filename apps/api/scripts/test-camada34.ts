process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { config } = await import('../src/config.js');
  const {
    resolveRegionContextAtPoint,
    isCategoryEnabledAtPoint,
    resolvePricingRegionIdAtPoint,
    listPublicCategoriesForRegion,
    seedMemoryRegionCategories,
    __testResetRegionGeoMemory,
  } = await import('../src/region/serviceRegionGeoService.js');
  const { resolveRadiusStages } = await import('../src/config/operationalParamsService.js');

  __testResetRegionGeoMemory();

  const bcLat = -26.9905;
  const bcLng = -48.6348;
  const outsideLat = -23.55;
  const outsideLng = -46.63;

  const inside = await resolveRegionContextAtPoint(bcLat, bcLng);
  if (!inside.inCoverage || !inside.serviceRegion) {
    throw new Error('BC center should be in coverage');
  }
  if (!inside.enabledCategoryCodes.includes('economico')) {
    throw new Error('Economico should be enabled in BC');
  }
  if (inside.enabledCategoryCodes.includes('black')) {
    throw new Error('Black should be disabled in BC seed');
  }
  console.log('BC region:', inside.serviceRegion.name, 'categories:', inside.enabledCategoryCodes.length);

  const outside = await resolveRegionContextAtPoint(outsideLat, outsideLng);
  if (outside.inCoverage) throw new Error('São Paulo coords should be outside BC polygon');

  const blackOk = await isCategoryEnabledAtPoint('black', bcLat, bcLng);
  if (blackOk) throw new Error('Black should not be enabled at BC point');

  const economicoOk = await isCategoryEnabledAtPoint('economico', bcLat, bcLng);
  if (!economicoOk) throw new Error('Economico should be enabled at BC point');

  const pricingRegionId = await resolvePricingRegionIdAtPoint(bcLat, bcLng);
  if (pricingRegionId !== config.defaultPricingRegionId) {
    throw new Error(`Expected Vale pricing region, got ${pricingRegionId}`);
  }
  console.log('Pricing region:', pricingRegionId);

  const publicCats = listPublicCategoriesForRegion(inside.enabledCategoryCodes);
  if (!publicCats.some((c) => c.code === 'economico')) {
    throw new Error('Public category list missing economico');
  }

  seedMemoryRegionCategories({
    regionId: inside.serviceRegion.id,
    categories: [
      { code: 'economico', enabled: true, priority: 100 },
      { code: 'comfort', enabled: true, priority: 90 },
    ],
  });
  const narrowed = await resolveRegionContextAtPoint(bcLat, bcLng);
  if (narrowed.enabledCategoryCodes.length !== 2) {
    throw new Error('Seeded category override should narrow list');
  }

  const stages = await resolveRadiusStages('economico', inside.serviceRegion.id);
  if (stages.length < 1) throw new Error('Radius stages missing for region');
  console.log('Match radius stage 1:', stages[0], 'm');

  console.log('Camada 34 PostGIS region categories tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
