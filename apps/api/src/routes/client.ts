import { Router } from 'express';
import { optionalAuthMiddleware } from '../middleware/auth.js';
import { getClientBootstrap } from '../catalog/clientBootstrapProductionService.js';
import { listCategoryRequirementProfiles } from '../catalog/categoryDocumentProductionService.js';

export const clientRouter = Router();

clientRouter.get('/bootstrap', optionalAuthMiddleware, async (req, res) => {
  const lat = req.query.lat != null ? Number(req.query.lat) : undefined;
  const lng = req.query.lng != null ? Number(req.query.lng) : undefined;

  const bootstrap = await getClientBootstrap({
    lat: lat != null && !Number.isNaN(lat) ? lat : undefined,
    lng: lng != null && !Number.isNaN(lng) ? lng : undefined,
    userId: req.user?.id,
    userEmail: req.user?.email,
    userFullName: req.user?.fullName,
    userRole: req.user?.role,
  });
  res.json(bootstrap);
});

clientRouter.get('/category-requirements/:regionId', async (req, res) => {
  const profiles = await listCategoryRequirementProfiles(req.params.regionId);
  res.json({ regionId: req.params.regionId, profiles });
});
