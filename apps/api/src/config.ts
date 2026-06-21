import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function resolveDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!password) return undefined;

  const projectRef = process.env.SUPABASE_PROJECT_REF ?? 'scpwlhfqlfkvudkkzvaf';
  const hostRaw = process.env.SUPABASE_DB_HOST ?? `db.${projectRef}.supabase.co`;
  const host = hostRaw.includes(':') && !hostRaw.startsWith('[') ? `[${hostRaw}]` : hostRaw;
  const port = process.env.SUPABASE_DB_PORT ?? '5432';
  const user = process.env.SUPABASE_DB_USER ?? 'postgres';
  const database = process.env.SUPABASE_DB_NAME ?? 'postgres';

  return `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

const databaseUrl = resolveDatabaseUrl();
const useMemoryDb = !databaseUrl;

export const config = {
  port: Number(process.env.PORT ?? 3000),
  useMemoryDb,
  databaseUrl: databaseUrl ?? '',
  jwtSecret: process.env.JWT_SECRET ?? (useMemoryDb ? 'bc-taxi-dev-secret' : required('JWT_SECRET')),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  mapboxAccessToken: process.env.MAPBOX_ACCESS_TOKEN ?? '',
  mapboxDefaultCenter: {
    lat: Number(process.env.MAPBOX_DEFAULT_LAT ?? -26.9194),
    lng: Number(process.env.MAPBOX_DEFAULT_LNG ?? -49.0661),
  },
  rideCodeSecret:
    process.env.RIDE_CODE_SECRET ?? (useMemoryDb ? 'bc-taxi-ride-code-dev' : required('RIDE_CODE_SECRET')),
  redisUrl: process.env.REDIS_URL ?? '',
  defaultPricingRegionId: process.env.DEFAULT_PRICING_REGION_ID ?? '00000000-0000-4000-8000-000000000010',
  defaultServiceRegionId: process.env.DEFAULT_SERVICE_REGION_ID ?? '00000000-0000-4000-8000-000000000020',
  weatherApiEnabled: process.env.WEATHER_API_ENABLED !== 'false',
  pspProvider: process.env.PSP_PROVIDER ?? 'demo',
  pspApiUrl: process.env.PSP_API_URL ?? '',
  pspApiSecret: process.env.PSP_API_SECRET ?? '',
  pspWebhookSecret: process.env.PSP_WEBHOOK_SECRET ?? '',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
  stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  mercadoPagoAccessToken: process.env.MERCADOPAGO_ACCESS_TOKEN ?? '',
  pagarmeApiKey: process.env.PAGARME_API_KEY ?? '',
  matchUsePostgis: process.env.MATCH_USE_POSTGIS !== 'false',
  pushNotificationsEnabled: process.env.PUSH_NOTIFICATIONS_ENABLED !== 'false',
  pushProvider: process.env.PUSH_PROVIDER ?? 'demo',
  fcmServerKey: process.env.FCM_SERVER_KEY ?? '',
  adminApiKey: process.env.ADMIN_API_KEY ?? '',
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  openaiModel: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
  aiInsightsEnabled: process.env.AI_INSIGHTS_ENABLED !== 'false',
};
