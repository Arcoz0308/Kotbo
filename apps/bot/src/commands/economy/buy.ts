import type { SlashCommandDefinition } from '../../commands.js';
import { SlashCommandBuilder, type ChatInputCommandInteraction, type AutocompleteInteraction, MessageFlags } from 'discord.js';
import prisma from '../../utils/db.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { buyShopItem, getOrCreateEconomyConfig } from '../../services/features/economyService.js';

const data = new SlashCommandBuilder()
  .setName('buy')
  .setDescription('🛒 Achète un objet dans la boutique')
  .addStringOption(option =>
    option
      .setName('objet')
      .setDescription("L'objet à acheter (choisis dans la liste)")
      .setRequired(true)
      .setAutocomplete(true)
  );

async function autocomplete(interaction: AutocompleteInteraction) {
  const focusedValue = interaction.options.getFocused().toLowerCase();
  const guildId = interaction.guildId!;

  try {
    const items = await prisma.rpgItem.findMany({
      where: {
        OR: [
          { guildId: null },
          { guildId }
        ],
        purchasable: true
      }
    });

    const choices = items
      .filter(item => item.name.toLowerCase().includes(focusedValue))
      .slice(0, 25)
      .map(item => ({
        name: `${item.emoji} ${item.name} (${item.price} 🪙)`,
        value: item.id
      }));

    await interaction.respond(choices);
  } catch {
    await interaction.respond([]);
  }
}

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;
  const itemId = interaction.options.getString('objet', true);

  try {
    const buyResult = await buyShopItem(guildId, userId, itemId);
    const config = await getOrCreateEconomyConfig(guildId);
    await interaction.reply({
      embeds: [
        successEmbed(
          'Achat réussi !',
          `Vous avez acheté **${buyResult.itemName}** pour **${buyResult.price}** ${config.currencyEmoji}.\nNouveau solde: **${buyResult.newBalance}** ${config.currencyEmoji}`
        )
      ]
    });
  } catch (err: unknown) {
    await interaction.reply({
      embeds: [errorEmbed('Achat échoué', err.message || "Impossible d'effectuer l'achat.")],
      flags: [MessageFlags.Ephemeral]
    });
  }
}

export const buyCommand = { data, execute, autocomplete } satisfies SlashCommandDefinition;
