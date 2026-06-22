import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';
import { createRideRequest, startMatching } from '../match/matchService.js';
import {
  createCorporateRideApproval,
  getCorporateProductionPolicy,
  requiresCorporateApproval,
  type CorporateRideApproval,
  validateCorporatePolicyProduction,
} from './corporateProductionService.js';
import { getPassengerReputation } from '../reviews/reputationService.js';
import { quoteWithDynamicPricing } from '../pricing/dynamicPricingService.js';
import type { RideCategoryCode } from '../domain/types.js';

export interface CorporateAccount {
  id: string;
  name: string;
  taxId?: string;
  billingEmail?: string;
}

export interface CorporateMember {
  id: string;
  accountId: string;
  userId: string;
  role: string;
  approvalStatus: string;
}

export interface CorporateCostCenter {
  id: string;
  accountId: string;
  code: string;
  label: string;
}

export interface CorporatePolicy {
  accountId: string;
  allowedCategoryCodes: string[];
  maxFareCentavos?: number;
  blockPublicPromos: boolean;
  weekdayStartHour: number;
  weekdayEndHour: number;
}

export const DEMO_ACCOUNT_ID = '00000000-0000-4000-8000-000000000100';

const memoryAccounts: CorporateAccount[] = [
  {
    id: DEMO_ACCOUNT_ID,
    name: 'BC Taxi Demo Corp',
    taxId: '12.345.678/0001-99',
    billingEmail: 'financeiro@bctaxi.demo',
  },
];

const memoryMembers: CorporateMember[] = [];
const memoryCostCenters: CorporateCostCenter[] = [
  { id: '00000000-0000-4000-8000-000000000101', accountId: DEMO_ACCOUNT_ID, code: 'VENDAS', label: 'Vendas' },
  { id: '00000000-0000-4000-8000-000000000102', accountId: DEMO_ACCOUNT_ID, code: 'TI', label: 'Tecnologia' },
];
const memoryPolicies: CorporatePolicy[] = [
  {
    accountId: DEMO_ACCOUNT_ID,
    allowedCategoryCodes: ['corporativo', 'comfort', 'executivo'],
    maxFareCentavos: 15000,
    blockPublicPromos: true,
    weekdayStartHour: 6,
    weekdayEndHour: 22,
  },
];
const memoryInvoiceLines: Array<{
  id: string;
  accountId: string;
  rideId: string;
  costCenterId?: string;
  passengerId: string;
  amountCentavos: number;
  capturedAmountCentavos?: number;
  status: string;
  statementId?: string;
  policyVersion?: string;
}> = [];

function mapPolicy(row: Record<string, unknown>): CorporatePolicy {
  return {
    accountId: row.account_id as string,
    allowedCategoryCodes: (row.allowed_category_codes as string[]) ?? [],
    maxFareCentavos: row.max_fare_centavos != null ? Number(row.max_fare_centavos) : undefined,
    blockPublicPromos: Boolean(row.block_public_promos),
    weekdayStartHour: Number(row.weekday_start_hour ?? 6),
    weekdayEndHour: Number(row.weekday_end_hour ?? 22),
  };
}

export async function ensureDemoCorporateMember(userId: string): Promise<CorporateMember> {
  if (config.useMemoryDb) {
    let member = memoryMembers.find((m) => m.userId === userId && m.accountId === DEMO_ACCOUNT_ID);
    if (!member) {
      member = {
        id: randomUUID(),
        accountId: DEMO_ACCOUNT_ID,
        userId,
        role: 'employee',
        approvalStatus: 'approved',
      };
      memoryMembers.push(member);
    }
    return member;
  }

  const { rows } = await pool.query(
    `INSERT INTO corporate_members (account_id, user_id, role, approval_status)
     VALUES ($1, $2, 'employee', 'approved')
     ON CONFLICT (account_id, user_id) DO UPDATE SET approval_status = 'approved'
     RETURNING id, account_id, user_id, role, approval_status`,
    [DEMO_ACCOUNT_ID, userId],
  );
  const r = rows[0];
  return {
    id: r.id as string,
    accountId: r.account_id as string,
    userId: r.user_id as string,
    role: r.role as string,
    approvalStatus: r.approval_status as string,
  };
}

export async function getCorporateMembership(userId: string): Promise<{
  account: CorporateAccount;
  member: CorporateMember;
  policy: CorporatePolicy;
  costCenters: CorporateCostCenter[];
} | null> {
  if (config.useMemoryDb) {
    const member = memoryMembers.find((m) => m.userId === userId && m.approvalStatus === 'approved');
    if (!member) return null;
    const account = memoryAccounts.find((a) => a.id === member.accountId);
    const policy = memoryPolicies.find((p) => p.accountId === member.accountId);
    if (!account || !policy) return null;
    return {
      account,
      member,
      policy,
      costCenters: memoryCostCenters.filter((c) => c.accountId === member.accountId),
    };
  }

  const { rows } = await pool.query(
    `SELECT m.id, m.account_id, m.user_id, m.role, m.approval_status,
            a.name, a.tax_id, a.billing_email
     FROM corporate_members m
     JOIN corporate_accounts a ON a.id = m.account_id
     WHERE m.user_id = $1 AND m.approval_status = 'approved' AND a.is_active = TRUE
     LIMIT 1`,
    [userId],
  );
  if (!rows[0]) return null;

  const policyRows = await pool.query(`SELECT * FROM corporate_policies WHERE account_id = $1`, [
    rows[0].account_id,
  ]);
  const ccRows = await pool.query(
    `SELECT id, account_id, code, label FROM corporate_cost_centers WHERE account_id = $1 AND is_active = TRUE`,
    [rows[0].account_id],
  );

  return {
    account: {
      id: rows[0].account_id as string,
      name: rows[0].name as string,
      taxId: (rows[0].tax_id as string) ?? undefined,
      billingEmail: (rows[0].billing_email as string) ?? undefined,
    },
    member: {
      id: rows[0].id as string,
      accountId: rows[0].account_id as string,
      userId: rows[0].user_id as string,
      role: rows[0].role as string,
      approvalStatus: rows[0].approval_status as string,
    },
    policy: mapPolicy(policyRows.rows[0] ?? {}),
    costCenters: ccRows.rows.map((r) => ({
      id: r.id as string,
      accountId: r.account_id as string,
      code: r.code as string,
      label: r.label as string,
    })),
  };
}

export function validateCorporatePolicy(
  policy: CorporatePolicy,
  input: { categoryCode: string; fareCentavos: number; at?: Date },
): { ok: boolean; reason?: string } {
  const at = input.at ?? new Date();
  const hour = at.getHours();
  if (hour < policy.weekdayStartHour || hour >= policy.weekdayEndHour) {
    return { ok: false, reason: 'Fora do horário corporativo permitido' };
  }
  if (!policy.allowedCategoryCodes.includes(input.categoryCode)) {
    return { ok: false, reason: 'Categoria não autorizada pela empresa' };
  }
  if (policy.maxFareCentavos != null && input.fareCentavos > policy.maxFareCentavos) {
    return { ok: false, reason: 'Valor acima do teto corporativo' };
  }
  return { ok: true };
}

export async function recordCorporateInvoiceLine(input: {
  accountId: string;
  rideId: string;
  costCenterId?: string;
  passengerId: string;
  amountCentavos: number;
  policyVersion?: string;
}) {
  if (config.useMemoryDb) {
    memoryInvoiceLines.push({
      id: randomUUID(),
      ...input,
      status: 'pending',
      policyVersion: input.policyVersion,
    });
    return;
  }
  await pool.query(
    `INSERT INTO corporate_invoice_lines (account_id, ride_id, cost_center_id, passenger_id, amount_centavos, policy_version)
     VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (ride_id) DO NOTHING`,
    [
      input.accountId,
      input.rideId,
      input.costCenterId ?? null,
      input.passengerId,
      input.amountCentavos,
      input.policyVersion ?? null,
    ],
  );
}

export async function captureCorporateInvoiceLine(rideId: string, capturedAmountCentavos: number) {
  if (config.useMemoryDb) {
    const line = memoryInvoiceLines.find((l) => l.rideId === rideId);
    if (!line) return false;
    line.capturedAmountCentavos = capturedAmountCentavos;
    line.amountCentavos = capturedAmountCentavos;
    return true;
  }
  const { rowCount } = await pool.query(
    `UPDATE corporate_invoice_lines
     SET captured_amount_centavos = $2, amount_centavos = $2
     WHERE ride_id = $1 AND status IN ('pending', 'invoiced')`,
    [rideId, capturedAmountCentavos],
  );
  return (rowCount ?? 0) > 0;
}

export async function bookCorporateRide(input: {
  passengerId: string;
  accountId: string;
  costCenterId: string;
  categoryCode: string;
  pickupLat: number;
  pickupLng: number;
  pickupAddress?: string;
  dropoffLat: number;
  dropoffLng: number;
  dropoffAddress?: string;
  distanceKm?: number;
  durationMin?: number;
}) {
  const membership = await getCorporateMembership(input.passengerId);
  if (!membership || membership.account.id !== input.accountId) {
    throw new Error('Usuário não vinculado à empresa');
  }
  const costCenter = membership.costCenters.find((c) => c.id === input.costCenterId);
  if (!costCenter) throw new Error('Centro de custo inválido');

  let estimatedFareCentavos = 5000;
  if (input.distanceKm && input.durationMin) {
    const quote = await quoteWithDynamicPricing(
      input.categoryCode as RideCategoryCode,
      input.distanceKm,
      input.durationMin,
      { lat: input.pickupLat, lng: input.pickupLng },
    );
    estimatedFareCentavos = quote.passengerFareCentavos;
  }

  const prodPolicy = await getCorporateProductionPolicy(input.accountId);

  const policyCheck = prodPolicy
    ? await validateCorporatePolicyProduction(prodPolicy, {
        categoryCode: input.categoryCode,
        fareCentavos: estimatedFareCentavos,
        pickupLat: input.pickupLat,
        pickupLng: input.pickupLng,
        costCenterId: input.costCenterId,
      })
    : validateCorporatePolicy(membership.policy, {
        categoryCode: input.categoryCode,
        fareCentavos: estimatedFareCentavos,
      });
  if (!policyCheck.ok) throw new Error(policyCheck.reason ?? 'Política corporativa violada');

  const needsApproval = prodPolicy
    ? requiresCorporateApproval(prodPolicy, estimatedFareCentavos)
    : false;

  const rep = await getPassengerReputation(input.passengerId);
  const ride = await createRideRequest({
    passengerId: input.passengerId,
    categoryCode: input.categoryCode,
    pickupLat: input.pickupLat,
    pickupLng: input.pickupLng,
    pickupAddress: input.pickupAddress,
    dropoffLat: input.dropoffLat,
    dropoffLng: input.dropoffLng,
    dropoffAddress: input.dropoffAddress,
    isCorporate: true,
    estimatedFareCentavos,
    passengerReputation: rep,
  });

  await recordCorporateInvoiceLine({
    accountId: input.accountId,
    rideId: ride.id,
    costCenterId: input.costCenterId,
    passengerId: input.passengerId,
    amountCentavos: estimatedFareCentavos,
    policyVersion: prodPolicy?.configVersion,
  });

  if (needsApproval && prodPolicy) {
    const approval = await createCorporateRideApproval({
      accountId: input.accountId,
      rideId: ride.id,
      requesterUserId: input.passengerId,
      costCenterId: input.costCenterId,
      quotedFareCentavos: estimatedFareCentavos,
      policyVersion: prodPolicy.configVersion,
    });
    return { ride, billingMode: 'corporate' as const, costCenter, pendingApproval: approval };
  }

  const matched = await startMatching(ride.id, rep);
  return { ride: matched ?? ride, billingMode: 'corporate' as const, costCenter };
}

export async function approveCorporateRideBooking(input: {
  approvalId: string;
  accountId: string;
  decidedByUserId: string;
}) {
  const { approveCorporateRide } = await import('./corporateProductionService.js');
  const approval = await approveCorporateRide(input);
  const rep = await getPassengerReputation(approval.requesterUserId);
  const matched = await startMatching(approval.rideId, rep);
  return { approval, ride: matched };
}

export async function getCorporateInvoiceLineByRideId(rideId: string) {
  if (config.useMemoryDb) {
    return memoryInvoiceLines.find((l) => l.rideId === rideId) ?? null;
  }
  const { rows } = await pool.query(
    `SELECT account_id, policy_version FROM corporate_invoice_lines WHERE ride_id = $1`,
    [rideId],
  );
  if (!rows[0]) return null;
  return {
    accountId: rows[0].account_id as string,
    policyVersion: (rows[0].policy_version as string) ?? undefined,
  };
}

export function __testSetCorporateMemberRole(userId: string, role: string) {
  const member = memoryMembers.find((m) => m.userId === userId);
  if (member) member.role = role;
}

export async function listCorporateInvoiceLines(accountId: string, limit = 20) {
  if (config.useMemoryDb) {
    return memoryInvoiceLines.filter((l) => l.accountId === accountId).slice(0, limit);
  }
  const { rows } = await pool.query(
    `SELECT id, ride_id, cost_center_id, passenger_id, amount_centavos, status, created_at
     FROM corporate_invoice_lines WHERE account_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [accountId, limit],
  );
  return rows.map((r) => ({
    id: r.id as string,
    rideId: r.ride_id as string,
    costCenterId: (r.cost_center_id as string) ?? undefined,
    passengerId: r.passenger_id as string,
    amountCentavos: Number(r.amount_centavos),
    status: r.status as string,
    createdAt: (r.created_at as Date).toISOString(),
  }));
}

export function publicPromosBlockedForCorporate(userId: string): Promise<boolean> {
  return getCorporateMembership(userId).then((m) => m?.policy.blockPublicPromos ?? false);
}
