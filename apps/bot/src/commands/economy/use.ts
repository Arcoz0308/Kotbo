import type { SlashCommandDefinition } from '../../commands.js';
import { SlashCommandBuilder, type ChatInputCommandInteraction, type AutocompleteInteraction, MessageFlags } from 'discord.js';
import prisma from '../../utils/db.js';
import { getOrCreateRpgProfile, consumePotionItem, equipInventoryItem } from '../../services/features/economyService.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';

interface LocalRpgItem {
  id: string;
  name: string;
  emoji: string;
  type: string;
}

interface LocalInventoryEntry {
  itemId: string;
  item: LocalRpgItem;
}

const data = new SlashCommandBuilder()
  .setName('use')
  .setDescription('🎒 Utilise un objet de ton inventaire (potion ou équipement)')
  .addStringOption(option =>
    option
      .setName('objet')
      .setDescription("L'objet à utiliser (choisis dans la liste)")
      .setRequired(true)
      .setAutocomplete(true)
  );

async function autocomplete(interaction: AutocompleteInteraction) {
  const focusedValue = interaction.options.getFocused().toLowerCase();
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;

  try {
    const profile = await getOrCreateRpgProfile(guildId, userId);
    const inventory = profile.inventory as unknown as LocalInventoryEntry[];

    const choices = inventory
      .map(entry => entry.item)
      .filter(item => item.name.toLowerCase().includes(focusedValue))
      .slice(0, 25)
      .map(item => ({
        name: `${item.emoji} ${item.name} (${item.type})`,
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
    const profile = await getOrCreateRpgProfile(guildId, userId);
    const selectedEntry = (profile.inventory as unknown as LocalInventoryEntry[]).find(
      entry => entry.itemId === itemId
    );

    if (!selectedEntry) {
      await interaction.reply({
        embeds: [errorEmbed('Objet introuvable', "Vous ne possédez pas cet objet dans votre inventaire.")],
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    const item = selectedEntry.item;

    if (item.type === 'POTION') {
      const result = await consumePotionItem(guildId, userId, itemId);
      await interaction.reply({
        embeds: [
          successEmbed(
            'Potion consommée',
            `Vous buvez **${result.itemName}**.\n❤️ PV restaurés: +${result.restoredHp} (Total: ${result.newHp} PV)\n⚡ Énergie restaurée: +${result.restoredEnergy} (Total: ${result.newEnergy} Énergie)`
          )
        ]
      });
    } else if (item.type === 'WEAPON' || item.type === 'ARMOR') {
      const result = await equipInventoryItem(guildId, userId, itemId);
      await interaction.reply({
        embeds: [
          successEmbed(
            'Objet équipé',
            `Vous avez équipé **${result.itemName}** en tant que **${result.type === 'WEAPON' ? 'Arme 🗡️' : 'Armure 🦺'}** !`
          )
        ]
      });
    } else {
      await interaction.reply({
        embeds: [errorEmbed("Impossible d'utiliser", `L'objet **${item.name}** ne peut pas être utilisé directement.`)],
        flags: [MessageFlags.Ephemeral]
      });
    }
  } catch (err: any) {
    await interaction.reply({
      embeds: [errorEmbed('Erreur', err.message || "Impossible d'utiliser l'objet.")],
      flags: [MessageFlags.Ephemeral]
    });
  }
}

export const useCommand = { data, execute, autocomplete } satisfies SlashCommandDefinition;
