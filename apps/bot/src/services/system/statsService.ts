import type { Client } from 'discord.js';
import prisma from '../../utils/db.js';
import { logger } from '../../utils/logger.js';
import { getCurrentInstance } from '../../utils/instanceContext.js';
import { fetchExternal } from '../../utils/http.js';
import botPackageJson from '../../../package.json';

export interface BotPingPayload {
  botClientId: string;
  botName: string;
  botAvatarUrl: string | null;
  dashboardUrl: string | null;
  guildCount: number;
  userCount: number;
  version: string | null;
  isSelfHosted: boolean;
}

/**
 * Pings the central master server to report statistics of the current bot instance.
 * To avoid duplication, this only executes on Shard 0.
 */
export async function pingMasterServer(client: Client): Promise<void> {
  // If sharded, only run on Shard 0
  if (client.shard && !client.shard.ids.includes(0)) {
    return;
  }

  try {
    let guildCount = 0;
    let userCount = 0;

    if (client.shard) {
      const shardGuilds = await client.shard.fetchClientValues('guilds.cache.size') as number[];
      guildCount = shardGuilds.reduce((acc, count) => acc + count, 0);

      const shardUsers = await client.shard.broadcastEval((c) =>
        c.guilds.cache.reduce((acc, guild) => acc + (guild.memberCount || 0), 0)
      ) as number[];
      userCount = shardUsers.reduce((acc, count) => acc + count, 0);
    } else {
      guildCount = client.guilds.cache.size;
      userCount = client.guilds.cache.reduce((acc, guild) => acc + (guild.memberCount || 0), 0);
    }

    const currentInst = getCurrentInstance();
    const isSelfHosted = process.env.IS_SELF_HOSTED === 'true' ||
      (!currentInst.dashboardOrigin.includes('kotbo.fr') && currentInst.isDefault);

    const payload: BotPingPayload = {
      botClientId: client.user?.id || '',
      botName: client.user?.username || currentInst.name,
      botAvatarUrl: client.user?.displayAvatarURL() || currentInst.brandLogoUrl || null,
      dashboardUrl: currentInst.dashboardUrl,
      guildCount,
      userCount,
      version: botPackageJson.version,
      isSelfHosted,
    };

    if (!payload.botClientId) {
      logger.warn('StatsPing', 'Client user ID not available yet. Skipping ping.');
      return;
    }

    const masterUrl = process.env.MASTER_API_URL || 'https://api.kotbo.fr';
    const pingUrl = `${masterUrl.replace(/\/$/, '')}/api/public/stats/ping`;

    logger.info('StatsPing', `Sending stats ping to ${pingUrl} (Guilds: ${guildCount}, Users: ${userCount}, Self-Hosted: ${isSelfHosted})`);

    // Perform the HTTP request
    const response = await fetchExternal(pingUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Kotbo-Ping': 'true',
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      logger.success('StatsPing', 'Stats ping sent successfully.');
    } else {
      logger.error('StatsPing', `Failed to send stats ping: ${response.status} ${response.statusText}`);
    }
  } catch (err) {
    logger.error('StatsPing', 'Error sending stats ping:', err);
  }
}

/**
 * Registers/Updates the stats for a bot instance in the database.
 */
export async function registerBotInstanceStats(payload: BotPingPayload): Promise<void> {
  const { botClientId, botName, botAvatarUrl, dashboardUrl, guildCount, userCount, version, isSelfHosted } = payload;

  await prisma.botInstanceStats.upsert({
    where: { botClientId },
    update: {
      botName,
      botAvatarUrl,
      dashboardUrl,
      guildCount,
      userCount,
      version,
      isSelfHosted,
      lastPingAt: new Date(),
    },
    create: {
      botClientId,
      botName,
      botAvatarUrl,
      dashboardUrl,
      guildCount,
      userCount,
      version,
      isSelfHosted,
    },
  });
}

/**
 * Deletes any bot stats rows that haven't updated in the last 48 hours.
 */
export async function cleanUpStaleStats(): Promise<void> {
  const staleThreshold = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours ago
  const result = await prisma.botInstanceStats.deleteMany({
    where: {
      lastPingAt: {
        lt: staleThreshold,
      },
    },
  });

  if (result.count > 0) {
    logger.info('StatsService', `Cleaned up ${result.count} stale bot instance stats.`);
  }
}
