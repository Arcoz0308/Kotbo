import { Client, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags, type ButtonInteraction } from 'discord.js';
import prisma from '../../utils/db.js';
import { logger } from '../../utils/logger.js';

import { resolveEmojiShortcodes } from '../../utils/emojis.js';

/**
 * Crée et publie une nouvelle suggestion dans le salon dédié
 */
export async function createSuggestion(guildId: string, userId: string, username: string, content: string, client: Client) {
  // 1. Déterminer le salon de suggestions
  const guildConfig = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { publicChannelId: true, dashboardFeatureConfigs: true }
  });

  const featureConfig = (guildConfig?.dashboardFeatureConfigs || []).find((f: unknown) => f.featureKey === 'suggestions');
  if (featureConfig && featureConfig.enabled === false) {
    throw new Error('Le système de suggestions est désactivé sur ce serveur.');
  }
  let targetChannelId = featureConfig?.channelId || guildConfig?.publicChannelId;

  const discordGuild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!discordGuild) throw new Error("Serveur introuvable");

  // Fallback si aucun canal configuré: chercher un canal textuel nommé "suggestions"
  if (!targetChannelId) {
    const fallbackChannel = discordGuild.channels.cache.find(c => c.name.toLowerCase().includes('suggest') && c.isTextBased());
    if (fallbackChannel) {
      targetChannelId = fallbackChannel.id;
    } else {
      throw new Error("Aucun salon de suggestions n'a été configuré sur le dashboard.");
    }
  }

  const channel = discordGuild.channels.cache.get(targetChannelId);
  if (!channel?.isTextBased()) {
    throw new Error("Le salon de suggestions configuré est invalide ou introuvable.");
  }

  // 2. Créer l'entrée dans la base de données
  const suggestion = await prisma.suggestion.create({
    data: {
      guildId,
      userId,
      username,
      content,
      status: 'PENDING',
      channelId: targetChannelId,
    },
  });

  // 3. Envoyer l'embed sur Discord
  const member = await discordGuild.members.fetch(userId).catch(() => null);
  const avatarUrl = member?.user.displayAvatarURL({ size: 128 }) || null;

  const embed = new EmbedBuilder()
    .setTitle(`💡 Nouvelle Suggestion`)
    .setDescription(resolveEmojiShortcodes(content))
    .setAuthor({ name: member?.displayName || username, iconURL: avatarUrl || undefined })
    .addFields(
      { name: 'Statut', value: "⏳ En cours d'évaluation", inline: true },
      { name: 'Votes', value: '👍 Upvotes : `0` | 👎 Downvotes : `0`', inline: true }
    )
    .setColor('#FE75C2')
    .setFooter({ text: `ID de la suggestion : ${suggestion.id}` })
    .setTimestamp();

  // Boutons de vote
  const upvoteBtn = new ButtonBuilder()
    .setCustomId(`suggest_vote:${suggestion.id}:up`)
    .setEmoji('👍')
    .setLabel('0')
    .setStyle(ButtonStyle.Secondary);

  const downvoteBtn = new ButtonBuilder()
    .setCustomId(`suggest_vote:${suggestion.id}:down`)
    .setEmoji('👎')
    .setLabel('0')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(upvoteBtn, downvoteBtn);

  const message = await channel.send({ embeds: [embed], components: [row], allowedMentions: { parse: [] } }).catch(() => null);
  
  if (message) {
    await prisma.suggestion.update({
      where: { id: suggestion.id },
      data: { messageId: message.id },
    });
  }

  return suggestion;
}

/**
 * Traite les votes sur une suggestion (Upvote / Downvote)
 */
export async function handleSuggestionVote(interaction: ButtonInteraction, type: 'up' | 'down') {
  const suggestionId = interaction.customId.split(':')[1];
  const userId = interaction.user.id;

  const suggestion = await prisma.suggestion.findUnique({
    where: { id: suggestionId },
  });

  if (!suggestion) {
    return interaction.reply({ content: '❌ Suggestion introuvable.', flags: [MessageFlags.Ephemeral] });
  }

  if (suggestion.status !== 'PENDING') {
    return interaction.reply({ content: '❌ Cette suggestion a déjà été tranchée par le staff.', flags: [MessageFlags.Ephemeral] });
  }

  let upvoters = [...suggestion.upvoters];
  let downvoters = [...suggestion.downvoters];

  const hasUpvoted = upvoters.includes(userId);
  const hasDownvoted = downvoters.includes(userId);

  if (type === 'up') {
    if (hasUpvoted) {
      upvoters = upvoters.filter(id => id !== userId);
    } else {
      upvoters.push(userId);
      downvoters = downvoters.filter(id => id !== userId); // Enlever du camp adverse
    }
  } else {
    if (hasDownvoted) {
      downvoters = downvoters.filter(id => id !== userId);
    } else {
      downvoters.push(userId);
      upvoters = upvoters.filter(id => id !== userId); // Enlever du camp adverse
    }
  }

  // Enregistrer les votes
  await prisma.suggestion.update({
    where: { id: suggestionId },
    data: {
      upvoters,
      downvoters,
      channelId: suggestion.channelId ?? interaction.channelId,
      messageId: suggestion.messageId ?? interaction.message.id,
    },
  });

  // Mettre à jour le message du bouton directement via l'interaction Discord.
  const originalEmbed = interaction.message.embeds[0];
  if (originalEmbed) {
    const updatedEmbed = EmbedBuilder.from(originalEmbed)
      .setFields(
        { name: 'Statut', value: "⏳ En cours d'évaluation", inline: true },
        { name: 'Votes', value: `👍 Upvotes : \`${upvoters.length}\` | 👎 Downvotes : \`${downvoters.length}\``, inline: true }
      );

    const upBtn = new ButtonBuilder()
      .setCustomId(`suggest_vote:${suggestion.id}:up`)
      .setEmoji('👍')
      .setLabel(String(upvoters.length))
      .setStyle(ButtonStyle.Secondary);

    const downBtn = new ButtonBuilder()
      .setCustomId(`suggest_vote:${suggestion.id}:down`)
      .setEmoji('👎')
      .setLabel(String(downvoters.length))
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(upBtn, downBtn);

    try {
      await interaction.update({ embeds: [updatedEmbed], components: [row] });
    } catch (e: unknown) {
      logger.error('Suggestions', `Impossible de mettre à jour l'embed de la suggestion ${suggestion.id}:`, e);
      return interaction.reply({
        content: "✅ Votre vote a été enregistré, mais l'affichage du compteur n'a pas pu être rafraîchi.",
        flags: [MessageFlags.Ephemeral],
      });
    }

    return interaction.followUp({
      content: '✅ Votre vote a été pris en compte !',
      flags: [MessageFlags.Ephemeral],
    });
  } else {
    logger.warn('Suggestions', `Message ${interaction.message.id} sans embed pour la suggestion ${suggestion.id}`);
  }

  return interaction.reply({
    content: '✅ Votre vote a été pris en compte !',
    flags: [MessageFlags.Ephemeral],
  });
}

/**
 * Met à jour le statut d'une suggestion et son affichage sur Discord (décision du staff)
 */
export async function resolveSuggestion(
  suggestionId: string,
  status: 'APPROVED' | 'REJECTED' | 'IMPLEMENTED',
  responseText: string,
  respondedById: string,
  client: Client
) {
  const suggestion = await prisma.suggestion.findUnique({
    where: { id: suggestionId },
  });

  if (!suggestion) return null;

  // Enregistrer dans la base de données
  const updated = await prisma.suggestion.update({
    where: { id: suggestionId },
    data: {
      status,
      responseText,
      respondedById,
      respondedAt: new Date(),
    },
  });

  // Mettre à jour l'affichage sur Discord
  if (suggestion.channelId && suggestion.messageId) {
    const discordGuild = client.guilds.cache.get(suggestion.guildId) || await client.guilds.fetch(suggestion.guildId).catch(() => null);
    if (discordGuild) {
      const channel = discordGuild.channels.cache.get(suggestion.channelId);
      if (channel?.isTextBased()) {
        const message = await channel.messages.fetch(suggestion.messageId).catch(() => null);
        if (message) {
          const originalEmbed = message.embeds[0];
          if (originalEmbed) {
            let statusText = "⏳ En cours d'évaluation";
            let color = '#FE75C2';

            if (status === 'APPROVED') {
              statusText = '✅ **Approuvée par le Staff**';
              color = '#57F287';
            } else if (status === 'REJECTED') {
              statusText = '❌ **Refusée par le Staff**';
              color = '#ED4245';
            } else if (status === 'IMPLEMENTED') {
              statusText = '🚀 **Implémentée dans la communauté**';
              color = '#5865F2';
            }

            const updatedEmbed = EmbedBuilder.from(originalEmbed)
              .setColor(color as unknown)
              .setFields(
                { name: 'Statut', value: statusText, inline: true },
                { name: 'Votes finaux', value: `👍 Upvotes : \`${updated.upvoters.length}\` | 👎 Downvotes : \`${updated.downvoters.length}\``, inline: true },
                { name: `Réponse de la modération`, value: responseText || 'Aucun commentaire.', inline: false }
              );

            // Désactiver les boutons de vote pour sceller le scrutin
            const upBtn = new ButtonBuilder()
              .setCustomId(`suggest_vote_disabled_up:${suggestion.id}`)
              .setEmoji('👍')
              .setLabel(String(updated.upvoters.length))
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true);

            const downBtn = new ButtonBuilder()
              .setCustomId(`suggest_vote_disabled_down:${suggestion.id}`)
              .setEmoji('👎')
              .setLabel(String(updated.downvoters.length))
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true);

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(upBtn, downBtn);

            await message.edit({ embeds: [updatedEmbed], components: [row] }).catch(() => null);
          }
        }
      }
    }
  }

  return updated;
}
