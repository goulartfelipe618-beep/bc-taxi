import { Router } from 'express';
import { z } from 'zod';
import { adminAuthMiddleware } from '../middleware/adminAuth.js';
import {
  enqueueAiInferenceJob,
  processAiInferenceJob,
  getAiInferenceJob,
  getLatestAiRecommendation,
  enqueueAndProcessAiJob,
} from '../ai/inferenceJobService.js';
import type { AiUseCase } from '../ai/types.js';

export const aiRouter = Router();

aiRouter.use(adminAuthMiddleware);

const useCases = [
  'fraud_case_summary',
  'demand_forecast',
  'dynamic_pressure_hint',
  'review_sentiment',
  'ops_supply_insight',
] as const;

const enqueueSchema = z.object({
  useCase: z.enum(useCases),
  features: z.record(z.unknown()),
  regionId: z.string().uuid().optional(),
  sourceRef: z.string().optional(),
  processImmediately: z.boolean().optional(),
});

aiRouter.post('/jobs', async (req, res) => {
  const parsed = enqueueSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  if (parsed.data.processImmediately) {
    const job = await enqueueAndProcessAiJob(parsed.data);
    res.status(201).json({ job, advisoryOnly: true });
    return;
  }

  const job = await enqueueAiInferenceJob(parsed.data);
  setImmediate(() => {
    void processAiInferenceJob(job.id);
  });
  res.status(202).json({ job, message: 'Job enfileirado para processamento assíncrono', advisoryOnly: true });
});

aiRouter.get('/jobs/:jobId', async (req, res) => {
  const job = await getAiInferenceJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: 'Job não encontrado' });
    return;
  }
  res.json({ job, advisoryOnly: true });
});

aiRouter.post('/jobs/:jobId/process', async (req, res) => {
  const job = await processAiInferenceJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: 'Job não encontrado' });
    return;
  }
  res.json({ job, advisoryOnly: true });
});

aiRouter.get('/recommendations/:useCase', async (req, res) => {
  const useCase = req.params.useCase as AiUseCase;
  if (!useCases.includes(useCase as (typeof useCases)[number])) {
    res.status(400).json({ error: 'Use case inválido' });
    return;
  }
  const regionId = typeof req.query.regionId === 'string' ? req.query.regionId : undefined;
  const recommendation = await getLatestAiRecommendation(useCase, regionId);
  res.json({ recommendation, advisoryOnly: true, notAuthoritative: true });
});
