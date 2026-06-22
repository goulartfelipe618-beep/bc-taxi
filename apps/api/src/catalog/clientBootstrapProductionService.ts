import { config } from '../config.js';
import { pool } from '../db.js';
import { resolveRegionContextAtPoint, listPublicCategoriesForRegion } from '../region/serviceRegionGeoService.js';
import { listCategories, getPublicCategory } from '../domain/rideCategories.js';
import { listPaymentMethods } from '../payments/paymentStore.js';
import { getPaymentPublicConfig } from '../payments/tokenizationService.js';
import { getPassengerReputation } from '../reviews/reputationService.js';
import { getTier } from '../domain/reputation.js';
import { listCategoryRequirementProfiles } from './categoryDocumentProductionService.js';

export interface ClientProductionConfig {
  configVersion: string;
  useApiPaymentMethods: boolean;
  useApiProfile: boolean;
  useApiCategories: boolean;
}

const memoryClientConfig: ClientProductionConfig = {
  configVersion: 'camada43-memory-v1',
  useApiPaymentMethods: true,
  useApiProfile: true,
  useApiCategories: true,
};

export async function getClientProductionConfig(regionId?: string): Promise<ClientProductionConfig> {
  if (config.useMemoryDb) return { ...memoryClientConfig };

  const { rows } = await pool.query(
    `SELECT * FROM client_production_config
     WHERE is_active = TRUE AND ($1::uuid IS NULL OR region_id = $1 OR region_id IS NULL)
     ORDER BY region_id NULLS LAST, created_at DESC
     LIMIT 1`,
    [regionId ?? null],
  );
  const r = rows[0];
  if (!r) return { ...memoryClientConfig, configVersion: 'camada43-v1' };
  return {
    configVersion: r.config_version as string,
    useApiPaymentMethods: Boolean(r.use_api_payment_methods),
    useApiProfile: Boolean(r.use_api_profile),
    useApiCategories: Boolean(r.use_api_categories),
  };
}

export async function getClientBootstrap(input: {
  lat?: number;
  lng?: number;
  userId?: string;
  userEmail?: string;
  userFullName?: string;
  userRole?: string;
}) {
  const clientCfg = await getClientProductionConfig();
  let regionCtx = {
    inCoverage: true,
    serviceRegionId: config.defaultServiceRegionId,
    pricingRegionId: config.defaultPricingRegionId,
    enabledCategoryCodes: listCategories({ passengerRidesOnly: true }).map((c) => c.code),
  };

  if (input.lat != null && input.lng != null && !Number.isNaN(input.lat) && !Number.isNaN(input.lng)) {
    const resolved = await resolveRegionContextAtPoint(input.lat, input.lng);
    regionCtx = {
      inCoverage: resolved.inCoverage,
      serviceRegionId: resolved.serviceRegion?.id ?? config.defaultServiceRegionId,
      pricingRegionId: resolved.pricingRegionId ?? config.defaultPricingRegionId,
      enabledCategoryCodes: resolved.enabledCategoryCodes,
    };
  }

  const categories = clientCfg.useApiCategories
    ? listPublicCategoriesForRegion(regionCtx.enabledCategoryCodes)
        .filter((c) => c.isPassengerRide)
        .map(getPublicCategory)
    : listCategories({ passengerRidesOnly: true }).map(getPublicCategory);

  const categoryProfiles =
    regionCtx.serviceRegionId && regionCtx.inCoverage
      ? await listCategoryRequirementProfiles(regionCtx.serviceRegionId)
      : [];

  const paymentPublic = await getPaymentPublicConfig();
  const paymentMethods =
    input.userId && clientCfg.useApiPaymentMethods ? await listPaymentMethods(input.userId) : [];

  let profile: Record<string, unknown> | null = null;
  let reputation: { score: number; tier: string } | null = null;

  if (input.userId && clientCfg.useApiProfile) {
    const score = await getPassengerReputation(input.userId);
    reputation = { score, tier: getTier(score) };
    profile = {
      id: input.userId,
      email: input.userEmail,
      fullName: input.userFullName,
      role: input.userRole,
      rating: score,
      tier: getTier(score),
    };
  }

  return {
    configVersion: clientCfg.configVersion,
    inCoverage: regionCtx.inCoverage,
    serviceRegionId: regionCtx.serviceRegionId,
    pricingRegionId: regionCtx.pricingRegionId,
    features: {
      useApiCategories: clientCfg.useApiCategories,
      useApiPaymentMethods: clientCfg.useApiPaymentMethods,
      useApiProfile: clientCfg.useApiProfile,
    },
    categories,
    categoryRequirementProfiles: categoryProfiles.map((p) => ({
      categoryCode: p.categoryCode,
      minDriverReputation: p.minDriverReputation,
      locationFreshnessSeconds: p.locationFreshnessSeconds,
      requiredDriverDocTypes: p.requiredDriverDocTypes,
      requiredVehicleDocTypes: p.requiredVehicleDocTypes,
      minCompletedRides: p.minCompletedRides,
      configVersion: p.configVersion,
    })),
    payment: {
      public: paymentPublic,
      methods: paymentMethods.map((m) => ({
        id: m.id,
        methodType: m.methodType,
        label: m.label,
        lastFour: m.lastFour,
        brand: m.brand,
        isDefault: m.isDefault,
        isActive: m.isActive,
      })),
    },
    profile,
    reputation,
  };
}

export function __testResetClientBootstrapProductionMemory() {
  Object.assign(memoryClientConfig, {
    configVersion: 'camada43-memory-v1',
    useApiPaymentMethods: true,
    useApiProfile: true,
    useApiCategories: true,
  });
}
