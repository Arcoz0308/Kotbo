import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

import { ShardingManager } from 'discord.js';
import prisma from './utils/db.js';
import { logger } from './utils/logger.js';

type ShardingConfig = {
  mode: 'auto' | 'fixed';
  shardCount?: number;
};

const SHARDING_CONFIG_KEY = 'SHARDING_CONFIG';

async function loadShardingConfig(): Promise<ShardingConfig> {
  try {
    const config = await prisma.botGlobalConfig.findUnique({ where: { key: SHARDING_CONFIG_KEY } });
    if (!config?.value) {
      return { mode: 'auto' };
    }

    const parsed = JSON.parse(config.value) as Partial<ShardingConfig>;
    if (parsed.mode === 'fixed') {
      const shardCount = Number(parsed.shardCount);
      if (Number.isFinite(shardCount) && shardCount > 0) {
        return { mode: 'fixed', shardCount: Math.floor(shardCount) };
      }
    }

    return { mode: 'auto' };
  } catch (error) {
    logger.warn('Sharding', 'Impossible de lire la config de sharding, fallback en auto.', error);
    return { mode: 'auto' };
  }
}

async function main() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    logger.error('Bot', 'DISCORD_TOKEN non défini dans .env !');
    process.exit(1);
  }

  const shardingConfig = await loadShardingConfig();
  const workerPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'index.ts');

  // Allow an environment override for local testing: SHARD_COUNT
  const envShardCount = process.env.SHARD_COUNT ? Number(process.env.SHARD_COUNT) : undefined;
  let totalShards: number | 'auto' = shardingConfig.mode === 'fixed' && shardingConfig.shardCount
    ? shardingConfig.shardCount
    : 'auto';

  if (envShardCount && Number.isFinite(envShardCount) && envShardCount > 0) {
    totalShards = Math.floor(envShardCount);
    logger.info('Sharding', `SHARD_COUNT override: démarrage en ${totalShards} shard(s).`);
  }

  const manager = new ShardingManager(workerPath, {
    token,
    totalShards,
    respawn: true,
  });

  manager.on('shardCreate', (shard) => {
    logger.info('Sharding', `Shard ${shard.id} initialisé.`);

    shard.on('message', (message: any) => {
      try {
        if (!message || typeof message !== 'object') return;

        // Legacy: request a full container restart
        if (message.type === 'restart-container') {
          logger.warn('Sharding', `Redémarrage du conteneur demandé par le shard ${shard.id}.`);
          // If the launcher is configured to rely on container restart (Dokploy), exit.
          if (process.env.MANAGER_USE_CONTAINER_RESTART === 'true') {
            process.exit(0);
          }

          // Otherwise attempt an in-process respawn of all shards.
          if (typeof (manager as any).respawnAll === 'function') {
            (manager as any).respawnAll();
          } else {
            const total = Number((manager as any).totalShards ?? (manager as any).shards?.size ?? 0);
            for (let i = 0; i < total; i += 1) {
              if (typeof (manager as any).respawn === 'function') {
                (manager as any).respawn(i);
              }
            }
          }
          return;
        }

        // Request to respawn a specific shard
        if (message.type === 'respawn-shard' && Number.isInteger(Number(message.shardId))) {
          const target = Number(message.shardId);
          logger.warn('Sharding', `Respawn demandé pour le shard ${target} (via shard ${shard.id}).`);
          if (typeof (manager as any).respawn === 'function') {
            try {
              (manager as any).respawn(target);
            } catch (err) {
              logger.error('Sharding', `Erreur lors du respawn du shard ${target}:`, err);
            }
          }
          return;
        }
      } catch (err) {
        logger.error('Sharding', 'Erreur en traitant le message IPC du shard:', err);
      }
    });
  });

  await manager.spawn();
  logger.success('Sharding', `Bot lancé avec ${manager.totalShards} shard(s).`);
}

main().catch((error) => {
  logger.error('Sharding', 'Impossible de démarrer le manager de sharding.', error);
  process.exit(1);
});