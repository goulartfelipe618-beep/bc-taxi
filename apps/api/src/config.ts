import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

const databaseUrl = process.env.DATABASE_URL;
const useMemoryDb = !databaseUrl;

export const config = {
  port: Number(process.env.PORT ?? 3000),
  useMemoryDb,
  databaseUrl: databaseUrl ?? '',
  jwtSecret: process.env.JWT_SECRET ?? (useMemoryDb ? 'bc-taxi-dev-secret' : required('JWT_SECRET')),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
};
