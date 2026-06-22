import { config } from '../config.js';
import { pool } from '../db.js';
import { isDocValid, listDriverDocuments, listVehicleDocuments } from '../fleet/fleetStore.js';
import { getPrimaryActiveVehicle } from '../fleet/fleetStore.js';
import { isDriverCompliantForCategory } from '../fleet/complianceService.js';

export interface CategoryRequirementProfile {
  regionId: string;
  categoryCode: string;
  minDriverReputation: number;
  locationFreshnessSeconds: number;
  requiredDriverDocTypes: string[];
  requiredVehicleDocTypes: string[];
  optionalDriverDocTypes: string[];
  minCompletedRides: number;
  configVersion: string;
}

const BC_REGION_ID = '00000000-0000-4000-8000-000000000020';

const memoryProfiles = new Map<string, CategoryRequirementProfile>();

function profileKey(regionId: string, categoryCode: string) {
  return `${regionId}:${categoryCode}`;
}

const defaultProfiles: CategoryRequirementProfile[] = [
  {
    regionId: BC_REGION_ID,
    categoryCode: 'economico',
    minDriverReputation: 4.5,
    locationFreshnessSeconds: 120,
    requiredDriverDocTypes: ['CNH'],
    requiredVehicleDocTypes: ['CRLV', 'INSURANCE'],
    optionalDriverDocTypes: [],
    minCompletedRides: 0,
    configVersion: 'camada43-memory-v1',
  },
  {
    regionId: BC_REGION_ID,
    categoryCode: 'comfort',
    minDriverReputation: 4.75,
    locationFreshnessSeconds: 90,
    requiredDriverDocTypes: ['CNH'],
    requiredVehicleDocTypes: ['CRLV', 'INSURANCE', 'COMFORT_CHECKLIST'],
    optionalDriverDocTypes: [],
    minCompletedRides: 20,
    configVersion: 'camada43-memory-v1',
  },
  {
    regionId: BC_REGION_ID,
    categoryCode: 'aeroporto',
    minDriverReputation: 4.7,
    locationFreshnessSeconds: 60,
    requiredDriverDocTypes: ['CNH', 'AIRPORT_BADGE'],
    requiredVehicleDocTypes: ['CRLV', 'INSURANCE', 'AIRPORT_PERMIT'],
    optionalDriverDocTypes: [],
    minCompletedRides: 30,
    configVersion: 'camada43-memory-v1',
  },
  {
    regionId: BC_REGION_ID,
    categoryCode: 'corporativo',
    minDriverReputation: 4.75,
    locationFreshnessSeconds: 120,
    requiredDriverDocTypes: ['CNH', 'B2B_BILLING'],
    requiredVehicleDocTypes: ['CRLV', 'INSURANCE'],
    optionalDriverDocTypes: [],
    minCompletedRides: 10,
    configVersion: 'camada43-memory-v1',
  },
  {
    regionId: BC_REGION_ID,
    categoryCode: 'entrega',
    minDriverReputation: 4.4,
    locationFreshnessSeconds: 150,
    requiredDriverDocTypes: ['CNH'],
    requiredVehicleDocTypes: ['CRLV', 'INSURANCE'],
    optionalDriverDocTypes: [],
    minCompletedRides: 0,
    configVersion: 'camada43-memory-v1',
  },
];

function seedMemoryProfiles() {
  if (memoryProfiles.size > 0) return;
  for (const p of defaultProfiles) {
    memoryProfiles.set(profileKey(p.regionId, p.categoryCode), p);
  }
}

export async function getCategoryRequirementProfile(
  regionId: string,
  categoryCode: string,
): Promise<CategoryRequirementProfile | null> {
  if (config.useMemoryDb) {
    seedMemoryProfiles();
    return memoryProfiles.get(profileKey(regionId, categoryCode)) ?? null;
  }

  const { rows } = await pool.query(
    `SELECT * FROM category_requirement_profiles
     WHERE region_id = $1 AND category_code = $2 AND is_active = TRUE
     LIMIT 1`,
    [regionId, categoryCode],
  );
  const r = rows[0];
  if (!r) return null;
  return mapProfileRow(r);
}

export async function listCategoryRequirementProfiles(regionId: string): Promise<CategoryRequirementProfile[]> {
  if (config.useMemoryDb) {
    seedMemoryProfiles();
    return [...memoryProfiles.values()].filter((p) => p.regionId === regionId);
  }

  const { rows } = await pool.query(
    `SELECT * FROM category_requirement_profiles
     WHERE region_id = $1 AND is_active = TRUE
     ORDER BY category_code`,
    [regionId],
  );
  return rows.map(mapProfileRow);
}

export async function getCategoryLocationFreshnessSeconds(
  categoryCode: string,
  regionId = config.defaultServiceRegionId,
): Promise<number> {
  const profile = await getCategoryRequirementProfile(regionId, categoryCode);
  return profile?.locationFreshnessSeconds ?? 120;
}

export async function validateDriverCategoryProduction(input: {
  driverId: string;
  categoryCode: string;
  regionId?: string;
  reputationScore?: number;
  completedRides?: number;
}): Promise<{ ok: boolean; reason?: string }> {
  const regionId = input.regionId ?? config.defaultServiceRegionId;
  const baseOk = await isDriverCompliantForCategory(input.driverId, input.categoryCode);
  if (!baseOk) return { ok: false, reason: 'Compliance base não atendido' };

  const profile = await getCategoryRequirementProfile(regionId, input.categoryCode);
  if (!profile) return { ok: true };

  if (input.reputationScore != null && input.reputationScore < profile.minDriverReputation) {
    return { ok: false, reason: `Reputação mínima ${profile.minDriverReputation}` };
  }
  if (input.completedRides != null && input.completedRides < profile.minCompletedRides) {
    return { ok: false, reason: `Mínimo ${profile.minCompletedRides} corridas` };
  }

  const driverDocs = await listDriverDocuments(input.driverId);
  for (const docType of profile.requiredDriverDocTypes) {
    const doc = driverDocs.find((d) => d.docType === docType);
    if (!doc || !isDocValid(doc)) {
      return { ok: false, reason: `Documento motorista ausente/inválido: ${docType}` };
    }
  }

  const vehicle = await getPrimaryActiveVehicle(input.driverId);
  if (!vehicle) return { ok: false, reason: 'Veículo ativo ausente' };
  const vehicleDocs = await listVehicleDocuments(vehicle.id);
  for (const docType of profile.requiredVehicleDocTypes) {
    const doc = vehicleDocs.find((d) => d.docType === docType);
    if (!doc || !isDocValid(doc)) {
      return { ok: false, reason: `Documento veículo ausente/inválido: ${docType}` };
    }
  }

  return { ok: true };
}

function mapProfileRow(r: Record<string, unknown>): CategoryRequirementProfile {
  return {
    regionId: r.region_id as string,
    categoryCode: r.category_code as string,
    minDriverReputation: Number(r.min_driver_reputation),
    locationFreshnessSeconds: Number(r.location_freshness_seconds),
    requiredDriverDocTypes: (r.required_driver_doc_types as string[]) ?? [],
    requiredVehicleDocTypes: (r.required_vehicle_doc_types as string[]) ?? [],
    optionalDriverDocTypes: (r.optional_driver_doc_types as string[]) ?? [],
    minCompletedRides: Number(r.min_completed_rides ?? 0),
    configVersion: r.config_version as string,
  };
}

export function seedMemoryCategoryRequirementProfile(profile: CategoryRequirementProfile) {
  memoryProfiles.set(profileKey(profile.regionId, profile.categoryCode), profile);
}

export function __testResetCategoryDocumentProductionMemory() {
  memoryProfiles.clear();
}
