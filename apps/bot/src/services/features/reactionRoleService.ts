import type { Prisma } from '@prisma/client';
import { Client, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags, GuildMember, type ButtonInteraction } from 'discord.js';
import prisma from '../../utils/db.js';
import { logger } from '../../utils/logger.js';
import { resolveEmojiShortcodes } from '../../utils/emojis.js';

/**
 * Crée et envoie un menu de rôles avec boutons dans un canal Discord
 */
export async function createReactionRoleMenu(
  client: Client,
  guildId: string,
  channelId: string,
  title: string,
  options: Array<{ emoji?: string; label: string; roleId: string }>
) {
  // 1. Enregistrer dans la BDD
  const menu = await prisma.reactionRoleMenu.create({
    data: {
      guildId,
      channelId,
      title,
      options: options as Prisma.InputJsonValue,
    },
  });

  // 2. Envoyer le message sur Discord
  await sendOrUpdateMenuMessage(client, menu.id);
  return menu;
}

/**
 * Supprime un menu en base puis tente de retirer son message Discord.
 * La suppression en base en premier invalide immédiatement les anciens boutons,
 * même si le bot ne peut plus accéder au message.
 */
export async function deleteReactionRoleMenu(
  client: Client,
  guildId: string,
  menuId: string
): Promise<boolean> {
  const menu = await prisma.reactionRoleMenu.findFirst({
    where: { id: menuId, guildId },
  });

  if (!menu) {
    return false;
  }

  await prisma.reactionRoleMenu.delete({
    where: { id: menu.id },
  });

  if (!menu.messageId) {
    return true;
  }

  try {
    const discordGuild = client.guilds.cache.get(guildId)
      || await client.guilds.fetch(guildId).catch(() => null);
    const channel = discordGuild?.channels.cache.get(menu.channelId)
      || await discordGuild?.channels.fetch(menu.channelId).catch(() => null);

    if (!channel?.isTextBased()) {
      logger.warn(
        'ReactionRoleService',
        `Message ${menu.messageId} non supprimé : salon ${menu.channelId} introuvable ou non textuel.`
      );
      return true;
    }

    const message = await channel.messages.fetch(menu.messageId).catch(() => null);
    if (message) {
      await message.delete();
    }
  } catch (err) {
    logger.warn(
      'ReactionRoleService',
      `Le menu ${menu.id} est désactivé, mais son message Discord n'a pas pu être supprimé :`,
      err
    );
  }

  return true;
}

/**
 * Envoie ou met à jour le message d'un menu de rôles
 */
export async function sendOrUpdateMenuMessage(client: Client, menuId: string) {
  try {
    const menu = await prisma.reactionRoleMenu.findUnique({
      where: { id: menuId },
    });
    if (!menu) return;

    const discordGuild = client.guilds.cache.get(menu.guildId) || await client.guilds.fetch(menu.guildId).catch(() => null);
    if (!discordGuild) return;

    const channel = discordGuild.channels.cache.get(menu.channelId);
    if (!channel?.isTextBased()) return;

    const options = menu.options as Array<{ emoji?: string; label: string; roleId: string }>;

    // Créer l'embed du menu
    const embed = new EmbedBuilder()
      .setTitle(resolveEmojiShortcodes(menu.title))
      .setDescription("Cliquez sur les boutons ci-dessous pour vous attribuer ou retirer les rôles correspondants.")
      .setColor('#5865F2')
      .setTimestamp();

    // Construire les boutons (maximum 5 boutons par ligne, maximum 25 boutons au total)
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    let currentRow = new ActionRowBuilder<ButtonBuilder>();

    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const button = new ButtonBuilder()
        .setCustomId(`role_toggle:${opt.roleId}`)
        .setLabel(opt.label)
        .setStyle(ButtonStyle.Secondary);

      if (opt.emoji) {
        button.setEmoji(opt.emoji);
      }

      if (i > 0 && i % 5 === 0) {
        rows.push(currentRow);
        currentRow = new ActionRowBuilder<ButtonBuilder>();
      }

      currentRow.addComponents(button);
    }

    if (currentRow.components.length > 0) {
      rows.push(currentRow);
    }

    let messageSent;
    if (menu.messageId) {
      // Tenter de modifier le message existant
      const existingMsg = await channel.messages.fetch(menu.messageId).catch(() => null);
      if (existingMsg) {
        messageSent = await existingMsg.edit({ embeds: [embed], components: rows }).catch(() => null);
      }
    }

    if (!messageSent) {
      // Envoyer un nouveau message
      messageSent = await channel.send({ embeds: [embed], components: rows }).catch(() => null);
      if (messageSent) {
        await prisma.reactionRoleMenu.update({
          where: { id: menuId },
          data: { messageId: messageSent.id },
        });
      }
    }
  } catch (err) {
    logger.error('ReactionRoleService', `Erreur lors de l'envoi/mise à jour du menu ${menuId}:`, err);
  }
}

/**
 * Bascule (ajoute ou retire) un rôle à un membre suite à un clic sur bouton
 */
export async function handleRoleToggleInteraction(interaction: ButtonInteraction) {
  try {
    const roleId = interaction.customId.split(':')[1];
    const guildId = interaction.guildId;
    const messageId = interaction.message.id;

    const activeMenu = guildId
      ? await prisma.reactionRoleMenu.findFirst({
        where: { guildId, messageId },
      })
      : null;
    const configuredRoles = Array.isArray(activeMenu?.options)
      ? activeMenu.options as Array<{ roleId?: string }>
      : [];

    if (!activeMenu || !configuredRoles.some(option => option.roleId === roleId)) {
      return interaction.reply({
        content: '❌ Ce panneau de rôles a été supprimé ou n’est plus actif.',
        flags: [MessageFlags.Ephemeral],
      });
    }

    // `interaction.member` peut etre un GuildMember complet ou sa forme brute
    // APIInteractionGuildMember (hors cache), qui n'expose pas de gestionnaire
    // de roles : seul le premier permet d'ajouter ou retirer un role.
    const member = interaction.member;

    if (!(member instanceof GuildMember)) {
      return interaction.reply({
        content: '❌ Impossible de trouver votre profil sur ce serveur.',
        flags: [MessageFlags.Ephemeral],
      });
    }

    const hasRole = member.roles.cache.has(roleId);
    if (hasRole) {
      // Retirer le rôle
      await member.roles.remove(roleId);
      return interaction.reply({
        content: `✅ Le rôle <@&${roleId}> vous a été retiré.`,
        flags: [MessageFlags.Ephemeral],
      });
    } else {
      // Ajouter le rôle
      await member.roles.add(roleId);
      return interaction.reply({
        content: `✅ Le rôle <@&${roleId}> vous a été attribué.`,
        flags: [MessageFlags.Ephemeral],
      });
    }
  } catch (err) {
    logger.error('ReactionRoleService', 'Erreur lors de la bascule de rôle :', err);
    return interaction.reply({
      content: '❌ Une erreur est survenue (permissions insuffisantes du bot pour gérer ce rôle).',
      flags: [MessageFlags.Ephemeral],
    });
  }
}
