import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { autocompletePlaces, getDrivingRoute, getMapboxPublicConfig } from '../mapbox/mapboxClient.js';
import { listRecentPlaces, recordPlaceConfirmation, toPublicPlaceHistory } from '../places/placeStore.js';
import {
  deleteSavedPlace,
  listSavedPlaces,
  toPublicSavedPlace,
  upsertSavedPlace,
} from '../places/savedPlaceStore.js';
import type { MapPlace } from '../mapbox/types.js';

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

const confirmPlaceSchema = z.object({
  id: z.string(),
  label: z.string(),
  address: z.string(),
  lat: z.number(),
  lng: z.number(),
  featureId: z.string().optional(),
  source: z.enum(['mapbox', 'mock']).optional(),
});

placesRouter.post('/confirm', authMiddleware, async (req, res) => {
  const parsed = confirmPlaceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const place: MapPlace = {
    id: parsed.data.id,
    label: parsed.data.label,
    address: parsed.data.address,
    lat: parsed.data.lat,
    lng: parsed.data.lng,
    featureId: parsed.data.featureId ?? parsed.data.id,
    source: parsed.data.source ?? 'mapbox',
  };

  const record = await recordPlaceConfirmation(req.user!.id, place);
  res.status(201).json({ place: toPublicPlaceHistory(record) });
});

placesRouter.get('/recent', authMiddleware, async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 10), 20);
  const items = await listRecentPlaces(req.user!.id, limit);
  res.json({ places: items.map(toPublicPlaceHistory) });
});

const savedPlaceSchema = z.object({
  placeType: z.enum(['favorite', 'home', 'work']),
  label: z.string().min(1),
  address: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  featureId: z.string().optional(),
});

placesRouter.get('/saved', authMiddleware, async (req, res) => {
  const items = await listSavedPlaces(req.user!.id);
  res.json({ places: items.map(toPublicSavedPlace) });
});

placesRouter.post('/saved', authMiddleware, async (req, res) => {
  const parsed = savedPlaceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const place = await upsertSavedPlace(req.user!.id, parsed.data);
  res.status(201).json({ place: toPublicSavedPlace(place) });
});

placesRouter.delete('/saved/:id', authMiddleware, async (req, res) => {
  const ok = await deleteSavedPlace(req.user!.id, req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'Local não encontrado' });
    return;
  }
  res.json({ ok: true });
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
