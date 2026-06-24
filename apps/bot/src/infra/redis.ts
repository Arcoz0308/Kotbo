import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';
import { logger } from '../utils/logger.js';

let sharedRedis: Redis | null = null;
let redisDisabled = false;

function getRedisConnectionInput(): { url?: string; host?: string; port?: number; password?: string } {
  const url = process.env.REDIS_URL;
  if (url) return { url };

  const host = process.env.REDIS_HOST;
  if (!host) return {};

  const port = Number.parseInt(process.env.REDIS_PORT ?? '6379', 10);
  const password = process.env.REDIS_PASSWORD;
  return { host, port: Number.isNaN(port) ? 6379 : port, password };
}

function buildRedisOptions(extra?: RedisOptions): RedisOptions {
  return {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    enableReadyCheck: true,
    ...extra,
  };
}

function createClient(extra?: RedisOptions): Redis | null {
  const conn = getRedisConnectionInput();

  if (!conn.url && !conn.host) {
    return null;
  }

  if (conn.url) {
    return new Redis(conn.url, buildRedisOptions(extra));
  }

  return new Redis({
    host: conn.host,
    port: conn.port,
    password: conn.password,
    ...buildRedisOptions(extra),
  });
}

export async function initRedis(): Promise<Redis | null> {
  if (sharedRedis) return sharedRedis;
  if (redisDisabled) return null;

  const client = createClient();
  if (!client) {
    redisDisabled = true;
    logger.warn('Redis', 'Redis désactivé: REDIS_URL/REDIS_HOST absent.');
    return null;
  }

  try {
    await client.connect();
    await client.ping();
    sharedRedis = client;
    logger.success('Redis', 'Connexion Redis établie.');
    return sharedRedis;
  } catch (error) {
    logger.error('Redis', 'Impossible de se connecter à Redis:', error);
    client.disconnect();
    redisDisabled = true;
    return null;
  }
}

export function createRedisForWorker(): Redis | null {
  if (redisDisabled) return null;
  return createClient({
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

export function getRedis(): Redis | null {
  return sharedRedis;
}

export async function assertRedisConnection(): Promise<void> {
  const client = sharedRedis ?? await initRedis();
  if (!client) {
    throw new Error(
      'Redis indisponible — BullMQ requiert une connexion Redis active. ' +
      'Configurez REDIS_URL ou REDIS_HOST.'
    );
  }
  try {
    await client.ping();
  } catch (err) {
    throw new Error(`Redis indisponible — ping échoué: ${String(err)}`);
  }
}
