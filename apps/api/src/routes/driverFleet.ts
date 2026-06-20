import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { getDriverCompliance, toPublicCompliance } from '../fleet/complianceService.js';
import {
  ensureDriverFleetBootstrap,
  syncDriverProfileFromFleet,
} from '../fleet/driverProfileSync.js';
import {
  createVehicle,
  listDriverDocuments,
  listDriverVehicles,
  listVehicleDocuments,
  toPublicDocument,
  toPublicVehicle,
  upsertDriverDocument,
  upsertVehicleDocument,
} from '../fleet/fleetStore.js';

export const driverFleetRouter = Router();

driverFleetRouter.use(authMiddleware);

driverFleetRouter.get('/compliance', async (req, res) => {
  if (req.user!.role !== 'driver') {
    res.status(403).json({ error: 'Somente motoristas' });
    return;
  }
  await ensureDriverFleetBootstrap(req.user!.id);
  const profile = await getDriverCompliance(req.user!.id);
  res.json({ compliance: toPublicCompliance(profile) });
});

driverFleetRouter.get('/vehicles', async (req, res) => {
  if (req.user!.role !== 'driver') {
    res.status(403).json({ error: 'Somente motoristas' });
    return;
  }
  const vehicles = await listDriverVehicles(req.user!.id);
  res.json({ vehicles: vehicles.map(toPublicVehicle) });
});

const vehicleSchema = z.object({
  plate: z.string().min(5).max(10),
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().min(1990).max(2100),
  color: z.string().optional(),
  bodyType: z.string().optional(),
  seatCount: z.number().int().min(1).max(50).optional(),
  wheelchairAccessible: z.boolean().optional(),
  petReady: z.boolean().optional(),
  comfortApproved: z.boolean().optional(),
  categoryCodes: z.array(z.string()).optional(),
});

driverFleetRouter.post('/vehicles', async (req, res) => {
  if (req.user!.role !== 'driver') {
    res.status(403).json({ error: 'Somente motoristas' });
    return;
  }
  const parsed = vehicleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const vehicle = await createVehicle(req.user!.id, parsed.data);
  await syncDriverProfileFromFleet(req.user!.id);
  res.status(201).json({ vehicle: toPublicVehicle(vehicle) });
});

const driverDocSchema = z.object({
  docType: z.enum([
    'CNH', 'IDENTITY', 'EAR_PROOF', 'DEFENSIVE_TRAINING', 'EXECUTIVE_TRAINING',
    'PET_TRAINING', 'PCD_TRAINING', 'AIRPORT_TRAINING', 'B2B_BILLING',
  ]),
  status: z.enum(['pending', 'approved', 'rejected', 'expired']).optional(),
  expiresAt: z.string().optional(),
});

driverFleetRouter.get('/documents', async (req, res) => {
  if (req.user!.role !== 'driver') {
    res.status(403).json({ error: 'Somente motoristas' });
    return;
  }
  const docs = await listDriverDocuments(req.user!.id);
  res.json({ documents: docs.map(toPublicDocument) });
});

driverFleetRouter.post('/documents', async (req, res) => {
  if (req.user!.role !== 'driver') {
    res.status(403).json({ error: 'Somente motoristas' });
    return;
  }
  const parsed = driverDocSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const doc = await upsertDriverDocument(req.user!.id, parsed.data);
  await syncDriverProfileFromFleet(req.user!.id);
  res.status(201).json({ document: toPublicDocument(doc) });
});

const vehicleDocSchema = z.object({
  docType: z.enum([
    'CRLV', 'INSURANCE', 'COMFORT_CHECKLIST', 'PCD_ADAPTATION', 'AIRPORT_AUTHORIZATION', 'INSPECTION',
  ]),
  status: z.enum(['pending', 'approved', 'rejected', 'expired']).optional(),
  expiresAt: z.string().optional(),
});

driverFleetRouter.get('/vehicles/:vehicleId/documents', async (req, res) => {
  if (req.user!.role !== 'driver') {
    res.status(403).json({ error: 'Somente motoristas' });
    return;
  }
  const vehicles = await listDriverVehicles(req.user!.id);
  if (!vehicles.some((v) => v.id === req.params.vehicleId)) {
    res.status(404).json({ error: 'Veículo não encontrado' });
    return;
  }
  const docs = await listVehicleDocuments(req.params.vehicleId);
  res.json({ documents: docs.map(toPublicDocument) });
});

driverFleetRouter.post('/vehicles/:vehicleId/documents', async (req, res) => {
  if (req.user!.role !== 'driver') {
    res.status(403).json({ error: 'Somente motoristas' });
    return;
  }
  const vehicles = await listDriverVehicles(req.user!.id);
  if (!vehicles.some((v) => v.id === req.params.vehicleId)) {
    res.status(404).json({ error: 'Veículo não encontrado' });
    return;
  }
  const parsed = vehicleDocSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const doc = await upsertVehicleDocument(req.params.vehicleId, parsed.data);
  await syncDriverProfileFromFleet(req.user!.id);
  res.status(201).json({ document: toPublicDocument(doc) });
});
