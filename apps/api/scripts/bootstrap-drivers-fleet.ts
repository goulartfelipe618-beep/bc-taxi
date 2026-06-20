/**
 * Garante linha em drivers + driver_categories para motoristas já existentes no Supabase.
 * Uso: npm run bootstrap:drivers (com DATABASE_URL ou SUPABASE_DB_PASSWORD configurados)
 */
import { pool } from '../src/db.js';
import { ensureDriverFleetBootstrap } from '../src/fleet/driverProfileSync.js';

async function main() {
  const { rows } = await pool.query(
    `SELECT u.id FROM users u WHERE u.role = 'driver' ORDER BY u.created_at`,
  );
  console.log(`Motoristas encontrados: ${rows.length}`);

  for (const row of rows) {
    await ensureDriverFleetBootstrap(row.id as string);
  }

  const synced = await pool.query(
    `UPDATE drivers d SET enabled_categories = sub.cats
     FROM (
       SELECT dc.driver_id,
         COALESCE(array_agg(dc.category_code ORDER BY dc.category_code), ARRAY['economico']::text[]) AS cats
       FROM driver_categories dc
       GROUP BY dc.driver_id
     ) sub
     WHERE d.user_id = sub.driver_id
       AND d.enabled_categories IS DISTINCT FROM sub.cats`,
  );
  console.log(`Perfis sincronizados: ${synced.rowCount ?? 0}`);
  console.log('Bootstrap concluído');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
