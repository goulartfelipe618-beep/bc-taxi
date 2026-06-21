import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { useMemory } from '../stores/memoryMatchStore.js';
import { getDeviceGraph } from './deviceGraphService.js';
import { enforceFromRiskScore, applyFraudBlock } from './fraudEnforcementService.js';
import { revokeReputationBenefits } from '../reviews/revocationService.js';

export type AutoReviewDecision = 'clear' | 'restrict' | 'block' | 'escalate';

export interface FraudCaseRecord {
  id: string;
  userId: string;
  status: string;
  riskScore: number;
  summary?: string;
  priority: number;
  reviewStatus: string;
  autoAction?: string;
  reasonCodes: string[];
}

export interface AutoReviewResult {
  caseId: string;
  decision: AutoReviewDecision;
  reasonCodes: string[];
  priority: number;
}

const memoryCases: FraudCaseRecord[] = [];
const memoryReviews: AutoReviewResult[] = [];

const RULES_VERSION = 'v1';

function computePriority(input: {
  riskScore: number;
  linkedAccountCount: number;
  reasonCodes: string[];
}): number {
  let priority = Math.round(input.riskScore * 100);
  if (input.linkedAccountCount >= 2) priority += 20;
  if (input.reasonCodes.includes('GPS_JUMP')) priority += 15;
  if (input.reasonCodes.includes('MULTI_ACCOUNT_DEVICE')) priority += 10;
  return Math.min(100, priority);
}

function decideAutoReview(input: {
  riskScore: number;
  linkedAccountCount: number;
  graphFlags: string[];
  reasonCodes: string[];
}): { decision: AutoReviewDecision; reasonCodes: string[] } {
  const codes = [...input.reasonCodes];
  if (input.graphFlags.includes('MULTI_ACCOUNT_CLUSTER')) codes.push('MULTI_ACCOUNT_CLUSTER');

  if (input.riskScore >= 0.9 || (input.linkedAccountCount >= 3 && input.riskScore >= 0.6)) {
    return { decision: 'block', reasonCodes: codes };
  }
  if (input.riskScore >= 0.75 || input.graphFlags.includes('MULTI_ACCOUNT_CLUSTER')) {
    return { decision: 'restrict', reasonCodes: codes };
  }
  if (input.riskScore >= 0.5 || input.linkedAccountCount >= 1) {
    return { decision: 'escalate', reasonCodes: codes };
  }
  return { decision: 'clear', reasonCodes: codes };
}

export async function upsertFraudCase(input: {
  userId: string;
  riskScore: number;
  summary: string;
  reasonCodes?: string[];
}): Promise<FraudCaseRecord> {
  const reasonCodes = input.reasonCodes ?? [];

  if (useMemory()) {
    const existing = memoryCases.find((c) => c.userId === input.userId && c.status === 'open');
    if (existing) {
      existing.riskScore = Math.max(existing.riskScore, input.riskScore);
      existing.summary = input.summary;
      existing.reasonCodes = [...new Set([...existing.reasonCodes, ...reasonCodes])];
      return existing;
    }
    const created: FraudCaseRecord = {
      id: randomUUID(),
      userId: input.userId,
      status: 'open',
      riskScore: input.riskScore,
      summary: input.summary,
      priority: 50,
      reviewStatus: 'pending',
      reasonCodes,
    };
    memoryCases.push(created);
    return created;
  }

  const { rows: existingRows } = await pool.query(
    `SELECT id FROM fraud_cases WHERE user_id = $1 AND status = 'open' LIMIT 1`,
    [input.userId],
  );

  if (existingRows[0]) {
    const caseId = existingRows[0].id as string;
    await pool.query(
      `UPDATE fraud_cases SET
         risk_score = GREATEST(risk_score, $2),
         summary = $3,
         reason_codes = (
           SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(reason_codes, '{}') || $4::text[]))
         ),
         review_status = 'pending'
       WHERE id = $1`,
      [caseId, input.riskScore, input.summary, reasonCodes],
    );
    const { rows } = await pool.query(`SELECT * FROM fraud_cases WHERE id = $1`, [caseId]);
    return mapCaseRow(rows[0] as Record<string, unknown>);
  }

  const id = randomUUID();
  await pool.query(
    `INSERT INTO fraud_cases (id, user_id, status, risk_score, summary, reason_codes, review_status)
     VALUES ($1,$2,'open',$3,$4,$5,'pending')`,
    [id, input.userId, input.riskScore, input.summary, reasonCodes],
  );
  const { rows } = await pool.query(`SELECT * FROM fraud_cases WHERE id = $1`, [id]);
  return mapCaseRow(rows[0] as Record<string, unknown>);
}

function mapCaseRow(row: Record<string, unknown>): FraudCaseRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    status: row.status as string,
    riskScore: Number(row.risk_score),
    summary: (row.summary as string) ?? undefined,
    priority: Number(row.priority ?? 50),
    reviewStatus: (row.review_status as string) ?? 'pending',
    autoAction: (row.auto_action as string) ?? undefined,
    reasonCodes: (row.reason_codes as string[]) ?? [],
  };
}

export async function autoReviewCase(caseId: string): Promise<AutoReviewResult | null> {
  let fraudCase: FraudCaseRecord | null = null;

  if (useMemory()) {
    fraudCase = memoryCases.find((c) => c.id === caseId) ?? null;
  } else {
    const { rows } = await pool.query(`SELECT * FROM fraud_cases WHERE id = $1`, [caseId]);
    fraudCase = rows[0] ? mapCaseRow(rows[0] as Record<string, unknown>) : null;
  }

  if (!fraudCase || fraudCase.reviewStatus !== 'pending') return null;

  const graph = await getDeviceGraph(fraudCase.userId);
  const { decision, reasonCodes } = decideAutoReview({
    riskScore: fraudCase.riskScore,
    linkedAccountCount: graph.linkedUserCount,
    graphFlags: graph.riskFlags,
    reasonCodes: fraudCase.reasonCodes,
  });

  const priority = computePriority({
    riskScore: fraudCase.riskScore,
    linkedAccountCount: graph.linkedUserCount,
    reasonCodes,
  });

  const result: AutoReviewResult = { caseId, decision, reasonCodes, priority };

  if (decision === 'block') {
    await enforceFromRiskScore({
      userId: fraudCase.userId,
      riskScore: fraudCase.riskScore,
      reasonCodes,
    });
    if (reasonCodes.includes('GPS_JUMP')) {
      await revokeReputationBenefits({
        userId: fraudCase.userId,
        userRole: 'driver',
        reason: 'Fraude confirmada por revisão automática',
        sourceType: 'fraud',
        sourceRef: caseId,
      });
    }
    fraudCase.status = 'confirmed';
    fraudCase.autoAction = 'block';
    fraudCase.reviewStatus = 'auto_reviewed';
  } else if (decision === 'restrict') {
    await applyFraudBlock({
      userId: fraudCase.userId,
      blockScope: 'ride_request',
      reasonCode: 'AUTO_REVIEW_RESTRICT',
      summary: 'Restrição automática após revisão de caso de fraude',
      sourceType: 'case_review',
      sourceRef: caseId,
      riskScore: fraudCase.riskScore,
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    });
    fraudCase.status = 'reviewing';
    fraudCase.autoAction = 'restrict';
    fraudCase.reviewStatus = 'auto_reviewed';
  } else if (decision === 'escalate') {
    fraudCase.status = 'reviewing';
    fraudCase.reviewStatus = 'human_queue';
    fraudCase.autoAction = 'none';
  } else {
    fraudCase.status = 'cleared';
    fraudCase.reviewStatus = 'auto_reviewed';
    fraudCase.autoAction = 'clear';
  }

  fraudCase.priority = priority;

  if (useMemory()) {
    memoryReviews.push(result);
    return result;
  }

  await pool.query(
    `INSERT INTO fraud_case_auto_reviews
       (case_id, decision, reason_codes, risk_score, linked_account_count, deterministic_rules_version)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [caseId, decision, reasonCodes, fraudCase.riskScore, graph.linkedUserCount, RULES_VERSION],
  );

  await pool.query(
    `UPDATE fraud_cases SET
       status = $2,
       priority = $3,
       review_status = $4,
       auto_action = $5,
       closed_at = CASE WHEN $2 IN ('cleared', 'confirmed') THEN NOW() ELSE closed_at END
     WHERE id = $1`,
    [caseId, fraudCase.status, priority, fraudCase.reviewStatus, fraudCase.autoAction ?? null],
  );

  return result;
}

export async function processPendingFraudCases(limit = 20): Promise<AutoReviewResult[]> {
  let pending: FraudCaseRecord[] = [];

  if (useMemory()) {
    pending = memoryCases.filter((c) => c.reviewStatus === 'pending' && c.status === 'open').slice(0, limit);
  } else {
    const { rows } = await pool.query(
      `SELECT * FROM fraud_cases
       WHERE review_status = 'pending' AND status IN ('open', 'reviewing')
       ORDER BY priority DESC, opened_at ASC
       LIMIT $1`,
      [limit],
    );
    pending = rows.map((r) => mapCaseRow(r as Record<string, unknown>));
  }

  const results: AutoReviewResult[] = [];
  for (const c of pending) {
    const reviewed = await autoReviewCase(c.id);
    if (reviewed) results.push(reviewed);
  }
  return results;
}

export function __testResetCaseReviewMemory() {
  memoryCases.length = 0;
  memoryReviews.length = 0;
}

export function __testSeedCase(input: Omit<FraudCaseRecord, 'id'> & { id?: string }) {
  memoryCases.push({
    id: input.id ?? randomUUID(),
    userId: input.userId,
    status: input.status,
    riskScore: input.riskScore,
    summary: input.summary,
    priority: input.priority,
    reviewStatus: input.reviewStatus,
    autoAction: input.autoAction,
    reasonCodes: input.reasonCodes,
  });
}
