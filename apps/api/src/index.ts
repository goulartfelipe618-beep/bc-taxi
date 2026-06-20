import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { migrate, pool } from './db.js';
import { startRedisFanout } from './realtime/eventBus.js';
import { attachWebSocketServer } from './realtime/wsServer.js';
import { wsHub } from './realtime/wsHub.js';
import { authRouter } from './routes/auth.js';
import { categoriesRouter, configRouter, quotesRouter } from './routes/catalog.js';
import { placesRouter, routesRouter } from './routes/mapbox.js';
import { paymentsRouter } from './routes/payments.js';
import { pricingRouter } from './routes/pricing.js';
import { driverRouter, ridesRouter } from './routes/rides.js';
import { driverFleetRouter } from './routes/driverFleet.js';

async function main() {
  await migrate();
  if (config.useMemoryDb) {
    console.log('Running in memory mode (no DATABASE_URL)');
  } else {
    console.log('Database schema ready');
  }

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      mode: config.useMemoryDb ? 'memory' : 'postgres',
      redis: Boolean(config.redisUrl),
      wsConnections: wsHub.stats().connections,
    });
  });

  app.use('/auth', authRouter);
  app.use('/v1/categories', categoriesRouter);
  app.use('/v1/quotes', quotesRouter);
  app.use('/v1/pricing', pricingRouter);
  app.use('/v1/config', configRouter);
  app.use('/v1/places', placesRouter);
  app.use('/v1/routes', routesRouter);
  app.use('/v1/payments', paymentsRouter);
  app.use('/v1/rides', ridesRouter);
  app.use('/v1/driver', driverRouter);
  app.use('/v1/driver/fleet', driverFleetRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' });
  });

  const server = createServer(app);
  attachWebSocketServer(server);
  const stopRedisFanout = startRedisFanout();

  server.listen(config.port, () => {
    console.log(`BC Taxi API running on http://localhost:${config.port} (WS /ws)`);
  });

  process.on('SIGINT', async () => {
    stopRedisFanout?.();
    if (!config.useMemoryDb && pool) await pool.end();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Failed to start API:', err.message);
  process.exit(1);
});
