import { Router } from 'express';
import { z } from 'zod';
import { autocompletePlaces, getDrivingRoute, getMapboxPublicConfig } from '../mapbox/mapboxClient.js';

const autocompleteQuery = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

const directionsQuery = z.object({
  fromLat: z.coerce.number(),
  fromLng: z.coerce.number(),
  toLat: z.coerce.number(),
  toLng: z.coerce.number(),
});

export const placesRouter = Router();

placesRouter.get('/autocomplete', async (req, res) => {
  const parsed = autocompleteQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const places = await autocompletePlaces(parsed.data.q, parsed.data.limit ?? 8);
  res.json({ places });
});

placesRouter.get('/config', (_req, res) => {
  res.json(getMapboxPublicConfig());
});

export const routesRouter = Router();

routesRouter.get('/directions', async (req, res) => {
  const parsed = directionsQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const route = await getDrivingRoute(
    parsed.data.fromLat,
    parsed.data.fromLng,
    parsed.data.toLat,
    parsed.data.toLng,
  );
  res.json({ route });
});
