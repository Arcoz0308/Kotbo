/** Configuration du sharding et instantanes des shards. */
import { type Client } from 'discord.js';
import prisma from '../../utils/db.js';
import type { ShardSnapshot, ShardingConfig } from './core.js';

export const SHARDING_CONFIG_KEY = 'SHARDING_CONFIG';

export const DEFAULT_SHARDING_CONFIG: ShardingConfig = {
  mode: 'auto',
  shardCount: null,
};

export function parseShardingConfig(rawValue: string | null | undefined): ShardingConfig {
  if (!rawValue) return DEFAULT_SHARDING_CONFIG;

  try {
    const parsed = JSON.parse(rawValue) as Partial<ShardingConfig>;
    if (parsed.mode === 'fixed') {
      const shardCount = Number(parsed.shardCount);
      if (Number.isFinite(shardCount) && shardCount > 0) {
        return { mode: 'fixed', shardCount: Math.floor(shardCount) };
      }
    }
  } catch {
    // ignore
  }

  return DEFAULT_SHARDING_CONFIG;
}

export async function loadShardingConfig(): Promise<ShardingConfig> {
  const config = await prisma.botGlobalConfig.findUnique({ where: { key: SHARDING_CONFIG_KEY } });
  return parseShardingConfig(config?.value ?? null);
}

export async function saveShardingConfig(config: ShardingConfig) {
  await prisma.botGlobalConfig.upsert({
    where: { key: SHARDING_CONFIG_KEY },
    update: { value: JSON.stringify(config) },
    create: { key: SHARDING_CONFIG_KEY, value: JSON.stringify(config) },
  });
}

export function requestContainerRestart() {
  if (typeof process.send === 'function') {
    process.send({ type: 'restart-container' });
    return;
  }

  setTimeout(() => process.exit(0), 250);
}

export function requestShardRespawn(shardId: number) {
  if (typeof process.send === 'function') {
    process.send({ type: 'respawn-shard', shardId });
    return;
  }

  requestContainerRestart();
}

export async function resolveGuildById(client: Client, guildId: string) {
  return client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
}

export async function collectShardSnapshots(client: Client): Promise<ShardSnapshot[]> {
  const sharding = client.shard;
  if (!sharding) {
    return [{
      shardId: 0,
      status: 'online',
      guildCount: client.guilds.cache.size,
      memberCount: client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0),
      ping: Math.round(client.ws.ping || 0),
      uptime: Math.floor(process.uptime()),
      readyAt: client.readyAt?.toISOString() ?? null,
      memoryUsage: process.memoryUsage(),
    }];
  }

  const configuredShardCount = Number(sharding.count ?? 1);
  const onlineSnapshots = await sharding.broadcastEval<ShardSnapshot>((shardClient: Client) => ({
    shardId: Number(shardClient.shard?.ids?.[0] ?? 0),
    status: shardClient.isReady() ? 'online' : 'starting',
    guildCount: shardClient.guilds.cache.size,
    memberCount: shardClient.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0),
    ping: Math.round(shardClient.ws.ping || 0),
    uptime: Math.floor(process.uptime()),
    readyAt: shardClient.readyAt?.toISOString() ?? null,
    memoryUsage: process.memoryUsage(),
  }));

  const snapshotById = new Map<number, ShardSnapshot>();
  for (const snapshot of onlineSnapshots) {
    snapshotById.set(snapshot.shardId, snapshot);
  }

  for (let shardId = 0; shardId < configuredShardCount; shardId += 1) {
    if (!snapshotById.has(shardId)) {
      snapshotById.set(shardId, {
        shardId,
        status: 'offline',
        guildCount: 0,
        memberCount: 0,
        ping: 0,
        uptime: 0,
        readyAt: null,
        memoryUsage: { rss: 0, heapUsed: 0, heapTotal: 0 },
      });
    }
  }

  return [...snapshotById.values()].sort((a, b) => a.shardId - b.shardId);
}

export async function collectShardGuilds(client: Client) {
  const sharding = client.shard;
  if (!sharding) {
    return client.guilds.cache.map((guild) => ({
      id: guild.id,
      name: guild.name,
      icon: guild.iconURL(),
      memberCount: guild.memberCount,
      joinedAt: guild.joinedAt?.toISOString() ?? null,
      activated: false,
      activationCode: null,
      shardId: 0,
    }));
  }

  interface ShardGuildResult {
    id: string;
    name: string;
    icon: string | null;
    memberCount: number;
    joinedAt: string | null;
    shardId: number;
  }

  const results = await sharding.broadcastEval<ShardGuildResult[]>((shardClient: Client) => shardClient.guilds.cache.map((guild) => ({
    id: guild.id,
    name: guild.name,
    icon: guild.iconURL(),
    memberCount: guild.memberCount,
    joinedAt: guild.joinedAt?.toISOString() ?? null,
    shardId: Number(shardClient.shard?.ids?.[0] ?? 0),
  })));

  return results.flat();
}

export let dashboardStateBroadcaster: ((guildId: string, reason: string) => void) | null = null;
export const setDashboardStateBroadcaster = (fn: (guildId: string, reason: string) => void) => {
  dashboardStateBroadcaster = fn;
};

export const broadcastDashboardStateChange = (guildId: string, reason: string) => {
  dashboardStateBroadcaster?.(guildId, reason);
};
