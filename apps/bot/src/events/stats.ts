import { Client, Events, ChannelType, VoiceChannel } from 'discord.js';
import prisma from '../utils/db.js';
import { logger } from '../utils/logger.js';

// Debounce timers map to avoid spamming rename requests on member join/leave
const updateTimeouts = new Map<string, NodeJS.Timeout>();

export function registerStatsChannelListener(client: Client): void {
  // Update stats on client ready, then every 10 minutes
  client.on(Events.ClientReady, () => {
    updateAllGuildsStats(client);
    setInterval(() => updateAllGuildsStats(client), 10 * 60 * 1000);
  });

  // Also update stats when a member joins or leaves (debounced)
  client.on(Events.GuildMemberAdd, (member) => {
    triggerDebouncedUpdate(client, member.guild.id);
  });

  client.on(Events.GuildMemberRemove, (member) => {
    triggerDebouncedUpdate(client, member.guild.id);
  });

  logger.success('StatsChannels', 'Écouteur de Salons Statistiques enregistré');
}

function triggerDebouncedUpdate(client: Client, guildId: string) {
  const existingTimeout = updateTimeouts.get(guildId);
  if (existingTimeout) clearTimeout(existingTimeout);

  const timeout = setTimeout(() => {
    updateTimeouts.delete(guildId);
    updateGuildStats(client, guildId).catch((err) => 
      logger.error('StatsChannels', `Erreur lors de la mise à jour des stats pour la guilde ${guildId} :`, err)
    );
  }, 15000); // Wait 15 seconds after last change

  updateTimeouts.set(guildId, timeout);
}

async function updateAllGuildsStats(client: Client): Promise<void> {
  const activeConfigs = await prisma.guild.findMany({
    where: { statsEnabled: true },
    select: { id: true }
  });

  for (const config of activeConfigs) {
    try {
      await updateGuildStats(client, config.id);
    } catch (err) {
      logger.error('StatsChannels', `Erreur lors de la mise à jour globale des stats pour ${config.id} :`, err);
    }
  }
}

export async function updateGuildStats(client: Client, guildId: string): Promise<void> {
  const guildConfig = await prisma.guild.findUnique({
    where: { id: guildId },
    select: {
      statsEnabled: true,
      statsConfig: true,
    }
  });

  if (!guildConfig || !guildConfig.statsEnabled || !guildConfig.statsConfig) {
    return;
  }

  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  const config = guildConfig.statsConfig as any;

  // 1. Gather counts
  let membersCount = guild.memberCount;
  let botsCount = 0;
  let roleCount = 0;
  
  let needsFetch = config.botChannelId || (config.roleChannelId && config.roleTargetId);
  if (!needsFetch && Array.isArray(config.customStats)) {
    needsFetch = config.customStats.some((c: any) => c.enabled && (c.type === 'role' || c.type === 'online' || c.type === 'bots'));
  }

  // Fetch members to count bots and roles accurately if configured
  if (needsFetch) {
    const allMembers = await guild.members.fetch().catch(() => guild.members.cache);
    botsCount = allMembers.filter(m => m.user.bot).size;
    
    if (config.roleChannelId && config.roleTargetId) {
      roleCount = allMembers.filter(m => m.roles.cache.has(config.roleTargetId)).size;
    }
  }

  const channelsCount = guild.channels.cache.size;
  const categoriesCount = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size;

  let activityCount = 0;
  if (config.activityChannelId || (Array.isArray(config.customStats) && config.customStats.some((c: any) => c.enabled && c.type === 'activity'))) {
    activityCount = await prisma.memberProfile.count({
      where: {
        guildId,
        lastSeenAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      }
    }).catch(() => 0);
  }

  // 2. Helper to rename a channel if it exists and value changed
  const renameChannelIfNeeded = async (channelId: string, template: string, count: number, customGoal?: number) => {
    if (!channelId) return;
    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (channel && channel instanceof VoiceChannel) {
      let expectedName = template.replace('{count}', count.toString());
      if (customGoal !== undefined) {
        expectedName = expectedName.replace('{goal}', customGoal.toString());
      }
      if (channel.name !== expectedName) {
        await channel.setName(expectedName).catch((err) => 
          logger.warn('StatsChannels', `Impossible de renommer le salon ${channelId} vers "${expectedName}" (limitation Discord ?) :`, err)
        );
      }
    }
  };

  // 3. Rename active stats channels
  if ((config.memberEnabled ?? !!config.memberChannelId) && config.memberChannelId) {
    await renameChannelIfNeeded(config.memberChannelId, config.memberTemplate || '👤 Membres : {count}', membersCount);
  }
  if ((config.botEnabled ?? !!config.botChannelId) && config.botChannelId) {
    await renameChannelIfNeeded(config.botChannelId, config.botTemplate || '🤖 Bots : {count}', botsCount);
  }
  if ((config.roleEnabled ?? !!config.roleChannelId) && config.roleChannelId && config.roleTargetId) {
    await renameChannelIfNeeded(config.roleChannelId, config.roleTemplate || '👑 Staff : {count}', roleCount);
  }
  if ((config.channelEnabled ?? !!config.channelChannelId) && config.channelChannelId) {
    await renameChannelIfNeeded(config.channelChannelId, config.channelTemplate || '💬 Salons : {count}', channelsCount);
  }
  if ((config.categoryEnabled ?? !!config.categoryChannelId) && config.categoryChannelId) {
    await renameChannelIfNeeded(config.categoryChannelId, config.categoryTemplate || '📁 Catégories : {count}', categoriesCount);
  }
  if ((config.activityEnabled ?? !!config.activityChannelId) && config.activityChannelId) {
    await renameChannelIfNeeded(config.activityChannelId, config.activityTemplate || '📈 Actifs 24h : {count}', activityCount);
  }

  // 4. Update custom stats channels
  if (Array.isArray(config.customStats)) {
    for (const custom of config.customStats) {
      if (!custom.enabled || !custom.channelId) continue;
      
      let count = 0;
      if (custom.type === 'members') {
        count = membersCount;
      } else if (custom.type === 'bots') {
        count = botsCount;
      } else if (custom.type === 'online') {
        const allMembers = await guild.members.fetch().catch(() => guild.members.cache);
        count = allMembers.filter(m => m.presence && m.presence.status !== 'offline').size;
      } else if (custom.type === 'voice') {
        count = guild.members.cache.filter(m => m.voice && m.voice.channelId).size;
      } else if (custom.type === 'role') {
        if (custom.roleTargetId) {
          const allMembers = await guild.members.fetch().catch(() => guild.members.cache);
          count = allMembers.filter(m => m.roles.cache.has(custom.roleTargetId)).size;
        }
      } else if (custom.type === 'channels') {
        count = channelsCount;
      } else if (custom.type === 'categories') {
        count = categoriesCount;
      } else if (custom.type === 'activity') {
        count = activityCount;
      } else if (custom.type === 'boosts') {
        count = guild.premiumSubscriptionCount || 0;
      } else if (custom.type === 'goal') {
        count = membersCount;
      }

      await renameChannelIfNeeded(custom.channelId, custom.template || 'Stat : {count}', count, custom.goalTarget);
    }
  }
}
