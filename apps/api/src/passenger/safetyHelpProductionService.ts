import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';

export interface SafetyHelpProductionConfig {
  configVersion: string;
  helpCenterEnabled: boolean;
  safetyToolsEnabled: boolean;
  trustedContactsMax: number;
  rideShareEnabled: boolean;
  emergencyHotline: string;
  supportPhone: string;
}

export interface HelpTopic {
  code: string;
  title: string;
  summary: string;
}

export interface TrustedContact {
  id: string;
  name: string;
  phoneMasked: string;
  relationshipLabel?: string;
  createdAt: string;
}

export interface SafetyHelpDashboard {
  config: SafetyHelpProductionConfig;
  helpTopics: HelpTopic[];
  supportChannels: Array<{ code: string; label: string; value: string }>;
  safetyTools: Array<{ code: string; label: string; description: string; enabled: boolean }>;
  trustedContacts: TrustedContact[];
  recentInquiries: number;
}

const HELP_TOPICS: HelpTopic[] = [
  { code: 'recent_trip', title: 'Problema com uma viagem recente', summary: 'Relatar conduta, rota ou cobrança incorreta.' },
  { code: 'change_destination', title: 'Alterar destino durante a corrida', summary: 'Como pedir nova parada ou destino no app.' },
  { code: 'payment_declined', title: 'Pagamento recusado', summary: 'PIX, cartão ou restrições por reputação.' },
  { code: 'lost_item', title: 'Objeto perdido no veículo', summary: 'Contactar motorista e abrir pedido de devolução.' },
  { code: 'account_data', title: 'Conta e dados pessoais', summary: 'Perfil, privacidade e exclusão de conta.' },
  { code: 'safety_emergency', title: 'Emergência ou segurança', summary: 'Partilhar viagem, contactos de confiança e SOS.' },
];

const memoryConfig: SafetyHelpProductionConfig = {
  configVersion: 'camada55-memory-v1',
  helpCenterEnabled: true,
  safetyToolsEnabled: true,
  trustedContactsMax: 5,
  rideShareEnabled: true,
  emergencyHotline: '190',
  supportPhone: '0800 000 0000',
};

const memoryContacts = new Map<string, TrustedContact[]>();
const memoryInquiries = new Map<string, number>();

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '****';
  return `•••• ${digits.slice(-4)}`;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function getSafetyHelpProductionConfig(): Promise<SafetyHelpProductionConfig> {
  if (config.useMemoryDb) return { ...memoryConfig };

  const { rows } = await pool.query(
    `SELECT * FROM safety_help_production_config WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1`,
  );
  const r = rows[0];
  if (!r) return { ...memoryConfig, configVersion: 'camada55-v1' };
  return {
    configVersion: r.config_version as string,
    helpCenterEnabled: Boolean(r.help_center_enabled),
    safetyToolsEnabled: Boolean(r.safety_tools_enabled),
    trustedContactsMax: Number(r.trusted_contacts_max),
    rideShareEnabled: Boolean(r.ride_share_enabled),
    emergencyHotline: r.emergency_hotline as string,
    supportPhone: r.support_phone as string,
  };
}

async function listTrustedContacts(userId: string): Promise<TrustedContact[]> {
  if (config.useMemoryDb) return [...(memoryContacts.get(userId) ?? [])];

  const { rows } = await pool.query(
    `SELECT id, name, phone_masked, relationship_label, created_at
     FROM user_trusted_contacts WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    phoneMasked: r.phone_masked as string,
    relationshipLabel: r.relationship_label as string | undefined,
    createdAt: (r.created_at as Date).toISOString(),
  }));
}

async function countRecentInquiries(userId: string): Promise<number> {
  if (config.useMemoryDb) return memoryInquiries.get(userId) ?? 0;

  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM help_inquiry_events
     WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days'`,
    [userId],
  );
  return Number(rows[0]?.c ?? 0);
}

export async function getSafetyHelpDashboard(userId: string): Promise<SafetyHelpDashboard> {
  const cfg = await getSafetyHelpProductionConfig();
  const trustedContacts = await listTrustedContacts(userId);
  const recentInquiries = await countRecentInquiries(userId);

  return {
    config: cfg,
    helpTopics: cfg.helpCenterEnabled ? HELP_TOPICS : [],
    supportChannels: [
      { code: 'phone', label: 'Telefone', value: cfg.supportPhone },
      { code: 'emergency', label: 'Emergência', value: cfg.emergencyHotline },
    ],
    safetyTools: [
      {
        code: 'share_ride',
        label: 'Partilhar viagem',
        description: 'Envie localização e detalhes da corrida ativa.',
        enabled: cfg.safetyToolsEnabled && cfg.rideShareEnabled,
      },
      {
        code: 'trusted_contacts',
        label: 'Contactos de confiança',
        description: 'Pessoas avisadas automaticamente em emergência.',
        enabled: cfg.safetyToolsEnabled,
      },
      {
        code: 'safety_cancel',
        label: 'Cancelar por segurança',
        description: 'Encerra a corrida sem taxa quando houver risco.',
        enabled: cfg.safetyToolsEnabled,
      },
    ],
    trustedContacts,
    recentInquiries,
  };
}

export async function recordHelpInquiry(input: {
  userId: string;
  topicCode: string;
  searchQuery?: string;
  channel?: 'in_app' | 'phone' | 'chat';
}) {
  const cfg = await getSafetyHelpProductionConfig();
  if (!cfg.helpCenterEnabled) throw new Error('Centro de ajuda indisponível');

  const topic = HELP_TOPICS.find((t) => t.code === input.topicCode);
  if (!topic && !input.searchQuery) throw new Error('Tópico inválido');

  if (config.useMemoryDb) {
    memoryInquiries.set(input.userId, (memoryInquiries.get(input.userId) ?? 0) + 1);
    return { ok: true, topic: topic?.title ?? input.searchQuery };
  }

  await pool.query(
    `INSERT INTO help_inquiry_events (user_id, topic_code, search_query, channel)
     VALUES ($1, $2, $3, $4)`,
    [input.userId, input.topicCode || 'search', input.searchQuery ?? null, input.channel ?? 'in_app'],
  );
  return { ok: true, topic: topic?.title ?? input.searchQuery };
}

export async function addTrustedContact(input: {
  userId: string;
  name: string;
  phone: string;
  relationshipLabel?: string;
}) {
  const cfg = await getSafetyHelpProductionConfig();
  if (!cfg.safetyToolsEnabled) throw new Error('Ferramentas de segurança indisponíveis');

  const contacts = await listTrustedContacts(input.userId);
  if (contacts.length >= cfg.trustedContactsMax) {
    throw new Error(`Limite de ${cfg.trustedContactsMax} contactos de confiança`);
  }

  const phoneMasked = maskPhone(input.phone);
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const contact: TrustedContact = {
    id,
    name: input.name.trim(),
    phoneMasked,
    relationshipLabel: input.relationshipLabel?.trim() || undefined,
    createdAt,
  };

  if (config.useMemoryDb) {
    const list = memoryContacts.get(input.userId) ?? [];
    list.unshift(contact);
    memoryContacts.set(input.userId, list);
    return contact;
  }

  await pool.query(
    `INSERT INTO user_trusted_contacts (id, user_id, name, phone_masked, relationship_label)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, input.userId, contact.name, phoneMasked, contact.relationshipLabel ?? null],
  );
  return contact;
}

export async function removeTrustedContact(userId: string, contactId: string) {
  if (config.useMemoryDb) {
    const list = memoryContacts.get(userId) ?? [];
    memoryContacts.set(
      userId,
      list.filter((c) => c.id !== contactId),
    );
    return { ok: true };
  }

  await pool.query(`DELETE FROM user_trusted_contacts WHERE id = $1 AND user_id = $2`, [
    contactId,
    userId,
  ]);
  return { ok: true };
}

export async function createRideShareLink(input: { userId: string; rideId?: string }) {
  const cfg = await getSafetyHelpProductionConfig();
  if (!cfg.safetyToolsEnabled || !cfg.rideShareEnabled) {
    throw new Error('Partilha de viagem indisponível');
  }

  const token = randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + 2 * 60 * 60_000);
  const shareUrl = `https://bc.taxi/share/${token}`;

  if (config.useMemoryDb) {
    return {
      shareUrl,
      expiresAt: expiresAt.toISOString(),
      rideId: input.rideId ?? null,
    };
  }

  await pool.query(
    `INSERT INTO safety_share_events (user_id, ride_id, share_token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [input.userId, input.rideId ?? null, hashToken(token), expiresAt.toISOString()],
  );

  return {
    shareUrl,
    expiresAt: expiresAt.toISOString(),
    rideId: input.rideId ?? null,
  };
}

export function __testResetSafetyHelpProductionMemory() {
  memoryContacts.clear();
  memoryInquiries.clear();
}
