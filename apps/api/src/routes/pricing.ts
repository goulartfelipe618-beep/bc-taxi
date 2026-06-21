import { Router } from 'express';
import { z } from 'zod';
import type { RideCategoryCode } from '../domain/types.js';
import { refreshDynamicPricing, refreshAllDynamicPricing } from '../pricing/dynamicPricingService.js';
import { buildEngineQuote } from '../pricing/pricingEngineService.js';
import { getActivePricingRule } from '../pricing/pricingRuleStore.js';
import { getRecentCalculationLogs } from '../pricing/dynamicPricingGuardStore.js';
import { buildPublicDynamicStatus } from '../pricing/dynamicPricingGuardService.js';
import { config } from '../config.js';

export const pricingRouter = Router();

pricingRouter.get('/dynamic', async (req, res) => {
  const categoryCode = (req.query.category as string) ?? 'economico';
  const lat = req.query.lat != null ? Number(req.query.lat) : undefined;
  const lng = req.query.lng != null ? Number(req.query.lng) : undefined;
  try {
    const snapshot = await refreshDynamicPricing(categoryCode as RideCategoryCode, config.defaultPricingRegionId, {
      lat,
      lng,
    });
    res.json(buildPublicDynamicStatus(snapshot));
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao obter pricing dinâmico';
    res.status(400).json({ error: message });
  }
});

pricingRouter.get('/dynamic/logs/:categoryCode', async (req, res) => {
  try {
    const logs = await getRecentCalculationLogs(config.defaultPricingRegionId, req.params.categoryCode, 15);
    res.json({ logs });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao obter logs';
    res.status(400).json({ error: message });
  }
});

pricingRouter.post('/dynamic/refresh-all', async (_req, res) => {
  try {
    const snapshots = await refreshAllDynamicPricing();
    res.json({ snapshots: snapshots.map(buildPublicDynamicStatus) });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao atualizar pricing';
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
