import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { useMemory } from '../stores/memoryMatchStore.js';
import { getRideDecisionLogs } from './decisionLogService.js';

export type TraceComponent = 'api' | 'redis' | 'ws' | 'psp' | 'match' | 'route' | 'fraud';

export interface TraceSpan {
  id: string;
  traceId: string;
  rideId?: string;
  spanName: string;
  component: TraceComponent;
  status: 'ok' | 'error' | 'degraded';
  durationMs?: number;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const memorySpans: TraceSpan[] = [];

export function generateTraceId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 24);
}

export async function recordTraceSpan(input: {
  traceId: string;
  rideId?: string;
  spanName: string;
  component: TraceComponent;
  status?: 'ok' | 'error' | 'degraded';
  durationMs?: number;
  metadata?: Record<string, unknown>;
}) {
  const span: TraceSpan = {
    id: randomUUID(),
    traceId: input.traceId,
    rideId: input.rideId,
    spanName: input.spanName,
    component: input.component,
    status: input.status ?? 'ok',
    durationMs: input.durationMs,
    metadata: input.metadata,
    createdAt: new Date(),
  };

  if (useMemory()) {
    memorySpans.push(span);
    if (memorySpans.length > 1000) memorySpans.shift();
    return span;
  }

  await pool.query(
    `INSERT INTO ops_trace_spans
       (id, trace_id, ride_id, span_name, component, status, duration_ms, metadata_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      span.id,
      span.traceId,
      input.rideId ?? null,
      input.spanName,
      input.component,
      span.status,
      input.durationMs ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );

  return span;
}

export async function getRideTraceBundle(rideId: string) {
  const decisions = await getRideDecisionLogs(rideId);

  let spans: TraceSpan[] = [];
  let outboxEvents: Array<{ eventType: string; traceId?: string; occurredAt: string }> = [];

  if (useMemory()) {
    spans = memorySpans.filter((s) => s.rideId === rideId);
  } else {
    const { rows } = await pool.query(
      `SELECT id, trace_id, ride_id, span_name, component, status, duration_ms, metadata_json, created_at
       FROM ops_trace_spans WHERE ride_id = $1 ORDER BY created_at ASC`,
      [rideId],
    );
    spans = rows.map((r) => ({
      id: r.id as string,
      traceId: r.trace_id as string,
      rideId: r.ride_id as string | undefined,
      spanName: r.span_name as string,
      component: r.component as TraceComponent,
      status: r.status as TraceSpan['status'],
      durationMs: r.duration_ms != null ? Number(r.duration_ms) : undefined,
      metadata: r.metadata_json as Record<string, unknown>,
      createdAt: new Date(r.created_at as string),
    }));

    const outbox = await pool.query(
      `SELECT event_type, trace_id, created_at FROM event_outbox
       WHERE aggregate_id = $1 OR payload_json->>'rideId' = $1
       ORDER BY created_at ASC LIMIT 50`,
      [rideId],
    );
    outboxEvents = outbox.rows.map((r) => ({
      eventType: r.event_type as string,
      traceId: (r.trace_id as string) ?? undefined,
      occurredAt: new Date(r.created_at as string).toISOString(),
    }));
  }

  return {
    rideId,
    decisions,
    spans: spans.map((s) => ({
      traceId: s.traceId,
      spanName: s.spanName,
      component: s.component,
      status: s.status,
      durationMs: s.durationMs,
      createdAt: s.createdAt.toISOString(),
    })),
    outboxEvents,
  };
}

export function __testResetTraceMemory() {
  memorySpans.length = 0;
}
