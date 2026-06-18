import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { migrate, pool } from './db.js';
import { authRouter } from './routes/auth.js';

async function main() {
  await migrate();
  console.log('Database schema ready');

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/auth', authRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' });
  });

  app.listen(config.port, () => {
    console.log(`BC Taxi API running on http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start API:', err.message);
  process.exit(1);
});

process.on('SIGINT', async () => {
  await pool.end();
  process.exit(0);
});
