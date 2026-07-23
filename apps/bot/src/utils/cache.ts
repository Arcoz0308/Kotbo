import type { DashboardSettings, Guild } from '@prisma/client';
import { getRedis } from '../infra/redis.js';
import { logger } from './logger.js';
import prisma from './db.js';

interface MemoryCacheEntry<T> {
  value: T;
  expiresAt: number;
}

const memoryCache = new Map<string, MemoryCacheEntry<unknown>>();

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    // 1. Check in-memory L1 cache first
    const cached = memoryCache.get(key);
    if (cached) {
      if (cached.expiresAt > Date.now()) {
        return cached.value as T;
      }
      memoryCache.delete(key);
    }

    // 2. Fallback to Redis L2 cache
    try {
      const redis = getRedis();
      if (redis) {
        const val = await redis.get(key);
        if (val) {
          const parsed = JSON.parse(val) as T;
          // Store in L1 memory cache for 5 seconds to buffer consecutive checks
          memoryCache.set(key, {
            value: parsed,
            expiresAt: Date.now() + 5000,
          });
          return parsed;
        }
        return null;
      }
    } catch (err) {
      logger.error('Cache', `Redis GET error for key ${key}`, err);
    }

    return null;
  },

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    // Store in L1 memory cache
    memoryCache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });

    // Store in Redis L2 cache
    try {
      const redis = getRedis();
      if (redis) {
        await redis.setex(key, ttlSeconds, JSON.stringify(value));
      }
    } catch (err) {
      logger.error('Cache', `Redis SETEX error for key ${key}`, err);
    }
  },

  async delete(key: string): Promise<void> {
    // Clear L1 memory cache
    memoryCache.delete(key);

    // Clear Redis L2 cache
    try {
      const redis = getRedis();
      if (redis) {
        await redis.del(key);
      }
    } catch (err) {
      logger.error('Cache', `Redis DEL error for key ${key}`, err);
    }
  },

  async invalidateGuild(guildId: string): Promise<void> {
    const prefix = `guild:${guildId}:`;

    for (const key of memoryCache.keys()) {
      if (key.startsWith(prefix)) {
        memoryCache.delete(key);
      }
    }

    try {
      const redis = getRedis();
      if (redis) {
        let cursor = '0';
        const keysToDelete: string[] = [];
        do {
          const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 500);
          cursor = nextCursor;
          keysToDelete.push(...keys);
        } while (cursor !== '0');

        if (keysToDelete.length > 0) {
          const pipeline = redis.pipeline();
          for (let i = 0; i < keysToDelete.length; i += 1000) {
            pipeline.del(...keysToDelete.slice(i, i + 1000));
          }
          await pipeline.exec();
        }
      }
    } catch (err) {
      logger.error('Cache', `Redis pattern delete error for prefix ${prefix}`, err);
    }
  }
};

/**
 * Retrieves the cached Guild configuration, or queries the database and caches it.
 */
export async function getCachedGuild(guildId: string) {
  const cacheKey = `guild:${guildId}:config`;
  let guild = await cache.get<Guild>(cacheKey);

  if (!guild) {
    guild = await prisma.guild.findUnique({
      where: { id: guildId },
    });
    if (guild) {
      await cache.set(cacheKey, guild, 60); // Cache for 60 seconds
    }
  }
  return guild;
}

/**
 * Retrieves cached DashboardSettings, or queries the database and caches it.
 */
export async function getCachedDashboardSettings(guildId: string) {
  const cacheKey = `guild:${guildId}:dashboard_settings`;
  let settings = await cache.get<DashboardSettings>(cacheKey);

  if (!settings) {
    settings = await prisma.dashboardSettings.findUnique({
      where: { guildId },
    });
    if (settings) {
      await cache.set(cacheKey, settings, 60); // Cache for 60 seconds
    }
  }
  return settings;
}
