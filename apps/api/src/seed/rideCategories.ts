import type pg from 'pg';
import type { RideCategoryDefinition } from '../domain/types.js';
import { RIDE_CATEGORIES } from '../domain/rideCategories.js';

export async function seedRideCategories(pool: pg.Pool) {
  for (const c of RIDE_CATEGORIES) {
    await pool.query(
      `INSERT INTO ride_categories (
        code, name, description,
        passenger_limit_min, passenger_limit_max,
        bag_policy_json, is_shared, is_premium, is_passenger_ride,
        requires_scheduling, inherits_base_category, config_json
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        passenger_limit_min = EXCLUDED.passenger_limit_min,
        passenger_limit_max = EXCLUDED.passenger_limit_max,
        bag_policy_json = EXCLUDED.bag_policy_json,
        is_shared = EXCLUDED.is_shared,
        is_premium = EXCLUDED.is_premium,
        is_passenger_ride = EXCLUDED.is_passenger_ride,
        requires_scheduling = EXCLUDED.requires_scheduling,
        inherits_base_category = EXCLUDED.inherits_base_category,
        config_json = EXCLUDED.config_json,
        updated_at = NOW()`,
      [
        c.code,
        c.name,
        c.description,
        c.passengerLimitMin,
        c.passengerLimitMax,
        JSON.stringify({ policy: c.baggagePolicy }),
        c.isShared,
        c.isPremium,
        c.isPassengerRide,
        c.requiresScheduling,
        c.inheritsBaseCategory ?? null,
        JSON.stringify(categoryConfigJson(c)),
      ],
    );
  }
}

function categoryConfigJson(c: RideCategoryDefinition) {
  return {
    driverRequirements: c.driverRequirements,
    vehicleRequirements: c.vehicleRequirements,
    acceptanceRules: c.acceptanceRules,
    tariffMultipliers: c.tariffMultipliers,
    specificMultipliers: c.specificMultipliers,
    dynamicCap: c.dynamicCap,
    searchRadiusStagesM: c.searchRadiusStagesM,
    offerTimeoutSeconds: c.offerTimeoutSeconds,
    takeRateBpsMin: c.takeRateBpsMin,
    takeRateBpsMax: c.takeRateBpsMax,
    driverDynamicShareBps: c.driverDynamicShareBps,
  };
}
