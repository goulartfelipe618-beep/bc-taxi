import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';
import { resolveServiceRegionIdAtPoint } from '../region/serviceRegionGeoService.js';
import type { CorporatePolicy } from './corporateService.js';

export interface CorporateProductionPolicy extends CorporatePolicy {
  approvalThresholdCentavos?: number;
  allowedRegionIds?: string[];
  requireCostCenter: boolean;
  configVersion: string;
}

export interface CorporateBillingStatement {
  id: string;
  accountId: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  totalCentavos: number;
  lineCount: number;
  configVersion: string;
}

export interface CorporateRideApproval {
  id: string;
  accountId: string;
  rideId: string;
  requesterUserId: string;
  quotedFareCentavos: number;
  status: string;
}

const memoryStatements: CorporateBillingStatement[] = [];
const memoryApprovals: CorporateRideApproval[] = [];
const memoryEvents: Array<{ accountId: string; eventType: string }> = [];
const memoryProductionPolicies = new Map<string, CorporateProductionPolicy>();

export function seedMemoryCorporateProductionPolicy(accountId: string, policy: CorporateProductionPolicy) {
  memoryProductionPolicies.set(accountId, policy);
}

export async function getCorporateProductionPolicy(accountId: string): Promise<CorporateProductionPolicy | null> {
  if (config.useMemoryDb) {
    return memoryProductionPolicies.get(accountId) ?? null;
  }
  const { rows } = await pool.query(`SELECT * FROM corporate_policies WHERE account_id = $1`, [accountId]);
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    accountId,
    allowedCategoryCodes: (r.allowed_category_codes as string[]) ?? [],
    maxFareCentavos: r.max_fare_centavos != null ? Number(r.max_fare_centavos) : undefined,
    blockPublicPromos: Boolean(r.block_public_promos),
    weekdayStartHour: Number(r.weekday_start_hour ?? 6),
    weekdayEndHour: Number(r.weekday_end_hour ?? 22),
    approvalThresholdCentavos:
      r.approval_threshold_centavos != null ? Number(r.approval_threshold_centavos) : undefined,
    allowedRegionIds: (r.allowed_region_ids as string[] | null) ?? undefined,
    requireCostCenter: Boolean(r.require_cost_center ?? true),
    configVersion: (r.config_version as string) ?? 'camada38-v1',
  };
}

export async function validateCorporatePolicyProduction(
  policy: CorporateProductionPolicy,
  input: {
    categoryCode: string;
    fareCentavos: number;
    at?: Date;
    pickupLat?: number;
    pickupLng?: number;
    costCenterId?: string;
  },
): Promise<{ ok: boolean; reason?: string }> {
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
  if (policy.requireCostCenter && !input.costCenterId) {
    return { ok: false, reason: 'Centro de custo obrigatório' };
  }
  if (
    policy.allowedRegionIds &&
    policy.allowedRegionIds.length > 0 &&
    input.pickupLat != null &&
    input.pickupLng != null
  ) {
    const regionId = await resolveServiceRegionIdAtPoint(input.pickupLat, input.pickupLng);
    if (!regionId || !policy.allowedRegionIds.includes(regionId)) {
      return { ok: false, reason: 'Região de embarque não autorizada pela empresa' };
    }
  }
  return { ok: true };
}

export function requiresCorporateApproval(policy: CorporateProductionPolicy, fareCentavos: number): boolean {
  return policy.approvalThresholdCentavos != null && fareCentavos > policy.approvalThresholdCentavos;
}

export async function createCorporateRideApproval(input: {
  accountId: string;
  rideId: string;
  requesterUserId: string;
  costCenterId?: string;
  quotedFareCentavos: number;
  policyVersion: string;
}): Promise<CorporateRideApproval> {
  const approval: CorporateRideApproval = {
    id: randomUUID(),
    accountId: input.accountId,
    rideId: input.rideId,
    requesterUserId: input.requesterUserId,
    quotedFareCentavos: input.quotedFareCentavos,
    status: 'pending',
  };

  if (config.useMemoryDb) {
    memoryApprovals.push(approval);
    memoryEvents.push({ accountId: input.accountId, eventType: 'approval_requested' });
    return approval;
  }

  const { rows } = await pool.query(
    `INSERT INTO corporate_ride_approvals
       (id, account_id, ride_id, requester_user_id, cost_center_id, quoted_fare_centavos, policy_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [
      approval.id,
      input.accountId,
      input.rideId,
      input.requesterUserId,
      input.costCenterId ?? null,
      input.quotedFareCentavos,
      input.policyVersion,
    ],
  );
  approval.id = rows[0].id as string;
  await recordCorporatePolicyEvent(input.accountId, 'approval_requested', input.policyVersion, {
    rideId: input.rideId,
    quotedFareCentavos: input.quotedFareCentavos,
  });
  return approval;
}

export async function approveCorporateRide(input: {
  approvalId: string;
  decidedByUserId: string;
  accountId: string;
}): Promise<CorporateRideApproval> {
  if (config.useMemoryDb) {
    const approval = memoryApprovals.find((a) => a.id === input.approvalId && a.accountId === input.accountId);
    if (!approval || approval.status !== 'pending') throw new Error('Aprovação não encontrada');
    approval.status = 'approved';
    memoryEvents.push({ accountId: input.accountId, eventType: 'approval_granted' });
    return approval;
  }

  const { rows } = await pool.query(
    `UPDATE corporate_ride_approvals
     SET status = 'approved', decided_by_user_id = $2, decided_at = NOW()
     WHERE id = $1 AND account_id = $3 AND status = 'pending'
     RETURNING *`,
    [input.approvalId, input.decidedByUserId, input.accountId],
  );
  if (!rows[0]) throw new Error('Aprovação não encontrada');
  await recordCorporatePolicyEvent(input.accountId, 'approval_granted', rows[0].policy_version as string, {
    rideId: rows[0].ride_id,
  });
  return {
    id: rows[0].id as string,
    accountId: rows[0].account_id as string,
    rideId: rows[0].ride_id as string,
    requesterUserId: rows[0].requester_user_id as string,
    quotedFareCentavos: Number(rows[0].quoted_fare_centavos),
    status: 'approved',
  };
}

export async function captureCorporateInvoiceOnRideComplete(rideId: string, capturedAmountCentavos: number) {
  const { captureCorporateInvoiceLine, getCorporateInvoiceLineByRideId } = await import(
    './corporateService.js'
  );
  const ok = await captureCorporateInvoiceLine(rideId, capturedAmountCentavos);
  if (!ok) return false;

  const line = await getCorporateInvoiceLineByRideId(rideId);
  if (line) {
    await recordCorporatePolicyEvent(line.accountId, 'invoice_captured', line.policyVersion ?? 'camada38', {
      rideId,
      capturedAmountCentavos,
    });
  }
  return true;
}

export async function closeCorporateBillingPeriod(input: {
  accountId: string;
  periodStart: string;
  periodEnd: string;
  configVersion: string;
}): Promise<CorporateBillingStatement> {
  if (config.useMemoryDb) {
    const { listCorporateInvoiceLines } = await import('./corporateService.js');
    const lines = await listCorporateInvoiceLines(input.accountId, 500);
    const pending = lines.filter((l) => l.status === 'pending');
    const total = pending.reduce((s, l) => s + l.amountCentavos, 0);
    const statement: CorporateBillingStatement = {
      id: randomUUID(),
      accountId: input.accountId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      status: 'closed',
      totalCentavos: total,
      lineCount: pending.length,
      configVersion: input.configVersion,
    };
    memoryStatements.push(statement);
    for (const line of pending) {
      (line as { status: string; statementId?: string }).status = 'invoiced';
      (line as { statementId?: string }).statementId = statement.id;
    }
    memoryEvents.push({ accountId: input.accountId, eventType: 'statement_closed' });
    return statement;
  }

  const statementId = randomUUID();
  const { rows: agg } = await pool.query(
    `SELECT COALESCE(SUM(amount_centavos), 0)::bigint AS total, COUNT(*)::int AS cnt
     FROM corporate_invoice_lines
     WHERE account_id = $1 AND status = 'pending'
       AND created_at::date >= $2::date AND created_at::date <= $3::date`,
    [input.accountId, input.periodStart, input.periodEnd],
  );
  const total = Number(agg[0]?.total ?? 0);
  const lineCount = Number(agg[0]?.cnt ?? 0);

  await pool.query(
    `INSERT INTO corporate_billing_statements
       (id, account_id, period_start, period_end, status, total_centavos, line_count, config_version, closed_at)
     VALUES ($1,$2,$3,$4,'closed',$5,$6,$7,NOW())`,
    [statementId, input.accountId, input.periodStart, input.periodEnd, total, lineCount, input.configVersion],
  );

  await pool.query(
    `UPDATE corporate_invoice_lines
     SET status = 'invoiced', statement_id = $4
     WHERE account_id = $1 AND status = 'pending'
       AND created_at::date >= $2::date AND created_at::date <= $3::date`,
    [input.accountId, input.periodStart, input.periodEnd, statementId],
  );

  await recordCorporatePolicyEvent(input.accountId, 'statement_closed', input.configVersion, {
    statementId,
    totalCentavos: total,
    lineCount,
  });

  return {
    id: statementId,
    accountId: input.accountId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    status: 'closed',
    totalCentavos: total,
    lineCount,
    configVersion: input.configVersion,
  };
}

export async function listCorporateBillingStatements(accountId: string, limit = 10) {
  if (config.useMemoryDb) {
    return memoryStatements.filter((s) => s.accountId === accountId).slice(0, limit);
  }
  const { rows } = await pool.query(
    `SELECT * FROM corporate_billing_statements
     WHERE account_id = $1 ORDER BY period_end DESC LIMIT $2`,
    [accountId, limit],
  );
  return rows.map((r) => ({
    id: r.id as string,
    accountId: r.account_id as string,
    periodStart: (r.period_start as Date).toISOString().slice(0, 10),
    periodEnd: (r.period_end as Date).toISOString().slice(0, 10),
    status: r.status as string,
    totalCentavos: Number(r.total_centavos),
    lineCount: Number(r.line_count),
    configVersion: r.config_version as string,
  }));
}

async function recordCorporatePolicyEvent(
  accountId: string,
  eventType: string,
  policyVersion: string,
  metadata: Record<string, unknown> = {},
) {
  if (config.useMemoryDb) {
    memoryEvents.push({ accountId, eventType });
    return;
  }
  await pool.query(
    `INSERT INTO corporate_policy_events (account_id, ride_id, event_type, policy_version, metadata_json)
     VALUES ($1,$2,$3,$4,$5)`,
    [accountId, (metadata.rideId as string) ?? null, eventType, policyVersion, JSON.stringify(metadata)],
  );
}

export function __testResetCorporateProductionMemory() {
  memoryStatements.length = 0;
  memoryApprovals.length = 0;
  memoryEvents.length = 0;
  memoryProductionPolicies.clear();
}

export function __testGetCorporateProductionEvents() {
  return memoryEvents;
}

export function __testGetCorporateApprovals() {
  return memoryApprovals;
}
