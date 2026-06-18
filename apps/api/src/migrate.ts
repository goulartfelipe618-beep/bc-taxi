import 'dotenv/config';
import { migrate, pool } from './db.js';

async function main() {
  await migrate();
  console.log('Migration completed');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
