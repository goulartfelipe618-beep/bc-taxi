const store = new Map<string, { value: string; expiresAt: number }>();

export const matchCache = {
  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  },

  async get(key: string): Promise<string | null> {
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      return null;
    }
    return entry.value;
  },

  async del(key: string): Promise<void> {
    store.delete(key);
  },

  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const existing = await this.get(key);
    if (existing) return false;
    await this.set(key, value, ttlSeconds);
    return true;
  },
};

export function purgeExpiredCache() {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.expiresAt) store.delete(key);
  }
}

setInterval(purgeExpiredCache, 60_000).unref();
