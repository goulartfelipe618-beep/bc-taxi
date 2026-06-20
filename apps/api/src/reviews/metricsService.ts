import { pool } from '../db.js';
import { useMemory } from '../stores/memoryMatchStore.js';

export interface DriverOperationalMetrics {
  operationalStability: number;
  pickupPunctuality: number;
  routeAdherence: number;
  documentQuality: number;
}

export interface PassengerOperationalMetrics {
  boardingPresence: number;
  paymentSuccess: number;
  lateCancelIndex: number;
  behaviorIndex: number;
}

const memoryDriverMetrics = new Map<string, DriverOperationalMetrics>();
const memoryPassengerMetrics = new Map<string, PassengerOperationalMetrics>();

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function scoreFromRate(rate: number) {
  return clamp01(rate) * 5;
}

export async function getDriverOperationalMetrics(userId: string): Promise<DriverOperationalMetrics> {
  if (useMemory()) {
    return (
      memoryDriverMetrics.get(userId) ?? {
        operationalStability: 4.5,
        pickupPunctuality: 4.5,
        routeAdherence: 4.5,
        documentQuality: 4.8,
      }
    );
  }

  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
       COUNT(*) FILTER (WHERE status IN ('COMPLETED','CANCELLED','IN_PROGRESS','DRIVER_ARRIVED','DRIVER_ASSIGNED'))::int AS assigned,
       COUNT(*) FILTER (WHERE status = 'COMPLETED' AND arrived_at IS NOT NULL AND started_at IS NOT NULL
         AND EXTRACT(EPOCH FROM (started_at - arrived_at)) <= 900)::int AS punctual_arrivals,
       COUNT(*) FILTER (WHERE status = 'COMPLETED' AND arrived_at IS NOT NULL)::int AS arrived_completed
     FROM rides WHERE driver_id = $1`,
    [userId],
  );

  const completed = Number(rows[0]?.completed ?? 0);
  const assigned = Math.max(1, Number(rows[0]?.assigned ?? 0));
  const punctual = Number(rows[0]?.punctual_arrivals ?? 0);
  const arrivedCompleted = Math.max(1, Number(rows[0]?.arrived_completed ?? 0));

  let documentQuality = 4.5;
  try {
    const { getDriverCompliance } = await import('../fleet/complianceService.js');
    const compliance = await getDriverCompliance(userId);
    if (compliance?.isCompliant) documentQuality = 5;
    else if (compliance) documentQuality = 3.5;
  } catch {
    documentQuality = 4.5;
  }

  return {
    operationalStability: scoreFromRate(completed / assigned),
    pickupPunctuality: scoreFromRate(punctual / arrivedCompleted),
    routeAdherence: scoreFromRate(Math.min(1, 0.85 + completed / (assigned * 2))),
    documentQuality,
  };
}

export async function getPassengerOperationalMetrics(userId: string): Promise<PassengerOperationalMetrics> {
  if (useMemory()) {
    return (
      memoryPassengerMetrics.get(userId) ?? {
        boardingPresence: 4.6,
        paymentSuccess: 4.8,
        lateCancelIndex: 4.5,
        behaviorIndex: 4.7,
      }
    );
  }

  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
       COUNT(*) FILTER (WHERE status IN ('COMPLETED','CANCELLED','DRIVER_ASSIGNED','DRIVER_ARRIVED','IN_PROGRESS'))::int AS started_flow,
       COUNT(*) FILTER (WHERE status = 'CANCELLED' AND driver_id IS NOT NULL)::int AS late_cancels
     FROM rides WHERE passenger_id = $1`,
    [userId],
  );

  const completed = Number(rows[0]?.completed ?? 0);
  const startedFlow = Math.max(1, Number(rows[0]?.started_flow ?? 0));
  const lateCancels = Number(rows[0]?.late_cancels ?? 0);

  const { rows: payRows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE pi.status IN ('authorized','captured'))::int AS ok,
       COUNT(*)::int AS total
     FROM payment_intents pi
     JOIN rides r ON r.id = pi.ride_id
     WHERE r.passenger_id = $1`,
    [userId],
  );
  const payOk = Number(payRows[0]?.ok ?? 0);
  const payTotal = Math.max(1, Number(payRows[0]?.total ?? 0));

  const { rows: fraudRows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM fraud_signals WHERE user_id = $1 AND created_at > NOW() - INTERVAL '90 days'`,
    [userId],
  );
  const fraudCount = Number(fraudRows[0]?.c ?? 0);
  const behaviorIndex = scoreFromRate(Math.max(0, 1 - fraudCount * 0.15));

  return {
    boardingPresence: scoreFromRate(completed / startedFlow),
    paymentSuccess: scoreFromRate(payOk / payTotal),
    lateCancelIndex: scoreFromRate(Math.max(0, 1 - lateCancels / startedFlow)),
    behaviorIndex,
  };
}

export function seedMemoryDriverMetrics(userId: string, metrics: DriverOperationalMetrics) {
  memoryDriverMetrics.set(userId, metrics);
}

export function seedMemoryPassengerMetrics(userId: string, metrics: PassengerOperationalMetrics) {
  memoryPassengerMetrics.set(userId, metrics);
}
