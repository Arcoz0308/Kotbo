import type { SlashCommandDefinition } from '../../commands.js';
import { SlashCommandBuilder, type ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { transferCoins, getOrCreateEconomyConfig } from '../../services/features/economyService.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';

const data = new SlashCommandBuilder()
  .setName('give-coins')
  .setDescription('💸 Donner des pièces de ton portefeuille à un autre membre')
  .addUserOption(option =>
    option
      .setName('membre')
      .setDescription('Le membre à qui donner les pièces')
      .setRequired(true)
  )
  .addIntegerOption(option =>
    option
      .setName('montant')
      .setDescription('Le montant de pièces à envoyer')
      .setRequired(true)
      .setMinValue(1)
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const senderId = interaction.user.id;
  const receiver = interaction.options.getUser('membre', true);
  const amount = interaction.options.getInteger('montant', true);

  if (receiver.bot) {
    await interaction.reply({
      embeds: [errorEmbed('Erreur', 'Vous ne pouvez pas envoyer des pièces à un bot !')],
      flags: [MessageFlags.Ephemeral]
    });
    return;
  }

  if (receiver.id === senderId) {
    await interaction.reply({
      embeds: [errorEmbed('Erreur', 'Vous ne pouvez pas vous envoyer des pièces à vous-même !')],
      flags: [MessageFlags.Ephemeral]
    });
    return;
  }

  try {
    const config = await getOrCreateEconomyConfig(guildId);
    const result = await transferCoins(guildId, senderId, receiver.id, amount);

    await interaction.reply({
      embeds: [
        successEmbed(
          'Transaction réussie !',
          `Vous avez envoyé **${amount}** ${config.currencyEmoji} à <@${receiver.id}>.\n\n` +
          `**Vos pièces :** **${result.senderBalance}** ${config.currencyEmoji}\n` +
          `**Leurs pièces :** **${result.receiverBalance}** ${config.currencyEmoji}`
        )
      ]
    });
  } catch (err: any) {
    await interaction.reply({
      embeds: [errorEmbed('Transaction échouée', err.message || "Impossible d'envoyer les pièces.")],
      flags: [MessageFlags.Ephemeral]
    });
  }
}

export const giveCoinsCommand = { data, execute } satisfies SlashCommandDefinition;
