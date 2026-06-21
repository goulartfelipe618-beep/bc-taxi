import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import {
  computeAirportPressure,
  detectZoneAt,
  listAirportZones,
  listZonesNear,
  resolveAirportContext,
  toPublicContext,
  toPublicZone,
  upsertAirportZone,
} from '../airport/airportService.js';
import {
  getDriverQueueStatus,
  listAirportQueuePools,
  listWaitingQueueEntries,
  syncAirportQueueFromLocation,
} from '../airport/airportQueueService.js';
import { config } from '../config.js';

export const airportsRouter = Router();

airportsRouter.get('/', async (_req, res) => {
  const zones = await listAirportZones();
  res.json({ zones: zones.map(toPublicZone) });
});

airportsRouter.get('/near', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    res.status(400).json({ error: 'lat e lng são obrigatórios' });
    return;
  }
  const zones = await listZonesNear(lat, lng);
  res.json({ zones: zones.map(toPublicZone) });
});

airportsRouter.get('/detect', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    res.status(400).json({ error: 'lat e lng são obrigatórios' });
    return;
  }
  const zone = await detectZoneAt(lat, lng);
  if (!zone) {
    res.json({ inAirportZone: false });
    return;
  }
  res.json({ inAirportZone: true, zone: toPublicZone(zone) });
});

airportsRouter.get('/pressure', async (req, res) => {
  const lat = req.query.lat != null ? Number(req.query.lat) : undefined;
  const lng = req.query.lng != null ? Number(req.query.lng) : undefined;
  const categoryCode = typeof req.query.categoryCode === 'string' ? req.query.categoryCode : undefined;
  const pressure = await computeAirportPressure(lat, lng, categoryCode);
  res.json({ airportPressure: pressure });
});

const contextSchema = z.object({
  fromLat: z.number().optional(),
  fromLng: z.number().optional(),
  toLat: z.number().optional(),
  toLng: z.number().optional(),
  categoryCode: z.string().optional(),
  airportFeeCentavos: z.number().min(0).optional(),
});

airportsRouter.post('/context', async (req, res) => {
  const parsed = contextSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const ctx = await resolveAirportContext({
    fromLat: parsed.data.fromLat,
    fromLng: parsed.data.fromLng,
    toLat: parsed.data.toLat,
    toLng: parsed.data.toLng,
    categoryCode: parsed.data.categoryCode,
    airportFeeOverrideCentavos: parsed.data.airportFeeCentavos,
  });
  res.json(toPublicContext(ctx));
});

const adminZoneSchema = z.object({
  name: z.string().min(2),
  iataCode: z.string().optional(),
  terminalCode: z.string().optional(),
  centerLat: z.number(),
  centerLng: z.number(),
  radiusKm: z.number().positive().optional(),
  pickupInstructions: z.string().optional(),
  regionId: z.string().uuid().optional(),
  feeCentavos: z.number().min(0).optional(),
});

airportsRouter.post('/zones', async (req, res) => {
  const adminKey = req.header('x-admin-key');
  if (!config.adminApiKey || adminKey !== config.adminApiKey) {
    res.status(401).json({ error: 'Não autorizado' });
    return;
  }
  const parsed = adminZoneSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const zone = await upsertAirportZone(parsed.data);
  res.status(201).json({ zone: toPublicZone(zone) });
});

airportsRouter.get('/queue/pools', async (_req, res) => {
  const pools = await listAirportQueuePools();
  res.json({
    pools: pools.map((p) => ({
      id: p.id,
      zoneId: p.zoneId,
      name: p.name,
      terminalCode: p.terminalCode,
      centerLat: p.centerLat,
      centerLng: p.centerLng,
      radiusM: p.radiusM,
      allowedCategories: p.allowedCategories,
    })),
  });
});

airportsRouter.get('/queue/me', authMiddleware, async (req, res) => {
  const status = await getDriverQueueStatus(req.user!.id);
  res.json(status);
});

airportsRouter.post('/queue/sync', authMiddleware, async (req, res) => {
  const parsed = z
    .object({ lat: z.number(), lng: z.number() })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const result = await syncAirportQueueFromLocation(
    req.user!.id,
    parsed.data.lat,
    parsed.data.lng,
  );
  res.json(result);
});

airportsRouter.get('/:zoneId/queue', async (req, res) => {
  const terminalCode =
    typeof req.query.terminalCode === 'string' ? req.query.terminalCode : undefined;
  const categoryCode =
    typeof req.query.categoryCode === 'string' ? req.query.categoryCode : undefined;
  const entries = await listWaitingQueueEntries({
    zoneId: req.params.zoneId,
    terminalCode,
    categoryCode,
  });
  res.json({
    zoneId: req.params.zoneId,
    waitingCount: entries.length,
    entries: entries.map((e) => ({
      driverId: e.driverId,
      queuePosition: e.queuePosition,
      terminalCode: e.terminalCode,
      categories: e.categories,
      enteredAt: e.enteredAt.toISOString(),
    })),
  });
});
