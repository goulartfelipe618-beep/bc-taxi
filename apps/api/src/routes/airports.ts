import { Router } from 'express';
import { z } from 'zod';
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
