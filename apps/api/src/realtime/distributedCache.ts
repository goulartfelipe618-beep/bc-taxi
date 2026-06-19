import { matchCache } from '../match/cacheStore.js';
import { redisDel, redisGet, redisPublish, redisSet, redisSetNx } from './redisClient.js';

const REDIS_CHANNEL = 'bc-taxi:events';

export const distributedCache = {
  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await matchCache.set(key, value, ttlSeconds);
    await redisSet(key, value, ttlSeconds);
  },

  async get(key: string): Promise<string | null> {
    const fromRedis = await redisGet(key);
    if (fromRedis != null) return fromRedis;
    return matchCache.get(key);
  },

  async del(key: string): Promise<void> {
    await matchCache.del(key);
    await redisDel(key);
  },

  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const redisOk = await redisSetNx(key, value, ttlSeconds);
    if (redisOk) {
      await matchCache.set(key, value, ttlSeconds);
      return true;
    }
    return matchCache.setNx(key, value, ttlSeconds);
  },
};

export async function publishRealtimeEvent(eventJson: string) {
  await redisPublish(REDIS_CHANNEL, eventJson);
}

export { REDIS_CHANNEL };
