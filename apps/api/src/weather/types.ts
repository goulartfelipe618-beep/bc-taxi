export type WeatherState = 'CLEAR' | 'LIGHT_RAIN' | 'MODERATE_RAIN' | 'HEAVY_RAIN' | 'STORM';

export interface WeatherSnapshot {
  regionId: string;
  weatherState: WeatherState;
  intensityIndex: number;
  weatherPressure: number;
  precipitationMm: number;
  confidence: number;
  snapshotAt: Date;
  source: string;
}

export const WEATHER_PRESSURE: Record<WeatherState, number> = {
  CLEAR: 0,
  LIGHT_RAIN: 0.1,
  MODERATE_RAIN: 0.3,
  HEAVY_RAIN: 0.5,
  STORM: 0.72,
};

export const MOTO_BLOCKED_WEATHER: WeatherState[] = ['HEAVY_RAIN', 'STORM'];
