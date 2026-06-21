export type RideStatus =
  | 'REQUESTED'
  | 'OFFERING'
  | 'DRIVER_ASSIGNED'
  | 'DRIVER_ARRIVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_DRIVERS';

export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'expired' | 'superseded' | 'error';
export type OfferType = 'sequential' | 'parallel';
export type DriverOperationalStatus = 'offline' | 'online' | 'busy' | 'paused' | 'restricted';

export interface RideRecord {
  id: string;
  passengerId: string;
  driverId?: string;
  categoryCode: string;
  status: RideStatus;
  pickupLat: number;
  pickupLng: number;
  pickupAddress?: string;
  dropoffLat: number;
  dropoffLng: number;
  dropoffAddress?: string;
  passengerCount: number;
  isCorporate: boolean;
  isShared: boolean;
  hasPet: boolean;
  needsWheelchair: boolean;
  accessibilityNeedCode?: string;
  assistiveDeviceCount?: number;
  estimatedFareCentavos?: number;
  rideVersion: number;
  matchStage: number;
  assignedAt?: Date;
  arrivedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  paymentIntentId?: string;
  cancelReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DriverRecord {
  userId: string;
  fullName: string;
  isOnline: boolean;
  operationalStatus: DriverOperationalStatus;
  lat?: number;
  lng?: number;
  locationUpdatedAt?: Date;
  enabledCategories: string[];
  reputationScore: number;
  completedRides: number;
  acceptanceRate: number;
  cancellationRate: number;
  onlineMinutesToday: number;
  activeRideId?: string;
  wheelchairAccessible: boolean;
  petReady: boolean;
  comfortApproved: boolean;
  vehicleType: string;
}

export interface MatchAttemptRecord {
  id: string;
  rideId: string;
  stageNumber: number;
  searchRadiusM: number;
  candidateCount: number;
  strategy: OfferType;
  resultStatus: string;
  startedAt: Date;
  endedAt?: Date;
}

export interface MatchCandidateRecord {
  attemptId: string;
  driverId: string;
  score: number;
  etaPickupS: number;
  distanceM: number;
  rankPosition: number;
  featureVector: Record<string, number>;
}

export interface RideOfferRecord {
  id: string;
  rideId: string;
  attemptId: string;
  driverId: string;
  offerBatch: number;
  offerType: OfferType;
  status: OfferStatus;
  expiresAt: Date;
  claimToken?: string;
  createdAt: Date;
}

export interface PassengerContext {
  passengerId: string;
  reputationScore: number;
  tier: string;
  isCorporate: boolean;
}

export interface RideRequestInput {
  passengerId: string;
  categoryCode: string;
  pickupLat: number;
  pickupLng: number;
  pickupAddress?: string;
  dropoffLat: number;
  dropoffLng: number;
  dropoffAddress?: string;
  passengerCount?: number;
  isCorporate?: boolean;
  isShared?: boolean;
  hasPet?: boolean;
  needsWheelchair?: boolean;
  accessibilityNeedCode?: string;
  assistiveDeviceCount?: number;
  estimatedFareCentavos?: number;
  passengerReputation?: number;
}

export interface ScoredCandidate {
  driver: DriverRecord;
  score: number;
  etaPickupS: number;
  distanceM: number;
  compatibility: number;
  featureVector: Record<string, number>;
}
