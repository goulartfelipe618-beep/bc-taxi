import type { Server } from 'node:http';
import { WebSocketServer } from 'ws';
import { wsHub } from './wsHub.js';

export function attachWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const token = url.searchParams.get('token');
    const checkpoint = url.searchParams.get('checkpoint') ?? undefined;
    if (!token) {
      ws.close(4401, 'Missing token');
      return;
    }

    wsHub.register(ws, token, checkpoint);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as {
          type: string;
          rideId?: string;
          checkpoint?: string;
          eventId?: string;
        };
        if (msg.type === 'subscribe_ride' && msg.rideId) wsHub.subscribeRide(ws, msg.rideId);
        if (msg.type === 'checkpoint' && msg.checkpoint) void wsHub.setCheckpoint(ws, msg.checkpoint);
        if (msg.type === 'ack' && msg.eventId) void wsHub.ackEvent(ws, msg.eventId);
        if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
      } catch {
        /* ignore */
      }
    });

    ws.on('close', () => wsHub.unregister(ws));
  });

  return wss;
}
