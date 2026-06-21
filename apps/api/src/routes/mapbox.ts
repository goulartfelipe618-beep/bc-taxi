import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { autocompletePlaces, getMapboxPublicConfig } from '../mapbox/mapboxClient.js';
import { listRecentPlaces, recordPlaceConfirmation, toPublicPlaceHistory } from '../places/placeStore.js';
import {
  listPlaceAliases,
  upsertPlaceAlias,
} from '../places/aliasStore.js';
import {
  reverseGeocode,
  searchPlacesIntelligent,
  toPublicRankedSuggestion,
} from '../places/intelligentSearchService.js';
import {
  deleteSavedPlace,
  listSavedPlaces,
  toPublicSavedPlace,
  upsertSavedPlace,
} from '../places/savedPlaceStore.js';
import { quoteRoutes, quoteRoutesWithFares, selectRouteStrategy, toPublicRouteQuote, ROUTE_STRATEGY_META } from '../route/routeService.js';
import { getRecalculationEvents } from '../route/routeStore.js';
import type { RideCategoryCode } from '../domain/types.js';
import { getWeatherAtPoint, getWeatherPublic } from '../weather/weatherService.js';
import type { MapPlace } from '../mapbox/types.js';
import type { RouteStrategy } from '../route/types.js';

const autocompleteQuery = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(20).optional(),
  proximityLat: z.coerce.number().optional(),
  proximityLng: z.coerce.number().optional(),
  sessionToken: z.string().optional(),
});

const searchQuery = autocompleteQuery.extend({
  regionCluster: z.string().optional(),
});

const directionsQuery = z.object({
  fromLat: z.coerce.number(),
  fromLng: z.coerce.number(),
  toLat: z.coerce.number(),
  toLng: z.coerce.number(),
  waypoints: z.string().optional(),
});

function parseWaypoints(raw?: string): { lat: number; lng: number }[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((p) => {
        if (typeof p !== 'object' || p == null) return null;
        const item = p as { lat?: unknown; lng?: unknown };
        if (typeof item.lat !== 'number' || typeof item.lng !== 'number') return null;
        return { lat: item.lat, lng: item.lng };
      })
      .filter((p): p is { lat: number; lng: number } => p != null);
  } catch {
    return [];
  }
}

export const placesRouter = Router();

placesRouter.get('/autocomplete', async (req, res) => {
  const parsed = autocompleteQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const places = await autocompletePlaces(parsed.data.q, parsed.data.limit ?? 8, {
    proximityLat: parsed.data.proximityLat,
    proximityLng: parsed.data.proximityLng,
    sessionToken: parsed.data.sessionToken,
  });
  res.json({ places });
});

placesRouter.get('/search', authMiddleware, async (req, res) => {
  const parsed = searchQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const suggestions = await searchPlacesIntelligent({
    query: parsed.data.q,
    userId: req.user!.id,
    proximityLat: parsed.data.proximityLat,
    proximityLng: parsed.data.proximityLng,
    sessionToken: parsed.data.sessionToken,
    limit: parsed.data.limit ?? 10,
    regionCluster: parsed.data.regionCluster,
  });

  res.json({
    suggestions: suggestions.map(toPublicRankedSuggestion),
    ranking: {
      formula: '0.38*Text + 0.24*Geo + 0.18*Affinity + 0.12*Popularity + 0.08*Recency',
    },
  });
});

placesRouter.get('/reverse', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({ error: 'lat e lng são obrigatórios' });
    return;
  }
  const place = await reverseGeocode(lat, lng);
  if (!place) {
    res.status(404).json({ error: 'Endereço não encontrado' });
    return;
  }
  res.json({ place });
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
  sessionToken: z.string().optional(),
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

  const record = await recordPlaceConfirmation(req.user!.id, place, parsed.data.sessionToken);
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

const aliasSchema = z.object({
  alias: z.string().min(2).max(40),
  id: z.string(),
  label: z.string(),
  address: z.string(),
  lat: z.number(),
  lng: z.number(),
  featureId: z.string().optional(),
});

placesRouter.get('/aliases', authMiddleware, async (req, res) => {
  const aliases = await listPlaceAliases(req.user!.id);
  res.json({
    aliases: aliases.map((a) => ({
      id: a.id,
      alias: a.alias,
      label: a.label,
      address: a.address,
      lat: a.lat,
      lng: a.lng,
      featureId: a.featureId,
    })),
  });
});

placesRouter.post('/aliases', authMiddleware, async (req, res) => {
  const parsed = aliasSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const record = await upsertPlaceAlias(req.user!.id, {
    alias: parsed.data.alias,
    place: {
      id: parsed.data.id,
      label: parsed.data.label,
      address: parsed.data.address,
      lat: parsed.data.lat,
      lng: parsed.data.lng,
      featureId: parsed.data.featureId ?? parsed.data.id,
      source: 'mapbox',
    },
  });

  res.status(201).json({
    alias: {
      id: record.id,
      alias: record.alias,
      label: record.label,
      address: record.address,
      lat: record.lat,
      lng: record.lng,
      featureId: record.featureId,
    },
  });
});

export const routesRouter = Router();

routesRouter.get('/directions', async (req, res) => {
  const parsed = directionsQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const waypoints = parseWaypoints(parsed.data.waypoints);
  const quote = await quoteRoutes({
    fromLat: parsed.data.fromLat,
    fromLng: parsed.data.fromLng,
    toLat: parsed.data.toLat,
    toLng: parsed.data.toLng,
    waypoints,
  });

  res.json({
    route: {
      distanceKm: quote.distanceKm,
      durationMin: quote.durationMin,
      geometry: quote.recommended.geometry,
      source: 'mapbox',
      requestId: quote.requestId,
      strategy: quote.selectedStrategy,
    },
  });
});

const quoteBodySchema = z.object({
  fromLat: z.number(),
  fromLng: z.number(),
  toLat: z.number(),
  toLng: z.number(),
  waypoints: z.array(z.object({ lat: z.number(), lng: z.number() })).optional(),
  strategy: z.enum(['fastest', 'shortest', 'economical', 'less_traffic']).optional(),
  categoryCode: z.string().optional(),
});

routesRouter.get('/strategies', (_req, res) => {
  res.json({
    strategies: Object.entries(ROUTE_STRATEGY_META).map(([strategy, meta]) => ({
      strategy,
      ...meta,
    })),
  });
});

routesRouter.post('/quote', authMiddleware, async (req, res) => {
  const parsed = quoteBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const weather = await getWeatherAtPoint(parsed.data.fromLat, parsed.data.fromLng);
  const quote = parsed.data.categoryCode
    ? await quoteRoutesWithFares({
        fromLat: parsed.data.fromLat,
        fromLng: parsed.data.fromLng,
        toLat: parsed.data.toLat,
        toLng: parsed.data.toLng,
        waypoints: parsed.data.waypoints,
        userId: req.user!.id,
        preferredStrategy: parsed.data.strategy as RouteStrategy | undefined,
        categoryCode: parsed.data.categoryCode as RideCategoryCode,
      })
    : await quoteRoutes({
        fromLat: parsed.data.fromLat,
        fromLng: parsed.data.fromLng,
        toLat: parsed.data.toLat,
        toLng: parsed.data.toLng,
        waypoints: parsed.data.waypoints,
        userId: req.user!.id,
        preferredStrategy: parsed.data.strategy as RouteStrategy | undefined,
      });

  res.json({
    ...toPublicRouteQuote(quote),
    weather: getWeatherPublic(weather),
  });
});

const selectBodySchema = z.object({
  requestId: z.string().uuid(),
  strategy: z.enum(['fastest', 'shortest', 'economical', 'less_traffic']),
  categoryCode: z.string().optional(),
  rideId: z.string().uuid().optional(),
});

routesRouter.post('/select', authMiddleware, async (req, res) => {
  const parsed = selectBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const updated = await selectRouteStrategy({
    requestId: parsed.data.requestId,
    strategy: parsed.data.strategy,
    userId: req.user!.id,
    rideId: parsed.data.rideId,
    categoryCode: parsed.data.categoryCode as RideCategoryCode | undefined,
  });

  if (!updated) {
    res.status(404).json({ error: 'Cotação de rota não encontrada' });
    return;
  }

  res.json(toPublicRouteQuote(updated));
});

routesRouter.get('/recalculations/:rideId', authMiddleware, async (req, res) => {
  const events = await getRecalculationEvents(req.params.rideId);
  res.json({ events });
});

routesRouter.get('/weather', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({ error: 'lat e lng são obrigatórios' });
    return;
  }
  const snapshot = await getWeatherAtPoint(lat, lng);
  res.json({ weather: getWeatherPublic(snapshot) });
});
