import { Client, Events, Message, TextChannel, PermissionFlagsBits } from 'discord.js';
import prisma from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { errorEmbed } from '../utils/embeds.js';
import { getCachedGuild } from '../utils/cache.js';

export function registerHoneypotListener(client: Client): void {
  client.on(Events.MessageCreate, async (message: Message) => {
    const { guild, author, member, channelId, channel } = message;
    if (!guild || !member || author.bot) return;

    try {
      const guildConfig = await getCachedGuild(guild.id);

      if (!guildConfig || !guildConfig.honeypotEnabled || guildConfig.honeypotChannelId !== channelId) {
        return;
      }

      // Check if the user is staff or administrator to bypass the trap
      const isOwner = author.id === process.env.DISCORD_CLIENT_OWNER_ID;
      const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
      
      const hasStaffRole = (guildConfig.baseStaffRoleId && member.roles.cache.has(guildConfig.baseStaffRoleId)) ||
                            (guildConfig.moderatorRoleId && member.roles.cache.has(guildConfig.moderatorRoleId)) ||
                            (guildConfig.testStaffRoleId && member.roles.cache.has(guildConfig.testStaffRoleId));

      if (isOwner || isAdmin || hasStaffRole) {
        // Staff bypassed the trap
        return;
      }

      // Delete the message immediately to prevent spam spread
      await message.delete().catch(() => null);

      // Ban the user from the guild
      await member.ban({
        deleteMessageSeconds: 60 * 60 * 24, // Delete messages from past 24 hours
        reason: 'Kotbo Honeypot: Sent a message in the restricted honeypot channel (possible hacked account / spam bot).'
      });

      logger.warn('Honeypot', `Utilisateur banni car il a écrit dans le salon honeypot : ${author.tag} (${author.id})`);

      // Log the ban action in the server logs channel
      if (guildConfig.logChannelId) {
        const logChannel = guild.channels.cache.get(guildConfig.logChannelId);
        if (logChannel && logChannel instanceof TextChannel) {
          const embed = errorEmbed(
            '🚨 Détection Honeypot : Compte banni',
            `L'utilisateur **${author.tag}** (\`${author.id}\`) a été banni du serveur car il a écrit dans le salon piège <#${channelId}>.\n\n` +
            `**Message supprimé :**\n\`\`\`\n${message.content.slice(0, 1000) || '[Pas de texte/média]'}\n\`\`\``
          );
          await logChannel.send({ embeds: [embed] }).catch(() => null);
        }
      }
    } catch (err) {
      logger.error('Honeypot', `Erreur lors de la gestion du message dans le honeypot (${guild?.id}) :`, err);
    }
  });

  logger.success('Honeypot', 'Écouteur Honeypot enregistré');
}
