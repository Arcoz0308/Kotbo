import type { SlashCommandDefinition } from '../../commands.js';
import { SlashCommandBuilder, type ChatInputCommandInteraction, type AutocompleteInteraction, MessageFlags, PermissionFlagsBits } from 'discord.js';
import prisma from '../../utils/db.js';
import { adminRemoveItem } from '../../services/features/economyService.js';
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
  .setName('remove-item')
  .setDescription("⚙️ Retirer un objet de l'inventaire de quelqu'un")
  .addUserOption(option =>
    option
      .setName('membre')
      .setDescription('Le membre cible')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('objet')
      .setDescription("L'objet à retirer")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addIntegerOption(option =>
    option
      .setName('quantite')
      .setDescription("La quantité d'objets à retirer (défaut : 1)")
      .setRequired(false)
      .setMinValue(1)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function autocomplete(interaction: AutocompleteInteraction) {
  const focusedValue = interaction.options.getFocused().toLowerCase();
  const guildId = interaction.guildId!;
  const targetUserOption = interaction.options.get('membre');
  const targetUserId = targetUserOption?.value as string | undefined;

  try {
    let items: LocalRpgItem[] = [];

    if (targetUserId) {
      // Autocomplete based on what the target user actually owns
      const profile = await prisma.rpgProfile.findUnique({
        where: { guildId_userId: { guildId, userId: targetUserId } },
        include: { inventory: { include: { item: true } } }
      });
      if (profile) {
        items = (profile.inventory as unknown as LocalInventoryEntry[]).map(entry => entry.item);
      }
    }

    if (items.length === 0) {
      // Fallback: all items in the guild/global
      items = await prisma.rpgItem.findMany({
        where: {
          OR: [
            { guildId: null },
            { guildId }
          ]
        }
      }) as unknown as LocalRpgItem[];
    }

    const choices = items
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
  const targetUser = interaction.options.getUser('membre', true);
  const itemId = interaction.options.getString('objet', true);
  const quantity = interaction.options.getInteger('quantite') ?? 1;

  if (targetUser.bot) {
    await interaction.reply({
      embeds: [errorEmbed('Erreur', "Impossible de modifier l'inventaire d'un bot.")],
      flags: [MessageFlags.Ephemeral]
    });
    return;
  }

  try {
    const result = await adminRemoveItem(guildId, targetUser.id, itemId, quantity);

    await interaction.reply({
      embeds: [
        successEmbed(
          'Objet retiré !',
          `Vous avez retiré **${result.removedQuantity}x** ${result.itemEmoji} **${result.itemName}** de l'inventaire de <@${targetUser.id}>.\n` +
          `*(Quantité restante : ${result.remainingQuantity})*`
        )
      ]
    });
  } catch (err: unknown) {
    await interaction.reply({
      embeds: [errorEmbed('Erreur', err.message || "Impossible de retirer l'objet.")],
      flags: [MessageFlags.Ephemeral]
    });
  }
}

export const removeItemCommand = { data, execute, autocomplete } satisfies SlashCommandDefinition;
