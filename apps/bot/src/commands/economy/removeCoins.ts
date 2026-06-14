import type { SlashCommandDefinition } from '../../commands.js';
import { SlashCommandBuilder, type ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { adminRemoveCoins, getOrCreateEconomyConfig } from '../../services/features/economyService.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';

const data = new SlashCommandBuilder()
  .setName('remove-coins')
  .setDescription('⚙️ Retirer des pièces à un membre')
  .addUserOption(option =>
    option
      .setName('membre')
      .setDescription('Le membre cible')
      .setRequired(true)
  )
  .addIntegerOption(option =>
    option
      .setName('montant')
      .setDescription('Le montant de pièces à retirer')
      .setRequired(true)
      .setMinValue(1)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const targetUser = interaction.options.getUser('membre', true);
  const amount = interaction.options.getInteger('montant', true);

  if (targetUser.bot) {
    await interaction.reply({
      embeds: [errorEmbed('Erreur', 'Impossible de modifier le solde d’un bot.')],
      flags: [MessageFlags.Ephemeral]
    });
    return;
  }

  try {
    const result = await adminRemoveCoins(guildId, targetUser.id, amount);
    const config = await getOrCreateEconomyConfig(guildId);

    await interaction.reply({
      embeds: [
        successEmbed(
          'Pièces retirées !',
          `Vous avez retiré **${amount}** ${config.currencyEmoji} à <@${targetUser.id}>.\n` +
          `**Nouveau solde :** **${result.newBalance}** ${config.currencyEmoji}`
        )
      ]
    });
  } catch (err: any) {
    await interaction.reply({
      embeds: [errorEmbed('Erreur', err.message || 'Impossible de retirer les pièces.')],
      flags: [MessageFlags.Ephemeral]
    });
  }
}

export const removeCoinsCommand = { data, execute } satisfies SlashCommandDefinition;
