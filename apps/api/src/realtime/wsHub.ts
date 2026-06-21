import type { WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
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

export const wsHub = {
  register(ws: WebSocket, token: string) {
    try {
      const decoded = jwt.verify(token, config.jwtSecret) as { userId: string; role?: string };
      clients.set(ws, {
        userId: decoded.userId,
        role: decoded.role ?? 'passenger',
        rideIds: new Set(),
        lastCheckpoint: new Date(0).toISOString(),
      });
      ws.send(JSON.stringify({ type: 'connected', userId: decoded.userId }));
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

  setCheckpoint(ws: WebSocket, checkpoint: string) {
    const state = clients.get(ws);
    if (state) state.lastCheckpoint = checkpoint;
  },

  unregister(ws: WebSocket) {
    clients.delete(ws);
  },

  broadcast(event: RealtimeEvent) {
    const payload = JSON.stringify({ type: 'event', event });
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
