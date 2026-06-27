import { type Client, PermissionFlagsBits } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getCachedGuild } from '../utils/cache.js';

export function invalidateAutoThreadCache(_guildId?: string): void {
  // Handled by the central cache invalidation
}

async function getAutoThreadConfig(guildId: string): Promise<{ enabled: boolean; channels: string[]; botsEnabled: boolean }> {
  try {
    const guild = await getCachedGuild(guildId);
    return {
      enabled: guild?.autoThreadEnabled ?? false,
      channels: guild?.autoThreadChannels ?? [],
      botsEnabled: guild?.autoThreadBotsEnabled ?? false,
    };
  } catch (error) {
    logger.error('AutoThread', `Erreur lors de la récupération de la config pour la guilde ${guildId} :`, error);
    return { enabled: false, channels: [], botsEnabled: false };
  }
}

export function registerAutoThreadListener(client: Client): void {
  client.on('messageCreate', async message => {
    if (message.channel.isDMBased()) return;
    if (message.channel.isThread()) return;
    if (!message.guildId) return;

    try {
      const config = await getAutoThreadConfig(message.guildId);
      if (!config.enabled || !config.channels.includes(message.channelId)) {
        return;
      }

      // Skip interaction responses — they may be ephemeral or not threadable
      if (message.interaction) return;

      // Si c'est un bot autre que Kotbo lui-même, on vérifie si la création automatique est activée pour les bots.
      // Kotbo lui-même doit pouvoir créer des fils sur ses propres messages (comme les suggestions ou annonces).
      if (message.author.bot && message.author.id !== client.user?.id && !config.botsEnabled) {
        return;
      }

      // Check bot permissions in this guild / channel
      if (message.guild) {
        const botMember = message.guild.members.me ?? await message.guild.members.fetchMe();
        const permissions = botMember.permissionsIn(message.channel);
        if (!permissions.has(PermissionFlagsBits.CreatePublicThreads) ||
            !permissions.has(PermissionFlagsBits.SendMessagesInThreads)) {
          logger.warn('AutoThread', `Permissions insuffisantes dans le salon ${message.channelId} (guilde: ${message.guildId})`);
          return;
        }
      }

      // Build thread name
      let rawName = message.content ? message.content.replace(/[\n\r]+/g, ' ').trim() : '';
      let authorName = message.member?.displayName || message.author.displayName || message.author.username;

      // Si le message est vide mais contient un embed (ex: suggestion ou annonce de Kotbo), on extrait le titre/description et l'auteur de l'embed
      if (!rawName && message.embeds && message.embeds.length > 0) {
        const embed = message.embeds[0];
        if (embed.description) {
          rawName = embed.description.replace(/[\n\r]+/g, ' ').trim();
        } else if (embed.title) {
          rawName = embed.title.replace(/[\n\r]+/g, ' ').trim();
        }

        if (embed.author?.name) {
          authorName = embed.author.name;
        }
      }

      const cleanContent = rawName.substring(0, 40);
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
