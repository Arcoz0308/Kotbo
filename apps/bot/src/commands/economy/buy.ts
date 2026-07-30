import { errorMessage } from '../../utils/errors.js';
import type { SlashCommandDefinition } from '../../commands.js';
import { SlashCommandBuilder, type ChatInputCommandInteraction, type AutocompleteInteraction, MessageFlags } from 'discord.js';
import prisma from '../../utils/db.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { buyShopItem, getOrCreateEconomyConfig } from '../../services/features/economyService.js';
import { getEffectiveLocale, getCommandMetadata } from '../../utils/i18n.js';
import * as m from '../../lib/paraglide/messages.js';

const meta = getCommandMetadata('b3_buy');
const objetMeta = getCommandMetadata('b3_buy_objet');

const data = new SlashCommandBuilder()
  .setName(meta.name)
  .setNameLocalizations(meta.nameLocalizations)
  .setDescription(meta.description)
  .setDescriptionLocalizations(meta.descriptionLocalizations)
  .addStringOption(option =>
    option
      .setName(objetMeta.name)
      .setNameLocalizations(objetMeta.nameLocalizations)
      .setDescription(objetMeta.description)
      .setDescriptionLocalizations(objetMeta.descriptionLocalizations)
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
  const itemId = interaction.options.getString(objetMeta.name, true);
  const locale = await getEffectiveLocale(interaction);

  try {
    const buyResult = await buyShopItem(guildId, userId, itemId);
    const config = await getOrCreateEconomyConfig(guildId);
    await interaction.reply({
      embeds: [
        successEmbed(
          m.b3_buy_success_title({}, { locale }),
          m.b3_buy_success_desc({ itemName: buyResult.itemName, price: buyResult.price, currency: config.currencyEmoji, newBalance: buyResult.newBalance }, { locale })
        )
      ]
    });
  } catch (err: unknown) {
    await interaction.reply({
      embeds: [errorEmbed(m.b3_buy_failed_title({}, { locale }), errorMessage(err) || m.b3_buy_failed_desc({}, { locale }))],
      flags: [MessageFlags.Ephemeral]
    });
  }
}

export const buyCommand = { data, execute, autocomplete } satisfies SlashCommandDefinition;
