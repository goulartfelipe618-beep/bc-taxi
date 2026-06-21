import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';

export interface RideDecisionLog {
  id: string;
  rideId: string;
  decisionType: string;
  stage?: string;
  payload: Record<string, unknown>;
  traceId?: string;
  createdAt: Date;
}

const memoryLogs: RideDecisionLog[] = [];

export async function logRideDecision(input: {
  rideId: string;
  decisionType: string;
  stage?: string;
  payload?: Record<string, unknown>;
  traceId?: string;
}) {
  const entry: RideDecisionLog = {
    id: randomUUID(),
    rideId: input.rideId,
    decisionType: input.decisionType,
    stage: input.stage,
    payload: input.payload ?? {},
    traceId: input.traceId,
    createdAt: new Date(),
  };

  if (config.useMemoryDb) {
    memoryLogs.push(entry);
    return entry;
  }

  const { rows } = await pool.query(
    `INSERT INTO ride_decision_logs (ride_id, decision_type, stage, payload_json, trace_id)
     VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at`,
    [input.rideId, input.decisionType, input.stage ?? null, JSON.stringify(entry.payload), input.traceId ?? null],
  );
  entry.id = rows[0].id as string;
  entry.createdAt = new Date(rows[0].created_at as string);
  return entry;
}

export async function getRideDecisionLogs(rideId: string): Promise<RideDecisionLog[]> {
  if (config.useMemoryDb) {
    return memoryLogs.filter((l) => l.rideId === rideId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  const { rows } = await pool.query(
    `SELECT id, ride_id, decision_type, stage, payload_json, trace_id, created_at
     FROM ride_decision_logs WHERE ride_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [rideId],
  );
  return rows.map((r) => ({
    id: r.id as string,
    rideId: r.ride_id as string,
    decisionType: r.decision_type as string,
    stage: (r.stage as string) ?? undefined,
    payload: (r.payload_json as Record<string, unknown>) ?? {},
    traceId: (r.trace_id as string) ?? undefined,
    createdAt: new Date(r.created_at as string),
  }));
}

export function toPublicDecisionLog(log: RideDecisionLog) {
  return {
    id: log.id,
    rideId: log.rideId,
    decisionType: log.decisionType,
    stage: log.stage,
    payload: log.payload,
    traceId: log.traceId,
    createdAt: log.createdAt.toISOString(),
  };
}
