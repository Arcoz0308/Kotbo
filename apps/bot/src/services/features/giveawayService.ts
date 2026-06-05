import { Client, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import prisma from '../../utils/db.js';
import { logger } from '../../utils/logger.js';

// Cooldown map to prevent spamming/double clicks on the join button
const joinCooldowns = new Map<string, number>();

/**
 * Crée un nouveau giveaway sur Discord et en BDD
 */
export async function createGiveaway(
  client: Client,
  guildId: string,
  channelId: string,
  prize: string,
  winnerCount: number,
  durationMinutes: number,
  description?: string
) {
  const endsAt = new Date(Date.now() + durationMinutes * 60 * 1000);
  
  // 1. Sauvegarder dans la BDD pour générer l'ID
  const giveaway = await prisma.giveaway.create({
    data: {
      guildId,
      channelId,
      prize,
      winnerCount,
      endsAt,
      description,
    },
  });

  // 2. Créer l'embed et le message Discord
  const discordGuild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!discordGuild) return giveaway;

  const channel = discordGuild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return giveaway;

  const embed = new EmbedBuilder()
    .setTitle(`🎉 GIVEAWAY : ${prize} 🎉`)
    .setDescription(`${description ? `${description}\n\n` : ''}Cliquez sur le bouton ci-dessous pour participer !\n\n**Fin :** <t:${Math.floor(endsAt.getTime() / 1000)}:R> (<t:${Math.floor(endsAt.getTime() / 1000)}:f>)\n**Nombre de gagnants :** ${winnerCount}\n**Participants :** 0`)
    .setColor('#5865F2')
    .setFooter({ text: `ID : ${giveaway.id}` })
    .setTimestamp();

  const button = new ButtonBuilder()
    .setCustomId(`giveaway_join:${giveaway.id}`)
    .setEmoji('🎉')
    .setLabel('Rejoindre')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

  const message = await channel.send({ embeds: [embed], components: [row] }).catch(() => null);
  if (message) {
    // Mettre à jour avec le messageId
    await prisma.giveaway.update({
      where: { id: giveaway.id },
      data: { messageId: message.id },
    });
  }

  return giveaway;
}

/**
 * Gère l'action de clic sur le bouton d'inscription d'un giveaway
 */
export async function handleGiveawayJoin(interaction: any) {
  const giveawayId = interaction.customId.split(':')[1];
  const userId = interaction.user.id;

  // Anti-double-clic / Anti-spam : Cooldown de 2 secondes par utilisateur et par giveaway
  const cooldownKey = `${userId}:${giveawayId}`;
  const now = Date.now();
  const lastClick = joinCooldowns.get(cooldownKey);

  if (lastClick && now - lastClick < 2000) {
    return interaction.reply({
      content: '⚠️ Veuillez patienter 2 secondes entre chaque clic.',
      flags: [MessageFlags.Ephemeral],
    });
  }
  joinCooldowns.set(cooldownKey, now);

  // Nettoyage automatique du cooldown après 2 secondes
  setTimeout(() => {
    if (joinCooldowns.get(cooldownKey) === now) {
      joinCooldowns.delete(cooldownKey);
    }
  }, 2000);

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Verrouiller la ligne du giveaway pour bloquer les écritures/lectures concurrentes
      await tx.$queryRaw`SELECT 1 FROM giveaways WHERE id = ${giveawayId} FOR UPDATE`;

      // 2. Récupérer les données verrouillées et fraîches
      const giveaway = await tx.giveaway.findUnique({
        where: { id: giveawayId },
      });

      if (!giveaway || giveaway.ended) {
        throw new Error('ENDED_OR_NOT_FOUND');
      }

      const isParticipant = giveaway.participants.includes(userId);
      let updatedParticipants = [...giveaway.participants];
      let responseText = '';

      if (isParticipant) {
        // Se désinscrire
        updatedParticipants = updatedParticipants.filter(id => id !== userId);
        responseText = '😢 Vous vous êtes retiré du giveaway.';
      } else {
        // S'inscrire
        updatedParticipants.push(userId);
        responseText = '🎉 Inscription validée ! Bonne chance !';
      }

      await tx.giveaway.update({
        where: { id: giveawayId },
        data: { participants: updatedParticipants },
      });

      return {
        responseText,
        updatedParticipants,
        giveaway,
      };
    });

    const { responseText, updatedParticipants, giveaway } = result;

    // 4. Mettre à jour l'embed Discord en temps réel
    if (giveaway.messageId) {
      const channel = interaction.channel;
      if (channel?.isTextBased()) {
        const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
        if (message) {
          const originalEmbed = message.embeds[0];
          if (originalEmbed) {
            const updatedEmbed = EmbedBuilder.from(originalEmbed)
              .setDescription(`${giveaway.description ? `${giveaway.description}\n\n` : ''}Cliquez sur le bouton ci-dessous pour participer !\n\n**Fin :** <t:${Math.floor(giveaway.endsAt.getTime() / 1000)}:R> (<t:${Math.floor(giveaway.endsAt.getTime() / 1000)}:f>)\n**Nombre de gagnants :** ${giveaway.winnerCount}\n**Participants :** ${updatedParticipants.length}`);
            
            await message.edit({ embeds: [updatedEmbed] }).catch(() => null);
          }
        }
      }
    }

    return interaction.reply({
      content: responseText,
      flags: [MessageFlags.Ephemeral],
    });
  } catch (err: any) {
    if (err.message === 'ENDED_OR_NOT_FOUND') {
      return interaction.reply({
        content: '❌ Ce giveaway est terminé !',
        flags: [MessageFlags.Ephemeral],
      });
    }
    logger.error('GiveawayService', 'Erreur lors de handleGiveawayJoin :', err);
    return interaction.reply({
      content: '❌ Une erreur est survenue lors de votre inscription.',
      flags: [MessageFlags.Ephemeral],
    });
  }
}

/**
 * Termine un giveaway actif et tire les gagnants
 */
export async function endGiveaway(client: Client, giveawayId: string) {
  const giveaway = await prisma.giveaway.findUnique({
    where: { id: giveawayId },
  });

  if (!giveaway || giveaway.ended) return;

  const discordGuild = client.guilds.cache.get(giveaway.guildId) || await client.guilds.fetch(giveaway.guildId).catch(() => null);
  if (!discordGuild) return;

  const channel = discordGuild.channels.cache.get(giveaway.channelId);
  if (!channel?.isTextBased()) return;

  // Tirer les gagnants
  const participants = giveaway.participants;
  const winners: string[] = [];
  const count = Math.min(giveaway.winnerCount, participants.length);

  if (count > 0) {
    const pool = [...participants];
    for (let i = 0; i < count; i++) {
      const randIndex = Math.floor(Math.random() * pool.length);
      winners.push(pool[randIndex]);
      pool.splice(randIndex, 1);
    }
  }

  // Mettre à jour en BDD
  await prisma.giveaway.update({
    where: { id: giveawayId },
    data: {
      ended: true,
      winners,
    },
  });

  // Mettre à jour le message d'origine
  if (giveaway.messageId) {
    const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
    if (message) {
      const originalEmbed = message.embeds[0];
      if (originalEmbed) {
        const winnersMentions = winners.length > 0 ? winners.map(w => `<@${w}>`).join(', ') : 'Aucun participant.';
        const endedEmbed = EmbedBuilder.from(originalEmbed)
          .setDescription(`${giveaway.description ? `${giveaway.description}\n\n` : ''}**Gagnants :** ${winnersMentions}\n**Participants :** ${participants.length}`)
          .setColor('#ED4245')
          .setTimestamp();
        
        // Désactiver le bouton
        const disabledButton = new ButtonBuilder()
          .setCustomId(`giveaway_ended:${giveaway.id}`)
          .setEmoji('🎉')
          .setLabel('Terminé')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true);
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(disabledButton);

        await message.edit({ embeds: [endedEmbed], components: [row] }).catch(() => null);
      }
    }
  }

  // Annoncer le résultat dans le salon
  if (winners.length > 0) {
    const mentions = winners.map(w => `<@${w}>`).join(', ');
    await channel.send(`🎉 Félicitations à ${mentions} qui gagne(nt) **${giveaway.prize}** ! 🏆`).catch(() => null);
  } else {
    await channel.send(`😢 Personne n'a participé au giveaway pour **${giveaway.prize}**, il n'y a donc pas de gagnant.`).catch(() => null);
  }
}

/**
 * Sélectionne un nouveau gagnant (Reroll)
 */
export async function rerollGiveaway(client: Client, giveawayId: string) {
  const giveaway = await prisma.giveaway.findUnique({
    where: { id: giveawayId },
  });

  if (!giveaway || !giveaway.ended) return;

  const discordGuild = client.guilds.cache.get(giveaway.guildId) || await client.guilds.fetch(giveaway.guildId).catch(() => null);
  if (!discordGuild) return;

  const channel = discordGuild.channels.cache.get(giveaway.channelId);
  if (!channel?.isTextBased()) return;

  // Filtrer les participants qui ne sont pas déjà gagnants
  const candidates = giveaway.participants.filter(id => !giveaway.winners.includes(id));
  if (candidates.length === 0) {
    await channel.send(`❌ Aucun autre participant disponible pour un reroll de **${giveaway.prize}**.`).catch(() => null);
    return;
  }

  const newWinner = candidates[Math.floor(Math.random() * candidates.length)];
  const updatedWinners = [...giveaway.winners, newWinner];

  // Mettre à jour en BDD
  await prisma.giveaway.update({
    where: { id: giveawayId },
    data: { winners: updatedWinners },
  });

  // Mettre à jour le message d'origine
  if (giveaway.messageId) {
    const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
    if (message) {
      const originalEmbed = message.embeds[0];
      if (originalEmbed) {
        const winnersMentions = updatedWinners.map(w => `<@${w}>`).join(', ');
        const endedEmbed = EmbedBuilder.from(originalEmbed)
          .setDescription(`${giveaway.description ? `${giveaway.description}\n\n` : ''}**Gagnants (après reroll) :** ${winnersMentions}\n**Participants :** ${giveaway.participants.length}`);
        
        await message.edit({ embeds: [endedEmbed] }).catch(() => null);
      }
    }
  }

  await channel.send(`🎉 Nouveau tirage ! Félicitations à <@${newWinner}> qui gagne également **${giveaway.prize}** ! 🏆`).catch(() => null);
}

/**
 * Vérifie toutes les minutes les concours expirés et les clôture
 */
export async function checkExpiredGiveaways(client: Client) {
  try {
    const expired = await prisma.giveaway.findMany({
      where: {
        ended: false,
        endsAt: { lte: new Date() },
      },
    });

    for (const giveaway of expired) {
      await endGiveaway(client, giveaway.id);
    }
  } catch (err) {
    logger.error('GiveawayService', 'Erreur lors de la vérification des giveaways expirés :', err);
  }
}
