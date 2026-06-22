import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { pool, toPublicUser, type DbUser } from '../db.js';
import { getDriverCompliance, toPublicCompliance } from '../fleet/complianceService.js';
import { getDriverPayoutSummary } from '../payments/driverPayoutService.js';
import { getUserReputationProfile } from '../reviews/reputationService.js';

export interface DriverAccountProductionConfig {
  configVersion: string;
  earningsEnabled: boolean;
  inboxEnabled: boolean;
  profileEditEnabled: boolean;
}

export interface DriverProfileRecord {
  userId: string;
  emergencyContact?: string;
  pixKeyMasked?: string;
  preferredPayoutMethod: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  identityStatus: string;
  twoFactorEnabled: boolean;
  passwordChangedAt?: string;
  preferredLanguage: string;
  configVersion: string;
}

export interface DriverEarningsTransaction {
  id: string;
  transactionType: string;
  title: string;
  amountCentavos: number;
  balanceAfterCentavos?: number;
  createdAt: string;
}

export interface DriverInboxMessage {
  id: string;
  category: string;
  title: string;
  preview: string;
  body: string;
  iconType: string;
  isRead: boolean;
  createdAt: string;
}

const memoryConfig: DriverAccountProductionConfig = {
  configVersion: 'camada49-memory-v1',
  earningsEnabled: true,
  inboxEnabled: true,
  profileEditEnabled: true,
};

const memoryProfiles = new Map<string, DriverProfileRecord>();
const memoryEarnings = new Map<string, { availableCentavos: number; pendingCentavos: number }>();
const memoryTransactions = new Map<string, DriverEarningsTransaction[]>();
const memoryInbox = new Map<string, DriverInboxMessage[]>();
const memoryUsers = new Map<string, DbUser>();

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatMoney(centavos: number): string {
  return `R$ ${(centavos / 100).toFixed(2).replace('.', ',')}`;
}

export async function getDriverAccountProductionConfig(): Promise<DriverAccountProductionConfig> {
  if (config.useMemoryDb) return { ...memoryConfig };

  const { rows } = await pool.query(
    `SELECT * FROM driver_account_production_config WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1`,
  );
  const r = rows[0];
  if (!r) return { ...memoryConfig, configVersion: 'camada49-v1' };
  return {
    configVersion: r.config_version as string,
    earningsEnabled: Boolean(r.earnings_enabled),
    inboxEnabled: Boolean(r.inbox_enabled),
    profileEditEnabled: Boolean(r.profile_edit_enabled),
  };
}

async function ensureMemoryUser(user: DbUser) {
  memoryUsers.set(user.id, user);
  if (!memoryProfiles.has(user.id)) {
    memoryProfiles.set(user.id, {
      userId: user.id,
      emergencyContact: user.phone ?? undefined,
      pixKeyMasked: '***.***.***-**',
      preferredPayoutMethod: 'pix',
      emailVerified: false,
      phoneVerified: Boolean(user.phone),
      identityStatus: 'pending',
      twoFactorEnabled: false,
      passwordChangedAt: new Date().toISOString(),
      preferredLanguage: 'pt-BR',
      configVersion: 'camada49-memory-v1',
    });
  }
  if (!memoryEarnings.has(user.id)) {
    memoryEarnings.set(user.id, { availableCentavos: 18_450, pendingCentavos: 3200 });
    memoryTransactions.set(user.id, [
      {
        id: randomUUID(),
        transactionType: 'ride_payout',
        title: 'Corrida Econômico — Centro',
        amountCentavos: 2850,
        balanceAfterCentavos: 18_450,
        createdAt: new Date(Date.now() - 86_400_000).toISOString(),
      },
      {
        id: randomUUID(),
        transactionType: 'incentive',
        title: 'Bônus horário de pico',
        amountCentavos: 1200,
        balanceAfterCentavos: 15_600,
        createdAt: new Date(Date.now() - 172_800_000).toISOString(),
      },
    ]);
  }
  if (!memoryInbox.has(user.id)) {
    memoryInbox.set(user.id, [
      {
        id: randomUUID(),
        category: 'compliance',
        title: 'Documentos em análise',
        preview: 'CNH verificada com sucesso',
        body: 'Sua CNH foi aprovada. Mantenha o CRLV do veículo atualizado para continuar operando.',
        iconType: 'document',
        isRead: false,
        createdAt: new Date(Date.now() - 3600_000).toISOString(),
      },
      {
        id: randomUUID(),
        category: 'payout',
        title: 'Repasse disponível',
        preview: 'R$ 184,50 disponíveis para saque',
        body: 'Seu saldo de ganhos está disponível. Configure sua chave PIX no perfil para receber.',
        iconType: 'payout',
        isRead: true,
        createdAt: new Date(Date.now() - 86_400_000).toISOString(),
      },
    ]);
  }
}

async function getOrCreateProfile(userId: string): Promise<DriverProfileRecord> {
  if (config.useMemoryDb) {
    const existing = memoryProfiles.get(userId);
    if (existing) return existing;
    return {
      userId,
      preferredPayoutMethod: 'pix',
      emailVerified: false,
      phoneVerified: false,
      identityStatus: 'pending',
      twoFactorEnabled: false,
      preferredLanguage: 'pt-BR',
      configVersion: 'camada49-memory-v1',
    };
  }

  const { rows } = await pool.query(`SELECT * FROM driver_profiles WHERE user_id = $1`, [userId]);
  if (rows[0]) return mapProfileRow(rows[0]);

  const { rows: inserted } = await pool.query(
    `INSERT INTO driver_profiles (user_id) VALUES ($1) RETURNING *`,
    [userId],
  );
  return mapProfileRow(inserted[0]);
}

export async function getDriverAccountDashboard(user: DbUser) {
  if (config.useMemoryDb) await ensureMemoryUser(user);

  const [accountCfg, profile, reputation, payoutSummary, compliance] = await Promise.all([
    getDriverAccountProductionConfig(),
    getOrCreateProfile(user.id),
    getUserReputationProfile(user.id, 'driver'),
    getDriverPayoutSummary(user.id),
    getDriverCompliance(user.id).catch(() => null),
  ]);

  const earnings = accountCfg.earningsEnabled ? await getDriverEarnings(user.id, payoutSummary) : null;
  const messages = accountCfg.inboxEnabled ? await listDriverInboxMessages(user.id, 5) : [];

  return {
    configVersion: accountCfg.configVersion,
    features: {
      earningsEnabled: accountCfg.earningsEnabled,
      inboxEnabled: accountCfg.inboxEnabled,
      profileEditEnabled: accountCfg.profileEditEnabled,
    },
    user: toPublicUser(user),
    profile: {
      ...profile,
      fullName: user.full_name,
      email: user.email,
      phone: user.phone,
      rating: reputation.score,
      tier: reputation.tier,
      passwordChangedLabel: profile.passwordChangedAt
        ? formatDateLabel(new Date(profile.passwordChangedAt))
        : undefined,
    },
    earnings,
    payoutSummary: {
      totalGrossCentavos: payoutSummary.totalGrossCentavos,
      totalGrossLabel: formatMoney(payoutSummary.totalGrossCentavos),
      rideCount: payoutSummary.rideCount,
      pendingIncentiveCentavos: payoutSummary.pendingIncentiveCentavos,
    },
    compliance: compliance ? toPublicCompliance(compliance) : null,
    recentMessages: messages,
    unreadMessageCount: messages.filter((m) => !m.isRead).length,
  };
}

export async function getDriverEarnings(
  userId: string,
  payoutSummary?: Awaited<ReturnType<typeof getDriverPayoutSummary>>,
) {
  const summary = payoutSummary ?? (await getDriverPayoutSummary(userId));

  if (config.useMemoryDb) {
    const account = memoryEarnings.get(userId) ?? { availableCentavos: 0, pendingCentavos: 0 };
    const transactions = memoryTransactions.get(userId) ?? [];
    return {
      availableCentavos: account.availableCentavos,
      availableLabel: formatMoney(account.availableCentavos),
      pendingCentavos: account.pendingCentavos + summary.pendingIncentiveCentavos,
      pendingLabel: formatMoney(account.pendingCentavos + summary.pendingIncentiveCentavos),
      totalGrossCentavos: summary.totalGrossCentavos,
      currency: 'BRL',
      transactions,
    };
  }

  const { rows: walletRows } = await pool.query(
    `INSERT INTO driver_earnings_accounts (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
     RETURNING *`,
    [userId],
  );
  const availableCentavos = Number(walletRows[0].available_centavos);
  const pendingCentavos =
    Number(walletRows[0].pending_centavos) + summary.pendingIncentiveCentavos;
  const transactions = await listDriverEarningsTransactions(userId);
  return {
    availableCentavos,
    availableLabel: formatMoney(availableCentavos),
    pendingCentavos,
    pendingLabel: formatMoney(pendingCentavos),
    totalGrossCentavos: summary.totalGrossCentavos,
    currency: walletRows[0].currency as string,
    transactions,
  };
}

export async function listDriverEarningsTransactions(
  userId: string,
  limit = 30,
): Promise<DriverEarningsTransaction[]> {
  if (config.useMemoryDb) {
    return (memoryTransactions.get(userId) ?? []).slice(0, limit);
  }

  const { rows } = await pool.query(
    `SELECT id, transaction_type, title, amount_centavos, balance_after_centavos, created_at
     FROM driver_earnings_transactions
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit],
  );
  return rows.map((r) => ({
    id: r.id as string,
    transactionType: r.transaction_type as string,
    title: r.title as string,
    amountCentavos: Number(r.amount_centavos),
    balanceAfterCentavos:
      r.balance_after_centavos != null ? Number(r.balance_after_centavos) : undefined,
    createdAt: new Date(r.created_at as string).toISOString(),
  }));
}

export async function listDriverInboxMessages(userId: string, limit = 30): Promise<DriverInboxMessage[]> {
  if (config.useMemoryDb) {
    return (memoryInbox.get(userId) ?? []).slice(0, limit);
  }

  const { rows } = await pool.query(
    `SELECT id, category, title, preview, body, icon_type, is_read, created_at
     FROM driver_inbox_messages
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit],
  );
  return rows.map((r) => ({
    id: r.id as string,
    category: r.category as string,
    title: r.title as string,
    preview: r.preview as string,
    body: r.body as string,
    iconType: r.icon_type as string,
    isRead: Boolean(r.is_read),
    createdAt: new Date(r.created_at as string).toISOString(),
  }));
}

export async function markDriverInboxMessageRead(userId: string, messageId: string) {
  if (config.useMemoryDb) {
    const messages = memoryInbox.get(userId) ?? [];
    const msg = messages.find((m) => m.id === messageId);
    if (msg) msg.isRead = true;
    return msg ?? null;
  }

  const { rows } = await pool.query(
    `UPDATE driver_inbox_messages SET is_read = TRUE
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [messageId, userId],
  );
  return rows[0] ? { id: rows[0].id as string } : null;
}

export async function updateDriverProfile(
  user: DbUser,
  input: {
    fullName?: string;
    phone?: string;
    emergencyContact?: string;
    preferredPayoutMethod?: string;
    preferredLanguage?: string;
  },
) {
  const accountCfg = await getDriverAccountProductionConfig();
  if (!accountCfg.profileEditEnabled) throw new Error('Edição de perfil desabilitada');

  if (config.useMemoryDb) {
    await ensureMemoryUser(user);
    if (input.fullName) user.full_name = input.fullName.trim();
    if (input.phone !== undefined) user.phone = input.phone;
    memoryUsers.set(user.id, user);
    const profile = memoryProfiles.get(user.id)!;
    if (input.emergencyContact !== undefined) profile.emergencyContact = input.emergencyContact;
    if (input.preferredPayoutMethod) profile.preferredPayoutMethod = input.preferredPayoutMethod;
    if (input.preferredLanguage) profile.preferredLanguage = input.preferredLanguage;
    return getDriverAccountDashboard(user);
  }

  if (input.fullName || input.phone !== undefined) {
    await pool.query(
      `UPDATE users SET
         full_name = COALESCE($2, full_name),
         phone = COALESCE($3, phone)
       WHERE id = $1`,
      [user.id, input.fullName?.trim() ?? null, input.phone ?? null],
    );
    if (input.fullName) user.full_name = input.fullName.trim();
    if (input.phone !== undefined) user.phone = input.phone;
  }

  await pool.query(
    `INSERT INTO driver_profiles (
      user_id, emergency_contact, preferred_payout_method, preferred_language, updated_at
    ) VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      emergency_contact = COALESCE(EXCLUDED.emergency_contact, driver_profiles.emergency_contact),
      preferred_payout_method = COALESCE(EXCLUDED.preferred_payout_method, driver_profiles.preferred_payout_method),
      preferred_language = COALESCE(EXCLUDED.preferred_language, driver_profiles.preferred_language),
      updated_at = NOW()`,
    [
      user.id,
      input.emergencyContact ?? null,
      input.preferredPayoutMethod ?? null,
      input.preferredLanguage ?? null,
    ],
  );

  await pool.query(
    `INSERT INTO driver_profile_events (user_id, event_type, metadata_json)
     VALUES ($1, 'profile_updated', $2)`,
    [user.id, JSON.stringify(input)],
  );

  return getDriverAccountDashboard(user);
}

export async function getDriverSecuritySummary(user: DbUser) {
  if (config.useMemoryDb) await ensureMemoryUser(user);
  const profile = await getOrCreateProfile(user.id);
  return {
    passwordChangedLabel: profile.passwordChangedAt
      ? formatDateLabel(new Date(profile.passwordChangedAt))
      : 'Nunca alterada',
    twoFactorEnabled: profile.twoFactorEnabled,
    emergencyContact: profile.emergencyContact ?? user.phone,
    emailVerified: profile.emailVerified,
    phoneVerified: profile.phoneVerified,
    identityStatus: profile.identityStatus,
    pixKeyMasked: profile.pixKeyMasked,
    preferredPayoutMethod: profile.preferredPayoutMethod,
  };
}

export async function updateDriverPassword(user: DbUser, currentPassword: string, newPassword: string) {
  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) throw new Error('Palavra-passe atual incorreta');

  const passwordHash = await bcrypt.hash(newPassword, 12);
  const changedAt = new Date();

  if (config.useMemoryDb) {
    user.password_hash = passwordHash;
    memoryUsers.set(user.id, user);
    const profile = await getOrCreateProfile(user.id);
    profile.passwordChangedAt = changedAt.toISOString();
    memoryProfiles.set(user.id, profile);
    return { ok: true, passwordChangedAt: changedAt.toISOString() };
  }

  await pool.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [user.id, passwordHash]);
  await pool.query(
    `INSERT INTO driver_profiles (user_id, password_changed_at, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE SET password_changed_at = $2, updated_at = NOW()`,
    [user.id, changedAt],
  );
  await pool.query(
    `INSERT INTO driver_profile_events (user_id, event_type) VALUES ($1, 'password_changed')`,
    [user.id],
  );
  user.password_hash = passwordHash;
  return { ok: true, passwordChangedAt: changedAt.toISOString() };
}

export async function setDriverTwoFactor(user: DbUser, enabled: boolean) {
  if (config.useMemoryDb) {
    const profile = await getOrCreateProfile(user.id);
    profile.twoFactorEnabled = enabled;
    memoryProfiles.set(user.id, profile);
    return profile;
  }

  const { rows } = await pool.query(
    `INSERT INTO driver_profiles (user_id, two_factor_enabled, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE SET two_factor_enabled = $2, updated_at = NOW()
     RETURNING *`,
    [user.id, enabled],
  );
  return mapProfileRow(rows[0]);
}

function mapProfileRow(r: Record<string, unknown>): DriverProfileRecord {
  return {
    userId: r.user_id as string,
    emergencyContact: (r.emergency_contact as string) ?? undefined,
    pixKeyMasked: (r.pix_key_masked as string) ?? undefined,
    preferredPayoutMethod: (r.preferred_payout_method as string) ?? 'pix',
    emailVerified: Boolean(r.email_verified),
    phoneVerified: Boolean(r.phone_verified),
    identityStatus: r.identity_status as string,
    twoFactorEnabled: Boolean(r.two_factor_enabled),
    passwordChangedAt: r.password_changed_at
      ? new Date(r.password_changed_at as string).toISOString()
      : undefined,
    preferredLanguage: (r.preferred_language as string) ?? 'pt-BR',
    configVersion: (r.config_version as string) ?? 'camada49-v1',
  };
}

export function __testResetDriverAccountProductionMemory() {
  memoryProfiles.clear();
  memoryEarnings.clear();
  memoryTransactions.clear();
  memoryInbox.clear();
  memoryUsers.clear();
  Object.assign(memoryConfig, {
    configVersion: 'camada49-memory-v1',
    earningsEnabled: true,
    inboxEnabled: true,
    profileEditEnabled: true,
  });
}

export function __testSeedDriverInboxMessage(
  userId: string,
  message: Omit<DriverInboxMessage, 'id' | 'createdAt'> & { id?: string },
) {
  const list = memoryInbox.get(userId) ?? [];
  list.unshift({
    id: message.id ?? randomUUID(),
    createdAt: new Date().toISOString(),
    ...message,
  });
  memoryInbox.set(userId, list);
}

export function seedMemoryDriverAccountProductionConfig(
  patch: Partial<DriverAccountProductionConfig> = {},
): DriverAccountProductionConfig {
  Object.assign(memoryConfig, patch);
  return { ...memoryConfig };
}
