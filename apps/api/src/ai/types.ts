export type AiUseCase =
  | 'fraud_case_summary'
  | 'demand_forecast'
  | 'dynamic_pressure_hint'
  | 'review_sentiment'
  | 'ops_supply_insight';

export type AiJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface AiInferenceJob {
  id: string;
  useCase: AiUseCase;
  status: AiJobStatus;
  inputFeatureSetId: string;
  modelVersion: string;
  promptHash: string;
  confidence?: number;
  output?: Record<string, unknown>;
  errorMessage?: string;
  sourceRef?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface AiRecommendation {
  id: string;
  useCase: AiUseCase;
  regionId?: string;
  jobId?: string;
  recommendationVersion: number;
  modelVersion: string;
  promptHash: string;
  inputFeatureSetId: string;
  confidence: number;
  summary: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface AiInsightOutput {
  summary: string;
  confidence: number;
  payload: Record<string, unknown>;
  modelVersion: string;
}
