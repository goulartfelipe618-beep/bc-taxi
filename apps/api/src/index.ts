import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { migrate, pool } from './db.js';
import { startRedisFanout } from './realtime/eventBus.js';
import { attachWebSocketServer } from './realtime/wsServer.js';
import { wsHub } from './realtime/wsHub.js';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { categoriesRouter, configRouter, quotesRouter } from './routes/catalog.js';
import { fraudRouter } from './routes/fraud.js';
import { notificationsRouter } from './routes/notifications.js';
import { placesRouter, routesRouter } from './routes/mapbox.js';
import { paymentsRouter, pspWebhookHandler } from './routes/payments.js';
import { pricingRouter } from './routes/pricing.js';
import { receiptsRouter } from './routes/receipts.js';
import { reputationRouter } from './routes/reputation.js';
import { driverRouter, ridesRouter } from './routes/rides.js';
import { promotionsRouter } from './routes/promotions.js';
import { schedulingRouter } from './routes/scheduling.js';
import { corporateRouter } from './routes/corporate.js';
import { deliveriesRouter } from './routes/deliveries.js';
import { driverFleetRouter } from './routes/driverFleet.js';
import { startHeartbeatJanitor } from './driver/driverLocationService.js';
import { eventsRouter } from './routes/events.js';
import { governanceRouter } from './routes/governance.js';
import { airportsRouter } from './routes/airports.js';
import { sharedRouter } from './routes/shared.js';
import { startScheduleDispatcher } from './scheduling/scheduleService.js';
import { startSharedPoolDispatcher } from './shared/sharedRideService.js';
import { startOpsMetricsJanitor } from './observability/opsMetricsService.js';

async function main() {
  await migrate();
  if (config.useMemoryDb) {
    console.log('Running in memory mode (no DATABASE_URL)');
  } else {
    console.log('Database schema ready');
  }

  const app = express();
  app.use(cors());
  app.post('/v1/payments/webhooks/psp', express.raw({ type: 'application/json' }), pspWebhookHandler);
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
  app.use('/v1/reputation', reputationRouter);
  app.use('/v1/fraud', fraudRouter);
  app.use('/v1/notifications', notificationsRouter);
  app.use('/v1/receipts', receiptsRouter);
  app.use('/v1/admin', adminRouter);
  app.use('/v1/promotions', promotionsRouter);
  app.use('/v1/schedules', schedulingRouter);
  app.use('/v1/corporate', corporateRouter);
  app.use('/v1/deliveries', deliveriesRouter);
  app.use('/v1/events', eventsRouter);
  app.use('/v1/governance', governanceRouter);
  app.use('/v1/airports', airportsRouter);
  app.use('/v1/shared', sharedRouter);
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
  const stopHeartbeatJanitor = startHeartbeatJanitor();
  const stopScheduleDispatcher = startScheduleDispatcher();
  const stopSharedDispatcher = startSharedPoolDispatcher();
  const stopOpsJanitor = startOpsMetricsJanitor();

  server.listen(config.port, () => {
    console.log(`BC Taxi API running on http://localhost:${config.port} (WS /ws)`);
  });

  process.on('SIGINT', async () => {
    stopRedisFanout?.();
    clearInterval(stopHeartbeatJanitor);
    clearInterval(stopScheduleDispatcher);
    clearInterval(stopSharedDispatcher);
    clearInterval(stopOpsJanitor);
    if (!config.useMemoryDb && pool) await pool.end();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Failed to start API:', err.message);
  process.exit(1);
});
