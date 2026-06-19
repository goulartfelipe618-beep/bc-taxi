import Redis from 'ioredis';
import { config } from '../config.js';

let redis: Redis | null = null;

export function getRedis(): Redis | null {
  if (!config.redisUrl) return null;
  if (!redis) {
    redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
    });
    redis.on('error', (err) => console.warn('[redis]', err.message));
  }
  return redis;
}

export async function redisSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  const client = getRedis();
  if (!client) return;
  await client.set(key, value, 'EX', ttlSeconds);
}

export async function redisGet(key: string): Promise<string | null> {
  const client = getRedis();
  if (!client) return null;
  return client.get(key);
}

export async function redisDel(key: string): Promise<void> {
  const client = getRedis();
  if (!client) return;
  await client.del(key);
}

export async function redisSetNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;
  const result = await client.set(key, value, 'EX', ttlSeconds, 'NX');
  return result === 'OK';
}

export async function redisPublish(channel: string, message: string): Promise<void> {
  const client = getRedis();
  if (!client) return;
  await client.publish(channel, message);
}

export function redisSubscribe(channel: string, handler: (message: string) => void): (() => void) | null {
  if (!config.redisUrl) return null;
  const sub = new Redis(config.redisUrl, { maxRetriesPerRequest: 2 });
  void sub.subscribe(channel);
  sub.on('message', (_ch, msg) => handler(msg));
  return () => {
    void sub.unsubscribe(channel);
    sub.disconnect();
  };
}
