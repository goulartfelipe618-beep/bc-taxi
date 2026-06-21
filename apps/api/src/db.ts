import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const pool = config.useMemoryDb
  ? (null as unknown as pg.Pool)
  : new pg.Pool({
      connectionString: config.databaseUrl,
      ssl: config.databaseUrl.includes('supabase.co')
        ? { rejectUnauthorized: false }
        : undefined,
    });

export async function migrate() {
  if (config.useMemoryDb) return;
  const schemaDir = join(__dirname, '../../../database');
  for (const file of [
    'schema.sql',
    'schema_operational.sql',
    'schema_match.sql',
    'schema_payments.sql',
    'schema_lifecycle.sql',
    'schema_layer2.sql',
    'schema_camada3.sql',
    'schema_places.sql',
    'schema_vehicles.sql',
    'schema_camada4.sql',
    'schema_camada5.sql',
    'schema_camada6.sql',
    'schema_camada7.sql',
    'schema_camada8.sql',
    'schema_camada9.sql',
    'schema_camada10.sql',
    'schema_camada11.sql',
    'schema_camada12.sql',
    'schema_camada13.sql',
    'schema_camada14.sql',
    'schema_camada15.sql',
    'schema_camada16.sql',
    'schema_camada17.sql',
    'schema_camada18.sql',
    'schema_camada19.sql',
    'schema_camada20.sql',
    'schema_camada21.sql',
    'schema_camada22.sql',
    'schema_camada23.sql',
    'schema_camada24.sql',
    'schema_camada25.sql',
    'schema_camada26.sql',
    'schema_camada27.sql',
    'schema_camada28.sql',
    'schema_camada29.sql',
  ]) {
    const schemaPath = join(schemaDir, file);
    const sql = readFileSync(schemaPath, 'utf8');
    await pool.query(sql);
  }
  const { seedRideCategories } = await import('./seed/rideCategories.js');
  await seedRideCategories(pool);
}

export type DbUser = {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  phone: string | null;
  role: 'passenger' | 'driver';
  created_at: Date;
};

export function toPublicUser(user: DbUser) {
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    phone: user.phone,
    role: user.role,
  };
}
