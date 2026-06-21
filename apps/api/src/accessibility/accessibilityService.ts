import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';
import { listDriverDocuments } from '../fleet/fleetStore.js';
import type { DriverRecord } from '../match/types.js';

export type AccessibilityNeedCode =
  | 'wheelchair'
  | 'walker'
  | 'mobility_aid'
  | 'visual_assistance'
  | 'hearing_assistance';

export interface AccessibilityNeedDefinition {
  code: AccessibilityNeedCode;
  label: string;
  description: string;
  requiresWheelchairVehicle: boolean;
  requiresPcdDriverOptIn: boolean;
  assistiveBaggageFree: boolean;
}

export interface AccessibilityRequestInput {
  rideId: string;
  needCode: AccessibilityNeedCode;
  assistiveDeviceCount?: number;
  notes?: string;
}

const CATALOG: AccessibilityNeedDefinition[] = [
  {
    code: 'wheelchair',
    label: 'Cadeira de rodas',
    description: 'Veículo com espaço e acesso para cadeira de rodas',
    requiresWheelchairVehicle: true,
    requiresPcdDriverOptIn: true,
    assistiveBaggageFree: true,
  },
  {
    code: 'walker',
    label: 'Andador ou bengala',
    description: 'Tempo extra de embarque; não exige adaptação veicular',
    requiresWheelchairVehicle: false,
    requiresPcdDriverOptIn: true,
    assistiveBaggageFree: true,
  },
  {
    code: 'mobility_aid',
    label: 'Muletas ou aparelho ortopédico',
    description: 'Itens assistivos não contam como bagagem tarifável',
    requiresWheelchairVehicle: false,
    requiresPcdDriverOptIn: true,
    assistiveBaggageFree: true,
  },
  {
    code: 'visual_assistance',
    label: 'Apoio visual',
    description: 'Motorista com treinamento inclusivo',
    requiresWheelchairVehicle: false,
    requiresPcdDriverOptIn: true,
    assistiveBaggageFree: true,
  },
  {
    code: 'hearing_assistance',
    label: 'Apoio auditivo',
    description: 'Motorista com treinamento inclusivo',
    requiresWheelchairVehicle: false,
    requiresPcdDriverOptIn: true,
    assistiveBaggageFree: true,
  },
];

const memoryProfiles = new Map<string, { capabilities: string[]; pcdOptIn: boolean }>();
const memoryRequests = new Map<string, AccessibilityRequestInput & { id: string }>();

export function listAccessibilityNeeds(): AccessibilityNeedDefinition[] {
  return [...CATALOG];
}

export function getAccessibilityNeed(code: string): AccessibilityNeedDefinition | undefined {
  return CATALOG.find((n) => n.code === code);
}

export function resolveAccessibilityNeed(input: {
  categoryCode: string;
  needsWheelchair?: boolean;
  accessibilityNeedCode?: string;
}): AccessibilityNeedCode | undefined {
  if (input.accessibilityNeedCode) {
    return getAccessibilityNeed(input.accessibilityNeedCode)?.code;
  }
  if (input.needsWheelchair) return 'wheelchair';
  return undefined;
}

export function normalizeRideAccessibility(input: {
  categoryCode: string;
  needsWheelchair?: boolean;
  accessibilityNeedCode?: string;
}): { categoryCode: string; needCode?: AccessibilityNeedCode; needsWheelchair: boolean } {
  let needCode = resolveAccessibilityNeed(input);
  if (input.categoryCode === 'pcd' && !needCode) {
    needCode = 'walker';
  }
  const needsWheelchair = needCode === 'wheelchair' || Boolean(input.needsWheelchair);
  return { categoryCode: input.categoryCode, needCode, needsWheelchair };
}

async function driverHasPcdTraining(driverId: string): Promise<boolean> {
  const docs = await listDriverDocuments(driverId);
  const training = docs.find((d) => d.docType === 'PCD_TRAINING');
  return training?.status === 'approved';
}

export function driverHasPcdOptIn(driver: DriverRecord): boolean {
  if (driver.enabledCategories.includes('pcd')) return true;
  const profile = memoryProfiles.get(driver.userId);
  return profile?.pcdOptIn ?? false;
}

export async function isDriverCompatibleWithNeed(
  driver: DriverRecord,
  needCode: AccessibilityNeedCode,
): Promise<boolean> {
  const need = getAccessibilityNeed(needCode);
  if (!need) return false;

  if (need.requiresWheelchairVehicle && !driver.wheelchairAccessible) {
    return false;
  }

  if (need.requiresPcdDriverOptIn && !driverHasPcdOptIn(driver)) {
    return false;
  }

  if (needCode === 'visual_assistance' || needCode === 'hearing_assistance') {
    const trained = await driverHasPcdTraining(driver.userId);
    if (!trained && !driver.enabledCategories.includes('pcd')) {
      return false;
    }
  }

  return true;
}

export function isPcdRide(input: {
  categoryCode: string;
  needCode?: AccessibilityNeedCode;
  needsWheelchair?: boolean;
}): boolean {
  return input.categoryCode === 'pcd' || Boolean(input.needCode) || Boolean(input.needsWheelchair);
}

export async function validateAccessibilityBooking(input: {
  categoryCode: string;
  accessibilityNeedCode?: string;
  needsWheelchair?: boolean;
  assistiveDeviceCount?: number;
}): Promise<{ ok: true; needCode?: AccessibilityNeedCode; needsWheelchair: boolean } | { ok: false; reason: string }> {
  const normalized = normalizeRideAccessibility(input);

  if (input.accessibilityNeedCode && !getAccessibilityNeed(input.accessibilityNeedCode)) {
    return { ok: false, reason: 'Necessidade de acessibilidade inválida' };
  }

  if (input.categoryCode === 'pcd' && !normalized.needCode) {
    return { ok: false, reason: 'Informe o tipo de necessidade para Transporte Adaptado' };
  }

  const count = input.assistiveDeviceCount ?? 0;
  if (count > 3) {
    return { ok: false, reason: 'Limite de 3 itens assistivos por viagem' };
  }

  return { ok: true, needCode: normalized.needCode, needsWheelchair: normalized.needsWheelchair };
}

export async function registerAccessibilityRequest(input: AccessibilityRequestInput) {
  const record = {
    id: randomUUID(),
    ...input,
    assistiveDeviceCount: input.assistiveDeviceCount ?? 0,
  };

  if (config.useMemoryDb) {
    memoryRequests.set(input.rideId, record);
    return record;
  }

  await pool.query(
    `UPDATE rides SET accessibility_need_code = $2, assistive_device_count = $3, needs_wheelchair = $4, updated_at = NOW()
     WHERE id = $1`,
    [input.rideId, input.needCode, input.assistiveDeviceCount ?? 0, input.needCode === 'wheelchair'],
  );

  const { rows } = await pool.query(
    `INSERT INTO ride_accessibility_requests (id, ride_id, need_code, assistive_device_count, notes)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (ride_id) DO UPDATE SET
       need_code = EXCLUDED.need_code,
       assistive_device_count = EXCLUDED.assistive_device_count,
       notes = EXCLUDED.notes
     RETURNING id`,
    [record.id, input.rideId, input.needCode, input.assistiveDeviceCount ?? 0, input.notes ?? null],
  );

  return { ...record, id: rows[0].id as string };
}

export async function upsertDriverAccessibilityProfile(input: {
  driverId: string;
  pcdOptIn?: boolean;
  capabilities?: string[];
  notes?: string;
}) {
  if (config.useMemoryDb) {
    memoryProfiles.set(input.driverId, {
      pcdOptIn: input.pcdOptIn ?? false,
      capabilities: input.capabilities ?? [],
    });
    return memoryProfiles.get(input.driverId)!;
  }

  await pool.query(
    `INSERT INTO driver_accessibility_profiles (driver_id, capabilities, pcd_opt_in, notes)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (driver_id) DO UPDATE SET
       capabilities = COALESCE(EXCLUDED.capabilities, driver_accessibility_profiles.capabilities),
       pcd_opt_in = COALESCE(EXCLUDED.pcd_opt_in, driver_accessibility_profiles.pcd_opt_in),
       notes = COALESCE(EXCLUDED.notes, driver_accessibility_profiles.notes),
       updated_at = NOW()`,
    [input.driverId, input.capabilities ?? [], input.pcdOptIn ?? false, input.notes ?? null],
  );

  const { rows } = await pool.query(
    `SELECT capabilities, pcd_opt_in FROM driver_accessibility_profiles WHERE driver_id = $1`,
    [input.driverId],
  );
  return {
    capabilities: (rows[0]?.capabilities as string[]) ?? [],
    pcdOptIn: Boolean(rows[0]?.pcd_opt_in),
  };
}

export async function getDriverAccessibilityProfile(driverId: string) {
  if (config.useMemoryDb) {
    return memoryProfiles.get(driverId) ?? { capabilities: [], pcdOptIn: false };
  }
  const { rows } = await pool.query(
    `SELECT capabilities, pcd_opt_in, notes FROM driver_accessibility_profiles WHERE driver_id = $1`,
    [driverId],
  );
  if (!rows[0]) return { capabilities: [], pcdOptIn: false };
  return {
    capabilities: rows[0].capabilities as string[],
    pcdOptIn: Boolean(rows[0].pcd_opt_in),
    notes: rows[0].notes as string | undefined,
  };
}

export function toPublicNeed(n: AccessibilityNeedDefinition) {
  return {
    code: n.code,
    label: n.label,
    description: n.description,
    requiresWheelchairVehicle: n.requiresWheelchairVehicle,
    requiresPcdDriverOptIn: n.requiresPcdDriverOptIn,
    assistiveBaggageFree: n.assistiveBaggageFree,
  };
}

export function toPublicAccessibilityRequest(req: AccessibilityRequestInput & { id: string }) {
  const need = getAccessibilityNeed(req.needCode);
  return {
    id: req.id,
    rideId: req.rideId,
    needCode: req.needCode,
    needLabel: need?.label,
    assistiveDeviceCount: req.assistiveDeviceCount ?? 0,
    notes: req.notes,
    assistiveBaggageFree: need?.assistiveBaggageFree ?? true,
  };
}

export function seedMemoryPcdDriver(driverId: string, opts?: { wheelchair?: boolean }) {
  memoryProfiles.set(driverId, {
    pcdOptIn: true,
    capabilities: opts?.wheelchair ? ['wheelchair_space'] : ['walker_assistance'],
  });
}
