import 'dotenv/config';
import pg from 'pg';

const p = process.env;
const hostRaw = p.SUPABASE_DB_HOST ?? `db.${p.SUPABASE_PROJECT_REF}.supabase.co`;
const host = hostRaw.includes(':') && !hostRaw.startsWith('[') ? `[${hostRaw}]` : hostRaw;
const url = `postgresql://${p.SUPABASE_DB_USER}:${encodeURIComponent(p.SUPABASE_DB_PASSWORD ?? '')}@${host}:${p.SUPABASE_DB_PORT}/postgres`;

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  const result = await pool.query('SELECT 1 AS ok');
  console.log('DB OK:', result.rows[0]);
} catch (err) {
  console.error('DB FAIL:', err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await pool.end();
}
