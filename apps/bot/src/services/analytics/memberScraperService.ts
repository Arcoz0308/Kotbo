import prisma from '../../utils/db.js';
import { logger } from '../../utils/logger.js';
import { Client, GuildMember } from 'discord.js';
import { getDateKey } from './analyticsService.js';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function startMemberScraping(client: Client, guildId: string, force = false): Promise<void> {
  const guildDb = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { statsConfig: true, activated: true },
  });

  if (!guildDb) {
    logger.error('MemberScraper', `Guild ${guildId} not found in database.`);
    return;
  }

  if (!guildDb.activated) {
    logger.warn('MemberScraper', `Guild ${guildId} is not activated. Scraping aborted.`);
    return;
  }

  let statsConfig = (guildDb.statsConfig as any) || {};
  const status = statsConfig.memberScrapeStatus || 'NOT_STARTED';

  if (status === 'IN_PROGRESS' && !force) {
    logger.warn('MemberScraper', `Member scraping already in progress for guild ${guildId}.`);
    return;
  }
  if (status === 'COMPLETED' && !force) {
    logger.info('MemberScraper', `Member scraping already completed for guild ${guildId}.`);
    return;
  }

  statsConfig = {
    ...statsConfig,
    memberScrapeStatus: 'IN_PROGRESS',
    memberScrapeError: null,
    memberScrapedCount: force ? 0 : (statsConfig.memberScrapedCount || 0),
    memberScrapedAt: new Date().toISOString(),
  };

  await prisma.guild.update({
    where: { id: guildId },
    data: { statsConfig },
  });

  runMemberScrapeTask(client, guildId, force).catch((err) => {
    logger.error('MemberScraper', `Uncaught error in member scraping task for guild ${guildId}:`, err);
  });
}

async function runMemberScrapeTask(client: Client, guildId: string, _force = false): Promise<void> {
  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    logger.error('MemberScraper', `Could not fetch guild ${guildId} from Discord client.`);
    await markScrapeFailed(guildId, 'Could not fetch guild from Discord client.');
    return;
  }

  try {
    logger.info('MemberScraper', `Starting member scraping for guild: ${guild.name} (${guild.id})`);

    // Fetch ALL members from Discord API
    const members = await guild.members.fetch();
    const humanMembers = members.filter(m => !m.user.bot);

    logger.info('MemberScraper', `Fetched ${humanMembers.size} human members for guild ${guild.name}`);

    // Aggregate joins by date for GuildDailyStat population
    const joinsByDate = new Map<string, number>();
    let scrapedCount = 0;

    const BATCH_SIZE = 50;
    const memberArray = [...humanMembers.values()];

    for (let i = 0; i < memberArray.length; i += BATCH_SIZE) {
      const batch = memberArray.slice(i, i + BATCH_SIZE);

      const ops = batch.map((member: GuildMember) => {
        const joinedAt = member.joinedAt;
        if (joinedAt) {
          const dateKey = getDateKey(joinedAt);
          joinsByDate.set(dateKey, (joinsByDate.get(dateKey) || 0) + 1);
        }

        return prisma.memberProfile.upsert({
          where: {
            guildId_userId: { guildId, userId: member.id },
          },
          update: {
            userTag: member.user.tag,
            username: member.user.username,
            globalName: member.user.globalName ?? null,
            displayName: member.displayName ?? member.user.globalName ?? member.user.username,
            avatarUrl: member.user.displayAvatarURL({ size: 256 }),
            accentColor: member.user.accentColor ?? null,
            isBot: false,
            accountCreatedAt: member.user.createdAt,
            guildJoinedAt: joinedAt ?? undefined,
            guildLeftAt: null,
            lastSeenAt: new Date(),
            rolesSnapshot: member.roles.cache.map(r => r.id).filter(id => id !== guildId),
          },
          create: {
            guildId,
            userId: member.id,
            userTag: member.user.tag,
            username: member.user.username,
            globalName: member.user.globalName ?? null,
            displayName: member.displayName ?? member.user.globalName ?? member.user.username,
            avatarUrl: member.user.displayAvatarURL({ size: 256 }),
            accentColor: member.user.accentColor ?? null,
            isBot: false,
            accountCreatedAt: member.user.createdAt,
            guildJoinedAt: joinedAt ?? null,
            guildLeftAt: null,
            lastSeenAt: new Date(),
            rolesSnapshot: member.roles.cache.map(r => r.id).filter(id => id !== guildId),
          },
        });
      });

      await prisma.$transaction(ops).catch((error) => {
        logger.error('MemberScraper', `Error upserting member batch (offset ${i}):`, error);
      });

      scrapedCount += batch.length;

      // Update progress
      const guildDb = await prisma.guild.findUnique({
        where: { id: guildId },
        select: { statsConfig: true },
      });
      const cfg = (guildDb?.statsConfig as any) || {};
      cfg.memberScrapedCount = scrapedCount;
      cfg.memberScrapeProgress = {
        scrapedCount,
        totalCount: humanMembers.size,
      };
      await prisma.guild.update({
        where: { id: guildId },
        data: { statsConfig: cfg },
      });

      await delay(100);
    }

    // Now populate GuildDailyStat with historical join counts
    logger.info('MemberScraper', `Populating historical join stats for ${joinsByDate.size} dates in guild ${guild.name}...`);

    const dateEntries = [...joinsByDate.entries()];
    for (let i = 0; i < dateEntries.length; i += BATCH_SIZE) {
      const chunk = dateEntries.slice(i, i + BATCH_SIZE);

      const ops = chunk.map(([dateKey, count]) => {
        return prisma.guildDailyStat.upsert({
          where: { guildId_dateKey: { guildId, dateKey } },
          create: { guildId, dateKey, membersJoined: count },
          update: { membersJoined: count },
        });
      });

      await prisma.$transaction(ops).catch((error) => {
        logger.error('MemberScraper', `Error upserting GuildDailyStat batch (offset ${i}):`, error);
      });
    }

    // Also populate GuildHourlyStat for join counts (spread across hour 12 as default for historical data)
    for (let i = 0; i < dateEntries.length; i += BATCH_SIZE) {
      const chunk = dateEntries.slice(i, i + BATCH_SIZE);

      const ops = chunk.map(([dateKey, count]) => {
        return prisma.guildHourlyStat.upsert({
          where: { guildId_dateKey_hour: { guildId, dateKey, hour: 12 } },
          create: { guildId, dateKey, hour: 12, joinsCount: count },
          update: { joinsCount: count },
        });
      });

      await prisma.$transaction(ops).catch((error) => {
        logger.error('MemberScraper', `Error upserting GuildHourlyStat batch (offset ${i}):`, error);
      });
    }

    // Mark members who left (in DB but not in Discord) with guildLeftAt
    const existingProfiles = await prisma.memberProfile.findMany({
      where: { guildId, isBot: false, guildLeftAt: null },
      select: { userId: true, guildJoinedAt: true },
    });

    const currentMemberIds = new Set(humanMembers.map(m => m.id));
    const leftMembers = existingProfiles.filter(p => !currentMemberIds.has(p.userId));

    if (leftMembers.length > 0) {
      logger.info('MemberScraper', `Marking ${leftMembers.length} members as left in guild ${guild.name}...`);

      // Aggregate leaves by date (use today as leave date since we don't know when they left)
      const leavesByDate = new Map<string, number>();
      const now = new Date();

      for (let i = 0; i < leftMembers.length; i += BATCH_SIZE) {
        const chunk = leftMembers.slice(i, i + BATCH_SIZE);

        const ops = chunk.map(member => {
          const dateKey = getDateKey(now);
          leavesByDate.set(dateKey, (leavesByDate.get(dateKey) || 0) + 1);

          return prisma.memberProfile.update({
            where: { guildId_userId: { guildId, userId: member.userId } },
            data: { guildLeftAt: now },
          });
        });

        await prisma.$transaction(ops).catch((error) => {
          logger.error('MemberScraper', `Error updating left members batch (offset ${i}):`, error);
        });
      }

      // Update GuildDailyStat with leave counts
      for (const [dateKey, count] of leavesByDate.entries()) {
        await prisma.guildDailyStat.upsert({
          where: { guildId_dateKey: { guildId, dateKey } },
          create: { guildId, dateKey, membersLeft: count },
          update: { membersLeft: { increment: count } },
        });
      }
    }

    // Populate totalMembers snapshot for each historical date
    const sortedDates = [...joinsByDate.keys()].sort();
    if (sortedDates.length > 0) {
      logger.info('MemberScraper', `Computing historical totalMembers snapshots for ${sortedDates.length} dates...`);

      let runningTotal = 0;
      for (const dateKey of sortedDates) {
        runningTotal += joinsByDate.get(dateKey) || 0;

        await prisma.guildDailyStat.update({
          where: { guildId_dateKey: { guildId, dateKey } },
          data: { totalMembers: runningTotal, totalHumans: runningTotal },
        }).catch(() => {});
      }
    }

    // Finalize
    const finalGuild = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { statsConfig: true },
    });
    const finalConfig = (finalGuild?.statsConfig as any) || {};
    finalConfig.memberScrapeStatus = 'COMPLETED';
    finalConfig.memberScrapeError = null;
    finalConfig.memberScrapedCount = scrapedCount;
    finalConfig.memberScrapedAt = new Date().toISOString();
    delete finalConfig.memberScrapeProgress;

    await prisma.guild.update({
      where: { id: guildId },
      data: { statsConfig: finalConfig },
    });

    logger.success('MemberScraper', `Member scraping completed for guild ${guild.name} (${guildId}). Total members: ${scrapedCount}, Dates: ${joinsByDate.size}, Left: ${leftMembers.length}`);
  } catch (err) {
    logger.error('MemberScraper', `Fatal error during member scraping for guild ${guildId}:`, err);
    await markScrapeFailed(guildId, err instanceof Error ? err.message : String(err));
  }
}

async function markScrapeFailed(guildId: string, errorMsg: string): Promise<void> {
  try {
    const guildDb = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { statsConfig: true },
    });

    const statsConfig = (guildDb?.statsConfig as any) || {};
    statsConfig.memberScrapeStatus = 'FAILED';
    statsConfig.memberScrapeError = errorMsg;
    delete statsConfig.memberScrapeProgress;

    await prisma.guild.update({
      where: { id: guildId },
      data: { statsConfig },
    });
  } catch (err) {
    logger.error('MemberScraper', `Failed to mark scrape status as FAILED for guild ${guildId}:`, err);
  }
}
