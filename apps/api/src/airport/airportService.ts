import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';
import { haversineKm } from '../mapbox/mockPlaces.js';
import { useMemory, memoryMatchStore } from '../stores/memoryMatchStore.js';

export interface AirportZone {
  id: string;
  regionId?: string;
  iataCode?: string;
  name: string;
  terminalCode?: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  pickupInstructions?: string;
  isActive: boolean;
}

export interface AirportTerminalFee {
  id: string;
  zoneId: string;
  feeCentavos: number;
  feeLabel: string;
  appliesTo: 'pickup' | 'dropoff' | 'both';
  isActive: boolean;
}

export interface AirportContext {
  isAirportRide: boolean;
  pickupZone?: AirportZone;
  dropoffZone?: AirportZone;
  airportFeeCentavos: number;
  feeLabel?: string;
  pickupInstructions?: string;
  pricingMode: 'standard' | 'airport_category';
  airportPressure: number;
}

const DEMO_ZONE_ID = '00000000-0000-4000-8000-000000000301';
const DEMO_FEE_ID = '00000000-0000-4000-8000-000000000302';

const memoryZones: AirportZone[] = [
  {
    id: DEMO_ZONE_ID,
    regionId: '00000000-0000-4000-8000-000000000020',
    iataCode: 'NVT',
    name: 'Aeroporto Ministro Victor Konder',
    terminalCode: 'MAIN',
    centerLat: -26.8799,
    centerLng: -48.6514,
    radiusKm: 3,
    pickupInstructions:
      'Desembarque na área oficial de aplicativos. Aguarde o motorista no ponto indicado pelo app.',
    isActive: true,
  },
];

const memoryFees: AirportTerminalFee[] = [
  {
    id: DEMO_FEE_ID,
    zoneId: DEMO_ZONE_ID,
    feeCentavos: 0,
    feeLabel: 'Taxa aeroportuária',
    appliesTo: 'pickup',
    isActive: true,
  },
];

function mapZone(row: Record<string, unknown>): AirportZone {
  return {
    id: row.id as string,
    regionId: (row.region_id as string) ?? undefined,
    iataCode: (row.iata_code as string) ?? undefined,
    name: row.name as string,
    terminalCode: (row.terminal_code as string) ?? undefined,
    centerLat: Number(row.center_lat),
    centerLng: Number(row.center_lng),
    radiusKm: Number(row.radius_km),
    pickupInstructions: (row.pickup_instructions as string) ?? undefined,
    isActive: Boolean(row.is_active),
  };
}

function mapFee(row: Record<string, unknown>): AirportTerminalFee {
  return {
    id: row.id as string,
    zoneId: row.zone_id as string,
    feeCentavos: Number(row.fee_centavos),
    feeLabel: row.fee_label as string,
    appliesTo: row.applies_to as AirportTerminalFee['appliesTo'],
    isActive: Boolean(row.is_active),
  };
}

function pointInZone(lat: number, lng: number, zone: AirportZone): boolean {
  return haversineKm(lat, lng, zone.centerLat, zone.centerLng) <= zone.radiusKm;
}

export async function listAirportZones(): Promise<AirportZone[]> {
  if (config.useMemoryDb) return memoryZones.filter((z) => z.isActive);
  const { rows } = await pool.query(
    `SELECT * FROM airport_zones WHERE is_active = TRUE ORDER BY name`,
  );
  return rows.map(mapZone);
}

async function getActiveFeesForZone(zoneId: string): Promise<AirportTerminalFee[]> {
  if (config.useMemoryDb) {
    return memoryFees.filter((f) => f.isActive && f.zoneId === zoneId);
  }
  const { rows } = await pool.query(
    `SELECT * FROM airport_terminal_fees
     WHERE zone_id = $1 AND is_active = TRUE AND effective_from <= NOW()
     ORDER BY effective_from DESC`,
    [zoneId],
  );
  return rows.map(mapFee);
}

function feeForRole(fees: AirportTerminalFee[], role: 'pickup' | 'dropoff'): number {
  let total = 0;
  for (const fee of fees) {
    if (fee.appliesTo === role || fee.appliesTo === 'both') {
      total += fee.feeCentavos;
    }
  }
  return total;
}

export async function detectZoneAt(lat: number, lng: number): Promise<AirportZone | undefined> {
  const zones = await listAirportZones();
  for (const zone of zones) {
    if (pointInZone(lat, lng, zone)) return zone;
  }
  return undefined;
}

export async function listZonesNear(lat: number, lng: number): Promise<AirportZone[]> {
  const zones = await listAirportZones();
  return zones.filter((z) => pointInZone(lat, lng, z));
}

async function countAirportDemandSupply(zone: AirportZone): Promise<{ rides: number; drivers: number }> {
  if (config.useMemoryDb) {
    const drivers = (await memoryMatchStore.findOnlineDrivers()).filter(
      (d) => d.isOnline && d.lat != null && d.lng != null && pointInZone(d.lat, d.lng, zone),
    );
    return { rides: 2, drivers: Math.max(1, drivers.length) };
  }

  const radiusM = zone.radiusKm * 1000;
  const { rows: rideRows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM rides
     WHERE status IN ('REQUESTED','OFFERING','DRIVER_ASSIGNED','DRIVER_ARRIVED','IN_PROGRESS')
       AND (
         (6371000 * acos(
           LEAST(1, GREATEST(-1,
             cos(radians($1)) * cos(radians(pickup_lat)) * cos(radians(pickup_lng) - radians($2))
             + sin(radians($1)) * sin(radians(pickup_lat))
           ))
         )) <= $3
         OR
         (6371000 * acos(
           LEAST(1, GREATEST(-1,
             cos(radians($1)) * cos(radians(dropoff_lat)) * cos(radians(dropoff_lng) - radians($2))
             + sin(radians($1)) * sin(radians(dropoff_lat))
           ))
         )) <= $3
       )`,
    [zone.centerLat, zone.centerLng, radiusM],
  );

  const { rows: driverRows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM drivers
     WHERE is_online = TRUE AND operational_status = 'online'
       AND lat IS NOT NULL AND lng IS NOT NULL
       AND (6371000 * acos(
         LEAST(1, GREATEST(-1,
           cos(radians($1)) * cos(radians(lat)) * cos(radians(lng) - radians($2))
           + sin(radians($1)) * sin(radians(lat))
         ))
       )) <= $3`,
    [zone.centerLat, zone.centerLng, radiusM],
  );

  return {
    rides: rideRows[0]?.c ?? 0,
    drivers: Math.max(1, driverRows[0]?.c ?? 1),
  };
}

/** Pressão local no aeroporto (demanda/oferta). Sem fila virtual — só afeta multiplicador dinâmico. */
export async function computeAirportPressure(
  lat?: number,
  lng?: number,
  _categoryCode?: string,
): Promise<number> {
  const zones =
    lat != null && lng != null ? await listZonesNear(lat, lng) : await listAirportZones();
  if (zones.length === 0) return 0;

  let maxPressure = 0;
  for (const zone of zones) {
    const { rides, drivers } = await countAirportDemandSupply(zone);
    const ratio = rides / drivers;
    let pressure = Math.max(0, (ratio - 0.6) * 0.25);
    if (lat != null && lng != null) {
      const dist = haversineKm(lat, lng, zone.centerLat, zone.centerLng);
      const proximity = Math.max(0, 1 - dist / zone.radiusKm);
      pressure *= 0.4 + proximity * 0.6;
    }
    maxPressure = Math.max(maxPressure, pressure);
  }

  return Math.min(0.35, maxPressure);
}

export async function resolveAirportContext(input: {
  fromLat?: number;
  fromLng?: number;
  toLat?: number;
  toLng?: number;
  categoryCode?: string;
  airportFeeOverrideCentavos?: number;
}): Promise<AirportContext> {
  const pickupZone =
    input.fromLat != null && input.fromLng != null
      ? await detectZoneAt(input.fromLat, input.fromLng)
      : undefined;
  const dropoffZone =
    input.toLat != null && input.toLng != null
      ? await detectZoneAt(input.toLat, input.toLng)
      : undefined;

  const isAirportRide =
    Boolean(pickupZone || dropoffZone) || input.categoryCode === 'aeroporto';

  let airportFeeCentavos = input.airportFeeOverrideCentavos ?? 0;
  let feeLabel: string | undefined;

  if (input.airportFeeOverrideCentavos == null) {
    if (pickupZone) {
      const fees = await getActiveFeesForZone(pickupZone.id);
      airportFeeCentavos += feeForRole(fees, 'pickup');
      feeLabel = fees[0]?.feeLabel;
    }
    if (dropoffZone && dropoffZone.id !== pickupZone?.id) {
      const fees = await getActiveFeesForZone(dropoffZone.id);
      airportFeeCentavos += feeForRole(fees, 'dropoff');
      feeLabel = feeLabel ?? fees[0]?.feeLabel;
    }
  }

  const pressureLat = input.fromLat ?? pickupZone?.centerLat ?? dropoffZone?.centerLat;
  const pressureLng = input.fromLng ?? pickupZone?.centerLng ?? dropoffZone?.centerLng;
  const airportPressure = isAirportRide
    ? await computeAirportPressure(pressureLat, pressureLng, input.categoryCode)
    : 0;

  return {
    isAirportRide,
    pickupZone,
    dropoffZone,
    airportFeeCentavos,
    feeLabel,
    pickupInstructions: pickupZone?.pickupInstructions ?? dropoffZone?.pickupInstructions,
    pricingMode: input.categoryCode === 'aeroporto' ? 'airport_category' : 'standard',
    airportPressure,
  };
}

export async function captureRideAirportSnapshot(input: {
  rideId: string;
  context: AirportContext;
}) {
  const { rideId, context } = input;
  const payload = {
    pickupZoneId: context.pickupZone?.id ?? null,
    dropoffZoneId: context.dropoffZone?.id ?? null,
    airportFeeCentavos: context.airportFeeCentavos,
    airportPressure: context.airportPressure,
    pricingMode: context.pricingMode,
    metadata: {
      pickupIata: context.pickupZone?.iataCode,
      dropoffIata: context.dropoffZone?.iataCode,
      feeLabel: context.feeLabel,
    },
  };

  if (config.useMemoryDb) return { id: randomUUID(), ...payload };

  const { rows } = await pool.query(
    `INSERT INTO ride_airport_snapshots
       (ride_id, pickup_zone_id, dropoff_zone_id, airport_fee_centavos, airport_pressure, pricing_mode, metadata_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id`,
    [
      rideId,
      payload.pickupZoneId,
      payload.dropoffZoneId,
      payload.airportFeeCentavos,
      payload.airportPressure,
      payload.pricingMode,
      JSON.stringify(payload.metadata),
    ],
  );
  return { id: rows[0].id as string, ...payload };
}

export async function upsertAirportZone(input: {
  name: string;
  iataCode?: string;
  terminalCode?: string;
  centerLat: number;
  centerLng: number;
  radiusKm?: number;
  pickupInstructions?: string;
  regionId?: string;
  feeCentavos?: number;
}): Promise<AirportZone> {
  const zone: AirportZone = {
    id: randomUUID(),
    regionId: input.regionId ?? config.defaultServiceRegionId,
    iataCode: input.iataCode,
    name: input.name,
    terminalCode: input.terminalCode,
    centerLat: input.centerLat,
    centerLng: input.centerLng,
    radiusKm: input.radiusKm ?? 2.5,
    pickupInstructions: input.pickupInstructions,
    isActive: true,
  };

  if (config.useMemoryDb) {
    memoryZones.push(zone);
    if (input.feeCentavos != null) {
      memoryFees.push({
        id: randomUUID(),
        zoneId: zone.id,
        feeCentavos: input.feeCentavos,
        feeLabel: 'Taxa aeroportuária',
        appliesTo: 'pickup',
        isActive: true,
      });
    }
    return zone;
  }

  const { rows } = await pool.query(
    `INSERT INTO airport_zones
       (id, region_id, iata_code, name, terminal_code, center_lat, center_lng, radius_km, pickup_instructions)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      zone.id,
      zone.regionId ?? null,
      zone.iataCode ?? null,
      zone.name,
      zone.terminalCode ?? null,
      zone.centerLat,
      zone.centerLng,
      zone.radiusKm,
      zone.pickupInstructions ?? null,
    ],
  );

  if (input.feeCentavos != null) {
    await pool.query(
      `INSERT INTO airport_terminal_fees (zone_id, fee_centavos, fee_label, applies_to)
       VALUES ($1,$2,'Taxa aeroportuária','pickup')`,
      [zone.id, input.feeCentavos],
    );
  }

  return mapZone(rows[0]);
}

export function toPublicZone(z: AirportZone) {
  return {
    id: z.id,
    iataCode: z.iataCode,
    name: z.name,
    terminalCode: z.terminalCode,
    centerLat: z.centerLat,
    centerLng: z.centerLng,
    radiusKm: z.radiusKm,
    pickupInstructions: z.pickupInstructions,
  };
}

export function toPublicContext(ctx: AirportContext) {
  return {
    isAirportRide: ctx.isAirportRide,
    airportFeeCentavos: ctx.airportFeeCentavos,
    feeLabel: ctx.feeLabel,
    pickupInstructions: ctx.pickupInstructions,
    pricingMode: ctx.pricingMode,
    airportPressure: ctx.airportPressure,
    pickupZone: ctx.pickupZone ? toPublicZone(ctx.pickupZone) : undefined,
    dropoffZone: ctx.dropoffZone ? toPublicZone(ctx.dropoffZone) : undefined,
  };
}
