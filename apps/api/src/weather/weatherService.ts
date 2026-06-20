import { config } from '../config.js';
import { pool } from '../db.js';
import { useMemory } from '../stores/memoryMatchStore.js';
import {
  MOTO_BLOCKED_WEATHER,
  WEATHER_PRESSURE,
  type WeatherSnapshot,
  type WeatherState,
} from './types.js';


const CACHE_TTL_MS = 5 * 60_000;

const memoryCache = new Map<string, WeatherSnapshot>();

function classifyFromPrecipitation(mm: number, weatherCode: number): WeatherState {
  if (weatherCode >= 95) return 'STORM';
  if (mm >= 7.5 || weatherCode >= 82) return 'HEAVY_RAIN';
  if (mm >= 2.5 || weatherCode >= 61) return 'MODERATE_RAIN';
  if (mm > 0.1 || (weatherCode >= 51 && weatherCode <= 67)) return 'LIGHT_RAIN';
  return 'CLEAR';
}

function intensityForState(state: WeatherState, precipitationMm: number): number {
  switch (state) {
    case 'STORM':
      return 1;
    case 'HEAVY_RAIN':
      return Math.min(1, 0.7 + precipitationMm / 20);
    case 'MODERATE_RAIN':
      return Math.min(0.7, 0.35 + precipitationMm / 10);
    case 'LIGHT_RAIN':
      return Math.min(0.35, 0.1 + precipitationMm / 5);
    default:
      return 0;
  }
}

async function fetchOpenMeteo(lat: number, lng: number): Promise<{ precipitation: number; weatherCode: number }> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lng));
  url.searchParams.set('current', 'precipitation,rain,weather_code');
  url.searchParams.set('timezone', 'America/Sao_Paulo');

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const data = (await res.json()) as {
    current?: { precipitation?: number; rain?: number; weather_code?: number };
  };
  const current = data.current ?? {};
  return {
    precipitation: Number(current.precipitation ?? current.rain ?? 0),
    weatherCode: Number(current.weather_code ?? 0),
  };
}

function buildSnapshot(
  regionId: string,
  lat: number,
  lng: number,
  precipitation: number,
  weatherCode: number,
): WeatherSnapshot {
  const weatherState = classifyFromPrecipitation(precipitation, weatherCode);
  const intensityIndex = intensityForState(weatherState, precipitation);
  return {
    regionId,
    weatherState,
    intensityIndex,
    weatherPressure: WEATHER_PRESSURE[weatherState],
    precipitationMm: precipitation,
    confidence: 0.85,
    snapshotAt: new Date(),
    source: 'open-meteo',
  };
}

async function persistSnapshot(snapshot: WeatherSnapshot, raw?: unknown) {
  if (useMemory()) return;
  await pool.query(
    `INSERT INTO weather_region_snapshots
       (region_id, weather_state, intensity_index, weather_pressure, precipitation_mm, confidence, source, raw_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      snapshot.regionId,
      snapshot.weatherState,
      snapshot.intensityIndex,
      snapshot.weatherPressure,
      snapshot.precipitationMm,
      snapshot.confidence,
      snapshot.source,
      raw ? JSON.stringify(raw) : null,
    ],
  );
}

export async function getWeatherAtPoint(
  lat: number,
  lng: number,
  regionId = config.defaultServiceRegionId,
): Promise<WeatherSnapshot> {
  const cacheKey = `${regionId}:${lat.toFixed(2)}:${lng.toFixed(2)}`;
  const cached = memoryCache.get(cacheKey);
  if (cached && Date.now() - cached.snapshotAt.getTime() < CACHE_TTL_MS) {
    return cached;
  }

  try {
    const { precipitation, weatherCode } = await fetchOpenMeteo(lat, lng);
    const snapshot = buildSnapshot(regionId, lat, lng, precipitation, weatherCode);
    memoryCache.set(cacheKey, snapshot);
    await persistSnapshot(snapshot, { precipitation, weatherCode });
    return snapshot;
  } catch {
    const fallback = buildSnapshot(regionId, lat, lng, 0, 0);
    memoryCache.set(cacheKey, fallback);
    return fallback;
  }
}

export async function getRegionalWeatherPressure(regionId = config.defaultServiceRegionId): Promise<number> {
  const { lat, lng } = config.mapboxDefaultCenter;
  const snapshot = await getWeatherAtPoint(lat, lng, regionId);
  return snapshot.weatherPressure;
}

export function isCategoryBlockedByWeather(categoryCode: string, weatherState: WeatherState): boolean {
  if (categoryCode !== 'moto') return false;
  return MOTO_BLOCKED_WEATHER.includes(weatherState);
}

export function getWeatherPublic(snapshot: WeatherSnapshot) {
  return {
    regionId: snapshot.regionId,
    weatherState: snapshot.weatherState,
    intensityIndex: snapshot.intensityIndex,
    weatherPressure: snapshot.weatherPressure,
    precipitationMm: snapshot.precipitationMm,
    motoBlocked: isCategoryBlockedByWeather('moto', snapshot.weatherState),
    snapshotAt: snapshot.snapshotAt.toISOString(),
  };
}
