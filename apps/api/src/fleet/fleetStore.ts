import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';
import type {
  DriverDocumentRecord,
  OperationalFlagRecord,
  VehicleDocumentRecord,
  VehicleRecord,
} from './types.js';

const memoryVehicles = new Map<string, VehicleRecord>();
const memoryDriverDocs = new Map<string, DriverDocumentRecord[]>();
const memoryVehicleDocs = new Map<string, VehicleDocumentRecord[]>();
const memoryDriverCategories = new Map<string, string[]>();
const memoryFlags = new Map<string, OperationalFlagRecord[]>();

function useMemory() {
  return config.useMemoryDb;
}

function isDocValid(doc: { status: string; expiresAt?: Date }, today = new Date()): boolean {
  if (doc.status !== 'approved') return false;
  if (!doc.expiresAt) return true;
  const exp = new Date(doc.expiresAt);
  exp.setHours(23, 59, 59, 999);
  return exp.getTime() >= today.getTime();
}

export function seedDemoFleetCompliance(driverId: string, categoryCodes: string[], opts?: {
  wheelchairAccessible?: boolean;
  petReady?: boolean;
  comfortApproved?: boolean;
}) {
  const vehicleId = randomUUID();
  const vehicle: VehicleRecord = {
    id: vehicleId,
    driverId,
    plate: `DEMO-${driverId.slice(0, 4).toUpperCase()}`,
    make: 'Demo',
    model: 'Sedan',
    year: new Date().getFullYear() - 5,
    bodyType: 'hatch',
    seatCount: 4,
    wheelchairAccessible: opts?.wheelchairAccessible ?? false,
    petReady: opts?.petReady ?? false,
    comfortApproved: opts?.comfortApproved ?? false,
    status: 'active',
    categoryCodes,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  memoryVehicles.set(vehicleId, vehicle);

  const farFuture = new Date();
  farFuture.setFullYear(farFuture.getFullYear() + 2);

  memoryDriverDocs.set(driverId, [
    {
      id: randomUUID(),
      driverId,
      docType: 'CNH',
      status: 'approved',
      expiresAt: farFuture,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: randomUUID(),
      driverId,
      docType: 'EAR_PROOF',
      status: 'approved',
      expiresAt: farFuture,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);

  memoryVehicleDocs.set(vehicleId, [
    {
      id: randomUUID(),
      vehicleId,
      docType: 'CRLV',
      status: 'approved',
      expiresAt: farFuture,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: randomUUID(),
      vehicleId,
      docType: 'INSURANCE',
      status: 'approved',
      expiresAt: farFuture,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);

  if (opts?.comfortApproved) {
    memoryVehicleDocs.get(vehicleId)!.push({
      id: randomUUID(),
      vehicleId,
      docType: 'COMFORT_CHECKLIST',
      status: 'approved',
      expiresAt: farFuture,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  if (opts?.wheelchairAccessible) {
    memoryVehicleDocs.get(vehicleId)!.push({
      id: randomUUID(),
      vehicleId,
      docType: 'PCD_ADAPTATION',
      status: 'approved',
      expiresAt: farFuture,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  memoryDriverCategories.set(driverId, categoryCodes);
  memoryFlags.set(driverId, []);
  return vehicle;
}

export async function listDriverVehicles(driverId: string): Promise<VehicleRecord[]> {
  if (useMemory()) {
    return [...memoryVehicles.values()].filter((v) => v.driverId === driverId && v.status === 'active');
  }

  const { rows } = await pool.query(
    `SELECT v.*, COALESCE(array_agg(vc.category_code) FILTER (WHERE vc.category_code IS NOT NULL), '{}') AS category_codes
     FROM vehicles v
     LEFT JOIN vehicle_categories vc ON vc.vehicle_id = v.id
     WHERE v.driver_id = $1 AND v.deleted_at IS NULL
     GROUP BY v.id
     ORDER BY v.created_at DESC`,
    [driverId],
  );
  return rows.map(mapVehicleRow);
}

export async function createVehicle(
  driverId: string,
  input: {
    plate: string;
    make: string;
    model: string;
    year: number;
    color?: string;
    bodyType?: string;
    seatCount?: number;
    wheelchairAccessible?: boolean;
    petReady?: boolean;
    comfortApproved?: boolean;
    categoryCodes?: string[];
  },
): Promise<VehicleRecord> {
  if (useMemory()) {
    const vehicle: VehicleRecord = {
      id: randomUUID(),
      driverId,
      plate: input.plate.toUpperCase(),
      make: input.make,
      model: input.model,
      year: input.year,
      color: input.color,
      bodyType: input.bodyType ?? 'hatch',
      seatCount: input.seatCount ?? 4,
      wheelchairAccessible: input.wheelchairAccessible ?? false,
      petReady: input.petReady ?? false,
      comfortApproved: input.comfortApproved ?? false,
      status: 'active',
      categoryCodes: input.categoryCodes ?? ['economico'],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    memoryVehicles.set(vehicle.id, vehicle);
    if (input.categoryCodes?.length) {
      memoryDriverCategories.set(driverId, [...new Set([...(memoryDriverCategories.get(driverId) ?? []), ...input.categoryCodes])]);
    }
    return vehicle;
  }

  const { rows } = await pool.query(
    `INSERT INTO vehicles
       (driver_id, plate, make, model, year, color, body_type, seat_count,
        wheelchair_accessible, pet_ready, comfort_approved)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      driverId,
      input.plate.toUpperCase(),
      input.make,
      input.model,
      input.year,
      input.color ?? null,
      input.bodyType ?? 'hatch',
      input.seatCount ?? 4,
      input.wheelchairAccessible ?? false,
      input.petReady ?? false,
      input.comfortApproved ?? false,
    ],
  );
  const vehicle = mapVehicleRow({ ...rows[0], category_codes: [] });

  for (const code of input.categoryCodes ?? ['economico']) {
    await pool.query(
      `INSERT INTO vehicle_categories (vehicle_id, category_code) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [vehicle.id, code],
    );
    await pool.query(
      `INSERT INTO driver_categories (driver_id, category_code) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [driverId, code],
    );
  }

  return { ...vehicle, categoryCodes: input.categoryCodes ?? ['economico'] };
}

export async function upsertDriverDocument(
  driverId: string,
  input: { docType: string; status?: string; expiresAt?: string },
): Promise<DriverDocumentRecord> {
  if (useMemory()) {
    const list = memoryDriverDocs.get(driverId) ?? [];
    const existing = list.find((d) => d.docType === input.docType);
    const record: DriverDocumentRecord = {
      id: existing?.id ?? randomUUID(),
      driverId,
      docType: input.docType as DriverDocumentRecord['docType'],
      status: (input.status as DriverDocumentRecord['status']) ?? 'approved',
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
      createdAt: existing?.createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    memoryDriverDocs.set(driverId, [...list.filter((d) => d.docType !== input.docType), record]);
    return record;
  }

  const existing = await pool.query(
    `SELECT id FROM driver_documents WHERE driver_id = $1 AND doc_type = $2 AND deleted_at IS NULL`,
    [driverId, input.docType],
  );
  if (existing.rowCount) {
    const { rows } = await pool.query(
      `UPDATE driver_documents SET status = $3, expires_at = $4, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [existing.rows[0].id, driverId, input.status ?? 'approved', input.expiresAt ?? null],
    );
    return mapDriverDocRow(rows[0]);
  }

  const { rows } = await pool.query(
    `INSERT INTO driver_documents (driver_id, doc_type, status, expires_at)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [driverId, input.docType, input.status ?? 'approved', input.expiresAt ?? null],
  );
  return mapDriverDocRow(rows[0]);
}

export async function upsertVehicleDocument(
  vehicleId: string,
  input: { docType: string; status?: string; expiresAt?: string },
): Promise<VehicleDocumentRecord> {
  if (useMemory()) {
    const list = memoryVehicleDocs.get(vehicleId) ?? [];
    const existing = list.find((d) => d.docType === input.docType);
    const record: VehicleDocumentRecord = {
      id: existing?.id ?? randomUUID(),
      vehicleId,
      docType: input.docType as VehicleDocumentRecord['docType'],
      status: (input.status as VehicleDocumentRecord['status']) ?? 'approved',
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
      createdAt: existing?.createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    memoryVehicleDocs.set(vehicleId, [...list.filter((d) => d.docType !== input.docType), record]);
    return record;
  }

  const existing = await pool.query(
    `SELECT id FROM vehicle_documents WHERE vehicle_id = $1 AND doc_type = $2 AND deleted_at IS NULL`,
    [vehicleId, input.docType],
  );
  if (existing.rowCount) {
    const { rows } = await pool.query(
      `UPDATE vehicle_documents SET status = $3, expires_at = $4, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [existing.rows[0].id, vehicleId, input.status ?? 'approved', input.expiresAt ?? null],
    );
    return mapVehicleDocRow(rows[0]);
  }

  const { rows } = await pool.query(
    `INSERT INTO vehicle_documents (vehicle_id, doc_type, status, expires_at)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [vehicleId, input.docType, input.status ?? 'approved', input.expiresAt ?? null],
  );
  return mapVehicleDocRow(rows[0]);
}

export async function listDriverDocuments(driverId: string): Promise<DriverDocumentRecord[]> {
  if (useMemory()) return memoryDriverDocs.get(driverId) ?? [];

  const { rows } = await pool.query(
    `SELECT * FROM driver_documents WHERE driver_id = $1 AND deleted_at IS NULL`,
    [driverId],
  );
  return rows.map(mapDriverDocRow);
}

export async function listVehicleDocuments(vehicleId: string): Promise<VehicleDocumentRecord[]> {
  if (useMemory()) return memoryVehicleDocs.get(vehicleId) ?? [];

  const { rows } = await pool.query(
    `SELECT * FROM vehicle_documents WHERE vehicle_id = $1 AND deleted_at IS NULL`,
    [vehicleId],
  );
  return rows.map(mapVehicleDocRow);
}

export async function listOperationalFlags(driverId: string): Promise<OperationalFlagRecord[]> {
  if (useMemory()) {
    return (memoryFlags.get(driverId) ?? []).filter(
      (f) => f.isActive && (!f.expiresAt || f.expiresAt.getTime() > Date.now()),
    );
  }

  const { rows } = await pool.query(
    `SELECT * FROM driver_operational_flags
     WHERE driver_id = $1 AND is_active = TRUE
       AND (expires_at IS NULL OR expires_at > NOW())`,
    [driverId],
  );
  return rows.map(mapFlagRow);
}

export async function getPrimaryActiveVehicle(driverId: string): Promise<VehicleRecord | null> {
  const vehicles = await listDriverVehicles(driverId);
  return vehicles.find((v) => v.status === 'active') ?? null;
}

export async function getDriverEnabledCategoriesFromFleet(driverId: string): Promise<string[]> {
  if (useMemory()) return memoryDriverCategories.get(driverId) ?? [];

  const { rows } = await pool.query(
    `SELECT category_code FROM driver_categories WHERE driver_id = $1`,
    [driverId],
  );
  return rows.map((r) => r.category_code as string);
}

export { isDocValid };

function mapVehicleRow(row: Record<string, unknown>): VehicleRecord {
  const codes = row.category_codes;
  return {
    id: row.id as string,
    driverId: row.driver_id as string,
    plate: row.plate as string,
    make: row.make as string,
    model: row.model as string,
    year: Number(row.year),
    color: (row.color as string) ?? undefined,
    bodyType: row.body_type as string,
    seatCount: Number(row.seat_count),
    trunkCapacityL: row.trunk_capacity_l != null ? Number(row.trunk_capacity_l) : undefined,
    wheelchairAccessible: Boolean(row.wheelchair_accessible),
    petReady: Boolean(row.pet_ready),
    comfortApproved: Boolean(row.comfort_approved),
    status: row.status as VehicleRecord['status'],
    categoryCodes: Array.isArray(codes) ? (codes as string[]) : [],
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function mapDriverDocRow(row: Record<string, unknown>): DriverDocumentRecord {
  return {
    id: row.id as string,
    driverId: row.driver_id as string,
    docType: row.doc_type as DriverDocumentRecord['docType'],
    status: row.status as DriverDocumentRecord['status'],
    expiresAt: row.expires_at ? new Date(row.expires_at as string) : undefined,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function mapVehicleDocRow(row: Record<string, unknown>): VehicleDocumentRecord {
  return {
    id: row.id as string,
    vehicleId: row.vehicle_id as string,
    docType: row.doc_type as VehicleDocumentRecord['docType'],
    status: row.status as VehicleDocumentRecord['status'],
    expiresAt: row.expires_at ? new Date(row.expires_at as string) : undefined,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function mapFlagRow(row: Record<string, unknown>): OperationalFlagRecord {
  return {
    id: row.id as string,
    driverId: row.driver_id as string,
    flagCode: row.flag_code as string,
    isActive: Boolean(row.is_active),
    reason: (row.reason as string) ?? undefined,
    expiresAt: row.expires_at ? new Date(row.expires_at as string) : undefined,
  };
}

export function toPublicVehicle(v: VehicleRecord) {
  return {
    id: v.id,
    plate: v.plate,
    make: v.make,
    model: v.model,
    year: v.year,
    color: v.color,
    bodyType: v.bodyType,
    seatCount: v.seatCount,
    wheelchairAccessible: v.wheelchairAccessible,
    petReady: v.petReady,
    comfortApproved: v.comfortApproved,
    status: v.status,
    categoryCodes: v.categoryCodes,
  };
}

export function toPublicDocument(d: DriverDocumentRecord | VehicleDocumentRecord) {
  return {
    id: d.id,
    docType: 'docType' in d ? d.docType : (d as VehicleDocumentRecord).docType,
    status: d.status,
    expiresAt: d.expiresAt?.toISOString().slice(0, 10),
  };
}
