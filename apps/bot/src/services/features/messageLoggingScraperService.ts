import prisma from '../../utils/db.js';
import { logger } from '../../utils/logger.js';
import { Client, ChannelType, TextChannel, Collection, Message } from 'discord.js';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface MessageLoggingStatus {
  status?: string;
  error?: string | null;
  scrapedChannelsCount?: number;
  totalChannelsCount?: number;
  scrapedMessagesCount?: number;
  currentChannelName?: string;
  startedAt?: string;
  completedAt?: string;
}

function extractAttachments(message: Message) {
  return message.attachments.map((a) => ({
    name: a.name,
    url: a.url,
    contentType: a.contentType ?? null,
  }));
}

/**
 * Initiates the retroactive message logging backfill in the background.
 */
export async function startMessageLoggingBackfill(client: Client, guildId: string, force = false): Promise<void> {
  const guildDb = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { messageLoggingEnabled: true, messageLoggingRetentionDays: true, messageLoggingStatus: true },
  });

  if (!guildDb) {
    logger.error('MessageLoggingScraper', `Guild ${guildId} non trouvée dans la base de données.`);
    return;
  }

  if (!guildDb.messageLoggingEnabled) {
    logger.warn('MessageLoggingScraper', `La journalisation n'est pas activée pour la guilde ${guildId}. Scraping avorté.`);
    return;
  }

  const currentStatus = (guildDb.messageLoggingStatus as MessageLoggingStatus | null)?.status || 'NOT_STARTED';

  if (currentStatus === 'IN_PROGRESS' && !force) {
    logger.info('MessageLoggingScraper', `Indexation déjà en cours pour la guilde ${guildId}.`);
    return;
  }

  // Update status to IN_PROGRESS
  const initialStatus = {
    status: 'IN_PROGRESS',
    error: null,
    scrapedChannelsCount: 0,
    totalChannelsCount: 0,
    scrapedMessagesCount: 0,
    currentChannelName: 'Initialisation...',
    startedAt: new Date().toISOString(),
  };

  await prisma.guild.update({
    where: { id: guildId },
    data: { messageLoggingStatus: initialStatus },
  });

  // Run backfill task in background
  runBackfillTask(client, guildId, force).catch((err) => {
    logger.error('MessageLoggingScraper', `Erreur non gérée dans la tâche de backfill pour la guilde ${guildId}:`, err);
  });
}

/**
 * The actual message log backfilling task running in the background.
 */
async function runBackfillTask(client: Client, guildId: string, force = false): Promise<void> {
  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    logger.error('MessageLoggingScraper', `Impossible de récupérer la guilde ${guildId} depuis l'API Discord.`);
    await markBackfillFailed(guildId, 'Impossible de récupérer la guilde depuis Discord.');
    return;
  }

  const me = guild.members.me || await guild.members.fetch(client.user!.id).catch(() => null);
  if (!me) {
    logger.error('MessageLoggingScraper', `Impossible de récupérer le membre bot dans la guilde ${guild.name} (${guild.id})`);
    await markBackfillFailed(guildId, 'Impossible de récupérer le membre bot.');
    return;
  }

  try {
    logger.info('MessageLoggingScraper', `Démarrage de l'indexation rétroactive pour la guilde: ${guild.name} (${guild.id})`);

    const guildDb = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { messageLoggingRetentionDays: true, messageLoggingIgnoredChannels: true, messageLoggingStatus: true },
    });

    const retentionDays = guildDb?.messageLoggingRetentionDays ?? 90;
    const ignoredChannels = (guildDb?.messageLoggingIgnoredChannels ?? []) as string[];

    // Calculate boundary date
    const cutoffTime = retentionDays > 0 
      ? Date.now() - retentionDays * 24 * 60 * 60 * 1000 
      : 0;

    // Fetch all channels in the guild
    const channels = await guild.channels.fetch();
    
    // Filter text-based channels where the bot has read permission
    const textChannels = [...channels.values()].filter(c => 
      c &&
      c.isTextBased() &&
      !ignoredChannels.includes(c.id) &&
      c.permissionsFor(me)?.has(['ViewChannel', 'ReadMessageHistory'])
    ) as TextChannel[];

    let scrapedChannels = 0;
    let totalMessagesScraped = 0;

    const statusObj = {
      status: 'IN_PROGRESS',
      error: null,
      scrapedChannelsCount: scrapedChannels,
      totalChannelsCount: textChannels.length,
      scrapedMessagesCount: totalMessagesScraped,
      currentChannelName: '',
      startedAt: (guildDb?.messageLoggingStatus as MessageLoggingStatus | null)?.startedAt || new Date().toISOString(),
    };

    for (const channel of textChannels) {
      statusObj.currentChannelName = channel.name;
      statusObj.scrapedChannelsCount = scrapedChannels;
      statusObj.scrapedMessagesCount = totalMessagesScraped;

      await prisma.guild.update({
        where: { id: guildId },
        data: { messageLoggingStatus: statusObj },
      });

      logger.info('MessageLoggingScraper', `Scraping historique pour #${channel.name} (${channel.id}) dans ${guild.name}`);

      let lastMessageId: string | undefined = undefined;
      let hasMore = true;
      let channelMessagesScraped = 0;

      while (hasMore) {
        try {
          const fetched: Collection<string, Message> = await channel.messages.fetch({ limit: 100, before: lastMessageId });
          if (fetched.size === 0) {
            hasMore = false;
            break;
          }

          const oldestMessage = fetched.last();
          if (!oldestMessage) {
            hasMore = false;
            break;
          }
          lastMessageId = oldestMessage.id;

          const batchData = [];

          for (const msg of fetched.values()) {
            // Respect the retention date boundary
            if (cutoffTime > 0 && msg.createdAt.getTime() < cutoffTime) {
              hasMore = false;
              continue;
            }

            const attachments = extractAttachments(msg);
            const stickerCount = msg.stickers?.size ?? 0;

            // Skip uninteresting system messages with no searchable text
            if (!msg.content && attachments.length === 0 && stickerCount === 0) continue;

            const channelName = 'name' in channel && channel.name ? channel.name : channel.id;
            const authorName = msg.member?.displayName || msg.author.displayName || msg.author.username;

            batchData.push({
              guildId: guild.id,
              channelId: channel.id,
              channelName,
              messageId: msg.id,
              authorId: msg.author.id,
              authorName,
              authorAvatar: msg.author.displayAvatarURL({ size: 64 }),
              isBot: msg.author.bot,
              content: msg.content ?? '',
              attachments: attachments.length > 0 ? attachments : undefined,
              embedCount: msg.embeds?.length ?? 0,
              hasAttachment: attachments.length > 0,
              createdAt: msg.createdAt,
            });
          }

          if (batchData.length > 0) {
            await prisma.messageLog.createMany({
              data: batchData,
              skipDuplicates: true,
            });
            channelMessagesScraped += batchData.length;
            totalMessagesScraped += batchData.length;
          }

          if (fetched.size < 100) {
            hasMore = false;
          }

          // In-loop UI progress update for large channels (every 500 messages)
          if (channelMessagesScraped % 500 === 0 && channelMessagesScraped > 0) {
            statusObj.scrapedMessagesCount = totalMessagesScraped;
            await prisma.guild.update({
              where: { id: guildId },
              data: { messageLoggingStatus: statusObj },
            });
          }

          // Anti-rate limit delay
          await delay(250);
        } catch (fetchErr) {
          logger.error('MessageLoggingScraper', `Erreur lors de la récupération des messages de #${channel.name}:`, fetchErr);
          hasMore = false;
        }
      }

      scrapedChannels++;
      logger.success('MessageLoggingScraper', `Fini #${channel.name} : ${channelMessagesScraped} messages importés.`);
    }

    // Finalize status to COMPLETED
    const finalStatus = {
      status: 'COMPLETED',
      error: null,
      scrapedChannelsCount: textChannels.length,
      totalChannelsCount: textChannels.length,
      scrapedMessagesCount: totalMessagesScraped,
      currentChannelName: 'Terminé',
      startedAt: statusObj.startedAt,
      completedAt: new Date().toISOString(),
    };

    await prisma.guild.update({
      where: { id: guildId },
      data: { messageLoggingStatus: finalStatus },
    });

    logger.success('MessageLoggingScraper', `Indexation rétroactive terminée pour la guilde ${guild.name} (${guildId}). Total : ${totalMessagesScraped} messages.`);
  } catch (err) {
    logger.error('MessageLoggingScraper', `Erreur fatale lors du backfill pour la guilde ${guildId}:`, err);
    await markBackfillFailed(guildId, err instanceof Error ? err.message : String(err));
  }
}

/**
 * Mark backfill status as FAILED in the database.
 */
async function markBackfillFailed(guildId: string, errorMsg: string): Promise<void> {
  try {
    const guildDb = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { messageLoggingStatus: true },
    });

    const statusObj = { ...((guildDb?.messageLoggingStatus as MessageLoggingStatus | null) || {}) } as MessageLoggingStatus;
    statusObj.status = 'FAILED';
    statusObj.error = errorMsg;
    statusObj.completedAt = new Date().toISOString();

    await prisma.guild.update({
      where: { id: guildId },
      data: { messageLoggingStatus: statusObj },
    });
  } catch (err) {
    logger.error('MessageLoggingScraper', `Impossible de marquer le statut en FAILED pour la guilde ${guildId}:`, err);
  }
}
