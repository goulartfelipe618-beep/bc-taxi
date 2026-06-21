import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';
import type { EngineQuoteResult } from '../pricing/pricingEngineService.js';
import {
  computeDriverPayoutBreakdown,
  saveDriverPayoutSettlement,
} from './driverPayoutService.js';

export interface LedgerSettlementResult {
  driverPayoutId: string;
  platformEntries: string[];
  cashSettlementId?: string;
}

const memoryDriverLedger: Array<{ id: string; driverUserId: string; rideId?: string; amountCentavos: number }> = [];
const memoryPlatformLedger: Array<{ id: string; rideId?: string; amountCentavos: number }> = [];

export async function recordPaymentSettlement(params: {
  rideId: string;
  driverUserId: string;
  paymentIntentId: string;
  paymentMethodType: string;
  quote: EngineQuoteResult;
  confirmedByUserId?: string;
  reputationTier?: string;
  passengerDiscountCentavos?: number;
}): Promise<LedgerSettlementResult> {
  const payoutBreakdown = await computeDriverPayoutBreakdown({
    quote: params.quote,
    driverUserId: params.driverUserId,
    rideId: params.rideId,
    reputationTier: params.reputationTier,
    passengerDiscountCentavos: params.passengerDiscountCentavos,
  });

  const settlement = await saveDriverPayoutSettlement({
    breakdown: payoutBreakdown,
    paymentIntentId: params.paymentIntentId,
  });

  const driverPayoutId = randomUUID();
  const platformIds: string[] = [];
  const payoutAmount = payoutBreakdown.driverGrossCentavos;

  if (config.useMemoryDb) {
    memoryDriverLedger.push({
      id: driverPayoutId,
      driverUserId: params.driverUserId,
      rideId: params.rideId,
      amountCentavos: payoutAmount,
    });
    const platformId = randomUUID();
    memoryPlatformLedger.push({
      id: platformId,
      rideId: params.rideId,
      amountCentavos: params.quote.platformFeeCentavos,
    });
    platformIds.push(platformId);

    if (params.paymentMethodType === 'cash') {
      return {
        driverPayoutId,
        platformEntries: platformIds,
        cashSettlementId: randomUUID(),
      };
    }
    return { driverPayoutId, platformEntries: platformIds };
  }

  await pool.query(
    `INSERT INTO driver_payout_ledger
      (id, driver_user_id, ride_id, payment_intent_id, entry_type, amount_centavos, description, metadata_json)
     VALUES ($1,$2,$3,$4,'ride_payout',$5,$6,$7)`,
    [
      driverPayoutId,
      params.driverUserId,
      params.rideId,
      params.paymentIntentId,
      payoutAmount,
      'Repasse corrida concluída',
      JSON.stringify({ ruleVersionId: params.quote.ruleVersionId, settlementId: settlement.id, breakdown: payoutBreakdown }),
    ],
  );

  const takeRateId = randomUUID();
  await pool.query(
    `INSERT INTO platform_fee_ledger
      (id, ride_id, payment_intent_id, entry_type, amount_centavos, description, metadata_json)
     VALUES ($1,$2,$3,'take_rate',$4,$5,$6)`,
    [
      takeRateId,
      params.rideId,
      params.paymentIntentId,
      params.quote.platformFeeCentavos - params.quote.breakdown.bookingFee - params.quote.regulatoryFeeCentavos,
      'Take rate + dynamic share',
      JSON.stringify({ breakdown: params.quote.breakdown }),
    ],
  );
  platformIds.push(takeRateId);

  if (params.quote.breakdown.bookingFee > 0) {
    const bookingId = randomUUID();
    await pool.query(
      `INSERT INTO platform_fee_ledger
        (id, ride_id, payment_intent_id, entry_type, amount_centavos, description)
       VALUES ($1,$2,$3,'booking_fee',$4,'Taxa de reserva')`,
      [bookingId, params.rideId, params.paymentIntentId, params.quote.breakdown.bookingFee],
    );
    platformIds.push(bookingId);
  }

  if (params.quote.regulatoryFeeCentavos > 0) {
    const regId = randomUUID();
    await pool.query(
      `INSERT INTO platform_fee_ledger
        (id, ride_id, payment_intent_id, entry_type, amount_centavos, description)
       VALUES ($1,$2,$3,'regulatory_fee',$4,'Taxa regulatória')`,
      [regId, params.rideId, params.paymentIntentId, params.quote.regulatoryFeeCentavos],
    );
    platformIds.push(regId);
  }

  if (params.quote.breakdown.tolls > 0) {
    const tollId = randomUUID();
    await pool.query(
      `INSERT INTO driver_payout_ledger
        (id, driver_user_id, ride_id, payment_intent_id, entry_type, amount_centavos, description, settlement_id)
       VALUES ($1,$2,$3,$4,'toll_repass',$5,'Repasse pedágio',$6)`,
      [tollId, params.driverUserId, params.rideId, params.paymentIntentId, payoutBreakdown.tollRepassCentavos, settlement.id],
    );
  }

  if (payoutBreakdown.eliteBonusCentavos > 0) {
    await pool.query(
      `INSERT INTO driver_payout_ledger
        (driver_user_id, ride_id, payment_intent_id, entry_type, amount_centavos, description, settlement_id)
       VALUES ($1,$2,$3,'incentive',$4,'Bônus Elite dinâmica',$5)`,
      [
        params.driverUserId,
        params.rideId,
        params.paymentIntentId,
        payoutBreakdown.eliteBonusCentavos,
        settlement.id,
      ],
    );
  }

  let cashSettlementId: string | undefined;
  if (params.paymentMethodType === 'cash') {
    cashSettlementId = randomUUID();
    await pool.query(
      `INSERT INTO cash_settlements
        (id, payment_intent_id, ride_id, driver_user_id, amount_centavos, confirmed_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        cashSettlementId,
        params.paymentIntentId,
        params.rideId,
        params.driverUserId,
        params.quote.passengerFareCentavos,
        params.confirmedByUserId ?? params.driverUserId,
      ],
    );
  }

  return { driverPayoutId, platformEntries: platformIds, cashSettlementId };
}

export async function getDriverLedgerSummary(driverUserId: string) {
  if (config.useMemoryDb) {
    const entries = memoryDriverLedger.filter((e) => e.driverUserId === driverUserId);
    const total = entries.reduce((s, e) => s + e.amountCentavos, 0);
    return { totalCentavos: total, entryCount: entries.length };
  }
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(amount_centavos),0)::int AS total, COUNT(*)::int AS c
     FROM driver_payout_ledger WHERE driver_user_id = $1`,
    [driverUserId],
  );
  return { totalCentavos: rows[0]?.total ?? 0, entryCount: rows[0]?.c ?? 0 };
}
