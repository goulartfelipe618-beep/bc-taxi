process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';
process.env.AI_INSIGHTS_ENABLED = 'true';
process.env.OPENAI_API_KEY = '';

async function main() {
  const {
    enqueueAndProcessAiJob,
    getAiInferenceJob,
    getLatestAiRecommendation,
    __testResetAiMemory,
  } = await import('../src/ai/inferenceJobService.js');
  const { maskPiiInFeatures, getPromptTemplate } = await import('../src/ai/promptRegistry.js');
  const { generateDeterministicInsight } = await import('../src/ai/deterministicInsightsService.js');

  __testResetAiMemory();

  const masked = maskPiiInFeatures({
    email: 'user@example.com',
    phone: '47999998888',
    openFlagCount: 8,
    topFlagTypes: ['PAIR_LOOP', 'MICRO_RIDE_REPEAT'],
  });
  if (JSON.stringify(masked).includes('user@example.com')) {
    throw new Error('PII should be masked');
  }

  const { promptHash } = getPromptTemplate('fraud_case_summary');
  if (promptHash.length < 16) throw new Error('promptHash missing');

  const deterministic = generateDeterministicInsight('fraud_case_summary', { openFlagCount: 8 });
  if (!deterministic.payload.advisoryOnly) throw new Error('Must be advisory only');

  const job = await enqueueAndProcessAiJob({
    useCase: 'fraud_case_summary',
    features: { openFlagCount: 8, topFlagTypes: ['PAIR_LOOP'] },
    sourceRef: 'test-camada30',
  });

  if (job.status !== 'completed') throw new Error(`Job failed: ${job.errorMessage}`);
  if (!job.promptHash || !job.inputFeatureSetId) throw new Error('Governance fields missing');
  if (!job.confidence || job.confidence <= 0) throw new Error('Confidence missing');
  console.log('AI job:', job.useCase, job.modelVersion, job.output?.summary);

  const loaded = await getAiInferenceJob(job.id);
  if (!loaded || loaded.status !== 'completed') throw new Error('Job reload failed');

  const rec = await getLatestAiRecommendation('fraud_case_summary');
  if (!rec || !rec.summary) throw new Error('Recommendation missing');
  if (!rec.payload.notAuthoritative && !rec.payload.advisoryOnly) {
    throw new Error('Recommendation must be non-authoritative');
  }

  const demand = await enqueueAndProcessAiJob({
    useCase: 'demand_forecast',
    features: { activeRides: 12, regionId: '00000000-0000-4000-8000-000000000020' },
  });
  if (demand.status !== 'completed') throw new Error('Demand forecast job failed');

  const ops = await enqueueAndProcessAiJob({
    useCase: 'ops_supply_insight',
    features: { wsConnections: 0, activeRides: 5 },
  });
  if (ops.status !== 'completed') throw new Error('Ops insight job failed');
  console.log('Ops insight:', ops.output?.summary);

  console.log('Camada 30 async OpenAI advisory insights tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
