import { Router } from 'express';
import { z } from 'zod';
import type { RideCategoryCode } from '../domain/types.js';
import { getDynamicMultiplier, refreshDynamicPricing } from '../pricing/dynamicPricingService.js';
import { buildEngineQuote } from '../pricing/pricingEngineService.js';
import { getActivePricingRule } from '../pricing/pricingRuleStore.js';
import { config } from '../config.js';

export const pricingRouter = Router();

pricingRouter.get('/dynamic', async (req, res) => {
  const categoryCode = (req.query.category as string) ?? 'economico';
  try {
    const multiplier = await getDynamicMultiplier(categoryCode as RideCategoryCode);
    res.json({ categoryCode, multiplierEffective: multiplier });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao obter pricing dinâmico';
    res.status(400).json({ error: message });
  }
});

const refreshSchema = z.object({
  categoryCode: z.string().default('economico'),
});

pricingRouter.post('/dynamic/refresh', async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const snapshot = await refreshDynamicPricing(parsed.data.categoryCode as RideCategoryCode);
    res.json(snapshot);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao atualizar pricing';
    res.status(400).json({ error: message });
  }
});

pricingRouter.get('/rules/:categoryCode', async (req, res) => {
  try {
    const rule = await getActivePricingRule(req.params.categoryCode as RideCategoryCode);
    res.json({ rule, regionId: config.defaultPricingRegionId });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Regra não encontrada';
    res.status(400).json({ error: message });
  }
});

const engineQuoteSchema = z.object({
  categoryCode: z.string(),
  distanceKm: z.number().positive(),
  durationMin: z.number().positive(),
  trafficIndex: z.number().min(0).optional(),
  fromLat: z.number().optional(),
  fromLng: z.number().optional(),
  toLat: z.number().optional(),
  toLng: z.number().optional(),
});

pricingRouter.post('/quote', async (req, res) => {
  const parsed = engineQuoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const quote = await buildEngineQuote({
      categoryCode: parsed.data.categoryCode as RideCategoryCode,
      distanceKm: parsed.data.distanceKm,
      durationMin: parsed.data.durationMin,
      trafficIndex: parsed.data.trafficIndex,
      fromLat: parsed.data.fromLat,
      fromLng: parsed.data.fromLng,
      toLat: parsed.data.toLat,
      toLng: parsed.data.toLng,
    });
    res.json(quote);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha no quote';
    res.status(400).json({ error: message });
  }
});
