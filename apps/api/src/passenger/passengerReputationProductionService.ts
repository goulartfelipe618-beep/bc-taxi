import { config } from '../config.js';
import {
  REPUTATION_CONFIG,
  getTier,
  type ReputationTier,
} from '../domain/reputation.js';
import { pool } from '../db.js';
import { listBadgeCatalog, listUserBadges, toPublicBadge } from '../reviews/badgeService.js';
import { getPassengerOperationalMetrics } from '../reviews/metricsService.js';
import { getPendingReviewsForUser } from '../reviews/pendingReviewService.js';
import {
  getFullReputationDashboard,
  getUserReputationProfile,
  listAvailableReviewTags,
} from '../reviews/reputationService.js';
import { listReviewsForUser } from '../reviews/reviewStore.js';
import { memoryMatchStore, useMemory } from '../stores/memoryMatchStore.js';

export interface PassengerReputationProductionConfig {
  configVersion: string;
  kpiDashboardEnabled: boolean;
  tierProgressEnabled: boolean;
  insightsEnabled: boolean;
  benefitsPanelEnabled: boolean;
  historyMonths: number;
}

export interface PassengerReputationKpis {
  completedRides: number;
  paymentSuccessRate: number;
  paymentSuccessLabel: string;
  lateCancelRate: number;
  lateCancelLabel: string;
  reviewCount: number;
}

export interface PassengerOperationalBreakdown {
  boardingPresence: number;
  paymentSuccess: number;
  lateCancelIndex: number;
  behaviorIndex: number;
}

export interface PassengerTierProgress {
  currentTier: string;
  nextTier?: string;
  nextTierMinScore?: number;
  pointsToNext?: number;
  progressPct: number;
}

export interface PassengerReputationInsight {
  code: string;
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'success';
}

const memoryConfig: PassengerReputationProductionConfig = {
  configVersion: 'camada54-memory-v1',
  kpiDashboardEnabled: true,
  tierProgressEnabled: true,
  insightsEnabled: true,
  benefitsPanelEnabled: true,
  historyMonths: 12,
};

const memoryInsights = new Map<string, PassengerReputationInsight[]>();
const memoryDismissedInsightCodes = new Map<string, Set<string>>();
const TIER_ORDER: ReputationTier[] = ['restrito', 'observacao', 'confiavel', 'premium', 'elite'];

function formatPct(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`;
}

export async function getPassengerReputationProductionConfig(): Promise<PassengerReputationProductionConfig> {
  if (config.useMemoryDb) return { ...memoryConfig };

  const { rows } = await pool.query(
    `SELECT * FROM passenger_reputation_production_config WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1`,
  );
  const r = rows[0];
  if (!r) return { ...memoryConfig, configVersion: 'camada54-v1' };
  return {
    configVersion: r.config_version as string,
    kpiDashboardEnabled: Boolean(r.kpi_dashboard_enabled),
    tierProgressEnabled: Boolean(r.tier_progress_enabled),
    insightsEnabled: Boolean(r.insights_enabled),
    benefitsPanelEnabled: Boolean(r.benefits_panel_enabled),
    historyMonths: Number(r.history_months),
  };
}

async function getPassengerKpis(userId: string): Promise<PassengerReputationKpis> {
  const reviews = await listReviewsForUser(userId);
  let completedRides = 0;
  let paymentSuccessRate = 0.96;
  let lateCancelRate = 0.04;

  if (useMemory()) {
    const rides = await memoryMatchStore.listRidesForUser(userId, 'passenger');
    completedRides = rides.filter((r) => r.status === 'COMPLETED').length;
    if (completedRides === 0) completedRides = 48;
    paymentSuccessRate = 0.97;
    lateCancelRate = 0.03;
  } else {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
         COUNT(*) FILTER (WHERE status = 'CANCELLED' AND driver_id IS NOT NULL)::int AS late_cancels,
         COUNT(*) FILTER (WHERE status IN ('COMPLETED','CANCELLED','DRIVER_ASSIGNED','DRIVER_ARRIVED','IN_PROGRESS'))::int AS started_flow
       FROM rides WHERE passenger_id = $1`,
      [userId],
    );
    completedRides = Number(rows[0]?.completed ?? 0);
    const startedFlow = Math.max(1, Number(rows[0]?.started_flow ?? 0));
    lateCancelRate = Number(rows[0]?.late_cancels ?? 0) / startedFlow;

    const { rows: payRows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE pi.status IN ('authorized','captured'))::int AS ok,
         COUNT(*)::int AS total
       FROM payment_intents pi
       JOIN rides r ON r.id = pi.ride_id
       WHERE r.passenger_id = $1`,
      [userId],
    );
    const payOk = Number(payRows[0]?.ok ?? 0);
    const payTotal = Math.max(1, Number(payRows[0]?.total ?? 0));
    paymentSuccessRate = payOk / payTotal;
  }

  return {
    completedRides,
    paymentSuccessRate,
    paymentSuccessLabel: formatPct(paymentSuccessRate),
    lateCancelRate,
    lateCancelLabel: formatPct(lateCancelRate),
    reviewCount: reviews.length,
  };
}

function buildTierProgress(score: number): PassengerTierProgress {
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
  kpis: PassengerReputationKpis,
  profile: Awaited<ReturnType<typeof getUserReputationProfile>>,
): PassengerReputationInsight[] {
  const insights: PassengerReputationInsight[] = [];

  if (profile.prepayRequired) {
    insights.push({
      code: 'prepay_required',
      title: 'Pré-pagamento obrigatório',
      body: 'Sua reputação exige confirmação de pagamento antes da corrida em algumas categorias.',
      severity: 'warning',
    });
  }

  if (!profile.cashAllowed) {
    insights.push({
      code: 'cash_restricted',
      title: 'Dinheiro indisponível',
      body: 'Pagamento em dinheiro está bloqueado para seu perfil. Use cartão ou PIX.',
      severity: 'info',
    });
  }

  if (profile.blockedCategories.length > 0 && !profile.blockedCategories.includes('*')) {
    insights.push({
      code: 'category_restrictions',
      title: 'Categorias restritas',
      body: `Algumas categorias estão bloqueadas: ${profile.blockedCategories.slice(0, 3).join(', ')}.`,
      severity: 'warning',
    });
  }

  if (kpis.lateCancelRate > 0.1) {
    insights.push({
      code: 'high_late_cancel',
      title: 'Cancelamentos tardios frequentes',
      body: 'Evite cancelar após o motorista ser atribuído para não perder benefícios.',
      severity: 'warning',
    });
  } else if (kpis.paymentSuccessRate >= 0.95) {
    insights.push({
      code: 'trusted_payer',
      title: 'Pagador confiável',
      body: 'Seu histórico de pagamentos é consistente na plataforma.',
      severity: 'success',
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
      body: 'Boa reputação desbloqueia prioridade no despacho e descontos na carteira.',
      severity: 'info',
    });
  }

  return insights;
}

export async function getPassengerReputationProductionDashboard(userId: string) {
  const prodCfg = await getPassengerReputationProductionConfig();
  const [base, kpis, opsMetrics, reviewTags] = await Promise.all([
    getFullReputationDashboard(userId, 'passenger'),
    prodCfg.kpiDashboardEnabled ? getPassengerKpis(userId) : Promise.resolve(null),
    getPassengerOperationalMetrics(userId),
    listAvailableReviewTags('passenger'),
  ]);

  const ops: PassengerOperationalBreakdown = {
    boardingPresence: opsMetrics.boardingPresence,
    paymentSuccess: opsMetrics.paymentSuccess,
    lateCancelIndex: opsMetrics.lateCancelIndex,
    behaviorIndex: opsMetrics.behaviorIndex,
  };

  const tierProgress = prodCfg.tierProgressEnabled
    ? buildTierProgress(base.profile.score)
    : null;

  let insights: PassengerReputationInsight[] = [];
  if (prodCfg.insightsEnabled) {
    if (config.useMemoryDb && memoryInsights.has(userId)) {
      insights = memoryInsights.get(userId)!;
    } else if (!config.useMemoryDb) {
      const { rows } = await pool.query(
        `SELECT insight_code, title, body, severity
         FROM passenger_reputation_insight_events
         WHERE passenger_user_id = $1 AND dismissed = FALSE
         ORDER BY created_at DESC LIMIT 5`,
        [userId],
      );
      insights = rows.map((r) => ({
        code: r.insight_code as string,
        title: r.title as string,
        body: r.body as string,
        severity: r.severity as PassengerReputationInsight['severity'],
      }));
    }
    if (insights.length === 0 && kpis) {
      insights = buildInsights(kpis, base.profile);
    }
    if (config.useMemoryDb) {
      const dismissed = memoryDismissedInsightCodes.get(userId) ?? new Set();
      insights = insights.filter((i) => !dismissed.has(i.code));
    }
  }

  const badgeCatalog = await listBadgeCatalog('passenger');
  const earnedCodes = new Set(base.badges.map((b) => b.code));

  return {
    configVersion: prodCfg.configVersion,
    features: {
      kpiDashboardEnabled: prodCfg.kpiDashboardEnabled,
      tierProgressEnabled: prodCfg.tierProgressEnabled,
      insightsEnabled: prodCfg.insightsEnabled,
      benefitsPanelEnabled: prodCfg.benefitsPanelEnabled,
    },
    profile: base.profile,
    benefits: prodCfg.benefitsPanelEnabled ? base.profile.benefits : null,
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

export async function dismissPassengerReputationInsight(userId: string, insightCode: string) {
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
    `UPDATE passenger_reputation_insight_events
     SET dismissed = TRUE
     WHERE passenger_user_id = $1 AND insight_code = $2`,
    [userId, insightCode],
  );
  return { ok: true };
}

export async function listPassengerReputationBadges(userId: string) {
  const badges = await listUserBadges(userId);
  return badges.map(toPublicBadge);
}

export function __testResetPassengerReputationProductionMemory() {
  memoryInsights.clear();
  memoryDismissedInsightCodes.clear();
  Object.assign(memoryConfig, {
    configVersion: 'camada54-memory-v1',
    kpiDashboardEnabled: true,
    tierProgressEnabled: true,
    insightsEnabled: true,
    benefitsPanelEnabled: true,
    historyMonths: 12,
  });
}

export function seedMemoryPassengerReputationProductionConfig(
  patch: Partial<PassengerReputationProductionConfig> = {},
): PassengerReputationProductionConfig {
  Object.assign(memoryConfig, patch);
  return { ...memoryConfig };
}
