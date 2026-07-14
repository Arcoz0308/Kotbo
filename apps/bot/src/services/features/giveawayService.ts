import { Client, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags, type ColorResolvable } from 'discord.js';
import prisma from '../../utils/db.js';
import { logger } from '../../utils/logger.js';
import { resolveEmojiShortcodes } from '../../utils/emojis.js';
import { isStaffServerGuild } from '../staff/staffServerService.js';

// Cooldown map to prevent spamming/double clicks on the join button
const joinCooldowns = new Map<string, number>();

/**
 * Données minimales d'un giveaway nécessaires pour reconstruire son embed.
 * On reconstruit toujours l'embed à partir de la BDD car les messages sont
 * envoyés en Components V2 (voir utils/patchV2.ts) : `message.embeds` est vide,
 * donc on ne peut pas relire l'embed d'origine sur le message pour l'éditer.
 */
interface GiveawayEmbedData {
  id: string;
  prize: string;
  description?: string | null;
  winnerCount: number;
  endsAt: Date;
  rpgXp?: number | null;
  rpgCoins?: number | null;
  rpgItemId?: string | null;
  needValidation?: boolean | null;
}

function buildGiveawayBonusInfo(giveaway: GiveawayEmbedData): string {
  let info = '';
  if ((giveaway.rpgCoins ?? 0) > 0) info += `\n🪙 **Pièces :** +${giveaway.rpgCoins}`;
  if ((giveaway.rpgXp ?? 0) > 0) info += `\n✨ **XP RPG :** +${giveaway.rpgXp}`;
  if (giveaway.rpgItemId) info += `\n📦 **Objet :** ${giveaway.rpgItemId}`;
  if (giveaway.needValidation) info += `\n⚠️ *Validation du staff requise*`;
  return info;
}

/** Embed d'un giveaway toujours en cours (création + inscriptions). */
function buildActiveGiveawayEmbed(giveaway: GiveawayEmbedData, participantCount: number): EmbedBuilder {
  const endsSec = Math.floor(giveaway.endsAt.getTime() / 1000);
  const bonus = buildGiveawayBonusInfo(giveaway);
  const description = `${giveaway.description ? `${giveaway.description}\n\n` : ''}` +
    `Cliquez sur le bouton ci-dessous pour participer !\n` +
    (bonus ? `\n**Récompenses bonus :**${bonus}\n` : '') +
    `\n**Fin :** <t:${endsSec}:R> (<t:${endsSec}:f>)\n` +
    `**Nombre de gagnants :** ${giveaway.winnerCount}\n` +
    `**Participants :** ${participantCount}`;
  return buildGiveawayEmbed(giveaway, description, '#5865F2');
}

/** Embed d'un giveaway dans un état terminé/validé (description & couleur fournies). */
function buildGiveawayEmbed(
  giveaway: GiveawayEmbedData,
  description: string,
  color: ColorResolvable
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(resolveEmojiShortcodes(`🎉 GIVEAWAY : ${giveaway.prize} 🎉`))
    .setDescription(resolveEmojiShortcodes(description))
    .setColor(color)
    .setFooter({ text: `ID : ${giveaway.id}` })
    .setTimestamp();
}

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
  description?: string,
  rpgXp = 0,
  rpgCoins = 0,
  rpgItemId: string | null = null,
  needValidation = false
) {
  if (await isStaffServerGuild(guildId)) {
    throw new Error('Les giveaways ne sont pas disponibles sur un serveur staff.');
  }

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
      rpgXp,
      rpgCoins,
      rpgItemId,
      needValidation,
      validationStatus: needValidation ? 'PENDING' : 'APPROVED'
    },
  });

  // 2. Créer l'embed et le message Discord
  const discordGuild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!discordGuild) return giveaway;

  const channel = discordGuild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return giveaway;

  const embed = buildActiveGiveawayEmbed(giveaway, 0);

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
export async function handleGiveawayJoin(interaction: unknown) {
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
          const updatedEmbed = buildActiveGiveawayEmbed(giveaway, updatedParticipants.length);
          await message.edit({ embeds: [updatedEmbed] }).catch(() => null);
        }
      }
    }

    return interaction.reply({
      content: responseText,
      flags: [MessageFlags.Ephemeral],
    });
  } catch (err: unknown) {
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

  // Mettre à jour le message d'origine
  if (giveaway.messageId) {
    const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
    if (message) {
      const winnersMentions = winners.length > 0 ? winners.map(w => `<@${w}>`).join(', ') : 'Aucun participant.';

      if (giveaway.needValidation) {
        // Mettre à jour avec validationStatus = PENDING et pendingWinners
        await prisma.giveaway.update({
          where: { id: giveawayId },
          data: {
            ended: true,
            validationStatus: 'PENDING',
            pendingWinners: winners,
          },
        });

        const endedEmbed = buildGiveawayEmbed(
          giveaway,
          `${giveaway.description ? `${giveaway.description}\n\n` : ''}**Gagnants Tirés (En attente de validation) :** ${winnersMentions}\n**Participants :** ${participants.length}`,
          '#FAA81A'
        );

        const approveBtn = new ButtonBuilder()
          .setCustomId(`giveaway_val_approve:${giveaway.id}`)
          .setLabel('Valider les gagnants ✅')
          .setStyle(ButtonStyle.Success);

        const rerollBtn = new ButtonBuilder()
          .setCustomId(`giveaway_val_reroll:${giveaway.id}`)
          .setLabel('Relancer (Reroll) 🎲')
          .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(approveBtn, rerollBtn);
        await message.edit({ embeds: [endedEmbed], components: [row] }).catch(() => null);

        await channel.send(`⏳ **Le giveaway pour **${giveaway.prize}** (ID: \`${giveaway.id}\`) s'est terminé !** Gagnants tirés : ${winnersMentions}. En attente de validation par un administrateur.`).catch(() => null);
        return;
      } else {
        // Pas de validation requise, gain direct
        await prisma.giveaway.update({
          where: { id: giveawayId },
          data: {
            ended: true,
            validationStatus: 'APPROVED',
            winners,
          },
        });

        await distributeGiveawayPrizes(giveaway, winners).catch((err) => {
          logger.error('GiveawayService', 'Error distributing prizes in endGiveaway:', err);
        });

        const endedEmbed = buildGiveawayEmbed(
          giveaway,
          `${giveaway.description ? `${giveaway.description}\n\n` : ''}**Gagnants :** ${winnersMentions}\n**Participants :** ${participants.length}`,
          '#ED4245'
        );

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

  // Annoncer le résultat direct
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

  // Filtrer les participants qui ne sont pas déjà gagnants validés
  const candidates = giveaway.participants.filter(id => !giveaway.winners.includes(id));
  if (candidates.length === 0) {
    await channel.send(`❌ Aucun autre participant disponible pour un reroll de **${giveaway.prize}**.`).catch(() => null);
    return;
  }

  const newWinner = candidates[Math.floor(Math.random() * candidates.length)];

  if (giveaway.needValidation) {
    // Si validation requise, on met à jour en tant que gagnant en attente
    await prisma.giveaway.update({
      where: { id: giveawayId },
      data: {
        validationStatus: 'PENDING',
        pendingWinners: [newWinner],
      },
    });

    if (giveaway.messageId) {
      const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
      if (message) {
        const endedEmbed = buildGiveawayEmbed(
          giveaway,
          `${giveaway.description ? `${giveaway.description}\n\n` : ''}**Gagnant Tiré après Reroll (En attente de validation) :** <@${newWinner}>\n**Participants :** ${giveaway.participants.length}`,
          '#FAA81A'
        );

        const approveBtn = new ButtonBuilder()
          .setCustomId(`giveaway_val_approve:${giveaway.id}`)
          .setLabel('Valider le gagnant ✅')
          .setStyle(ButtonStyle.Success);

        const rerollBtn = new ButtonBuilder()
          .setCustomId(`giveaway_val_reroll:${giveaway.id}`)
          .setLabel('Relancer (Reroll) 🎲')
          .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(approveBtn, rerollBtn);
        await message.edit({ embeds: [endedEmbed], components: [row] }).catch(() => null);
      }
    }

    await channel.send(`🎲 Reroll effectué ! Nouveau gagnant tiré au sort (En attente de validation) : <@${newWinner}>.`).catch(() => null);
  } else {
    // Pas de validation requise, gain immédiat
    const updatedWinners = [...giveaway.winners, newWinner];

    await prisma.giveaway.update({
      where: { id: giveawayId },
      data: {
        winners: updatedWinners,
        validationStatus: 'APPROVED'
      },
    });

    await distributeGiveawayPrizes(giveaway, [newWinner]).catch((err) => {
      logger.error('GiveawayService', 'Error distributing reroll prizes:', err);
    });

    if (giveaway.messageId) {
      const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
      if (message) {
        const winnersMentions = updatedWinners.map(w => `<@${w}>`).join(', ');
        const endedEmbed = buildGiveawayEmbed(
          giveaway,
          `${giveaway.description ? `${giveaway.description}\n\n` : ''}**Gagnants (après reroll) :** ${winnersMentions}\n**Participants :** ${giveaway.participants.length}`,
          '#ED4245'
        );

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

    await channel.send(`🎉 Nouveau tirage ! Félicitations à <@${newWinner}> qui gagne également **${giveaway.prize}** ! 🏆`).catch(() => null);
  }
}

/**
 * Valide les gagnants en attente et distribue les prix.
 */
export async function approveGiveawayWinners(client: Client, giveawayId: string) {
  const giveaway = await prisma.giveaway.findUnique({
    where: { id: giveawayId },
  });

  if (!giveaway || !giveaway.ended || giveaway.validationStatus !== 'PENDING') return;

  const winners = giveaway.pendingWinners;

  // Mettre à jour en BDD
  await prisma.giveaway.update({
    where: { id: giveawayId },
    data: {
      validationStatus: 'APPROVED',
      winners,
      pendingWinners: [],
    },
  });

  // Distribuer les prix
  await distributeGiveawayPrizes(giveaway, winners).catch((err) => {
    logger.error('GiveawayService', 'Error distributing prizes on approval:', err);
  });

  // Mettre à jour le message d'origine
  const discordGuild = client.guilds.cache.get(giveaway.guildId) || await client.guilds.fetch(giveaway.guildId).catch(() => null);
  if (!discordGuild) return;
  const channel = discordGuild.channels.cache.get(giveaway.channelId);
  if (!channel?.isTextBased()) return;

  if (giveaway.messageId) {
    const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
    if (message) {
      const winnersMentions = winners.length > 0 ? winners.map((w: string) => `<@${w}>`).join(', ') : 'Aucun.';
      const endedEmbed = buildGiveawayEmbed(
        giveaway,
        `${giveaway.description ? `${giveaway.description}\n\n` : ''}**Gagnants Validés :** ${winnersMentions}\n**Participants :** ${giveaway.participants.length}`,
        '#57F287' // Vert
      );

      const disabledButton = new ButtonBuilder()
        .setCustomId(`giveaway_ended:${giveaway.id}`)
        .setEmoji('🎉')
        .setLabel('Terminé & Validé')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(disabledButton);

      await message.edit({ embeds: [endedEmbed], components: [row] }).catch(() => null);
    }
  }

  // Annoncer le résultat final
  if (winners.length > 0) {
    const mentions = winners.map((w: string) => `<@${w}>`).join(', ');
    await channel.send(`🎉 **Félicitations validées !** ${mentions} gagne(nt) officiellement **${giveaway.prize}** ! 🏆`).catch(() => null);
  } else {
    await channel.send(`😢 Le giveaway pour **${giveaway.prize}** n'a aucun gagnant validé.`).catch(() => null);
  }
}

/**
 * Distribue les récompenses d'un giveaway aux profils des gagnants.
 */
async function distributeGiveawayPrizes(giveaway: {
  guildId: string;
  prize: string;
  rpgXp?: unknown;
  rpgCoins?: unknown;
  rpgItemId?: unknown;
}, winners: string[]) {
  if (winners.length === 0) return;

  const rpgXp = (giveaway.rpgXp as number) || 0;
  const rpgCoins = (giveaway.rpgCoins as number) || 0;
  const rpgItemId = (giveaway.rpgItemId as string | null) || null;

  const { checkLevelUp } = await import('./economyService.js');

  for (const userId of winners) {
    // 1. KotboCoins
    if (rpgCoins > 0) {
      await prisma.rpgProfile.upsert({
        where: { guildId_userId: { guildId: giveaway.guildId, userId } },
        update: { balance: { increment: rpgCoins } },
        create: {
          guildId: giveaway.guildId,
          userId,
          balance: rpgCoins,
          level: 1,
          xp: 0,
          health: 100,
          maxHealth: 100,
          energy: 100,
          attack: 10,
          defense: 10,
          speed: 10
        }
      });
    }

    // 2. XP RPG
    if (rpgXp > 0) {
      await prisma.rpgProfile.upsert({
        where: { guildId_userId: { guildId: giveaway.guildId, userId } },
        update: { xp: { increment: rpgXp } },
        create: {
          guildId: giveaway.guildId,
          userId,
          balance: 0,
          level: 1,
          xp: rpgXp,
          health: 100,
          maxHealth: 100,
          energy: 100,
          attack: 10,
          defense: 10,
          speed: 10
        }
      });
      await checkLevelUp(giveaway.guildId, userId).catch(() => null);
    }

    // 3. Objet RPG
    if (rpgItemId) {
      const item = await prisma.rpgItem.findUnique({
        where: { id: rpgItemId }
      });
      if (item) {
        const profile = await prisma.rpgProfile.upsert({
          where: { guildId_userId: { guildId: giveaway.guildId, userId } },
          update: {},
          create: {
            guildId: giveaway.guildId,
            userId,
            balance: 0,
            level: 1,
            xp: 0,
            health: 100,
            maxHealth: 100,
            energy: 100,
            attack: 10,
            defense: 10,
            speed: 10
          }
        });

        await prisma.rpgInventoryItem.upsert({
          where: {
            rpgProfileId_itemId: {
              rpgProfileId: profile.id,
              itemId: item.id
            }
          },
          update: { quantity: { increment: 1 } },
          create: {
            rpgProfileId: profile.id,
            itemId: item.id,
            quantity: 1
          }
        });
      }
    }
  }
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
