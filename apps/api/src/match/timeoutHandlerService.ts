import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { useMemory } from '../stores/memoryMatchStore.js';
import { emitEvent } from '../realtime/eventBus.js';
import { logRideDecision } from '../observability/decisionLogService.js';
import { getRide, runMatchStage } from './matchService.js';
import { decideReassignAction } from './reassignPolicyService.js';
import {
  createOfferForCandidate,
  expireOffers,
  getAttemptMeta,
  incrementSequentialCursor,
  listCandidatesForAttempt,
} from './matchEngineRepository.js';
import { getOfferTimeoutSeconds } from './eligibility.js';

interface PendingSchedule {
  id: string;
  rideId: string;
  attemptId: string;
  stageIndex: number;
  strategy: 'sequential' | 'parallel';
  passengerReputation: number;
  dueAt: Date;
  processedAt?: Date;
}

const memorySchedules: PendingSchedule[] = [];
const memoryTimeoutEvents: Array<{ rideId: string; action: string }> = [];

export async function scheduleMatchTimeout(input: {
  rideId: string;
  attemptId: string;
  stageIndex: number;
  strategy: 'sequential' | 'parallel';
  passengerReputation: number;
  dueAt: Date;
}) {
  if (useMemory()) {
    memorySchedules.push({
      id: randomUUID(),
      ...input,
    });
    return;
  }
  await pool.query(
    `INSERT INTO match_pending_schedules
       (ride_id, attempt_id, stage_index, strategy, passenger_reputation, due_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      input.rideId,
      input.attemptId,
      input.stageIndex,
      input.strategy,
      input.passengerReputation,
      input.dueAt,
    ],
  );
}

async function recordTimeoutEvent(input: {
  rideId: string;
  attemptId?: string;
  offerId?: string;
  stageNumber: number;
  actionTaken: string;
  metadata?: Record<string, unknown>;
}) {
  if (useMemory()) {
    memoryTimeoutEvents.push({ rideId: input.rideId, action: input.actionTaken });
    return;
  }
  await pool.query(
    `INSERT INTO match_offer_timeout_events
       (ride_id, attempt_id, offer_id, stage_number, action_taken, metadata_json)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      input.rideId,
      input.attemptId ?? null,
      input.offerId ?? null,
      input.stageNumber,
      input.actionTaken,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}

export async function processDueMatchTimeouts(maxStages = 6): Promise<number> {
  const now = Date.now();
  let processed = 0;

  const due = useMemory()
    ? memorySchedules.filter((s) => !s.processedAt && s.dueAt.getTime() <= now)
    : (
        await pool.query(
          `SELECT id, ride_id, attempt_id, stage_index, strategy, passenger_reputation, due_at
           FROM match_pending_schedules
           WHERE processed_at IS NULL AND due_at <= NOW()
           ORDER BY due_at ASC
           LIMIT 50`,
        )
      ).rows.map((row) => ({
        id: row.id as string,
        rideId: row.ride_id as string,
        attemptId: row.attempt_id as string,
        stageIndex: Number(row.stage_index),
        strategy: row.strategy as 'sequential' | 'parallel',
        passengerReputation: Number(row.passenger_reputation),
        dueAt: new Date(row.due_at as string),
      }));

  for (const schedule of due) {
    const ride = await getRide(schedule.rideId);
    if (!ride || ride.status === 'DRIVER_ASSIGNED') {
      await markScheduleProcessed(schedule.id);
      continue;
    }

    await expireOffers(schedule.rideId);
    await recordTimeoutEvent({
      rideId: schedule.rideId,
      attemptId: schedule.attemptId,
      stageNumber: schedule.stageIndex + 1,
      actionTaken: 'expire_offers',
    });

    void emitEvent('RIDE_MATCH_TIMEOUT', 'ride', schedule.rideId, {
      attemptId: schedule.attemptId,
      stageIndex: schedule.stageIndex,
    }, { rideId: schedule.rideId, userIds: [ride.passengerId] });

    const meta = await getAttemptMeta(schedule.attemptId);
    const candidates = await listCandidatesForAttempt(schedule.attemptId);
    const action = decideReassignAction({
      strategy: schedule.strategy,
      sequentialCursor: meta?.sequentialCursor ?? 0,
      candidateCount: candidates.length,
      stageIndex: schedule.stageIndex,
      maxStages,
    });

    if (action === 'rotate_sequential') {
      const nextRank = (meta?.sequentialCursor ?? 0) + 1;
      const next = candidates.find((c) => c.rankPosition === nextRank + 1) ?? candidates[nextRank];
      if (next) {
        await incrementSequentialCursor(schedule.attemptId, nextRank);
        await createOfferForCandidate({
          ride,
          attemptId: schedule.attemptId,
          driverId: next.driverId,
          offerType: 'sequential',
        });
        const timeoutMs = (await getOfferTimeoutSeconds(ride.categoryCode)) * 1000;
        await scheduleMatchTimeout({
          rideId: schedule.rideId,
          attemptId: schedule.attemptId,
          stageIndex: schedule.stageIndex,
          strategy: 'sequential',
          passengerReputation: schedule.passengerReputation,
          dueAt: new Date(Date.now() + timeoutMs),
        });
        await recordTimeoutEvent({
          rideId: schedule.rideId,
          attemptId: schedule.attemptId,
          stageNumber: schedule.stageIndex + 1,
          actionTaken: 'rotate_sequential',
          metadata: { nextRank, driverId: next.driverId },
        });
        void logRideDecision({
          rideId: schedule.rideId,
          decisionType: 'MATCH_SEQUENTIAL_ROTATE',
          stage: `stage_${schedule.stageIndex + 1}`,
          payload: { driverId: next.driverId, rank: nextRank + 1 },
        });
      }
    } else if (action === 'expand_stage') {
      await recordTimeoutEvent({
        rideId: schedule.rideId,
        attemptId: schedule.attemptId,
        stageNumber: schedule.stageIndex + 1,
        actionTaken: 'expand_stage',
      });
      await runMatchStage(schedule.rideId, schedule.stageIndex + 1, schedule.passengerReputation);
    } else {
      await recordTimeoutEvent({
        rideId: schedule.rideId,
        attemptId: schedule.attemptId,
        stageNumber: schedule.stageIndex + 1,
        actionTaken: 'no_drivers',
      });
      if (useMemory()) {
        const { memoryMatchStore } = await import('../stores/memoryMatchStore.js');
        await memoryMatchStore.updateRideStatus(schedule.rideId, 'NO_DRIVERS');
      } else {
        await pool.query(`UPDATE rides SET status = 'NO_DRIVERS', updated_at = NOW() WHERE id = $1`, [
          schedule.rideId,
        ]);
      }
    }

    await markScheduleProcessed(schedule.id);
    processed++;
  }

  return processed;
}

async function markScheduleProcessed(scheduleId: string) {
  if (useMemory()) {
    const item = memorySchedules.find((s) => s.id === scheduleId);
    if (item) item.processedAt = new Date();
    return;
  }
  await pool.query(`UPDATE match_pending_schedules SET processed_at = NOW() WHERE id = $1`, [scheduleId]);
}

export function startMatchTimeoutJanitor(intervalMs = 2000) {
  const timer = setInterval(() => {
    void processDueMatchTimeouts();
  }, intervalMs);
  return () => clearInterval(timer);
}

export function __testResetTimeoutMemory() {
  memorySchedules.length = 0;
  memoryTimeoutEvents.length = 0;
}

export function __testGetTimeoutEvents() {
  return memoryTimeoutEvents;
}
