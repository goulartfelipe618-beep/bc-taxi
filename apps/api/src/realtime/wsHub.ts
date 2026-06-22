import type { WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import {
  getReplayEventsSince,
  isCriticalRealtimeEvent,
  recordWebSocketCheckpoint,
  recordWebSocketEventAck,
} from './realtimeProductionService.js';
import type { RealtimeEvent } from './types.js';

interface ClientState {
  userId: string;
  role: string;
  rideIds: Set<string>;
  lastCheckpoint: string;
}

const clients = new Map<WebSocket, ClientState>();

function channelKey(kind: 'user' | 'ride' | 'driver', id: string) {
  return `${kind}:${id}`;
}

async function replayMissedEvents(ws: WebSocket, userId: string, checkpoint: string) {
  const events = await getReplayEventsSince(userId, checkpoint);
  for (const event of events) {
    ws.send(
      JSON.stringify({
        type: 'event',
        event,
        replay: true,
        requiresAck: isCriticalRealtimeEvent(event.eventType),
      }),
    );
  }
  ws.send(JSON.stringify({ type: 'replay_complete', count: events.length, checkpoint }));
}

export const wsHub = {
  register(ws: WebSocket, token: string, checkpoint?: string) {
    try {
      const decoded = jwt.verify(token, config.jwtSecret) as { userId: string; role?: string };
      const initialCheckpoint = checkpoint ?? new Date(0).toISOString();
      clients.set(ws, {
        userId: decoded.userId,
        role: decoded.role ?? 'passenger',
        rideIds: new Set(),
        lastCheckpoint: initialCheckpoint,
      });
      ws.send(JSON.stringify({ type: 'connected', userId: decoded.userId, checkpoint: initialCheckpoint }));

      if (checkpoint) {
        void replayMissedEvents(ws, decoded.userId, checkpoint);
      }
    } catch {
      ws.close(4401, 'Unauthorized');
    }
  },

  subscribeRide(ws: WebSocket, rideId: string) {
    const state = clients.get(ws);
    if (!state) return;
    state.rideIds.add(rideId);
    ws.send(JSON.stringify({ type: 'subscribed', channel: channelKey('ride', rideId) }));
  },

  async setCheckpoint(ws: WebSocket, checkpoint: string) {
    const state = clients.get(ws);
    if (!state) return;
    state.lastCheckpoint = checkpoint;
    await recordWebSocketCheckpoint(state.userId, checkpoint);
    ws.send(JSON.stringify({ type: 'checkpoint_saved', checkpoint }));
  },

  async ackEvent(ws: WebSocket, eventId: string) {
    const state = clients.get(ws);
    if (!state) return;
    await recordWebSocketEventAck(state.userId, eventId);
    ws.send(JSON.stringify({ type: 'ack_received', eventId }));
  },

  unregister(ws: WebSocket) {
    clients.delete(ws);
  },

  broadcast(event: RealtimeEvent) {
    const requiresAck = isCriticalRealtimeEvent(event.eventType);
    const payload = JSON.stringify({ type: 'event', event, requiresAck });
    const targets = new Set<WebSocket>();

    for (const [ws, state] of clients.entries()) {
      if (ws.readyState !== ws.OPEN) continue;
      if (event.userIds?.includes(state.userId)) targets.add(ws);
      if (event.driverId === state.userId) targets.add(ws);
      if (event.rideId && state.rideIds.has(event.rideId)) targets.add(ws);
      if (event.aggregateType === 'ride' && state.rideIds.has(event.aggregateId)) targets.add(ws);
    }

    for (const ws of targets) {
      ws.send(payload);
    }
  },

  stats() {
    return { connections: clients.size };
  },

  detailedStats() {
    let passengers = 0;
    let drivers = 0;
    for (const state of clients.values()) {
      if (state.role === 'driver') drivers += 1;
      else passengers += 1;
    }
    return { connections: clients.size, passengers, drivers };
  },
};
