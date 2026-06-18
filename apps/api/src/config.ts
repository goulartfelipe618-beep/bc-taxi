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
  const host = process.env.SUPABASE_DB_HOST ?? `db.${projectRef}.supabase.co`;
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
};
