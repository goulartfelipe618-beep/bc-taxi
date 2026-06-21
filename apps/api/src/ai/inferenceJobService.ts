import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { useMemory } from '../stores/memoryMatchStore.js';
import { buildFeatureSetId, getPromptTemplate, maskPiiInFeatures } from './promptRegistry.js';
import { runAiInference } from './openaiClient.js';
import type { AiInferenceJob, AiRecommendation, AiUseCase } from './types.js';

const memoryJobs = new Map<string, AiInferenceJob>();
const memoryRecommendations: AiRecommendation[] = [];
const memoryFeatures = new Map<string, Record<string, unknown>>();

function mapJob(row: Record<string, unknown>): AiInferenceJob {
  return {
    id: row.id as string,
    useCase: row.use_case as AiUseCase,
    status: row.status as AiInferenceJob['status'],
    inputFeatureSetId: row.input_feature_set_id as string,
    modelVersion: row.model_version as string,
    promptHash: row.prompt_hash as string,
    confidence: row.confidence != null ? Number(row.confidence) : undefined,
    output: (row.output_json as Record<string, unknown>) ?? undefined,
    errorMessage: (row.error_message as string) ?? undefined,
    sourceRef: (row.source_ref as string) ?? undefined,
    createdAt: new Date(row.created_at as string),
    completedAt: row.completed_at ? new Date(row.completed_at as string) : undefined,
  };
}

async function persistFeatureSnapshot(input: {
  featureSetId: string;
  useCase: AiUseCase;
  regionId?: string;
  features: Record<string, unknown>;
}) {
  const masked = maskPiiInFeatures(input.features);
  if (useMemory()) {
    memoryFeatures.set(input.featureSetId, masked);
    return;
  }
  await pool.query(
    `INSERT INTO ai_feature_snapshots (feature_set_id, use_case, region_id, features_json, pii_masked)
     VALUES ($1,$2,$3,$4,TRUE)
     ON CONFLICT (feature_set_id) DO NOTHING`,
    [input.featureSetId, input.useCase, input.regionId ?? null, JSON.stringify(masked)],
  );
}

export async function enqueueAiInferenceJob(input: {
  useCase: AiUseCase;
  features: Record<string, unknown>;
  regionId?: string;
  sourceRef?: string;
}): Promise<AiInferenceJob> {
  const featureSetId = buildFeatureSetId(input.useCase, input.features);
  const { promptHash } = getPromptTemplate(input.useCase);

  await persistFeatureSnapshot({
    featureSetId,
    useCase: input.useCase,
    regionId: input.regionId,
    features: input.features,
  });

  const job: AiInferenceJob = {
    id: randomUUID(),
    useCase: input.useCase,
    status: 'queued',
    inputFeatureSetId: featureSetId,
    modelVersion: 'pending',
    promptHash,
    sourceRef: input.sourceRef,
    createdAt: new Date(),
  };

  if (useMemory()) {
    memoryJobs.set(job.id, job);
  } else {
    const { rows } = await pool.query(
      `INSERT INTO ai_inference_jobs (id, use_case, status, input_feature_set_id, prompt_hash, source_ref)
       VALUES ($1,$2,'queued',$3,$4,$5)
       RETURNING *`,
      [job.id, input.useCase, featureSetId, promptHash, input.sourceRef ?? null],
    );
    return mapJob(rows[0] as Record<string, unknown>);
  }

  memoryJobs.set(job.id, job);
  return job;
}

export async function processAiInferenceJob(jobId: string): Promise<AiInferenceJob | null> {
  let job: AiInferenceJob | undefined;
  if (useMemory()) {
    job = memoryJobs.get(jobId);
  } else {
    const { rows } = await pool.query(`SELECT * FROM ai_inference_jobs WHERE id = $1`, [jobId]);
    job = rows[0] ? mapJob(rows[0] as Record<string, unknown>) : undefined;
  }
  if (!job || job.status === 'completed' || job.status === 'failed') return job ?? null;

  job.status = 'running';
  if (!useMemory()) {
    await pool.query(`UPDATE ai_inference_jobs SET status = 'running', started_at = NOW() WHERE id = $1`, [jobId]);
  }

  const features =
    (useMemory() ? memoryFeatures.get(job.inputFeatureSetId) : undefined) ??
    (await loadFeatures(job.inputFeatureSetId));

  try {
    const result = await runAiInference(job.useCase, features ?? {});
    job.status = 'completed';
    job.modelVersion = result.modelVersion;
    job.confidence = result.confidence;
    job.output = { summary: result.summary, ...result.payload };
    job.completedAt = new Date();

    if (useMemory()) {
      memoryJobs.set(jobId, job);
    } else {
      await pool.query(
        `UPDATE ai_inference_jobs SET
           status = 'completed',
           model_version = $2,
           confidence = $3,
           output_json = $4,
           completed_at = NOW()
         WHERE id = $1`,
        [jobId, result.modelVersion, result.confidence, JSON.stringify(job.output)],
      );
    }

    await saveRecommendation({
      useCase: job.useCase,
      jobId: job.id,
      modelVersion: result.modelVersion,
      promptHash: job.promptHash,
      inputFeatureSetId: job.inputFeatureSetId,
      confidence: result.confidence,
      summary: result.summary,
      payload: result.payload,
    });

    return job;
  } catch (err) {
    job.status = 'failed';
    job.errorMessage = err instanceof Error ? err.message : 'AI job failed';
    if (useMemory()) {
      memoryJobs.set(jobId, job);
    } else {
      await pool.query(
        `UPDATE ai_inference_jobs SET status = 'failed', error_message = $2, completed_at = NOW() WHERE id = $1`,
        [jobId, job.errorMessage],
      );
    }
    return job;
  }
}

async function loadFeatures(featureSetId: string): Promise<Record<string, unknown>> {
  const { rows } = await pool.query(
    `SELECT features_json FROM ai_feature_snapshots WHERE feature_set_id = $1`,
    [featureSetId],
  );
  return (rows[0]?.features_json as Record<string, unknown>) ?? {};
}

async function saveRecommendation(input: {
  useCase: AiUseCase;
  jobId: string;
  modelVersion: string;
  promptHash: string;
  inputFeatureSetId: string;
  confidence: number;
  summary: string;
  payload: Record<string, unknown>;
  regionId?: string;
}) {
  const rec: AiRecommendation = {
    id: randomUUID(),
    useCase: input.useCase,
    regionId: input.regionId,
    jobId: input.jobId,
    recommendationVersion: 1,
    modelVersion: input.modelVersion,
    promptHash: input.promptHash,
    inputFeatureSetId: input.inputFeatureSetId,
    confidence: input.confidence,
    summary: input.summary,
    payload: input.payload,
    createdAt: new Date(),
  };

  if (useMemory()) {
    for (const r of memoryRecommendations) {
      if (r.useCase === input.useCase) r.payload = { ...r.payload, superseded: true };
    }
    memoryRecommendations.push(rec);
    return rec;
  }

  await pool.query(
    `UPDATE ai_recommendations SET is_active = FALSE WHERE use_case = $1 AND ($2::uuid IS NULL OR region_id = $2)`,
    [input.useCase, input.regionId ?? null],
  );

  const { rows } = await pool.query(
    `INSERT INTO ai_recommendations
       (use_case, region_id, job_id, model_version, prompt_hash, input_feature_set_id, confidence, summary, payload_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, created_at`,
    [
      input.useCase,
      input.regionId ?? null,
      input.jobId,
      input.modelVersion,
      input.promptHash,
      input.inputFeatureSetId,
      input.confidence,
      input.summary,
      JSON.stringify(input.payload),
    ],
  );
  rec.id = rows[0].id as string;
  rec.createdAt = new Date(rows[0].created_at as string);
  return rec;
}

export async function enqueueAndProcessAiJob(input: {
  useCase: AiUseCase;
  features: Record<string, unknown>;
  regionId?: string;
  sourceRef?: string;
}): Promise<AiInferenceJob> {
  const job = await enqueueAiInferenceJob(input);
  const processed = await processAiInferenceJob(job.id);
  return processed ?? job;
}

export function scheduleAiInferenceJob(input: {
  useCase: AiUseCase;
  features: Record<string, unknown>;
  regionId?: string;
  sourceRef?: string;
}) {
  void enqueueAiInferenceJob(input).then((job) => processAiInferenceJob(job.id));
}

export async function getAiInferenceJob(jobId: string): Promise<AiInferenceJob | null> {
  if (useMemory()) return memoryJobs.get(jobId) ?? null;
  const { rows } = await pool.query(`SELECT * FROM ai_inference_jobs WHERE id = $1`, [jobId]);
  return rows[0] ? mapJob(rows[0] as Record<string, unknown>) : null;
}

export async function getLatestAiRecommendation(useCase: AiUseCase, regionId?: string) {
  if (useMemory()) {
    const list = memoryRecommendations.filter((r) => r.useCase === useCase);
    return list.at(-1) ?? null;
  }
  const { rows } = await pool.query(
    `SELECT * FROM ai_recommendations
     WHERE use_case = $1 AND is_active = TRUE
       AND ($2::uuid IS NULL OR region_id = $2)
     ORDER BY created_at DESC LIMIT 1`,
    [useCase, regionId ?? null],
  );
  if (!rows[0]) return null;
  const row = rows[0] as Record<string, unknown>;
  return {
    id: row.id as string,
    useCase: row.use_case as AiUseCase,
    regionId: (row.region_id as string) ?? undefined,
    jobId: (row.job_id as string) ?? undefined,
    recommendationVersion: Number(row.recommendation_version),
    modelVersion: row.model_version as string,
    promptHash: row.prompt_hash as string,
    inputFeatureSetId: row.input_feature_set_id as string,
    confidence: Number(row.confidence),
    summary: row.summary as string,
    payload: (row.payload_json as Record<string, unknown>) ?? {},
    createdAt: new Date(row.created_at as string),
  };
}

export function __testResetAiMemory() {
  memoryJobs.clear();
  memoryRecommendations.length = 0;
  memoryFeatures.clear();
}
