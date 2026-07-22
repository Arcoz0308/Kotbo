import { errorMessage } from '../../utils/errors.js';
import type { SlashCommandDefinition } from '../../commands.js';
import { SlashCommandBuilder, type ChatInputCommandInteraction, MessageFlags, EmbedBuilder } from 'discord.js';
import { claimDaily, getOrCreateEconomyConfig } from '../../services/features/economyService.js';
import { errorEmbed, COLORS } from '../../utils/embeds.js';

const data = new SlashCommandBuilder()
  .setName('daily')
  .setDescription('🪙 Récupérer vos pièces quotidiennes gratuites');

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;

  try {
    const result = await claimDaily(guildId, userId);
    const config = await getOrCreateEconomyConfig(guildId);

    if (!result.success) {
      await interaction.reply({
        embeds: [
          errorEmbed(
            'Daily indisponible',
            `Vous devez encore attendre **${result.remainingHours} heures et ${result.remainingMinutes} minutes** avant de pouvoir réclamer votre récompense.`
          )
        ],
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🪙 Récompense Journalière')
      .setDescription(`Vous avez récupéré **${result.reward}** ${config.currencyEmoji} **${config.currencyName}** !`)
      .addFields({ name: 'Nouveau solde', value: `**${result.newBalance}** ${config.currencyEmoji}` })
      .setColor(COLORS.success)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (err: unknown) {
    await interaction.reply({
      embeds: [errorEmbed('Erreur', errorMessage(err) || 'Impossible de réclamer la récompense.')],
      flags: [MessageFlags.Ephemeral]
    });
  }
}

export const dailyCommand = { data, execute } satisfies SlashCommandDefinition;
