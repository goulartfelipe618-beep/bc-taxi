import { config } from '../config.js';
import { pool } from '../db.js';
import { listCategories } from '../domain/rideCategories.js';

export interface ServiceRegionRecord {
  id: string;
  cityId: string;
  name: string;
  centerLat: number;
  centerLng: number;
  pricingRegionId?: string;
  isActive: boolean;
}

export interface RegionPointContext {
  inCoverage: boolean;
  serviceRegion?: ServiceRegionRecord;
  pricingRegionId?: string;
  pricingRegionName?: string;
  enabledCategoryCodes: string[];
}

interface MemoryRegion extends ServiceRegionRecord {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

const BC_SERVICE_REGION_ID = '00000000-0000-4000-8000-000000000020';
const VALE_PRICING_REGION_ID = '00000000-0000-4000-8000-000000000010';

const memoryRegions: MemoryRegion[] = [
  {
    id: BC_SERVICE_REGION_ID,
    cityId: 'balneario-camboriu',
    name: 'Balneário Camboriú / BC',
    centerLat: -26.9905,
    centerLng: -48.6348,
    pricingRegionId: VALE_PRICING_REGION_ID,
    isActive: true,
    minLat: -27.1,
    maxLat: -26.88,
    minLng: -48.78,
    maxLng: -48.48,
  },
];

const memoryCategoryMap = new Map<string, Array<{ code: string; enabled: boolean; priority: number }>>();

function seedMemoryCategories() {
  if (memoryCategoryMap.has(BC_SERVICE_REGION_ID)) return;
  memoryCategoryMap.set(BC_SERVICE_REGION_ID, [
    { code: 'economico', enabled: true, priority: 100 },
    { code: 'comfort', enabled: true, priority: 90 },
    { code: 'executivo', enabled: true, priority: 80 },
    { code: 'aeroporto', enabled: true, priority: 85 },
    { code: 'moto', enabled: true, priority: 10 },
    { code: 'pet', enabled: true, priority: 60 },
    { code: 'compartilhado', enabled: true, priority: 50 },
    { code: 'pcd', enabled: true, priority: 95 },
    { code: 'black', enabled: false, priority: 40 },
    { code: 'van', enabled: false, priority: 30 },
    { code: 'entrega', enabled: true, priority: 55 },
  ]);
}

function pointInMemoryRegion(lat: number, lng: number, region: MemoryRegion): boolean {
  return lat >= region.minLat && lat <= region.maxLat && lng >= region.minLng && lng <= region.maxLng;
}

function mapServiceRegion(row: Record<string, unknown>): ServiceRegionRecord {
  return {
    id: row.id as string,
    cityId: row.city_id as string,
    name: row.name as string,
    centerLat: Number(row.center_lat),
    centerLng: Number(row.center_lng),
    pricingRegionId: (row.pricing_region_id as string) ?? undefined,
    isActive: Boolean(row.is_active),
  };
}

export async function resolveRegionContextAtPoint(lat: number, lng: number): Promise<RegionPointContext> {
  seedMemoryCategories();

  if (config.useMemoryDb) {
    const region = memoryRegions.find((r) => r.isActive && pointInMemoryRegion(lat, lng, r));
    if (!region) {
      return { inCoverage: false, enabledCategoryCodes: [] };
    }
    const cats = (memoryCategoryMap.get(region.id) ?? [])
      .filter((c) => c.enabled)
      .sort((a, b) => b.priority - a.priority)
      .map((c) => c.code);
    return {
      inCoverage: true,
      serviceRegion: region,
      pricingRegionId: region.pricingRegionId ?? config.defaultPricingRegionId,
      pricingRegionName: 'Vale do Itajaí',
      enabledCategoryCodes: cats,
    };
  }

  const { rows } = await pool.query(
    `SELECT sr.*, pr.name AS pricing_region_name
     FROM service_regions sr
     LEFT JOIN pricing_regions pr ON pr.id = sr.pricing_region_id
     WHERE sr.is_active = TRUE
       AND sr.boundary IS NOT NULL
       AND ST_Covers(sr.boundary, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography)
     ORDER BY ST_Area(sr.boundary::geometry) ASC
     LIMIT 1`,
    [lat, lng],
  );

  if (!rows[0]) {
    const pricingOnly = await pool.query(
      `SELECT id, name FROM pricing_regions
       WHERE is_active = TRUE AND boundary IS NOT NULL
         AND ST_Covers(boundary, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography)
       ORDER BY priority DESC, ST_Area(boundary::geometry) ASC
       LIMIT 1`,
      [lat, lng],
    );
    if (!pricingOnly.rows[0]) {
      return { inCoverage: false, enabledCategoryCodes: [] };
    }
    return {
      inCoverage: true,
      pricingRegionId: pricingOnly.rows[0].id as string,
      pricingRegionName: pricingOnly.rows[0].name as string,
      enabledCategoryCodes: listCategories({ passengerRidesOnly: false }).map((c) => c.code),
    };
  }

  const serviceRegion = mapServiceRegion(rows[0]);
  const enabledCategoryCodes = await listEnabledCategoryCodes(serviceRegion.id);
  return {
    inCoverage: true,
    serviceRegion,
    pricingRegionId: serviceRegion.pricingRegionId ?? (rows[0].pricing_region_id as string),
    pricingRegionName: (rows[0].pricing_region_name as string) ?? undefined,
    enabledCategoryCodes,
  };
}

export async function listEnabledCategoryCodes(serviceRegionId: string): Promise<string[]> {
  seedMemoryCategories();

  if (config.useMemoryDb) {
    return (memoryCategoryMap.get(serviceRegionId) ?? [])
      .filter((c) => c.enabled)
      .sort((a, b) => b.priority - a.priority)
      .map((c) => c.code);
  }

  const { rows } = await pool.query(
    `SELECT category_code FROM service_region_categories
     WHERE region_id = $1 AND is_enabled = TRUE
     ORDER BY display_priority DESC, category_code ASC`,
    [serviceRegionId],
  );
  return rows.map((r) => r.category_code as string);
}

export async function isCategoryEnabledInRegion(
  serviceRegionId: string,
  categoryCode: string,
): Promise<boolean> {
  const enabled = await listEnabledCategoryCodes(serviceRegionId);
  return enabled.includes(categoryCode);
}

export async function isCategoryEnabledAtPoint(
  categoryCode: string,
  lat: number,
  lng: number,
): Promise<boolean> {
  const ctx = await resolveRegionContextAtPoint(lat, lng);
  if (!ctx.inCoverage) return false;
  return ctx.enabledCategoryCodes.includes(categoryCode);
}

export async function resolvePricingRegionIdAtPoint(
  lat: number,
  lng: number,
): Promise<string> {
  const ctx = await resolveRegionContextAtPoint(lat, lng);
  return ctx.pricingRegionId ?? config.defaultPricingRegionId;
}

export async function resolveServiceRegionIdAtPoint(
  lat: number,
  lng: number,
): Promise<string | undefined> {
  const ctx = await resolveRegionContextAtPoint(lat, lng);
  return ctx.serviceRegion?.id;
}

export function filterCategoriesByRegion(
  categoryCodes: string[],
  enabledCodes: string[],
): string[] {
  if (enabledCodes.length === 0) return categoryCodes;
  const set = new Set(enabledCodes);
  return categoryCodes.filter((c) => set.has(c));
}

export function listPublicCategoriesForRegion(enabledCodes: string[]) {
  const all = listCategories({ passengerRidesOnly: true });
  if (enabledCodes.length === 0) return all;
  const set = new Set(enabledCodes);
  return all
    .filter((c) => set.has(c.code))
    .sort((a, b) => enabledCodes.indexOf(a.code) - enabledCodes.indexOf(b.code));
}

export function seedMemoryRegionCategories(input: {
  regionId: string;
  categories: Array<{ code: string; enabled: boolean; priority: number }>;
}) {
  memoryCategoryMap.set(input.regionId, input.categories);
}

export function __testResetRegionGeoMemory() {
  memoryCategoryMap.clear();
}

export function __testRegisterMemoryRegion(region: MemoryRegion) {
  const idx = memoryRegions.findIndex((r) => r.id === region.id);
  if (idx >= 0) memoryRegions[idx] = region;
  else memoryRegions.push(region);
}

export type { MemoryRegion };
