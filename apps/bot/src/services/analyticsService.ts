import prisma from '../utils/db.js';

/**
 * Helper to get the date string (YYYY-MM-DD) in a specific timezone or UTC
 */
export const getDateKey = (date: Date = new Date()): string => {
  return date.toISOString().split('T')[0];
};

/**
 * Helper to get the current hour (0-23)
 */
export const getHourKey = (date: Date = new Date()): number => {
  return date.getUTCHours();
};

/**
 * Increment message counts in analytics tables
 */
export const trackMessage = async (guildId: string, channelId: string, userId: string) => {
  const dateKey = getDateKey();
  const hour = getHourKey();

  // 1. Guild Daily Stat
  await prisma.guildDailyStat.upsert({
    where: { guildId_dateKey: { guildId, dateKey } },
    update: { messagesCount: { increment: 1 } },
    create: { guildId, dateKey, messagesCount: 1 }
  });

  // 2. Guild Hourly Stat
  await prisma.guildHourlyStat.upsert({
    where: { guildId_dateKey_hour: { guildId, dateKey, hour } },
    update: { messagesCount: { increment: 1 } },
    create: { guildId, dateKey, hour, messagesCount: 1 }
  });

  // 3. Channel Daily Stat
  await prisma.channelDailyStat.upsert({
    where: { guildId_channelId_dateKey: { guildId, channelId, dateKey } },
    update: { messagesCount: { increment: 1 } },
    create: { guildId, channelId, dateKey, messagesCount: 1, uniqueAuthors: 1 } // To do accurately, uniqueAuthors needs distinct counting
  });

  // 4. Member Daily Stat
  await prisma.memberDailyStat.upsert({
    where: { guildId_userId_dateKey: { guildId, userId, dateKey } },
    update: { messagesCount: { increment: 1 } },
    create: { guildId, userId, dateKey, messagesCount: 1 }
  });
};

/**
 * Increment voice minutes in analytics tables
 */
export const trackVoiceSession = async (guildId: string, userId: string, durationMinutes: number) => {
  if (durationMinutes <= 0) return;
  const dateKey = getDateKey();
  const hour = getHourKey();

  await prisma.guildDailyStat.upsert({
    where: { guildId_dateKey: { guildId, dateKey } },
    update: { 
      voiceMinutes: { increment: durationMinutes },
      voiceSessionsCount: { increment: 1 }
    },
    create: { 
      guildId, 
      dateKey, 
      voiceMinutes: durationMinutes,
      voiceSessionsCount: 1
    }
  });

  await prisma.guildHourlyStat.upsert({
    where: { guildId_dateKey_hour: { guildId, dateKey, hour } },
    update: { voiceMinutes: { increment: durationMinutes } },
    create: { guildId, dateKey, hour, voiceMinutes: durationMinutes }
  });

  await prisma.memberDailyStat.upsert({
    where: { guildId_userId_dateKey: { guildId, userId, dateKey } },
    update: { voiceMinutes: { increment: durationMinutes } },
    create: { guildId, userId, dateKey, voiceMinutes: durationMinutes }
  });
};

/**
 * Record a member join
 */
export const trackMemberJoin = async (guildId: string) => {
  const dateKey = getDateKey();
  const hour = getHourKey();

  await prisma.guildDailyStat.upsert({
    where: { guildId_dateKey: { guildId, dateKey } },
    update: { membersJoined: { increment: 1 } },
    create: { guildId, dateKey, membersJoined: 1 }
  });

  await prisma.guildHourlyStat.upsert({
    where: { guildId_dateKey_hour: { guildId, dateKey, hour } },
    update: { joinsCount: { increment: 1 } },
    create: { guildId, dateKey, hour, joinsCount: 1 }
  });
};

/**
 * Record a member leave
 */
export const trackMemberLeave = async (guildId: string) => {
  const dateKey = getDateKey();
  const hour = getHourKey();

  await prisma.guildDailyStat.upsert({
    where: { guildId_dateKey: { guildId, dateKey } },
    update: { membersLeft: { increment: 1 } },
    create: { guildId, dateKey, membersLeft: 1 }
  });

  await prisma.guildHourlyStat.upsert({
    where: { guildId_dateKey_hour: { guildId, dateKey, hour } },
    update: { leavesCount: { increment: 1 } },
    create: { guildId, dateKey, hour, leavesCount: 1 }
  });
};

/**
 * Snapshot server population (total members, online, offline, bots vs humans)
 */
export const snapshotServerPopulation = async (
  guildId: string, 
  stats: {
    totalMembers: number;
    onlineMembers: number;
    idleMembers: number;
    dndMembers: number;
    offlineMembers: number;
    totalBots: number;
    totalHumans: number;
    activeMembers?: number;
    activeVoiceMembers?: number;
  }
) => {
  const dateKey = getDateKey();

  const daily = await prisma.guildDailyStat.upsert({
    where: { guildId_dateKey: { guildId, dateKey } },
    update: {
      totalMembers: stats.totalMembers,
      onlineMembers: stats.onlineMembers,
      idleMembers: stats.idleMembers,
      dndMembers: stats.dndMembers,
      offlineMembers: stats.offlineMembers,
      totalBots: stats.totalBots,
      totalHumans: stats.totalHumans,
      // Only update active members if explicitly provided
      ...(stats.activeMembers !== undefined ? { activeMembers: stats.activeMembers } : {}),
      ...(stats.activeVoiceMembers !== undefined ? { activeVoiceMembers: stats.activeVoiceMembers } : {})
    },
    create: {
      guildId,
      dateKey,
      totalMembers: stats.totalMembers,
      onlineMembers: stats.onlineMembers,
      idleMembers: stats.idleMembers,
      dndMembers: stats.dndMembers,
      offlineMembers: stats.offlineMembers,
      totalBots: stats.totalBots,
      totalHumans: stats.totalHumans,
      ...(stats.activeMembers !== undefined ? { activeMembers: stats.activeMembers } : {}),
      ...(stats.activeVoiceMembers !== undefined ? { activeVoiceMembers: stats.activeVoiceMembers } : {})
    }
  });

  // Track Peak values
  if (stats.onlineMembers > daily.peakOnline) {
    await prisma.guildDailyStat.update({
      where: { id: daily.id },
      data: { peakOnline: stats.onlineMembers }
    });
  }

  // Update Hourly Stat with online members
  const hour = getHourKey();
  await prisma.guildHourlyStat.upsert({
    where: { guildId_dateKey_hour: { guildId, dateKey, hour } },
    update: { onlineMembers: stats.onlineMembers },
    create: { guildId, dateKey, hour, onlineMembers: stats.onlineMembers }
  });
};
