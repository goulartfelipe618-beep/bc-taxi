import { createHash } from 'node:crypto';
import type { AiUseCase } from './types.js';

const PROMPT_VERSION = 'v1';

const templates: Record<AiUseCase, string> = {
  fraud_case_summary:
    'Summarize fraud case patterns for human review. Input features (PII masked): {{features}}. Return JSON with summary, priority_cases, clusters.',
  demand_forecast:
    'Project ride demand by region/hour/weather. Input: {{features}}. Return JSON with projected_rides, peak_hours, confidence_notes.',
  dynamic_pressure_hint:
    'Recommend future dynamic pricing pressure (advisory only). Input: {{features}}. Return JSON with suggested_multiplier_band, rationale.',
  review_sentiment:
    'Classify review sentiment and themes. Input: {{features}}. Return JSON with sentiment, themes, toxicity_risk.',
  ops_supply_insight:
    'Operational supply/demand insight for dispatch. Input: {{features}}. Return JSON with supply_gap, suggested_actions.',
};

export function getPromptTemplate(useCase: AiUseCase): { template: string; promptHash: string } {
  const template = templates[useCase];
  const promptHash = createHash('sha256')
    .update(`${PROMPT_VERSION}:${useCase}:${template}`)
    .digest('hex')
    .slice(0, 32);
  return { template, promptHash };
}

export function maskPiiInFeatures(features: Record<string, unknown>): Record<string, unknown> {
  const json = JSON.stringify(features);
  const masked = json
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email]')
    .replace(/\b\d{10,11}\b/g, '[phone]')
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '[cpf]');
  return JSON.parse(masked) as Record<string, unknown>;
}

export function buildFeatureSetId(useCase: AiUseCase, features: Record<string, unknown>): string {
  return createHash('sha256')
    .update(`${useCase}:${JSON.stringify(features)}`)
    .digest('hex')
    .slice(0, 24);
}
