import { getTier, type ReputationTier } from '../domain/reputation.js';
import { useMemory } from '../stores/memoryMatchStore.js';
import { listReviewsForUser } from './reviewStore.js';

export interface ReputationBadgeRecord {
  code: string;
  label: string;
  description: string;
  appliesTo: 'driver' | 'passenger' | 'both';
  tierRequired?: ReputationTier;
  minReviews?: number;
  icon?: string;
}

export interface UserBadgeRecord {
  code: string;
  label: string;
  description: string;
  icon?: string;
  awardedAt: Date;
}

const badgeCatalog: ReputationBadgeRecord[] = [
  {
    code: 'elite_passenger',
    label: 'Passageiro Elite',
    description: 'Reputação Elite na plataforma',
    appliesTo: 'passenger',
    tierRequired: 'elite',
    icon: 'star',
  },
  {
    code: 'premium_passenger',
    label: 'Passageiro Premium',
    description: 'Reputação Premium na plataforma',
    appliesTo: 'passenger',
    tierRequired: 'premium',
    icon: 'star_half',
  },
  {
    code: 'elite_driver',
    label: 'Motorista Elite',
    description: 'Reputação Elite com excelência operacional',
    appliesTo: 'driver',
    tierRequired: 'elite',
    minReviews: 50,
    icon: 'verified',
  },
  {
    code: 'premium_driver',
    label: 'Motorista Premium',
    description: 'Reputação Premium com histórico sólido',
    appliesTo: 'driver',
    tierRequired: 'premium',
    minReviews: 20,
    icon: 'shield',
  },
  {
    code: 'five_star_streak',
    label: 'Sequência 5 estrelas',
    description: '10 avaliações consecutivas com 5 estrelas',
    appliesTo: 'both',
    minReviews: 10,
    icon: 'local_fire_department',
  },
  {
    code: 'trusted_payer',
    label: 'Pagador confiável',
    description: 'Histórico consistente de pagamentos bem-sucedidos',
    appliesTo: 'passenger',
    tierRequired: 'confiavel',
    icon: 'payments',
  },
];

const memoryUserBadges = new Map<string, UserBadgeRecord[]>();

export async function listBadgeCatalog(role?: 'passenger' | 'driver'): Promise<ReputationBadgeRecord[]> {
  if (useMemory()) {
    return badgeCatalog.filter((b) => !role || b.appliesTo === 'both' || b.appliesTo === role);
  }

  const { rows } = await pool.query(`SELECT * FROM reputation_badges ORDER BY label`);
  if (rows.length === 0) {
    return badgeCatalog.filter((b) => !role || b.appliesTo === 'both' || b.appliesTo === role);
  }

  return rows
    .map((row) => ({
      code: row.code as string,
      label: row.label as string,
      description: row.description as string,
      appliesTo: row.applies_to as ReputationBadgeRecord['appliesTo'],
      tierRequired: (row.tier_required as ReputationTier) ?? undefined,
      minReviews: row.min_reviews != null ? Number(row.min_reviews) : undefined,
      icon: (row.icon as string) ?? undefined,
    }))
    .filter((b) => !role || b.appliesTo === 'both' || b.appliesTo === role);
}

async function awardBadge(userId: string, badge: ReputationBadgeRecord): Promise<void> {
  const awardedAt = new Date();
  const userBadge: UserBadgeRecord = {
    code: badge.code,
    label: badge.label,
    description: badge.description,
    icon: badge.icon,
    awardedAt,
  };

  if (useMemory()) {
    const list = memoryUserBadges.get(userId) ?? [];
    if (list.some((b) => b.code === badge.code)) return;
    list.push(userBadge);
    memoryUserBadges.set(userId, list);
    return;
  }

  await pool.query(
    `INSERT INTO user_reputation_badges (user_id, badge_code)
     VALUES ($1, $2) ON CONFLICT (user_id, badge_code) DO NOTHING`,
    [userId, badge.code],
  );
}

function hasFiveStarStreak(reviews: { stars: number }[]): boolean {
  if (reviews.length < 10) return false;
  return reviews.slice(0, 10).every((r) => r.stars === 5);
}

const TIER_RANK: Record<string, number> = {
  restrito: 0,
  observacao: 1,
  confiavel: 2,
  premium: 3,
  elite: 4,
};

function tierMeetsRequirement(current: string, required: string): boolean {
  return (TIER_RANK[current] ?? 0) >= (TIER_RANK[required] ?? 0);
}

export async function syncUserBadges(
  userId: string,
  role: 'passenger' | 'driver',
  compositeScore: number,
): Promise<UserBadgeRecord[]> {
  const tier = getTier(compositeScore);
  const reviews = await listReviewsForUser(userId);
  const catalog = await listBadgeCatalog(role);

  for (const badge of catalog) {
    if (badge.appliesTo !== 'both' && badge.appliesTo !== role) continue;
    if (badge.tierRequired && !tierMeetsRequirement(tier, badge.tierRequired)) continue;
    if (badge.minReviews != null && reviews.length < badge.minReviews) continue;
    if (badge.code === 'five_star_streak' && !hasFiveStarStreak(reviews)) continue;
    if (badge.code === 'trusted_payer' && compositeScore < 4.6) continue;

    await awardBadge(userId, badge);
  }

  return listUserBadges(userId);
}

export async function listUserBadges(userId: string): Promise<UserBadgeRecord[]> {
  if (useMemory()) return memoryUserBadges.get(userId) ?? [];

  const { rows } = await pool.query(
    `SELECT b.code, b.label, b.description, b.icon, ub.awarded_at
     FROM user_reputation_badges ub
     JOIN reputation_badges b ON b.code = ub.badge_code
     WHERE ub.user_id = $1
     ORDER BY ub.awarded_at DESC`,
    [userId],
  );

  return rows.map((row) => ({
    code: row.code as string,
    label: row.label as string,
    description: row.description as string,
    icon: (row.icon as string) ?? undefined,
    awardedAt: new Date(row.awarded_at as string),
  }));
}

export function toPublicBadge(b: UserBadgeRecord) {
  return {
    code: b.code,
    label: b.label,
    description: b.description,
    icon: b.icon,
    awardedAt: b.awardedAt.toISOString(),
  };
}
