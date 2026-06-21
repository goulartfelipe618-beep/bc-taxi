import { config } from '../config.js';
import { generateDeterministicInsight } from './deterministicInsightsService.js';
import { getPromptTemplate, maskPiiInFeatures } from './promptRegistry.js';
import type { AiInsightOutput, AiUseCase } from './types.js';

const DEFAULT_MODEL = 'gpt-4o-mini';

export async function runAiInference(
  useCase: AiUseCase,
  features: Record<string, unknown>,
): Promise<AiInsightOutput> {
  const masked = maskPiiInFeatures(features);
  const { template, promptHash } = getPromptTemplate(useCase);

  if (!config.openaiApiKey || !config.aiInsightsEnabled) {
    const deterministic = generateDeterministicInsight(useCase, masked);
    return { ...deterministic, payload: { ...deterministic.payload, promptHash, provider: 'deterministic' } };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.openaiModel,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are an advisory analytics assistant for a ride-hailing platform. Never make blocking decisions. Output valid JSON only.',
          },
          {
            role: 'user',
            content: template.replace('{{features}}', JSON.stringify(masked)),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI HTTP ${response.status}`);
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error('OpenAI empty response');

    const parsed = JSON.parse(content) as Record<string, unknown>;
    return {
      summary: String(parsed.summary ?? parsed.recommendation ?? 'Insight gerado'),
      confidence: Number(parsed.confidence ?? 0.75),
      modelVersion: config.openaiModel,
      payload: { ...parsed, promptHash, provider: 'openai', advisoryOnly: true, notAuthoritative: true },
    };
  } catch {
    const fallback = generateDeterministicInsight(useCase, masked);
    return {
      ...fallback,
      payload: { ...fallback.payload, promptHash, provider: 'deterministic_fallback' },
    };
  }
}

export { DEFAULT_MODEL };
