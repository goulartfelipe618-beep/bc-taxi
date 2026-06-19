export type RideCategoryCode =
  | 'moto'
  | 'economico'
  | 'comfort'
  | 'executivo'
  | 'black'
  | 'suv'
  | 'pet'
  | 'entrega'
  | 'aeroporto'
  | 'corporativo'
  | 'van'
  | 'micro_onibus'
  | 'compartilhado'
  | 'pcd';

export type ReputationTier = 'elite' | 'premium' | 'confiavel' | 'observacao' | 'restrito';

export type BlockType =
  | 'PASSENGER_CANCEL_DRIVER_24H'
  | 'DRIVER_CANCEL_PASSENGER_REDISPATCH'
  | 'PAIR_RISK_BLOCK'
  | 'MANUAL_BLOCK';

export interface DriverRequirements {
  minRating: number;
  minCompletedRides?: number;
  minAcceptanceRate?: number;
  maxCancellationRate?: number;
  minAge?: number;
  requiresEar?: boolean;
  requiresDefensiveTraining?: boolean;
  requiresExecutiveTraining?: boolean;
  requiresPremiumTraining?: boolean;
  requiresPetTraining?: boolean;
  requiresPcdTraining?: boolean;
  requiresCollectiveTraining?: boolean;
  requiresAirportTraining?: boolean;
  requiresB2bBilling?: boolean;
  notes?: string;
}

export interface VehicleRequirements {
  summary: string;
  minYearOffset?: number;
  minSeats?: number;
  maxEngineCc?: number;
  minEngineCc?: number;
  requiresAc?: boolean;
  requiresWheelchairAccess?: boolean;
  requiresPetReady?: boolean;
  bodyTypes?: string[];
}

export interface TariffMultipliers {
  base: number;
  distance: number;
  time: number;
  minimum: number;
}

export interface RideCategoryDefinition {
  code: RideCategoryCode;
  name: string;
  description: string;
  passengerLimitMin: number;
  passengerLimitMax: number;
  isShared: boolean;
  isPremium: boolean;
  isPassengerRide: boolean;
  requiresScheduling: boolean;
  inheritsBaseCategory?: RideCategoryCode;
  driverRequirements: DriverRequirements;
  vehicleRequirements: VehicleRequirements;
  acceptanceRules: string;
  baggagePolicy: string;
  tariffMultipliers: TariffMultipliers;
  specificMultipliers: Record<string, number | string | boolean>;
  dynamicCap: number;
  searchRadiusStagesM: number[];
  offerTimeoutSeconds: number;
  takeRateBpsMin: number;
  takeRateBpsMax: number;
  driverDynamicShareBps: number;
}

export interface ReputationConfig {
  driverLambda: number;
  passengerLambda: number;
  freshnessBonus: number;
  maxHistoricalWeightRatio: number;
  driverBayesianM: number;
  passengerBayesianM: number;
  tiers: Record<ReputationTier, { min: number; max: number }>;
}

export interface MatchConfig {
  scoreWeights: { d: number; r: number; a: number; c: number; t: number; e: number; k: number };
  defaultRadiusStagesM: number[];
  passengerEliteBonus: number;
  driverEliteBonus: number;
  corporateBonus: number;
  sequentialOfferTimeoutSeconds: number;
  parallelBatchSizeMin: number;
  parallelBatchSizeMax: number;
}

export interface PricingRegionDefaults {
  baseFareCentavos: number;
  distanceRateCentavosKm: number;
  timeRateCentavosMin: number;
  minimumFareCentavos: number;
  bookingFeeCentavos: number;
  trafficCoefficient: number;
}

export interface QuoteRequest {
  categoryCode: RideCategoryCode;
  distanceKm: number;
  durationMin: number;
  dynamicMultiplier?: number;
  tollsCentavos?: number;
  airportFeeCentavos?: number;
  addonsCentavos?: number;
}

export interface QuoteResult {
  categoryCode: RideCategoryCode;
  categoryName: string;
  passengerFareCentavos: number;
  estimatedDriverPayoutCentavos: number;
  dynamicMultiplier: number;
  breakdown: Record<string, number>;
}
