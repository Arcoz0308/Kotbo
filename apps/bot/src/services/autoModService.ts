import { Message, MessageFlags, PermissionFlagsBits, ChannelType, EmbedBuilder } from 'discord.js';
import prisma from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { registerWarnSanction, registerTimeoutSanction } from './sanctionService.js';

// Cache for AutoMod configs: key is guildId, value is the config object
const autoModConfigsCache = new Map<string, any>();

// In-memory spam tracker: key is "guildId:userId", value is array of timestamps of messages sent
const userMessageTimestamps = new Map<string, number[]>();

/**
 * Invalide le cache de configuration AutoMod pour une guilde
 */
export function invalidateAutoModCache(guildId: string) {
  autoModConfigsCache.delete(guildId);
}

/**
 * Récupère ou initialise la configuration AutoMod d'une guilde
 */
export async function getOrCreateAutoModConfig(guildId: string) {
  let config = autoModConfigsCache.get(guildId);
  if (!config) {
    config = await prisma.autoModConfig.findUnique({
      where: { guildId },
    });

    if (!config) {
      config = await prisma.autoModConfig.create({
        data: {
          guildId,
          spamEnabled: false,
          spamLimit: 5,
          spamIntervalSeconds: 5,
          spamAction: 'TIMEOUT',
          linksEnabled: false,
          linksAction: 'DELETE_AND_WARN',
          capsEnabled: false,
          capsThresholdPercent: 80,
          capsMinLength: 10,
          emojisEnabled: false,
          emojisLimit: 10,
          mentionsEnabled: false,
          mentionsLimit: 5,
        },
      });
    }
    autoModConfigsCache.set(guildId, config);
  }
  return config;
}

/**
 * Analyse un message et applique des sanctions si nécessaire
 * @returns true si le message a été supprimé ou l'utilisateur sanctionné (interrompre le traitement)
 */
export async function handleAutoMod(message: Message, client: any): Promise<boolean> {
  // Ignorer si message privé, envoyé par un bot, ou par un administrateur du serveur
  if (!message.guild || !message.member || message.author.bot) return false;
  if (message.member.permissions.has(PermissionFlagsBits.Administrator)) return false;

  try {
    const guildId = message.guild.id;
    const config = await getOrCreateAutoModConfig(guildId);

    // Vérifier si le rôle ou le salon est exempté
    if (config.bypassChannels.includes(message.channel.id)) return false;
    const hasBypassRole = message.member.roles.cache.some(r => config.bypassRoles.includes(r.id));
    if (hasBypassRole) return false;

    const content = message.content;
    const userId = message.author.id;

    // 1. Anti-Spam
    if (config.spamEnabled) {
      const trackerKey = `${guildId}:${userId}`;
      const now = Date.now();
      const userTimes = userMessageTimestamps.get(trackerKey) || [];

      // Nettoyer les vieux messages hors de la fenêtre d'intervalle
      const thresholdTime = now - (config.spamIntervalSeconds * 1000);
      const recentTimes = userTimes.filter(t => t > thresholdTime);
      recentTimes.push(now);
      userMessageTimestamps.set(trackerKey, recentTimes);

      if (recentTimes.length > config.spamLimit) {
        // Déclencher sanction de Spam
        await deleteMessage(message);
        await applySanction(
          message,
          config.spamAction,
          '[AutoMod] Spam détecté (messages trop rapides)',
          client
        );
        return true;
      }
    }

    // 2. Anti-Liens / Invitations Discord
    if (config.linksEnabled) {
      const inviteRegex = /(discord\.(gg|io|me|li)\/.+|discord\.com\/invite\/.+)/gi;
      if (inviteRegex.test(content)) {
        // Vérifier si le lien appartient à la whitelist
        const domains = config.linksWhitelist || [];
        const isWhitelisted = domains.some((domain: string) => content.includes(domain));

        if (!isWhitelisted) {
          await deleteMessage(message);
          await applySanction(
            message,
            config.linksAction,
            '[AutoMod] Partage d\'invitation Discord non autorisé',
            client
          );
          return true;
        }
      }
    }

    // 3. Limite de majuscules (Caps Lock)
    if (config.capsEnabled && content.length >= config.capsMinLength) {
      const letters = content.replace(/[^a-zA-Z]/g, '');
      if (letters.length >= config.capsMinLength) {
        const uppercaseLetters = letters.replace(/[^A-Z]/g, '');
        const percent = (uppercaseLetters.length / letters.length) * 100;

        if (percent >= config.capsThresholdPercent) {
          await deleteMessage(message);
          await applySanction(
            message,
            'WARN',
            `[AutoMod] Excès de majuscules (${Math.round(percent)}% de majuscules)`,
            client
          );
          return true;
        }
      }
    }

    // 4. Limite d'émojis
    if (config.emojisEnabled) {
      const customEmojiRegex = /<a?:\w+:\d+>/g;
      const unicodeEmojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{1F1E6}-\u{1F1FF}]/gu;
      
      const customCount = (content.match(customEmojiRegex) || []).length;
      const unicodeCount = (content.match(unicodeEmojiRegex) || []).length;
      const totalEmojis = customCount + unicodeCount;

      if (totalEmojis > config.emojisLimit) {
        await deleteMessage(message);
        await applySanction(
          message,
          'WARN',
          `[AutoMod] Trop d'émojis (${totalEmojis} émojis envoyés)`,
          client
        );
        return true;
      }
    }

    // 5. Limite de mentions
    if (config.mentionsEnabled) {
      const mentionCount = message.mentions.users.size + message.mentions.roles.size;
      if (mentionCount > config.mentionsLimit) {
        await deleteMessage(message);
        await applySanction(
          message,
          'TIMEOUT',
          `[AutoMod] Excès de mentions (${mentionCount} mentions)`,
          client
        );
        return true;
      }
    }
  } catch (err) {
    logger.error('AutoModService', 'Erreur lors de l\'exécution d\'AutoMod :', err);
  }

  return false;
}

/**
 * Supprime proprement le message fautif
 */
async function deleteMessage(message: Message) {
  await message.delete().catch(e => logger.warn('AutoModService', 'Impossible de supprimer le message :', e));
}

/**
 * Applique une sanction (WARN, TIMEOUT, ou DELETE_AND_WARN)
 */
async function applySanction(message: Message, action: string, reason: string, client: any) {
  const guildId = message.guild!.id;
  const target = {
    id: message.author.id,
    tag: message.author.tag,
  };
  const moderator = {
    id: client.user.id,
    tag: client.user.tag,
  };

  // Informer l'utilisateur dans le salon d'origine de manière éphémère (ou message normal supprimé rapidement)
  const warnAlert = await (message.channel as any).send(`⚠️ <@${message.author.id}>, votre message a été supprimé : ${reason.replace('[AutoMod] ', '')}`).catch(() => null);
  if (warnAlert) {
    setTimeout(() => {
      warnAlert.delete().catch(() => null);
    }, 6000);
  }

  // Notifier dans le salon de log si configuré
  try {
    const guildDb = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { logChannelId: true },
    });
    if (guildDb?.logChannelId) {
      const logChannel = message.guild!.channels.cache.get(guildDb.logChannelId);
      if (logChannel?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setTitle('🛡️ Sanction AutoMod')
          .setDescription(`L'utilisateur <@${target.id}> a déclenché une alerte de sécurité.`)
          .addFields(
            { name: 'Utilisateur', value: `${target.tag} (${target.id})`, inline: true },
            { name: 'Action', value: action, inline: true },
            { name: 'Raison', value: reason, inline: false },
            { name: 'Salon', value: `<#${message.channel.id}>`, inline: true }
          )
          .setColor('#ED4245')
          .setTimestamp();
        await (logChannel as any).send({ embeds: [embed] }).catch(() => null);
      }
    }
  } catch (err) {
    logger.warn('AutoModService', 'Impossible d\'envoyer le log AutoMod :', err);
  }

  // Appliquer l'effet de sanction réel
  if (action === 'WARN' || action === 'DELETE_AND_WARN') {
    await registerWarnSanction({
      guildId,
      target,
      moderator,
      reason,
      client,
    });
  } else if (action === 'TIMEOUT') {
    // Timeout de 10 minutes par défaut pour l'AutoMod
    const tenMinutesMs = 10 * 60 * 1000;
    await registerTimeoutSanction({
      guildId,
      target,
      moderator,
      reason,
      durationMs: tenMinutesMs,
      member: message.member!,
      client,
    });
  }
}
