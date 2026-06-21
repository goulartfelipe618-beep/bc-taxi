import { Router } from 'express';
import { getPublicCategory } from '../domain/rideCategories.js';
import {
  listEnabledCategoryCodes,
  listPublicCategoriesForRegion,
  resolveRegionContextAtPoint,
} from '../region/serviceRegionGeoService.js';

export const regionsRouter = Router();

regionsRouter.get('/detect', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    res.status(400).json({ error: 'lat e lng são obrigatórios' });
    return;
  }

  const ctx = await resolveRegionContextAtPoint(lat, lng);
  res.json({
    inCoverage: ctx.inCoverage,
    serviceRegion: ctx.serviceRegion
      ? {
          id: ctx.serviceRegion.id,
          name: ctx.serviceRegion.name,
          cityId: ctx.serviceRegion.cityId,
        }
      : undefined,
    pricingRegionId: ctx.pricingRegionId,
    pricingRegionName: ctx.pricingRegionName,
    enabledCategoryCodes: ctx.enabledCategoryCodes,
  });
});

regionsRouter.get('/:regionId/categories', async (req, res) => {
  const codes = await listEnabledCategoryCodes(req.params.regionId);
  const categories = listPublicCategoriesForRegion(codes).map(getPublicCategory);
  res.json({ regionId: req.params.regionId, categories });
});
