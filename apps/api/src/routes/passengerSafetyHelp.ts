import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  addTrustedContact,
  createRideShareLink,
  getSafetyHelpDashboard,
  recordHelpInquiry,
  removeTrustedContact,
} from '../passenger/safetyHelpProductionService.js';

export const passengerSafetyHelpRouter = Router();

passengerSafetyHelpRouter.use(authMiddleware);

passengerSafetyHelpRouter.use((req, res, next) => {
  if (req.user?.role !== 'passenger') {
    res.status(403).json({ error: 'Disponível apenas para passageiros' });
    return;
  }
  next();
});

passengerSafetyHelpRouter.get('/dashboard', async (req, res) => {
  const dashboard = await getSafetyHelpDashboard(req.user!.id);
  res.json(dashboard);
});

passengerSafetyHelpRouter.post('/help/inquiries', async (req, res) => {
  const { topicCode, searchQuery, channel } = req.body as {
    topicCode?: string;
    searchQuery?: string;
    channel?: 'in_app' | 'phone' | 'chat';
  };
  const result = await recordHelpInquiry({
    userId: req.user!.id,
    topicCode: topicCode ?? '',
    searchQuery,
    channel,
  });
  res.json(result);
});

passengerSafetyHelpRouter.post('/contacts', async (req, res) => {
  const { name, phone, relationshipLabel } = req.body as {
    name?: string;
    phone?: string;
    relationshipLabel?: string;
  };
  if (!name?.trim() || !phone?.trim()) {
    res.status(400).json({ error: 'Nome e telefone são obrigatórios' });
    return;
  }
  const contact = await addTrustedContact({
    userId: req.user!.id,
    name,
    phone,
    relationshipLabel,
  });
  res.status(201).json(contact);
});

passengerSafetyHelpRouter.delete('/contacts/:id', async (req, res) => {
  const result = await removeTrustedContact(req.user!.id, req.params.id);
  res.json(result);
});

passengerSafetyHelpRouter.post('/share-ride', async (req, res) => {
  const { rideId } = req.body as { rideId?: string };
  const result = await createRideShareLink({ userId: req.user!.id, rideId });
  res.json(result);
});
