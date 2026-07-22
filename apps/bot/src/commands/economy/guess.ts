import { errorMessage } from '../../utils/errors.js';
import type { SlashCommandDefinition } from '../../commands.js';
import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import prisma from '../../utils/db.js';
import { getOrCreateRpgProfile, getOrCreateEconomyConfig } from '../../services/features/economyService.js';
import { errorEmbed, COLORS } from '../../utils/embeds.js';

const data = new SlashCommandBuilder()
  .setName('guess')
  .setDescription('🤔 Deviner un nombre mystère entre 1 et 100 pour gagner des pièces (7 essais)');

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;

  try {
    const config = await getOrCreateEconomyConfig(guildId);
    if (!config.enabled) {
      await interaction.reply({
        embeds: [errorEmbed('Module Désactivé', "Le système d'économie est désactivé sur ce serveur.")],
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    const secret = Math.floor(Math.random() * 100) + 1;
    let attempts = 0;
    const maxAttempts = 7;

    const initialEmbed = new EmbedBuilder()
      .setTitle('🤔 Jeu du Nombre Mystère')
      .setDescription(
        `J'ai choisi un nombre secret entre **1 et 100**.\n` +
        `Envoyez vos propositions sous forme de message direct dans ce salon !\n\n` +
        `Vous disposez de **${maxAttempts} essais**. Moins vous utilisez d'essais, plus le gain est élevé !\n` +
        `*Envoyez simplement le nombre dans le chat.*`
      )
      .setColor(COLORS.primary)
      .setFooter({ text: 'Écrivez votre première proposition...' });

    await interaction.reply({ embeds: [initialEmbed] });

    const filter = (m: unknown) => m.author.id === userId && !isNaN(parseInt(m.content, 10));
    const collector = interaction.channel?.createMessageCollector({
      filter,
      time: 60000 // 1 minute globale
    });

    if (!collector) {
      await interaction.followUp({ content: "Impossible de lancer le jeu de capture de messages.", flags: [MessageFlags.Ephemeral] });
      return;
    }

    collector.on('collect', async (msg) => {
      attempts++;
      const guess = parseInt(msg.content, 10);

      // Delete user's message to avoid cluttering if permissions allow, or just react / reply
      try {
        if (msg.deletable) await msg.delete();
      } catch {
        // Ignore delete errors
      }

      if (guess === secret) {
        collector.stop('win');
      } else if (attempts >= maxAttempts) {
        collector.stop('loss');
      } else {
        const hint = guess < secret ? 'plus GRAND 📈' : 'plus PETIT 📉';
        await interaction.followUp({
          content: `<@${userId}>, **${guess}** est incorrect ! C'est **${hint}**. *(Essai ${attempts}/${maxAttempts})*`
        });
      }
    });

    collector.on('end', async (_, reason) => {
      try {
        const profile = await getOrCreateRpgProfile(guildId, userId);

        if (reason === 'win') {
          // Reward formula: base 200 minus attempts
          const reward = Math.max(20, 200 - (attempts - 1) * 25);
          const newBalance = profile.balance + reward;

          await prisma.rpgProfile.update({
            where: { id: profile.id },
            data: { balance: newBalance }
          });

          const winEmbed = new EmbedBuilder()
            .setTitle('🎉 Félicitations !')
            .setDescription(
              `Vous avez trouvé le nombre mystère **${secret}** en **${attempts} essais** !\n\n` +
              `**Gain :** +**${reward}** ${config.currencyEmoji}\n` +
              `**Nouveau solde :** **${newBalance}** ${config.currencyEmoji}`
            )
            .setColor(COLORS.success)
            .setTimestamp();

          await interaction.followUp({ embeds: [winEmbed] });
        } else if (reason === 'loss') {
          const lossEmbed = new EmbedBuilder()
            .setTitle('😢 Partie terminée')
            .setDescription(`Vous avez épuisé vos **${maxAttempts} essais** !\nLe nombre secret était **${secret}**. Retentez votre chance !`)
            .setColor(COLORS.danger)
            .setTimestamp();

          await interaction.followUp({ embeds: [lossEmbed] });
        } else {
          // Timeout
          const timeoutEmbed = new EmbedBuilder()
            .setTitle('⏱️ Temps écoulé')
            .setDescription(`Vous avez mis trop de temps à répondre. La partie est annulée.\nLe nombre secret était **${secret}**.`)
            .setColor(COLORS.warning)
            .setTimestamp();

          await interaction.followUp({ embeds: [timeoutEmbed] });
        }
      } catch (err: unknown) {
        // Handle end-of-collector db errors silently or log them
      }
    });
  } catch (err: unknown) {
    await interaction.reply({
      embeds: [errorEmbed('Erreur', errorMessage(err) || 'Impossible de démarrer le jeu.')],
      flags: [MessageFlags.Ephemeral]
    });
  }
}

export const guessCommand = { data, execute } satisfies SlashCommandDefinition;
