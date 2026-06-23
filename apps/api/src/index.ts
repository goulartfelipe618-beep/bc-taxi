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
import { clientRouter } from './routes/client.js';
import { categoriesRouter, configRouter, quotesRouter } from './routes/catalog.js';
import { fraudRouter } from './routes/fraud.js';
import { notificationsRouter } from './routes/notifications.js';
import { placesRouter, routesRouter } from './routes/mapbox.js';
import { passengerAccountRouter } from './routes/passengerAccount.js';
import { passengerReputationRouter } from './routes/passengerReputation.js';
import { passengerSafetyHelpRouter } from './routes/passengerSafetyHelp.js';
import { passengerSchedulingRouter } from './routes/passengerScheduling.js';
import { paymentsRouter, pspWebhookHandler } from './routes/payments.js';
import { pricingRouter } from './routes/pricing.js';
import { receiptsRouter } from './routes/receipts.js';
import { reputationRouter } from './routes/reputation.js';
import { driverRouter, ridesRouter } from './routes/rides.js';
import { promotionsRouter } from './routes/promotions.js';
import { schedulingRouter } from './routes/scheduling.js';
import { corporateRouter } from './routes/corporate.js';
import { deliveriesRouter } from './routes/deliveries.js';
import { driverAccountRouter } from './routes/driverAccount.js';
import { driverFleetRouter } from './routes/driverFleet.js';
import { driverPayoutRouter } from './routes/driverPayout.js';
import { driverReputationRouter } from './routes/driverReputation.js';
import { driverActivityRouter, passengerActivityRouter } from './routes/rideActivity.js';
import { startHeartbeatJanitor } from './driver/driverLocationService.js';
import { eventsRouter } from './routes/events.js';
import { governanceRouter } from './routes/governance.js';
import { airportsRouter } from './routes/airports.js';
import { sharedRouter } from './routes/shared.js';
import { accessibilityRouter } from './routes/accessibility.js';
import { collectiveRouter } from './routes/collective.js';
import { opsRouter } from './routes/ops.js';
import { aiRouter } from './routes/ai.js';
import { matchRouter } from './routes/match.js';
import { regionsRouter } from './routes/regions.js';
import { startScheduleDispatcher } from './scheduling/scheduleService.js';
import { startSharedPoolDispatcher } from './shared/sharedRideService.js';
import { startOpsMetricsJanitor } from './observability/opsMetricsService.js';
import { startLiveRouteMonitor } from './route/liveRouteMonitorService.js';
import { startDynamicPricingScheduler } from './pricing/dynamicPricingService.js';
import { startMatchTimeoutJanitor } from './match/timeoutHandlerService.js';
import { startPspRetryJanitor } from './payments/pspProductionService.js';

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
  app.use('/v1/client', clientRouter);
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
  app.use('/v1/collective', collectiveRouter);
  app.use('/v1/ops', opsRouter);
  app.use('/v1/ai', aiRouter);
  app.use('/v1/match', matchRouter);
  app.use('/v1/regions', regionsRouter);
  app.use('/v1/accessibility', accessibilityRouter);
  app.use('/v1/config', configRouter);
  app.use('/v1/places', placesRouter);
  app.use('/v1/routes', routesRouter);
  app.use('/v1/passenger/account', passengerAccountRouter);
  app.use('/v1/passenger/schedules', passengerSchedulingRouter);
  app.use('/v1/passenger/reputation', passengerReputationRouter);
  app.use('/v1/passenger/safety-help', passengerSafetyHelpRouter);
  app.use('/v1/passenger/activity', passengerActivityRouter);
  app.use('/v1/payments', paymentsRouter);
  app.use('/v1/rides', ridesRouter);
  app.use('/v1/driver', driverRouter);
  app.use('/v1/driver/fleet', driverFleetRouter);
  app.use('/v1/driver/payout', driverPayoutRouter);
  app.use('/v1/driver/account', driverAccountRouter);
  app.use('/v1/driver/reputation', driverReputationRouter);
  app.use('/v1/driver/activity', driverActivityRouter);

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
  const stopLiveRouteMonitor = startLiveRouteMonitor();
  const stopDynamicPricing = startDynamicPricingScheduler();
  const stopMatchTimeoutJanitor = startMatchTimeoutJanitor();
  const stopPspRetryJanitor = startPspRetryJanitor();

  server.listen(config.port, () => {
    console.log(`BC Taxi API running on http://localhost:${config.port} (WS /ws)`);
  });

  process.on('SIGINT', async () => {
    stopRedisFanout?.();
    clearInterval(stopHeartbeatJanitor);
    clearInterval(stopScheduleDispatcher);
    clearInterval(stopSharedDispatcher);
    clearInterval(stopOpsJanitor);
    clearInterval(stopLiveRouteMonitor);
    clearInterval(stopDynamicPricing);
    stopMatchTimeoutJanitor?.();
    stopPspRetryJanitor?.();
    if (!config.useMemoryDb && pool) await pool.end();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Failed to start API:', err.message);
  process.exit(1);
});
