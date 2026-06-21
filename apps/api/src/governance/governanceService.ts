import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';
import { MATCH_CONFIG } from '../domain/match.js';
import { REPUTATION_CONFIG } from '../domain/reputation.js';
import { getRideDecisionLogs, toPublicDecisionLog } from '../observability/decisionLogService.js';

export interface MatchScoringVersion {
  id: string;
  versionLabel: string;
  weights: Record<string, number>;
  bonuses: Record<string, number>;
}

export interface ReputationFormulaVersion {
  id: string;
  versionLabel: string;
  config: Record<string, unknown>;
}

export interface RideGovernanceSnapshot {
  id: string;
  rideId: string;
  phase: 'quote' | 'match' | 'settlement';
  pricingRuleVersionId?: string;
  pricingRuleSetLabel?: string;
  matchScoringVersionId?: string;
  reputationFormulaVersionId?: string;
  dynamicMultiplier?: number;
  quotedFareCentavos?: number;
  snapshotJson: Record<string, unknown>;
  createdAt: Date;
}

const MATCH_VERSION_ID = '00000000-0000-4000-8000-000000000300';
const REPUTATION_VERSION_ID = '00000000-0000-4000-8000-000000000301';

const memoryMatchVersions: MatchScoringVersion[] = [
  {
    id: MATCH_VERSION_ID,
    versionLabel: 'match-2026.1',
    weights: MATCH_CONFIG.scoreWeights as unknown as Record<string, number>,
    bonuses: {
      passengerEliteBonus: MATCH_CONFIG.passengerEliteBonus,
      passengerPremiumBonus: MATCH_CONFIG.passengerPremiumBonus,
      driverEliteBonus: MATCH_CONFIG.driverEliteBonus,
      driverPremiumBonus: MATCH_CONFIG.driverPremiumBonus,
      corporateBonus: MATCH_CONFIG.corporateBonus,
    },
  },
];

const memoryReputationVersions: ReputationFormulaVersion[] = [
  {
    id: REPUTATION_VERSION_ID,
    versionLabel: 'reputation-2026.1',
    config: {
      driverLambda: REPUTATION_CONFIG.driverLambda,
      passengerLambda: REPUTATION_CONFIG.passengerLambda,
      freshnessBonus: REPUTATION_CONFIG.freshnessBonus,
      maxHistoricalWeightRatio: REPUTATION_CONFIG.maxHistoricalWeightRatio,
      driverBayesianM: REPUTATION_CONFIG.driverBayesianM,
      passengerBayesianM: REPUTATION_CONFIG.passengerBayesianM,
    },
  },
];

const memorySnapshots: RideGovernanceSnapshot[] = [];

function mapMatchRow(row: Record<string, unknown>): MatchScoringVersion {
  return {
    id: row.id as string,
    versionLabel: row.version_label as string,
    weights: row.weights_json as Record<string, number>,
    bonuses: (row.bonuses_json as Record<string, number>) ?? {},
  };
}

function mapReputationRow(row: Record<string, unknown>): ReputationFormulaVersion {
  return {
    id: row.id as string,
    versionLabel: row.version_label as string,
    config: row.config_json as Record<string, unknown>,
  };
}

function mapSnapshotRow(row: Record<string, unknown>): RideGovernanceSnapshot {
  return {
    id: row.id as string,
    rideId: row.ride_id as string,
    phase: row.phase as RideGovernanceSnapshot['phase'],
    pricingRuleVersionId: (row.pricing_rule_version_id as string) ?? undefined,
    pricingRuleSetLabel: (row.pricing_rule_set_label as string) ?? undefined,
    matchScoringVersionId: (row.match_scoring_version_id as string) ?? undefined,
    reputationFormulaVersionId: (row.reputation_formula_version_id as string) ?? undefined,
    dynamicMultiplier: row.dynamic_multiplier != null ? Number(row.dynamic_multiplier) : undefined,
    quotedFareCentavos: row.quoted_fare_centavos != null ? Number(row.quoted_fare_centavos) : undefined,
    snapshotJson: (row.snapshot_json as Record<string, unknown>) ?? {},
    createdAt: new Date(row.created_at as string),
  };
}

export async function getActiveMatchScoringVersion(): Promise<MatchScoringVersion> {
  if (config.useMemoryDb) return memoryMatchVersions[0]!;

  const { rows } = await pool.query(
    `SELECT * FROM match_scoring_versions
     WHERE is_active = TRUE AND effective_from <= NOW()
       AND (effective_to IS NULL OR effective_to > NOW())
     ORDER BY effective_from DESC LIMIT 1`,
  );
  return rows[0] ? mapMatchRow(rows[0]) : memoryMatchVersions[0]!;
}

export async function getActiveReputationFormulaVersion(): Promise<ReputationFormulaVersion> {
  if (config.useMemoryDb) return memoryReputationVersions[0]!;

  const { rows } = await pool.query(
    `SELECT * FROM reputation_formula_versions
     WHERE is_active = TRUE AND effective_from <= NOW()
       AND (effective_to IS NULL OR effective_to > NOW())
     ORDER BY effective_from DESC LIMIT 1`,
  );
  return rows[0] ? mapReputationRow(rows[0]) : memoryReputationVersions[0]!;
}

async function resolvePricingRuleSetLabel(ruleVersionId?: string): Promise<string | undefined> {
  if (!ruleVersionId || config.useMemoryDb) return 'BC Taxi Default';
  const { rows } = await pool.query(
    `SELECT s.version_label FROM pricing_rule_versions v
     JOIN pricing_rule_sets s ON s.id = v.rule_set_id
     WHERE v.id = $1`,
    [ruleVersionId],
  );
  return (rows[0]?.version_label as string) ?? undefined;
}

export async function captureRideGovernanceSnapshot(input: {
  rideId: string;
  phase: 'quote' | 'match' | 'settlement';
  pricingRuleVersionId?: string;
  dynamicMultiplier?: number;
  quotedFareCentavos?: number;
  snapshotJson?: Record<string, unknown>;
}) {
  const matchVersion = await getActiveMatchScoringVersion();
  const reputationVersion = await getActiveReputationFormulaVersion();
  const ruleSetLabel = await resolvePricingRuleSetLabel(input.pricingRuleVersionId);

  const snapshot: RideGovernanceSnapshot = {
    id: randomUUID(),
    rideId: input.rideId,
    phase: input.phase,
    pricingRuleVersionId: input.pricingRuleVersionId,
    pricingRuleSetLabel: ruleSetLabel,
    matchScoringVersionId: matchVersion.id,
    reputationFormulaVersionId: reputationVersion.id,
    dynamicMultiplier: input.dynamicMultiplier,
    quotedFareCentavos: input.quotedFareCentavos,
    snapshotJson: {
      matchVersionLabel: matchVersion.versionLabel,
      reputationVersionLabel: reputationVersion.versionLabel,
      ...input.snapshotJson,
    },
    createdAt: new Date(),
  };

  if (config.useMemoryDb) {
    const existing = memorySnapshots.find((s) => s.rideId === input.rideId && s.phase === input.phase);
    if (existing) return existing;
    memorySnapshots.push(snapshot);
    return snapshot;
  }

  const { rows } = await pool.query(
    `INSERT INTO ride_governance_snapshots (
      ride_id, phase, pricing_rule_version_id, pricing_rule_set_label,
      match_scoring_version_id, reputation_formula_version_id,
      dynamic_multiplier, quoted_fare_centavos, snapshot_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (ride_id, phase) DO NOTHING
    RETURNING *`,
    [
      snapshot.rideId,
      snapshot.phase,
      snapshot.pricingRuleVersionId ?? null,
      snapshot.pricingRuleSetLabel ?? null,
      snapshot.matchScoringVersionId ?? null,
      snapshot.reputationFormulaVersionId ?? null,
      snapshot.dynamicMultiplier ?? null,
      snapshot.quotedFareCentavos ?? null,
      JSON.stringify(snapshot.snapshotJson),
    ],
  );

  if (rows[0]) return mapSnapshotRow(rows[0]);

  const { rows: existing } = await pool.query(
    `SELECT * FROM ride_governance_snapshots WHERE ride_id = $1 AND phase = $2`,
    [input.rideId, input.phase],
  );
  return existing[0] ? mapSnapshotRow(existing[0]) : snapshot;
}

export async function getRideGovernanceSnapshots(rideId: string): Promise<RideGovernanceSnapshot[]> {
  if (config.useMemoryDb) {
    return memorySnapshots
      .filter((s) => s.rideId === rideId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
  const { rows } = await pool.query(
    `SELECT * FROM ride_governance_snapshots WHERE ride_id = $1 ORDER BY created_at ASC`,
    [rideId],
  );
  return rows.map(mapSnapshotRow);
}

export async function getRideGovernanceTrail(rideId: string) {
  const snapshots = await getRideGovernanceSnapshots(rideId);
  const decisions = await getRideDecisionLogs(rideId);
  return {
    rideId,
    snapshots: snapshots.map(toPublicSnapshot),
    decisions: decisions.map(toPublicDecisionLog),
  };
}

export function toPublicSnapshot(s: RideGovernanceSnapshot) {
  return {
    id: s.id,
    phase: s.phase,
    pricingRuleVersionId: s.pricingRuleVersionId,
    pricingRuleSetLabel: s.pricingRuleSetLabel,
    matchScoringVersionId: s.matchScoringVersionId,
    matchVersionLabel: s.snapshotJson.matchVersionLabel,
    reputationFormulaVersionId: s.reputationFormulaVersionId,
    reputationVersionLabel: s.snapshotJson.reputationVersionLabel,
    dynamicMultiplier: s.dynamicMultiplier,
    quotedFareCentavos: s.quotedFareCentavos,
    snapshotJson: s.snapshotJson,
    createdAt: s.createdAt.toISOString(),
  };
}

export async function getActiveGovernanceCatalog() {
  const matchVersion = await getActiveMatchScoringVersion();
  const reputationVersion = await getActiveReputationFormulaVersion();

  let pricingRuleSetLabel = 'BC Taxi Default';
  if (!config.useMemoryDb) {
    const { rows } = await pool.query(
      `SELECT version_label FROM pricing_rule_sets WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1`,
    );
    pricingRuleSetLabel = (rows[0]?.version_label as string) ?? pricingRuleSetLabel;
  }

  return {
    pricingRuleSetLabel,
    matchScoring: {
      id: matchVersion.id,
      versionLabel: matchVersion.versionLabel,
      weights: matchVersion.weights,
    },
    reputationFormula: {
      id: reputationVersion.id,
      versionLabel: reputationVersion.versionLabel,
    },
  };
}

export async function publishMatchScoringVersion(input: {
  versionLabel: string;
  weights: Record<string, number>;
  bonuses?: Record<string, number>;
}) {
  if (config.useMemoryDb) {
    const v: MatchScoringVersion = {
      id: randomUUID(),
      versionLabel: input.versionLabel,
      weights: input.weights,
      bonuses: input.bonuses ?? {},
    };
    memoryMatchVersions.unshift(v);
    return v;
  }

  await pool.query(
    `UPDATE match_scoring_versions SET effective_to = NOW(), is_active = FALSE
     WHERE is_active = TRUE AND effective_to IS NULL`,
  );

  const { rows } = await pool.query(
    `INSERT INTO match_scoring_versions (version_label, weights_json, bonuses_json)
     VALUES ($1,$2,$3) RETURNING *`,
    [input.versionLabel, JSON.stringify(input.weights), JSON.stringify(input.bonuses ?? {})],
  );
  return mapMatchRow(rows[0]);
}
