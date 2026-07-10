import {
  Client,
  Events,
  Message,
  PartialMessage,
  ChannelType,
} from 'discord.js';
import prisma from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { getCachedGuild } from '../utils/cache.js';
import { isGuildActivated } from '../utils/activation.js';

const LOGGABLE_CHANNEL_TYPES = new Set<number>([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
  ChannelType.GuildVoice,
]);

/**
 * Determines whether message logging is active for a guild/channel and returns
 * the resolved guild config, or null when logging should be skipped.
 */
async function resolveLoggingConfig(guildId: string, channelId: string) {
  if (!isGuildActivated(guildId)) return null;
  const guildConfig = await getCachedGuild(guildId);
  if (!guildConfig || !guildConfig.messageLoggingEnabled) return null;
  const ignored = (guildConfig.messageLoggingIgnoredChannels ?? []) as string[];
  if (ignored.includes(channelId)) return null;
  return guildConfig;
}

function extractAttachments(message: Message) {
  return message.attachments.map((a) => ({
    name: a.name,
    url: a.url,
    contentType: a.contentType ?? null,
  }));
}

async function logMessage(message: Message): Promise<void> {
  const { guild, channel, author } = message;
  if (!guild || !author) return;
  if (channel.type === ChannelType.DM) return;
  if (!LOGGABLE_CHANNEL_TYPES.has(channel.type)) return;

  const config = await resolveLoggingConfig(guild.id, channel.id);
  if (!config) return;

  const attachments = extractAttachments(message);
  const stickerCount = message.stickers?.size ?? 0;

  // Nothing searchable/relevant to store (e.g. pure system messages).
  if (!message.content && attachments.length === 0 && stickerCount === 0) return;

  const channelName = 'name' in channel && channel.name ? channel.name : channel.id;
  const authorName = message.member?.displayName || author.displayName || author.username;

  try {
    await prisma.messageLog.create({
      data: {
        guildId: guild.id,
        channelId: channel.id,
        channelName,
        messageId: message.id,
        authorId: author.id,
        authorName,
        authorAvatar: author.displayAvatarURL({ size: 64 }),
        isBot: author.bot,
        content: message.content ?? '',
        attachments: attachments.length > 0 ? attachments : undefined,
        embedCount: message.embeds?.length ?? 0,
        hasAttachment: attachments.length > 0,
        createdAt: message.createdAt,
      },
    });
  } catch (err) {
    // Unique constraint (duplicate messageId) is benign — ignore it, surface the rest.
    const code = (err as { code?: string })?.code;
    if (code !== 'P2002') {
      logger.error('MessageLogging', `Impossible d'enregistrer le message ${message.id} (${guild.id}):`, err);
    }
  }
}

async function updateLoggedMessage(newMessage: Message | PartialMessage): Promise<void> {
  const guildId = newMessage.guild?.id;
  const channelId = newMessage.channelId;
  if (!guildId || !channelId) return;

  const config = await resolveLoggingConfig(guildId, channelId);
  if (!config) return;

  let full: Message;
  try {
    full = newMessage.partial ? await newMessage.fetch() : (newMessage as Message);
  } catch {
    return;
  }

  try {
    await prisma.messageLog.updateMany({
      where: { messageId: full.id },
      data: {
        content: full.content ?? '',
        embedCount: full.embeds?.length ?? 0,
        editedAt: new Date(),
      },
    });
  } catch (err) {
    logger.error('MessageLogging', `Impossible de mettre à jour le message ${full.id}:`, err);
  }
}

async function markMessageDeleted(messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) return;
  try {
    await prisma.messageLog.updateMany({
      where: { messageId: { in: messageIds }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  } catch (err) {
    logger.error('MessageLogging', 'Impossible de marquer des messages comme supprimés:', err);
  }
}

/**
 * Prunes message logs older than each guild's configured retention window.
 * Exported so it can be scheduled by the cron system.
 */
export async function pruneOldMessageLogs(): Promise<void> {
  const guilds = await prisma.guild.findMany({
    where: { messageLoggingEnabled: true },
    select: { id: true, messageLoggingRetentionDays: true },
  });

  for (const g of guilds) {
    const days = g.messageLoggingRetentionDays ?? 90;
    if (days <= 0) continue;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    try {
      const { count } = await prisma.messageLog.deleteMany({
        where: { guildId: g.id, createdAt: { lt: cutoff } },
      });
      if (count > 0) {
        logger.info('MessageLogging', `Purge de ${count} message(s) expiré(s) pour la guilde ${g.id}.`);
      }
    } catch (err) {
      logger.error('MessageLogging', `Erreur lors de la purge des logs pour ${g.id}:`, err);
    }
  }
}

export function registerMessageLoggingListener(client: Client): void {
  client.on(Events.MessageCreate, (message: Message) => {
    void logMessage(message);
  });

  client.on(Events.MessageUpdate, (_old, newMessage) => {
    void updateLoggedMessage(newMessage);
  });

  client.on(Events.MessageDelete, (message: Message | PartialMessage) => {
    void markMessageDeleted([message.id]);
  });

  client.on(Events.MessageBulkDelete, (messages) => {
    void markMessageDeleted([...messages.keys()]);
  });

  logger.success('MessageLogging', 'Écouteur de journalisation des messages enregistré');
}
