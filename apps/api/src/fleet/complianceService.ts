import { getCategory } from '../domain/rideCategories.js';
import type { RideCategoryCode } from '../domain/types.js';
import {
  getDriverEnabledCategoriesFromFleet,
  getPrimaryActiveVehicle,
  isDocValid,
  listDriverDocuments,
  listOperationalFlags,
  listVehicleDocuments,
} from './fleetStore.js';
import type { DriverComplianceProfile, VehicleRecord } from './types.js';

function vehicleMeetsCategory(vehicle: VehicleRecord, categoryCode: string): boolean {
  if (!vehicle.categoryCodes.includes(categoryCode)) return false;

  const category = getCategory(categoryCode as RideCategoryCode);
  if (!category) return false;

  const req = category.vehicleRequirements;
  const currentYear = new Date().getFullYear();
  if (req.minYearOffset != null && vehicle.year < currentYear - req.minYearOffset) return false;
  if (req.minSeats != null && vehicle.seatCount < req.minSeats) return false;
  if (req.requiresWheelchairAccess && !vehicle.wheelchairAccessible) return false;
  if (req.requiresPetReady && !vehicle.petReady) return false;
  if (category.code === 'comfort' && !vehicle.comfortApproved) return false;
  if (req.bodyTypes?.length && !req.bodyTypes.includes(vehicle.bodyType)) return false;

  return true;
}

export async function getDriverCompliance(driverId: string): Promise<DriverComplianceProfile> {
  const blockReasons: string[] = [];
  const flags = await listOperationalFlags(driverId);
  if (flags.length > 0) {
    blockReasons.push(...flags.map((f) => f.reason ?? f.flagCode));
  }

  const driverDocuments = await listDriverDocuments(driverId);
  const cnh = driverDocuments.find((d) => d.docType === 'CNH');
  const cnhValid = cnh ? isDocValid(cnh) : false;
  if (!cnhValid) blockReasons.push('CNH inválida ou ausente');

  const vehicle = await getPrimaryActiveVehicle(driverId);
  const hasActiveVehicle = Boolean(vehicle);
  if (!hasActiveVehicle) blockReasons.push('Nenhum veículo ativo');

  let vehicleDocuments = vehicle ? await listVehicleDocuments(vehicle.id) : [];
  const crlv = vehicleDocuments.find((d) => d.docType === 'CRLV');
  const insurance = vehicleDocuments.find((d) => d.docType === 'INSURANCE');
  const vehicleDocsValid =
    hasActiveVehicle && crlv != null && insurance != null && isDocValid(crlv) && isDocValid(insurance);

  if (hasActiveVehicle && !vehicleDocsValid) {
    blockReasons.push('CRLV ou seguro do veículo inválido');
  }

  const fleetCategories = await getDriverEnabledCategoriesFromFleet(driverId);
  const enabledCategories = fleetCategories.filter(
    (code) => vehicle && vehicleMeetsCategory(vehicle, code),
  );

  const canOperate = cnhValid && vehicleDocsValid && hasActiveVehicle && flags.length === 0;

  return {
    canOperate,
    blockReasons,
    cnhValid,
    vehicleDocsValid,
    hasActiveVehicle,
    activeVehicle: vehicle ?? undefined,
    driverDocuments,
    vehicleDocuments,
    operationalFlags: flags,
    enabledCategories,
  };
}

export async function isDriverCompliantForCategory(
  driverId: string,
  categoryCode: string,
): Promise<boolean> {
  const profile = await getDriverCompliance(driverId);
  if (!profile.canOperate) return false;
  if (!profile.activeVehicle) return false;
  return vehicleMeetsCategory(profile.activeVehicle, categoryCode);
}

export function toPublicCompliance(p: DriverComplianceProfile) {
  return {
    canOperate: p.canOperate,
    blockReasons: p.blockReasons,
    cnhValid: p.cnhValid,
    vehicleDocsValid: p.vehicleDocsValid,
    hasActiveVehicle: p.hasActiveVehicle,
    activeVehicle: p.activeVehicle ? {
      id: p.activeVehicle.id,
      plate: p.activeVehicle.plate,
      make: p.activeVehicle.make,
      model: p.activeVehicle.model,
      categoryCodes: p.activeVehicle.categoryCodes,
    } : null,
    enabledCategories: p.enabledCategories,
    driverDocuments: p.driverDocuments.map((d) => ({
      docType: d.docType,
      status: d.status,
      expiresAt: d.expiresAt?.toISOString().slice(0, 10),
    })),
    vehicleDocuments: p.vehicleDocuments.map((d) => ({
      docType: d.docType,
      status: d.status,
      expiresAt: d.expiresAt?.toISOString().slice(0, 10),
    })),
    operationalFlags: p.operationalFlags.map((f) => ({
      flagCode: f.flagCode,
      reason: f.reason,
    })),
  };
}
