import prisma from '../../utils/db.js';
import { logger } from '../../utils/logger.js';
import { Client, ChannelType, TextChannel, Collection, Message } from 'discord.js';
import { getDateKey, getHourKey } from './analyticsService.js';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Initiates the historical message scraping in the background.
 */
export async function startHistoricalScraping(client: Client, guildId: string, force = false): Promise<void> {
  const guildDb = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { statsConfig: true, activated: true },
  });

  if (!guildDb) {
    logger.error('MessageScraper', `Guild ${guildId} not found in database.`);
    return;
  }

  if (!guildDb.activated) {
    logger.warn('MessageScraper', `Guild ${guildId} is not activated. Scraping aborted.`);
    return;
  }

  let statsConfig = (guildDb.statsConfig as unknown) || {};
  const status = statsConfig.historicalScrapeStatus || 'NOT_STARTED';

  if (status === 'IN_PROGRESS' && !force) {
    logger.warn('MessageScraper', `Scraping already in progress for guild ${guildId}.`);
    return;
  }
  if (status === 'COMPLETED' && !force) {
    logger.info('MessageScraper', `Scraping already completed for guild ${guildId}.`);
    return;
  }

  // Update status to IN_PROGRESS
  statsConfig = {
    ...statsConfig,
    historicalScrapeStatus: 'IN_PROGRESS',
    historicalScrapeError: null,
    historicalScrapedChannels: force ? [] : (statsConfig.historicalScrapedChannels || []),
    historicalScrapedMessages: force ? 0 : (statsConfig.historicalScrapedMessages || 0),
    historicalScrapedAt: new Date().toISOString(),
  };

  await prisma.guild.update({
    where: { id: guildId },
    data: { statsConfig },
  });

  // Run the background task without awaiting to allow immediate response
  runScrapeTask(client, guildId, force).catch((err) => {
    logger.error('MessageScraper', `Uncaught error in scraping task for guild ${guildId}:`, err);
  });
}

/**
 * The actual message scraping task running in the background.
 */
async function runScrapeTask(client: Client, guildId: string, force = false): Promise<void> {
  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    logger.error('MessageScraper', `Could not fetch guild ${guildId} from Discord client.`);
    await markScrapeFailed(guildId, 'Could not fetch guild from Discord client.');
    return;
  }

  // Ensure the bot member is fetched and cached safely
  const me = guild.members.me || await guild.members.fetch(client.user!.id).catch(() => null);
  if (!me) {
    logger.error('MessageScraper', `Could not fetch bot member in guild ${guild.name} (${guild.id})`);
    await markScrapeFailed(guildId, 'Could not fetch bot member in guild.');
    return;
  }

  try {
    logger.info('MessageScraper', `Starting historical message scraping for guild: ${guild.name} (${guild.id})`);

    // Fetch all channels in the guild
    const channels = await guild.channels.fetch();
    
    // Filter out text-based channels where the bot has read permission
    const textChannels = [...channels.values()].filter(c => 
      c &&
      c.isTextBased() &&
      c.type !== ChannelType.GuildVoice &&
      c.type !== ChannelType.GuildStageVoice &&
      c.permissionsFor(me)?.has(['ViewChannel', 'ReadMessageHistory'])
    ) as TextChannel[];

    const guildDb = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { statsConfig: true },
    });

    const statsConfig = (guildDb?.statsConfig as unknown) || {};

    // Establish the boundary date so we only scrape historical messages older than when the bot started real-time tracking
    let scrapingBoundaryDate = statsConfig.scrapingBoundaryDate;
    if (!scrapingBoundaryDate || force) {
      scrapingBoundaryDate = new Date().toISOString();
      statsConfig.scrapingBoundaryDate = scrapingBoundaryDate;
      await prisma.guild.update({
        where: { id: guildId },
        data: { statsConfig },
      });
    }

    const boundaryTime = new Date(scrapingBoundaryDate).getTime();
    const completedChannels = new Set<string>(force ? [] : (statsConfig.historicalScrapedChannels || []));
    let totalMessagesScraped = force ? 0 : (statsConfig.historicalScrapedMessages || 0);

    const modifiedDates = new Set<string>();

    const FLUSH_MESSAGE_THRESHOLD = 2000;

    for (const channel of textChannels) {
      if (completedChannels.has(channel.id)) {
        continue;
      }

      logger.info('MessageScraper', `Scraping channel #${channel.name} (${channel.id}) in guild ${guild.name}`);

      let lastMessageId: string | undefined = undefined;
      
      // Resume scraping from where we left off if this was the last channel in progress
      if (
        statsConfig.historicalScrapeProgress &&
        statsConfig.historicalScrapeProgress.currentChannelId === channel.id &&
        statsConfig.historicalScrapeProgress.currentLastMessageId
      ) {
        lastMessageId = statsConfig.historicalScrapeProgress.currentLastMessageId;
        logger.info('MessageScraper', `Resuming scraping for channel #${channel.name} from message ID: ${lastMessageId}`);
      } else {
        // Initial setup for the new channel
        statsConfig.historicalScrapeProgress = {
          scrapedChannelsCount: completedChannels.size,
          totalChannelsCount: textChannels.length,
          currentChannelName: channel.name,
          currentChannelId: channel.id,
          currentLastMessageId: null,
          scrapedMessagesCount: totalMessagesScraped,
        };

        await prisma.guild.update({
          where: { id: guildId },
          data: { statsConfig },
        });
      }

      const _channelMessagesScraped = 0;
      let messagesSinceLastFlush = 0;
      let hasMore = true;

      // In-memory aggregates for the current channel to minimize database upserts
      const guildDailyMsg = new Map<string, number>();
      const guildHourlyMsg = new Map<string, number>();
      const channelDailyMsg = new Map<string, number>();
      const channelDailyAuthors = new Map<string, Set<string>>();
      const memberDailyMsg = new Map<string, number>();
      const memberDailyReplies = new Map<string, number>();

      const flushStats = async (isChannelComplete: boolean) => {
        if (
          guildDailyMsg.size === 0 &&
          guildHourlyMsg.size === 0 &&
          channelDailyMsg.size === 0 &&
          memberDailyMsg.size === 0 &&
          !isChannelComplete
        ) {
          return;
        }

        try {
          logger.info('MessageScraper', `Flushing accumulated stats for #${channel.name} to DB (complete: ${isChannelComplete})...`);

          // Flush GuildDailyStat
          for (const [dateKey, count] of guildDailyMsg.entries()) {
            await prisma.guildDailyStat.upsert({
              where: { guildId_dateKey: { guildId, dateKey } },
              create: { guildId, dateKey, messagesCount: count },
              update: { messagesCount: { increment: count } },
            });
          }
          guildDailyMsg.clear();

          // Flush GuildHourlyStat
          for (const [key, count] of guildHourlyMsg.entries()) {
            const [dateKey, hourStr] = key.split(':');
            const hour = parseInt(hourStr, 10);
            await prisma.guildHourlyStat.upsert({
              where: { guildId_dateKey_hour: { guildId, dateKey, hour } },
              create: { guildId, dateKey, hour, messagesCount: count },
              update: { messagesCount: { increment: count } },
            });
          }
          guildHourlyMsg.clear();

          // Flush ChannelDailyStat
          for (const [dateKey, count] of channelDailyMsg.entries()) {
            const uniqueAuthorsCount = channelDailyAuthors.get(dateKey)?.size || 0;
            await prisma.channelDailyStat.upsert({
              where: { guildId_channelId_dateKey: { guildId, channelId: channel.id, dateKey } },
              create: {
                guildId,
                channelId: channel.id,
                dateKey,
                messagesCount: count,
                uniqueAuthors: uniqueAuthorsCount,
              },
              update: {
                messagesCount: { increment: count },
                uniqueAuthors: uniqueAuthorsCount,
              },
            });
          }
          channelDailyMsg.clear();
          channelDailyAuthors.clear();

          // Flush MemberDailyStat
          for (const [key, count] of memberDailyMsg.entries()) {
            const [userId, dateKey] = key.split(':');
            const replies = memberDailyReplies.get(key) || 0;
            await prisma.memberDailyStat.upsert({
              where: { guildId_userId_dateKey: { guildId, userId, dateKey } },
              create: { guildId, userId, dateKey, messagesCount: count, repliesCount: replies },
              update: {
                messagesCount: { increment: count },
                repliesCount: { increment: replies },
              },
            });
          }
          memberDailyMsg.clear();
          memberDailyReplies.clear();

          if (isChannelComplete) {
            completedChannels.add(channel.id);
          }

          statsConfig.historicalScrapedChannels = [...completedChannels];
          statsConfig.historicalScrapedMessages = totalMessagesScraped;

          if (isChannelComplete) {
            statsConfig.historicalScrapeProgress = {
              scrapedChannelsCount: completedChannels.size,
              totalChannelsCount: textChannels.length,
              currentChannelName: channel.name,
              scrapedMessagesCount: totalMessagesScraped,
            };
          } else {
            statsConfig.historicalScrapeProgress = {
              scrapedChannelsCount: completedChannels.size,
              totalChannelsCount: textChannels.length,
              currentChannelName: channel.name,
              currentChannelId: channel.id,
              currentLastMessageId: lastMessageId || null,
              scrapedMessagesCount: totalMessagesScraped,
            };
          }

          await prisma.guild.update({
            where: { id: guildId },
            data: { statsConfig },
          });
        } catch (dbErr) {
          logger.error('MessageScraper', `Failed to flush stats for channel ${channel.id}:`, dbErr);
        }
      };

      while (hasMore) {
        try {
          const fetched: Collection<string, Message> = await channel.messages.fetch({ limit: 100, before: lastMessageId });
          if (fetched.size === 0) {
            hasMore = false;
            break;
          }

          const oldestMessage: Message | undefined = fetched.last();
          if (!oldestMessage) {
            hasMore = false;
            break;
          }
          lastMessageId = oldestMessage.id;

          for (const msg of fetched.values()) {
            if (msg.author.bot) continue;

            // Only process messages created BEFORE the boundary date
            if (msg.createdAt.getTime() >= boundaryTime) {
              continue;
            }

            _channelMessagesScraped++;
            totalMessagesScraped++;
            messagesSinceLastFlush++;

            const dateKey = getDateKey(msg.createdAt);
            const hour = getHourKey(msg.createdAt);
            const authorId = msg.author.id;
            const memberKey = `${authorId}:${dateKey}`;

            modifiedDates.add(dateKey);

            // Increment Guild Daily Stats
            guildDailyMsg.set(dateKey, (guildDailyMsg.get(dateKey) || 0) + 1);

            // Increment Guild Hourly Stats
            const hourlyKey = `${dateKey}:${hour}`;
            guildHourlyMsg.set(hourlyKey, (guildHourlyMsg.get(hourlyKey) || 0) + 1);

            // Increment Channel Daily Stats
            channelDailyMsg.set(dateKey, (channelDailyMsg.get(dateKey) || 0) + 1);

            let authorsSet = channelDailyAuthors.get(dateKey);
            if (!authorsSet) {
              authorsSet = new Set<string>();
              channelDailyAuthors.set(dateKey, authorsSet);
            }
            authorsSet.add(authorId);

            // Increment Member Daily Stats
            memberDailyMsg.set(memberKey, (memberDailyMsg.get(memberKey) || 0) + 1);

            if (msg.reference) {
              memberDailyReplies.set(memberKey, (memberDailyReplies.get(memberKey) || 0) + 1);
            }
          }

          if (fetched.size < 100) {
            hasMore = false;
          }

          // Periodic flush to prevent too many accumulated DB upserts and OOM/timeouts
          if (messagesSinceLastFlush >= FLUSH_MESSAGE_THRESHOLD) {
            await flushStats(false);
            messagesSinceLastFlush = 0;
          }

          // Small delay to protect against Discord API rate limit
          await delay(250);
        } catch (fetchErr) {
          logger.error('MessageScraper', `Error fetching messages in channel ${channel.id}:`, fetchErr);
          // If we hit a permissions/unknown error, abort this channel but don't mark completed to allow retry later
          hasMore = false;
        }
      }

      // Final flush for this channel
      await flushStats(true);
    }

    // Recalculate daily active members for modified dates
    if (modifiedDates.size > 0) {
      logger.info('MessageScraper', `Recalculating active members count for ${modifiedDates.size} dates in guild ${guild.name}...`);
      for (const dateKey of modifiedDates) {
        try {
          const activeMembersCount = await prisma.memberDailyStat.count({
            where: { guildId, dateKey, messagesCount: { gt: 0 } },
          });

          await prisma.guildDailyStat.update({
            where: { guildId_dateKey: { guildId, dateKey } },
            data: { activeMembers: activeMembersCount },
          });
        } catch (err) {
          logger.error('MessageScraper', `Failed to update active members for date ${dateKey}:`, err);
        }
      }
    }

    // Finalize status to COMPLETED
    statsConfig.historicalScrapeStatus = 'COMPLETED';
    statsConfig.historicalScrapeError = null;
    statsConfig.historicalScrapedAt = new Date().toISOString();
    delete statsConfig.historicalScrapeProgress;

    await prisma.guild.update({
      where: { id: guildId },
      data: { statsConfig },
    });

    logger.success('MessageScraper', `Historical scraping successfully completed for guild ${guild.name} (${guildId}). Total messages: ${totalMessagesScraped}`);
  } catch (err) {
    logger.error('MessageScraper', `Fatal error during historical scraping for guild ${guildId}:`, err);
    await markScrapeFailed(guildId, err instanceof Error ? err.message : String(err));
  }
}

/**
 * Mark scraping status as FAILED in the database config.
 */
async function markScrapeFailed(guildId: string, errorMsg: string): Promise<void> {
  try {
    const guildDb = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { statsConfig: true },
    });

    const statsConfig = (guildDb?.statsConfig as unknown) || {};
    statsConfig.historicalScrapeStatus = 'FAILED';
    statsConfig.historicalScrapeError = errorMsg;
    delete statsConfig.historicalScrapeProgress;

    await prisma.guild.update({
      where: { id: guildId },
      data: { statsConfig },
    });
  } catch (err) {
    logger.error('MessageScraper', `Failed to mark scrape status as FAILED for guild ${guildId}:`, err);
  }
}
