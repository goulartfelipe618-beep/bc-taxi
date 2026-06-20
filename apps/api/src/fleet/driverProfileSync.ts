import { config } from '../config.js';
import { pool } from '../db.js';
import { syncMemoryDriverFromFleet } from '../stores/memoryMatchStore.js';
import { getDriverCompliance } from './complianceService.js';
import type { DriverComplianceProfile } from './types.js';

function useMemory() {
  return config.useMemoryDb;
}

export async function ensureDriverFleetBootstrap(driverId: string): Promise<void> {
  if (useMemory()) return;

  await pool.query(
    `INSERT INTO drivers (user_id, enabled_categories)
     VALUES ($1, ARRAY['economico'])
     ON CONFLICT (user_id) DO NOTHING`,
    [driverId],
  );
  await pool.query(
    `INSERT INTO driver_categories (driver_id, category_code) VALUES ($1, 'economico')
     ON CONFLICT DO NOTHING`,
    [driverId],
  );
}

export async function syncDriverProfileFromFleet(driverId: string): Promise<DriverComplianceProfile> {
  const compliance = await getDriverCompliance(driverId);
  const vehicle = compliance.activeVehicle;
  const enabledCategories = compliance.enabledCategories.length > 0
    ? compliance.enabledCategories
    : ['economico'];

  if (useMemory()) {
    syncMemoryDriverFromFleet(driverId, {
      enabledCategories,
      wheelchairAccessible: vehicle?.wheelchairAccessible ?? false,
      petReady: vehicle?.petReady ?? false,
      comfortApproved: vehicle?.comfortApproved ?? false,
    });
    return compliance;
  }

  await pool.query(
    `UPDATE drivers SET
      enabled_categories = $2,
      wheelchair_accessible = $3,
      pet_ready = $4,
      comfort_approved = $5,
      primary_vehicle_id = $6,
      operational_status = CASE
        WHEN operational_status = 'busy' THEN operational_status
        WHEN $7 THEN operational_status
        ELSE 'restricted'
      END
     WHERE user_id = $1`,
    [
      driverId,
      enabledCategories,
      vehicle?.wheelchairAccessible ?? false,
      vehicle?.petReady ?? false,
      vehicle?.comfortApproved ?? false,
      vehicle?.id ?? null,
      compliance.canOperate,
    ],
  );

  return compliance;
}
