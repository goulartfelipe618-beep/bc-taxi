import { Router } from 'express';
import { z } from 'zod';
import { listActiveEvents, listEventsNear, toPublicEvent } from '../events/eventSurgeService.js';

export const eventsRouter = Router();

eventsRouter.get('/active', async (req, res) => {
  const lat = req.query.lat != null ? Number(req.query.lat) : undefined;
  const lng = req.query.lng != null ? Number(req.query.lng) : undefined;

  const events =
    lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)
      ? await listEventsNear(lat, lng)
      : await listActiveEvents();

  res.json({ events: events.map(toPublicEvent) });
});
