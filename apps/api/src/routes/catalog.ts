import { Router } from 'express';
import { z } from 'zod';
import { MATCH_CONFIG, BLOCK_DURATIONS } from '../domain/match.js';
import { buildEngineQuote } from '../pricing/pricingEngineService.js';
import {
  DRIVER_TIER_BENEFITS,
  PASSENGER_TIER_BENEFITS,
  REPUTATION_CONFIG,
} from '../domain/reputation.js';
import { getCategory, getPublicCategory, listCategories } from '../domain/rideCategories.js';
import { DEFAULT_PRICING_REGION, formatFare } from '../domain/pricing.js';
import type { RideCategoryCode } from '../domain/types.js';

export const categoriesRouter = Router();

categoriesRouter.get('/', (req, res) => {
  const passengerOnly = req.query.passengerRidesOnly !== 'false';
  const categories = listCategories({ passengerRidesOnly: passengerOnly }).map(getPublicCategory);
  res.json({ categories });
});

categoriesRouter.get('/:code', (req, res) => {
  const category = getCategory(req.params.code as RideCategoryCode);
  if (!category) {
    res.status(404).json({ error: 'Categoria não encontrada' });
    return;
  }
  res.json(getPublicCategory(category));
});

export const quotesRouter = Router();

const quoteSchema = z.object({
  categoryCode: z.string(),
  distanceKm: z.number().positive(),
  durationMin: z.number().positive(),
  dynamicMultiplier: z.number().min(1).optional(),
  trafficIndex: z.number().min(0).optional(),
  tollsCentavos: z.number().min(0).optional(),
  airportFeeCentavos: z.number().min(0).optional(),
  addonsCentavos: z.number().min(0).optional(),
  fromLat: z.number().optional(),
  fromLng: z.number().optional(),
  toLat: z.number().optional(),
  toLng: z.number().optional(),
});

quotesRouter.post('/', async (req, res) => {
  const parsed = quoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const category = getCategory(parsed.data.categoryCode as RideCategoryCode);
  if (!category) {
    res.status(400).json({ error: 'Categoria inválida' });
    return;
  }

  const quote = await buildEngineQuote({
    categoryCode: parsed.data.categoryCode as RideCategoryCode,
    distanceKm: parsed.data.distanceKm,
    durationMin: parsed.data.durationMin,
    dynamicMultiplier: parsed.data.dynamicMultiplier,
    trafficIndex: parsed.data.trafficIndex,
    tollsCentavos: parsed.data.tollsCentavos,
    airportFeeCentavos: parsed.data.airportFeeCentavos,
    addonsCentavos: parsed.data.addonsCentavos,
    fromLat: parsed.data.fromLat,
    fromLng: parsed.data.fromLng,
    toLat: parsed.data.toLat,
    toLng: parsed.data.toLng,
  });
  res.json({
    ...quote,
    passengerFareLabel: formatFare(quote.passengerFareCentavos),
    driverPayoutLabel: formatFare(quote.estimatedDriverPayoutCentavos),
    airportContext: quote.airportContext,
  });
});

export const configRouter = Router();

configRouter.get('/reputation', (_req, res) => {
  res.json({
    config: REPUTATION_CONFIG,
    passengerBenefits: PASSENGER_TIER_BENEFITS,
    driverBenefits: DRIVER_TIER_BENEFITS,
  });
});

configRouter.get('/match', (_req, res) => {
  res.json({ config: MATCH_CONFIG, blockDurationsSeconds: BLOCK_DURATIONS });
});

configRouter.get('/pricing', (_req, res) => {
  res.json({ defaultRegion: DEFAULT_PRICING_REGION });
});
