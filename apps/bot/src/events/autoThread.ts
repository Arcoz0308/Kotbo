import { type Client, PermissionFlagsBits } from 'discord.js';
import { logger } from '../utils/logger.js';

const autoThreadCache = new Map<string, { enabled: boolean; channels: string[]; expiresAt: number }>();

export function invalidateAutoThreadCache(guildId?: string): void {
  if (guildId) {
    autoThreadCache.delete(guildId);
    return;
  }
  autoThreadCache.clear();
}

async function getAutoThreadConfig(guildId: string): Promise<{ enabled: boolean; channels: string[] }> {
  const cached = autoThreadCache.get(guildId);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached;
  }

  try {
    const { default: prisma } = await import('../utils/db.js');
    const guild = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { autoThreadEnabled: true, autoThreadChannels: true },
    });

    const config = {
      enabled: guild?.autoThreadEnabled ?? false,
      channels: guild?.autoThreadChannels ?? [],
      expiresAt: now + 60_000 // Cache for 60 seconds
    };
    autoThreadCache.set(guildId, config);
    return config;
  } catch (error) {
    logger.error('AutoThread', `Erreur lors de la récupération de la config pour la guilde ${guildId} :`, error);
    return { enabled: false, channels: [] };
  }
}

export function registerAutoThreadListener(client: Client): void {
  client.on('messageCreate', async message => {
    if (message.author.bot || message.channel.isDMBased()) return;
    if (message.channel.isThread()) return;
    if (!message.guildId) return;

    try {
      const config = await getAutoThreadConfig(message.guildId);
      if (!config.enabled || !config.channels.includes(message.channelId)) {
        return;
      }

      // Check bot permissions in this guild / channel
      if (message.guild) {
        const botMember = await message.guild.members.fetchMe();
        const permissions = botMember.permissionsIn(message.channel);
        if (!permissions.has(PermissionFlagsBits.CreatePublicThreads) ||
            !permissions.has(PermissionFlagsBits.SendMessagesInThreads)) {
          logger.warn('AutoThread', `Permissions insuffisantes dans le salon ${message.channelId} (guilde: ${message.guildId})`);
          return;
        }
      }

      // Build thread name
      const rawName = message.content ? message.content.replace(/[\n\r]+/g, ' ').trim() : '';
      const cleanContent = rawName.substring(0, 40);
      const authorName = message.member?.displayName || message.author.displayName || message.author.username;
      const threadName = cleanContent 
        ? `Fil de ${authorName} - ${cleanContent}...` 
        : `Fil de ${authorName}`;

      const thread = await message.startThread({
        name: threadName.substring(0, 100), // Discord limit is 100
        autoArchiveDuration: 1440, // 24 hours
        reason: `AutoThread activé pour le salon.`,
      });

      logger.info('AutoThread', `Fil créé : "${thread.name}" (${thread.id}) pour le message ${message.id}`);
    } catch (error) {
      logger.error('AutoThread', 'Erreur lors de la création du fil de discussion :', error);
    }
  });

  logger.success('AutoThread', 'Écouteur AutoThread enregistré');
}
