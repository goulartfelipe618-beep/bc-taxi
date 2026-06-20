export type DocumentStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export type DriverDocType =
  | 'CNH'
  | 'IDENTITY'
  | 'EAR_PROOF'
  | 'DEFENSIVE_TRAINING'
  | 'EXECUTIVE_TRAINING'
  | 'PET_TRAINING'
  | 'PCD_TRAINING'
  | 'AIRPORT_TRAINING'
  | 'B2B_BILLING';

export type VehicleDocType =
  | 'CRLV'
  | 'INSURANCE'
  | 'COMFORT_CHECKLIST'
  | 'PCD_ADAPTATION'
  | 'AIRPORT_AUTHORIZATION'
  | 'INSPECTION';

export type VehicleRecord = {
  id: string;
  driverId: string;
  plate: string;
  make: string;
  model: string;
  year: number;
  color?: string;
  bodyType: string;
  seatCount: number;
  trunkCapacityL?: number;
  wheelchairAccessible: boolean;
  petReady: boolean;
  comfortApproved: boolean;
  status: 'active' | 'inactive' | 'pending_review';
  categoryCodes: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type DriverDocumentRecord = {
  id: string;
  driverId: string;
  docType: DriverDocType;
  status: DocumentStatus;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type VehicleDocumentRecord = {
  id: string;
  vehicleId: string;
  docType: VehicleDocType;
  status: DocumentStatus;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type OperationalFlagRecord = {
  id: string;
  driverId: string;
  flagCode: string;
  isActive: boolean;
  reason?: string;
  expiresAt?: Date;
};

export type DriverComplianceProfile = {
  canOperate: boolean;
  blockReasons: string[];
  cnhValid: boolean;
  vehicleDocsValid: boolean;
  hasActiveVehicle: boolean;
  activeVehicle?: VehicleRecord;
  driverDocuments: DriverDocumentRecord[];
  vehicleDocuments: VehicleDocumentRecord[];
  operationalFlags: OperationalFlagRecord[];
  enabledCategories: string[];
};
