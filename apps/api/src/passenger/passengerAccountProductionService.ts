import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { pool, toPublicUser, type DbUser } from '../db.js';
import { listPaymentMethods } from '../payments/paymentStore.js';
import { getPassengerReputation } from '../reviews/reputationService.js';
import { getTier } from '../domain/reputation.js';

export interface PassengerAccountProductionConfig {
  configVersion: string;
  walletEnabled: boolean;
  inboxEnabled: boolean;
  profileEditEnabled: boolean;
}

export interface PassengerProfileRecord {
  userId: string;
  gender?: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  identityStatus: string;
  twoFactorEnabled: boolean;
  recoveryPhone?: string;
  passwordChangedAt?: string;
  preferredLanguage: string;
  configVersion: string;
}

export interface PassengerWalletTransaction {
  id: string;
  transactionType: string;
  title: string;
  amountCentavos: number;
  balanceAfterCentavos?: number;
  createdAt: string;
}

export interface PassengerInboxMessage {
  id: string;
  category: string;
  title: string;
  preview: string;
  body: string;
  iconType: string;
  isRead: boolean;
  createdAt: string;
}

const memoryConfig: PassengerAccountProductionConfig = {
  configVersion: 'camada44-memory-v1',
  walletEnabled: true,
  inboxEnabled: true,
  profileEditEnabled: true,
};

const memoryProfiles = new Map<string, PassengerProfileRecord>();
const memoryWallets = new Map<string, { balanceCentavos: number }>();
const memoryTransactions = new Map<string, PassengerWalletTransaction[]>();
const memoryInbox = new Map<string, PassengerInboxMessage[]>();
const memoryUsers = new Map<string, DbUser>();

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export async function getPassengerAccountProductionConfig(): Promise<PassengerAccountProductionConfig> {
  if (config.useMemoryDb) return { ...memoryConfig };

  const { rows } = await pool.query(
    `SELECT * FROM passenger_account_production_config WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1`,
  );
  const r = rows[0];
  if (!r) return { ...memoryConfig, configVersion: 'camada44-v1' };
  return {
    configVersion: r.config_version as string,
    walletEnabled: Boolean(r.wallet_enabled),
    inboxEnabled: Boolean(r.inbox_enabled),
    profileEditEnabled: Boolean(r.profile_edit_enabled),
  };
}

async function ensureMemoryUser(user: DbUser) {
  memoryUsers.set(user.id, user);
  if (!memoryProfiles.has(user.id)) {
    memoryProfiles.set(user.id, {
      userId: user.id,
      gender: 'Prefiro não dizer',
      emailVerified: false,
      phoneVerified: Boolean(user.phone),
      identityStatus: 'pending',
      twoFactorEnabled: false,
      recoveryPhone: user.phone ?? undefined,
      passwordChangedAt: new Date().toISOString(),
      preferredLanguage: 'pt-BR',
      configVersion: 'camada44-memory-v1',
    });
  }
  if (!memoryWallets.has(user.id)) {
    memoryWallets.set(user.id, { balanceCentavos: 4250 });
    memoryTransactions.set(user.id, [
      {
        id: randomUUID(),
        transactionType: 'topup',
        title: 'Recarga PIX',
        amountCentavos: 5000,
        balanceAfterCentavos: 4250,
        createdAt: new Date(Date.now() - 86_400_000).toISOString(),
      },
      {
        id: randomUUID(),
        transactionType: 'ride_payment',
        title: 'Corrida Comfort — Centro',
        amountCentavos: -2850,
        balanceAfterCentavos: 4250,
        createdAt: new Date(Date.now() - 172_800_000).toISOString(),
      },
    ]);
  }
  if (!memoryInbox.has(user.id)) {
    memoryInbox.set(user.id, [
      {
        id: randomUUID(),
        category: 'promo',
        title: 'Cupom de boas-vindas',
        preview: 'Use WELCOME10 na próxima corrida',
        body: 'Você ganhou 10% de desconto na próxima viagem em categorias Econômico e Comfort.',
        iconType: 'promo',
        isRead: false,
        createdAt: new Date(Date.now() - 3600_000).toISOString(),
      },
      {
        id: randomUUID(),
        category: 'ride',
        title: 'Corrida concluída',
        preview: 'Avalie sua última viagem',
        body: 'Sua corrida para o Shopping Atlântico foi finalizada. Conte como foi a experiência.',
        iconType: 'ride',
        isRead: true,
        createdAt: new Date(Date.now() - 86_400_000).toISOString(),
      },
    ]);
  }
}

async function getOrCreateProfile(userId: string): Promise<PassengerProfileRecord> {
  if (config.useMemoryDb) {
    const existing = memoryProfiles.get(userId);
    if (existing) return existing;
    return {
      userId,
      emailVerified: false,
      phoneVerified: false,
      identityStatus: 'pending',
      twoFactorEnabled: false,
      preferredLanguage: 'pt-BR',
      configVersion: 'camada44-memory-v1',
    };
  }

  const { rows } = await pool.query(`SELECT * FROM passenger_profiles WHERE user_id = $1`, [userId]);
  if (rows[0]) return mapProfileRow(rows[0]);

  const { rows: inserted } = await pool.query(
    `INSERT INTO passenger_profiles (user_id) VALUES ($1) RETURNING *`,
    [userId],
  );
  return mapProfileRow(inserted[0]);
}

export async function getPassengerAccountDashboard(user: DbUser) {
  if (config.useMemoryDb) await ensureMemoryUser(user);

  const [accountCfg, profile, reputationScore, paymentMethods] = await Promise.all([
    getPassengerAccountProductionConfig(),
    getOrCreateProfile(user.id),
    getPassengerReputation(user.id),
    listPaymentMethods(user.id),
  ]);

  const wallet = accountCfg.walletEnabled ? await getPassengerWallet(user.id) : null;
  const messages = accountCfg.inboxEnabled ? await listPassengerInboxMessages(user.id, 5) : [];

  return {
    configVersion: accountCfg.configVersion,
    features: {
      walletEnabled: accountCfg.walletEnabled,
      inboxEnabled: accountCfg.inboxEnabled,
      profileEditEnabled: accountCfg.profileEditEnabled,
    },
    user: toPublicUser(user),
    profile: {
      ...profile,
      fullName: user.full_name,
      email: user.email,
      phone: user.phone,
      rating: reputationScore,
      tier: getTier(reputationScore),
      passwordChangedLabel: profile.passwordChangedAt
        ? formatDateLabel(new Date(profile.passwordChangedAt))
        : undefined,
    },
    wallet,
    paymentMethods: paymentMethods.map((m) => ({
      id: m.id,
      methodType: m.methodType,
      label: m.label,
      isDefault: m.isDefault,
      lastFour: m.lastFour,
      brand: m.brand,
    })),
    recentMessages: messages,
    unreadMessageCount: messages.filter((m) => !m.isRead).length,
  };
}

export async function getPassengerWallet(userId: string) {
  if (config.useMemoryDb) {
    const wallet = memoryWallets.get(userId) ?? { balanceCentavos: 0 };
    const transactions = memoryTransactions.get(userId) ?? [];
    return {
      balanceCentavos: wallet.balanceCentavos,
      balanceLabel: `R$ ${(wallet.balanceCentavos / 100).toFixed(2)}`,
      currency: 'BRL',
      transactions,
    };
  }

  const { rows: walletRows } = await pool.query(
    `INSERT INTO passenger_wallet_accounts (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
     RETURNING *`,
    [userId],
  );
  const balanceCentavos = Number(walletRows[0].balance_centavos);
  const transactions = await listPassengerWalletTransactions(userId);
  return {
    balanceCentavos,
    balanceLabel: `R$ ${(balanceCentavos / 100).toFixed(2)}`,
    currency: walletRows[0].currency as string,
    transactions,
  };
}

export async function listPassengerWalletTransactions(userId: string, limit = 30): Promise<PassengerWalletTransaction[]> {
  if (config.useMemoryDb) {
    return (memoryTransactions.get(userId) ?? []).slice(0, limit);
  }

  const { rows } = await pool.query(
    `SELECT id, transaction_type, title, amount_centavos, balance_after_centavos, created_at
     FROM passenger_wallet_transactions
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
    balanceAfterCentavos: r.balance_after_centavos != null ? Number(r.balance_after_centavos) : undefined,
    createdAt: new Date(r.created_at as string).toISOString(),
  }));
}

export async function listPassengerInboxMessages(userId: string, limit = 30): Promise<PassengerInboxMessage[]> {
  if (config.useMemoryDb) {
    return (memoryInbox.get(userId) ?? []).slice(0, limit);
  }

  const { rows } = await pool.query(
    `SELECT id, category, title, preview, body, icon_type, is_read, created_at
     FROM passenger_inbox_messages
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

export async function markPassengerInboxMessageRead(userId: string, messageId: string) {
  if (config.useMemoryDb) {
    const messages = memoryInbox.get(userId) ?? [];
    const msg = messages.find((m) => m.id === messageId);
    if (msg) msg.isRead = true;
    return msg ?? null;
  }

  const { rows } = await pool.query(
    `UPDATE passenger_inbox_messages SET is_read = TRUE
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [messageId, userId],
  );
  return rows[0] ? { id: rows[0].id as string } : null;
}

export async function updatePassengerProfile(
  user: DbUser,
  input: {
    fullName?: string;
    phone?: string;
    gender?: string;
    recoveryPhone?: string;
    preferredLanguage?: string;
  },
) {
  const accountCfg = await getPassengerAccountProductionConfig();
  if (!accountCfg.profileEditEnabled) throw new Error('Edição de perfil desabilitada');

  if (config.useMemoryDb) {
    await ensureMemoryUser(user);
    if (input.fullName) user.full_name = input.fullName.trim();
    if (input.phone !== undefined) user.phone = input.phone;
    memoryUsers.set(user.id, user);
    const profile = memoryProfiles.get(user.id)!;
    if (input.gender) profile.gender = input.gender;
    if (input.recoveryPhone !== undefined) profile.recoveryPhone = input.recoveryPhone;
    if (input.preferredLanguage) profile.preferredLanguage = input.preferredLanguage;
    return getPassengerAccountDashboard(user);
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
    `INSERT INTO passenger_profiles (user_id, gender, recovery_phone, preferred_language, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       gender = COALESCE(EXCLUDED.gender, passenger_profiles.gender),
       recovery_phone = COALESCE(EXCLUDED.recovery_phone, passenger_profiles.recovery_phone),
       preferred_language = COALESCE(EXCLUDED.preferred_language, passenger_profiles.preferred_language),
       updated_at = NOW()`,
    [
      user.id,
      input.gender ?? null,
      input.recoveryPhone ?? null,
      input.preferredLanguage ?? null,
    ],
  );

  await pool.query(
    `INSERT INTO passenger_profile_events (user_id, event_type, metadata_json)
     VALUES ($1, 'profile_updated', $2)`,
    [user.id, JSON.stringify(input)],
  );

  return getPassengerAccountDashboard(user);
}

export async function getPassengerSecuritySummary(user: DbUser) {
  if (config.useMemoryDb) await ensureMemoryUser(user);
  const profile = await getOrCreateProfile(user.id);
  return {
    passwordChangedLabel: profile.passwordChangedAt
      ? formatDateLabel(new Date(profile.passwordChangedAt))
      : 'Nunca alterada',
    twoFactorEnabled: profile.twoFactorEnabled,
    recoveryPhone: profile.recoveryPhone ?? user.phone,
    emailVerified: profile.emailVerified,
    phoneVerified: profile.phoneVerified,
    identityStatus: profile.identityStatus,
    socialProviders: [] as string[],
  };
}

export async function updatePassengerPassword(user: DbUser, currentPassword: string, newPassword: string) {
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
    `INSERT INTO passenger_profiles (user_id, password_changed_at, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE SET password_changed_at = $2, updated_at = NOW()`,
    [user.id, changedAt],
  );
  await pool.query(
    `INSERT INTO passenger_profile_events (user_id, event_type) VALUES ($1, 'password_changed')`,
    [user.id],
  );
  user.password_hash = passwordHash;
  return { ok: true, passwordChangedAt: changedAt.toISOString() };
}

export async function setPassengerTwoFactor(user: DbUser, enabled: boolean) {
  if (config.useMemoryDb) {
    const profile = await getOrCreateProfile(user.id);
    profile.twoFactorEnabled = enabled;
    memoryProfiles.set(user.id, profile);
    return profile;
  }

  const { rows } = await pool.query(
    `INSERT INTO passenger_profiles (user_id, two_factor_enabled, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE SET two_factor_enabled = $2, updated_at = NOW()
     RETURNING *`,
    [user.id, enabled],
  );
  return mapProfileRow(rows[0]);
}

function mapProfileRow(r: Record<string, unknown>): PassengerProfileRecord {
  return {
    userId: r.user_id as string,
    gender: (r.gender as string) ?? undefined,
    emailVerified: Boolean(r.email_verified),
    phoneVerified: Boolean(r.phone_verified),
    identityStatus: r.identity_status as string,
    twoFactorEnabled: Boolean(r.two_factor_enabled),
    recoveryPhone: (r.recovery_phone as string) ?? undefined,
    passwordChangedAt: r.password_changed_at
      ? new Date(r.password_changed_at as string).toISOString()
      : undefined,
    preferredLanguage: (r.preferred_language as string) ?? 'pt-BR',
    configVersion: (r.config_version as string) ?? 'camada44-v1',
  };
}

export function __testResetPassengerAccountProductionMemory() {
  memoryProfiles.clear();
  memoryWallets.clear();
  memoryTransactions.clear();
  memoryInbox.clear();
  memoryUsers.clear();
  Object.assign(memoryConfig, {
    configVersion: 'camada44-memory-v1',
    walletEnabled: true,
    inboxEnabled: true,
    profileEditEnabled: true,
  });
}

export function __testSeedPassengerInboxMessage(userId: string, message: Omit<PassengerInboxMessage, 'id' | 'createdAt'> & { id?: string }) {
  const list = memoryInbox.get(userId) ?? [];
  list.unshift({
    id: message.id ?? randomUUID(),
    createdAt: new Date().toISOString(),
    ...message,
  });
  memoryInbox.set(userId, list);
}
