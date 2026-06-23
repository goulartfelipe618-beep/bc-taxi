import { config } from '../config.js';
import {
  REPUTATION_CONFIG,
  getTier,
  type ReputationTier,
} from '../domain/reputation.js';
import { pool } from '../db.js';
import { listBadgeCatalog, listUserBadges, toPublicBadge } from '../reviews/badgeService.js';
import { getDriverOperationalMetrics } from '../reviews/metricsService.js';
import { getPendingReviewsForUser } from '../reviews/pendingReviewService.js';
import {
  getFullReputationDashboard,
  getUserReputationProfile,
  listAvailableReviewTags,
} from '../reviews/reputationService.js';
import { listReviewsForUser } from '../reviews/reviewStore.js';
import { memoryMatchStore, useMemory } from '../stores/memoryMatchStore.js';

export interface DriverReputationProductionConfig {
  configVersion: string;
  kpiDashboardEnabled: boolean;
  tierProgressEnabled: boolean;
  insightsEnabled: boolean;
  historyMonths: number;
}

export interface DriverReputationKpis {
  completedRides: number;
  acceptanceRate: number;
  acceptanceRateLabel: string;
  cancellationRate: number;
  cancellationRateLabel: string;
  reviewCount: number;
  weightedReviewCount: number;
}

export interface DriverOperationalBreakdown {
  operationalStability: number;
  pickupPunctuality: number;
  routeAdherence: number;
  documentQuality: number;
}

export interface DriverTierProgress {
  currentTier: string;
  nextTier?: string;
  nextTierMinScore?: number;
  pointsToNext?: number;
  progressPct: number;
}

export interface DriverReputationInsight {
  code: string;
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'success';
}

const memoryConfig: DriverReputationProductionConfig = {
  configVersion: 'camada51-memory-v1',
  kpiDashboardEnabled: true,
  tierProgressEnabled: true,
  insightsEnabled: true,
  historyMonths: 12,
};

const memoryInsights = new Map<string, DriverReputationInsight[]>();
const memoryDismissedInsightCodes = new Map<string, Set<string>>();
const TIER_ORDER: ReputationTier[] = ['restrito', 'observacao', 'confiavel', 'premium', 'elite'];

function formatPct(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`;
}

export async function getDriverReputationProductionConfig(): Promise<DriverReputationProductionConfig> {
  if (config.useMemoryDb) return { ...memoryConfig };

  const { rows } = await pool.query(
    `SELECT * FROM driver_reputation_production_config WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1`,
  );
  const r = rows[0];
  if (!r) return { ...memoryConfig, configVersion: 'camada51-v1' };
  return {
    configVersion: r.config_version as string,
    kpiDashboardEnabled: Boolean(r.kpi_dashboard_enabled),
    tierProgressEnabled: Boolean(r.tier_progress_enabled),
    insightsEnabled: Boolean(r.insights_enabled),
    historyMonths: Number(r.history_months),
  };
}

async function getDriverKpis(userId: string): Promise<DriverReputationKpis> {
  const reviews = await listReviewsForUser(userId);
  let completedRides = 0;
  let acceptanceRate = 0.82;
  let cancellationRate = 0.08;

  if (useMemory()) {
    const driver = await memoryMatchStore.getDriver(userId);
    if (driver) {
      completedRides = driver.completedRides;
      acceptanceRate = driver.acceptanceRate;
      cancellationRate = driver.cancellationRate;
    } else {
      completedRides = 312;
      acceptanceRate = 0.86;
      cancellationRate = 0.07;
    }
  } else {
    const { rows } = await pool.query(
      `SELECT completed_rides, acceptance_rate, cancellation_rate
       FROM drivers WHERE user_id = $1`,
      [userId],
    );
    if (rows[0]) {
      completedRides = Number(rows[0].completed_rides ?? 0);
      acceptanceRate = Number(rows[0].acceptance_rate ?? 0);
      cancellationRate = Number(rows[0].cancellation_rate ?? 0);
    }
  }

  return {
    completedRides,
    acceptanceRate,
    acceptanceRateLabel: formatPct(acceptanceRate),
    cancellationRate,
    cancellationRateLabel: formatPct(cancellationRate),
    reviewCount: reviews.length,
    weightedReviewCount: reviews.length,
  };
}

function buildTierProgress(score: number): DriverTierProgress {
  const currentTier = getTier(score);
  const idx = TIER_ORDER.indexOf(currentTier);
  const nextTier = idx < TIER_ORDER.length - 1 ? TIER_ORDER[idx + 1] : undefined;
  const currentMin = REPUTATION_CONFIG.tiers[currentTier].min;
  const currentMax = REPUTATION_CONFIG.tiers[currentTier].max;
  const nextMin = nextTier ? REPUTATION_CONFIG.tiers[nextTier].min : undefined;
  const span = currentMax - currentMin || 0.01;
  const progressPct = nextTier
    ? Math.round(Math.min(100, Math.max(0, ((score - currentMin) / span) * 100)))
    : 100;

  return {
    currentTier,
    nextTier,
    nextTierMinScore: nextMin,
    pointsToNext: nextMin != null ? Math.max(0, Math.round((nextMin - score) * 100) / 100) : undefined,
    progressPct,
  };
}

function buildInsights(
  kpis: DriverReputationKpis,
  ops: DriverOperationalBreakdown,
  profile: Awaited<ReturnType<typeof getUserReputationProfile>>,
): DriverReputationInsight[] {
  const insights: DriverReputationInsight[] = [];

  if (kpis.cancellationRate > 0.12) {
    insights.push({
      code: 'high_cancel_rate',
      title: 'Cancelamentos acima do ideal',
      body: 'Mantenha a taxa de cancelamento abaixo de 12% para permanecer elegível a categorias premium.',
      severity: 'warning',
    });
  } else if (kpis.cancellationRate <= 0.08) {
    insights.push({
      code: 'low_cancel_rate',
      title: 'Excelente taxa de cancelamento',
      body: 'Sua taxa de cancelamento está dentro do padrão das melhores praças.',
      severity: 'success',
    });
  }

  if (kpis.acceptanceRate < 0.45) {
    insights.push({
      code: 'low_accept_rate',
      title: 'Aceite abaixo do mínimo',
      body: 'Algumas categorias exigem aceite mínimo de 45%. Responda às ofertas dentro do SLA.',
      severity: 'warning',
    });
  }

  if (ops.pickupPunctuality >= 4.5) {
    insights.push({
      code: 'pickup_punctual',
      title: 'Pontualidade no embarque',
      body: 'Você chega no pickup dentro da janela esperada na maioria das corridas.',
      severity: 'success',
    });
  }

  if (profile.operationallyBlocked) {
    insights.push({
      code: 'operationally_blocked',
      title: 'Conta em observação operacional',
      body: 'Sua reputação está abaixo do limite operacional. Conclua corridas com boas avaliações para recuperar.',
      severity: 'warning',
    });
  }

  if (profile.benefitsRevoked) {
    insights.push({
      code: 'benefits_revoked',
      title: 'Benefícios suspensos',
      body: (profile as { revocationReason?: string }).revocationReason ??
        'Benefícios de reputação foram revogados por política de fraude ou compliance.',
      severity: 'warning',
    });
  }

  if (insights.length === 0) {
    insights.push({
      code: 'keep_going',
      title: 'Continue assim',
      body: 'Mantenha boas avaliações e documentação em dia para subir de tier.',
      severity: 'info',
    });
  }

  return insights;
}

export async function getDriverReputationProductionDashboard(userId: string) {
  const prodCfg = await getDriverReputationProductionConfig();
  const [base, kpis, opsMetrics, reviewTags] = await Promise.all([
    getFullReputationDashboard(userId, 'driver'),
    prodCfg.kpiDashboardEnabled ? getDriverKpis(userId) : Promise.resolve(null),
    getDriverOperationalMetrics(userId),
    listAvailableReviewTags('driver'),
  ]);

  const ops: DriverOperationalBreakdown = {
    operationalStability: opsMetrics.operationalStability,
    pickupPunctuality: opsMetrics.pickupPunctuality,
    routeAdherence: opsMetrics.routeAdherence,
    documentQuality: opsMetrics.documentQuality,
  };

  const tierProgress = prodCfg.tierProgressEnabled
    ? buildTierProgress(base.profile.score)
    : null;

  let insights: DriverReputationInsight[] = [];
  if (prodCfg.insightsEnabled) {
    if (config.useMemoryDb && memoryInsights.has(userId)) {
      insights = memoryInsights.get(userId)!;
    } else if (!config.useMemoryDb) {
      const { rows } = await pool.query(
        `SELECT insight_code, title, body, severity
         FROM driver_reputation_insight_events
         WHERE driver_user_id = $1 AND dismissed = FALSE
         ORDER BY created_at DESC LIMIT 5`,
        [userId],
      );
      insights = rows.map((r) => ({
        code: r.insight_code as string,
        title: r.title as string,
        body: r.body as string,
        severity: r.severity as DriverReputationInsight['severity'],
      }));
    }
    if (insights.length === 0 && kpis) {
      insights = buildInsights(kpis, ops, base.profile);
    }
    if (config.useMemoryDb) {
      const dismissed = memoryDismissedInsightCodes.get(userId) ?? new Set();
      insights = insights.filter((i) => !dismissed.has(i.code));
    }
  }

  const badgeCatalog = await listBadgeCatalog('driver');
  const earnedCodes = new Set(base.badges.map((b) => b.code));

  return {
    configVersion: prodCfg.configVersion,
    features: {
      kpiDashboardEnabled: prodCfg.kpiDashboardEnabled,
      tierProgressEnabled: prodCfg.tierProgressEnabled,
      insightsEnabled: prodCfg.insightsEnabled,
    },
    profile: base.profile,
    kpis,
    operationalBreakdown: ops,
    tierProgress,
    badges: base.badges,
    badgeCatalog: badgeCatalog.map((b) => ({
      code: b.code,
      label: b.label,
      description: b.description,
      icon: b.icon,
      tierRequired: b.tierRequired,
      minReviews: b.minReviews,
      earned: earnedCodes.has(b.code),
    })),
    pendingReviews: base.pendingReviews,
    recentReviewsReceived: base.recentReviewsReceived,
    history: base.history.slice(0, prodCfg.historyMonths),
    insights,
    availableReviewTags: reviewTags,
  };
}

export async function dismissDriverReputationInsight(userId: string, insightCode: string) {
  if (config.useMemoryDb) {
    const list = memoryInsights.get(userId) ?? [];
    memoryInsights.set(
      userId,
      list.filter((i) => i.code !== insightCode),
    );
    const dismissed = memoryDismissedInsightCodes.get(userId) ?? new Set<string>();
    dismissed.add(insightCode);
    memoryDismissedInsightCodes.set(userId, dismissed);
    return { ok: true };
  }

  await pool.query(
    `UPDATE driver_reputation_insight_events
     SET dismissed = TRUE
     WHERE driver_user_id = $1 AND insight_code = $2`,
    [userId, insightCode],
  );
  return { ok: true };
}

export async function listDriverReputationBadges(userId: string) {
  const badges = await listUserBadges(userId);
  return badges.map(toPublicBadge);
}

export function __testResetDriverReputationProductionMemory() {
  memoryInsights.clear();
  memoryDismissedInsightCodes.clear();
  Object.assign(memoryConfig, {
    configVersion: 'camada51-memory-v1',
    kpiDashboardEnabled: true,
    tierProgressEnabled: true,
    insightsEnabled: true,
    historyMonths: 12,
  });
}

export async function __testSeedDriverReputationMemory(
  userId: string,
  patch: {
    completedRides?: number;
    acceptanceRate?: number;
    cancellationRate?: number;
    reputationScore?: number;
    insights?: DriverReputationInsight[];
  } = {},
) {
  await memoryMatchStore.setDriverOnline(userId, false);
  const driver = await memoryMatchStore.getDriver(userId);
  if (driver) {
    if (patch.completedRides != null) driver.completedRides = patch.completedRides;
    if (patch.acceptanceRate != null) driver.acceptanceRate = patch.acceptanceRate;
    if (patch.cancellationRate != null) driver.cancellationRate = patch.cancellationRate;
    if (patch.reputationScore != null) driver.reputationScore = patch.reputationScore;
    await memoryMatchStore.upsertDriver(driver);
  }
  if (patch.insights) memoryInsights.set(userId, patch.insights);
}

export function seedMemoryDriverReputationProductionConfig(
  patch: Partial<DriverReputationProductionConfig> = {},
): DriverReputationProductionConfig {
  Object.assign(memoryConfig, patch);
  return { ...memoryConfig };
}
