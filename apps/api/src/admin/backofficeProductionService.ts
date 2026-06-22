import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';
import { getAdminOverview } from './adminService.js';
import { logAdminAction } from './adminService.js';
import { getOpsDashboard } from '../observability/opsAlertService.js';
import { listSloSnapshots } from '../observability/observabilityProductionService.js';
import {
  acknowledgeOpsAlert,
  resolveOpsAlert,
} from '../observability/opsAlertService.js';
import {
  acknowledgeProductionAlert,
  listOpenProductionAlerts,
  resolveProductionAlert,
} from '../observability/observabilityProductionService.js';
import { listOpenOpsAlerts } from '../observability/opsMetricsService.js';
import { listPendingCorporateRideApprovals } from '../corporate/corporateProductionService.js';

export interface BackofficeProductionConfig {
  taskQueueLimit: number;
  criticalAlertAutoEscalateMinutes: number;
  configVersion: string;
}

export interface BackofficeTask {
  id: string;
  taskType: 'ops_alert' | 'fraud_case' | 'corporate_approval';
  priority: number;
  summary: string;
  severity?: string;
  targetId: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

const memoryConfig: BackofficeProductionConfig = {
  taskQueueLimit: 50,
  criticalAlertAutoEscalateMinutes: 30,
  configVersion: 'camada42-memory-v1',
};

const memoryOperatorActions: Array<{
  id: string;
  operatorLabel: string;
  actionType: string;
  targetType: string;
  targetId: string;
  resultStatus: string;
}> = [];

const memoryFraudTasks: BackofficeTask[] = [];
const memoryCorporateTasks: BackofficeTask[] = [];

export function seedMemoryBackofficeFraudTask(task: Omit<BackofficeTask, 'id' | 'taskType'> & { id?: string }) {
  memoryFraudTasks.push({
    id: task.id ?? randomUUID(),
    taskType: 'fraud_case',
    priority: task.priority,
    summary: task.summary,
    severity: task.severity,
    targetId: task.targetId,
    createdAt: task.createdAt,
    metadata: task.metadata,
  });
}

export function seedMemoryBackofficeCorporateTask(task: Omit<BackofficeTask, 'id' | 'taskType'> & { id?: string }) {
  memoryCorporateTasks.push({
    id: task.id ?? randomUUID(),
    taskType: 'corporate_approval',
    priority: task.priority,
    summary: task.summary,
    severity: task.severity,
    targetId: task.targetId,
    createdAt: task.createdAt,
    metadata: task.metadata,
  });
}

export async function getBackofficeProductionConfig(): Promise<BackofficeProductionConfig> {
  if (config.useMemoryDb) return { ...memoryConfig };

  const { rows } = await pool.query(
    `SELECT * FROM backoffice_production_config WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1`,
  );
  const r = rows[0];
  if (!r) return { ...memoryConfig, configVersion: 'camada42-v1' };

  return {
    taskQueueLimit: Number(r.task_queue_limit),
    criticalAlertAutoEscalateMinutes: Number(r.critical_alert_auto_escalate_minutes),
    configVersion: r.config_version as string,
  };
}

async function recordOperatorAction(input: {
  operatorLabel: string;
  actionType: string;
  targetType: string;
  targetId: string;
  resultStatus: 'ok' | 'failed' | 'skipped';
  metadata?: Record<string, unknown>;
}) {
  const id = randomUUID();
  if (config.useMemoryDb) {
    memoryOperatorActions.push({
      id,
      operatorLabel: input.operatorLabel,
      actionType: input.actionType,
      targetType: input.targetType,
      targetId: input.targetId,
      resultStatus: input.resultStatus,
    });
    return id;
  }

  await pool.query(
    `INSERT INTO backoffice_operator_actions
       (id, operator_label, action_type, target_type, target_id, result_status, metadata_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      id,
      input.operatorLabel,
      input.actionType,
      input.targetType,
      input.targetId,
      input.resultStatus,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  await logAdminAction(input.actionType, input.targetType, input.targetId, {
    operatorLabel: input.operatorLabel,
    resultStatus: input.resultStatus,
    ...input.metadata,
  });
  return id;
}

export async function getBackofficeConsoleDashboard() {
  const [overview, ops, sloSnapshots, cfg] = await Promise.all([
    getAdminOverview(),
    getOpsDashboard(),
    listSloSnapshots({ limit: 5 }),
    getBackofficeProductionConfig(),
  ]);

  const tasks = await listBackofficeTaskQueue();

  return {
    configVersion: cfg.configVersion,
    overview,
    platformHealth: ops.platformHealth,
    metrics: ops.metrics,
    openAlerts: ops.openAlerts,
    sloSnapshots,
    taskQueue: {
      total: tasks.length,
      critical: tasks.filter((t) => t.severity === 'critical').length,
      items: tasks.slice(0, 10),
    },
  };
}

export async function listBackofficeTaskQueue(): Promise<BackofficeTask[]> {
  const cfg = await getBackofficeProductionConfig();
  const tasks: BackofficeTask[] = [];

  const [baseAlerts, productionAlerts] = await Promise.all([
    listOpenOpsAlerts(cfg.taskQueueLimit),
    listOpenProductionAlerts(cfg.taskQueueLimit),
  ]);
  const seenAlertIds = new Set<string>();
  const alerts = [...baseAlerts, ...productionAlerts].filter((alert) => {
    if (seenAlertIds.has(alert.id)) return false;
    seenAlertIds.add(alert.id);
    return alert.status === 'open';
  });
  for (const alert of alerts) {
    tasks.push({
      id: `alert:${alert.id}`,
      taskType: 'ops_alert',
      priority: alert.severity === 'critical' ? 100 : alert.severity === 'warning' ? 60 : 30,
      summary: alert.summary,
      severity: alert.severity,
      targetId: alert.id,
      createdAt: alert.createdAt.toISOString(),
      metadata: {
        alertType: alert.alertType,
        metricValue: alert.metricValue,
        thresholdValue: alert.thresholdValue,
      },
    });
  }

  if (config.useMemoryDb) {
    tasks.push(...memoryFraudTasks);
    const pendingCorp = await listPendingCorporateRideApprovals(cfg.taskQueueLimit);
    for (const approval of pendingCorp) {
      tasks.push({
        id: `corp:${approval.id}`,
        taskType: 'corporate_approval',
        priority: 70,
        summary: `Aprovação corporativa — R$ ${(approval.quotedFareCentavos / 100).toFixed(2)}`,
        severity: 'info',
        targetId: approval.id,
        createdAt: new Date().toISOString(),
        metadata: { accountId: approval.accountId, rideId: approval.rideId },
      });
    }
    tasks.push(...memoryCorporateTasks);
  } else {
    const fraudRows = await pool.query(
      `SELECT id, user_id, risk_score, summary, priority, opened_at
       FROM fraud_cases
       WHERE status IN ('open', 'reviewing') AND review_status IN ('pending', 'human_queue')
       ORDER BY priority DESC, opened_at ASC
       LIMIT $1`,
      [cfg.taskQueueLimit],
    );
    for (const r of fraudRows.rows) {
      tasks.push({
        id: `fraud:${r.id}`,
        taskType: 'fraud_case',
        priority: Number(r.priority ?? 50),
        summary: (r.summary as string) ?? 'Caso de fraude pendente',
        severity: Number(r.risk_score) >= 0.75 ? 'critical' : 'warning',
        targetId: r.id as string,
        createdAt: new Date(r.opened_at as string).toISOString(),
        metadata: { userId: r.user_id, riskScore: Number(r.risk_score) },
      });
    }

    const corpRows = await pool.query(
      `SELECT id, account_id, ride_id, quoted_fare_centavos, created_at
       FROM corporate_ride_approvals
       WHERE status = 'pending'
       ORDER BY created_at ASC
       LIMIT $1`,
      [cfg.taskQueueLimit],
    );
    for (const r of corpRows.rows) {
      tasks.push({
        id: `corp:${r.id}`,
        taskType: 'corporate_approval',
        priority: 70,
        summary: `Aprovação corporativa — R$ ${(Number(r.quoted_fare_centavos) / 100).toFixed(2)}`,
        severity: 'info',
        targetId: r.id as string,
        createdAt: new Date(r.created_at as string).toISOString(),
        metadata: { accountId: r.account_id, rideId: r.ride_id },
      });
    }
  }

  return tasks.sort((a, b) => b.priority - a.priority).slice(0, cfg.taskQueueLimit);
}

export async function acknowledgeBackofficeAlert(input: {
  alertId: string;
  operatorLabel: string;
  operatorUserId?: string;
}) {
  let alert = await acknowledgeOpsAlert(input.alertId, input.operatorUserId ?? input.operatorLabel);
  if (!alert) {
    alert = await acknowledgeProductionAlert(input.alertId, input.operatorUserId ?? input.operatorLabel);
  }
  await recordOperatorAction({
    operatorLabel: input.operatorLabel,
    actionType: 'alert_acknowledged',
    targetType: 'ops_alert',
    targetId: input.alertId,
    resultStatus: alert ? 'ok' : 'failed',
  });
  if (!alert) throw new Error('Alerta não encontrado ou já encerrado');
  return alert;
}

export async function resolveBackofficeAlert(input: {
  alertId: string;
  operatorLabel: string;
}) {
  const resolved = await resolveOpsAlert(input.alertId);
  if (!resolved) await resolveProductionAlert(input.alertId);
  await recordOperatorAction({
    operatorLabel: input.operatorLabel,
    actionType: 'alert_resolved',
    targetType: 'ops_alert',
    targetId: input.alertId,
    resultStatus: 'ok',
  });
  return { ok: true };
}

export async function resolveBackofficeFraudCase(input: {
  caseId: string;
  operatorLabel: string;
  decision: 'cleared' | 'confirmed';
}) {
  if (config.useMemoryDb) {
    const idx = memoryFraudTasks.findIndex((t) => t.targetId === input.caseId);
    if (idx >= 0) memoryFraudTasks.splice(idx, 1);
    await recordOperatorAction({
      operatorLabel: input.operatorLabel,
      actionType: input.decision === 'cleared' ? 'fraud_case_cleared' : 'fraud_case_confirmed',
      targetType: 'fraud_case',
      targetId: input.caseId,
      resultStatus: 'ok',
      metadata: { decision: input.decision },
    });
    return { caseId: input.caseId, status: input.decision === 'cleared' ? 'cleared' : 'confirmed' };
  }

  const status = input.decision === 'cleared' ? 'cleared' : 'confirmed';
  const { rowCount } = await pool.query(
    `UPDATE fraud_cases SET status = $2, closed_at = NOW(), review_status = 'closed'
     WHERE id = $1 AND status IN ('open', 'reviewing')`,
    [input.caseId, status],
  );
  if ((rowCount ?? 0) === 0) throw new Error('Caso de fraude não encontrado');

  await recordOperatorAction({
    operatorLabel: input.operatorLabel,
    actionType: input.decision === 'cleared' ? 'fraud_case_cleared' : 'fraud_case_confirmed',
    targetType: 'fraud_case',
    targetId: input.caseId,
    resultStatus: 'ok',
    metadata: { decision: input.decision },
  });
  return { caseId: input.caseId, status };
}

export async function restrictDriverDeliveryFromBackoffice(input: {
  driverUserId: string;
  reason: string;
  operatorLabel: string;
  restrictedUntil?: string;
}) {
  const { seedMemoryDeliveryDriverRestriction } = await import('../delivery/deliveryProductionService.js');

  if (config.useMemoryDb) {
    seedMemoryDeliveryDriverRestriction(
      input.driverUserId,
      input.reason,
      input.restrictedUntil ? new Date(input.restrictedUntil) : undefined,
    );
  } else {
    await pool.query(
      `INSERT INTO delivery_driver_restrictions (driver_user_id, reason, restricted_until)
       VALUES ($1,$2,$3)
       ON CONFLICT (driver_user_id) DO UPDATE
         SET reason = EXCLUDED.reason, restricted_until = EXCLUDED.restricted_until`,
      [input.driverUserId, input.reason, input.restrictedUntil ?? null],
    );
  }

  await recordOperatorAction({
    operatorLabel: input.operatorLabel,
    actionType: 'driver_delivery_restricted',
    targetType: 'driver',
    targetId: input.driverUserId,
    resultStatus: 'ok',
    metadata: { reason: input.reason, restrictedUntil: input.restrictedUntil },
  });

  return { driverUserId: input.driverUserId, restricted: true };
}

export async function approveCorporateFromBackoffice(input: {
  approvalId: string;
  accountId: string;
  operatorLabel: string;
  operatorUserId: string;
}) {
  const { approveCorporateRide } = await import('../corporate/corporateProductionService.js');
  const approval = await approveCorporateRide({
    approvalId: input.approvalId,
    accountId: input.accountId,
    decidedByUserId: input.operatorUserId,
  });

  if (config.useMemoryDb) {
    const idx = memoryCorporateTasks.findIndex((t) => t.targetId === input.approvalId);
    if (idx >= 0) memoryCorporateTasks.splice(idx, 1);
  }

  await recordOperatorAction({
    operatorLabel: input.operatorLabel,
    actionType: 'corporate_approval_granted',
    targetType: 'corporate_ride_approval',
    targetId: input.approvalId,
    resultStatus: 'ok',
    metadata: { accountId: input.accountId, rideId: approval.rideId },
  });

  return approval;
}

export function __testResetBackofficeProductionMemory() {
  memoryFraudTasks.length = 0;
  memoryCorporateTasks.length = 0;
  memoryOperatorActions.length = 0;
  Object.assign(memoryConfig, {
    taskQueueLimit: 50,
    criticalAlertAutoEscalateMinutes: 30,
    configVersion: 'camada42-memory-v1',
  });
}

export function __testGetBackofficeOperatorActions() {
  return memoryOperatorActions;
}
