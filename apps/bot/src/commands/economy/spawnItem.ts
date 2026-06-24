import type { SlashCommandDefinition } from '../../commands.js';
import { SlashCommandBuilder, type ChatInputCommandInteraction, type AutocompleteInteraction, MessageFlags, PermissionFlagsBits } from 'discord.js';
import prisma from '../../utils/db.js';
import { adminSpawnItem } from '../../services/features/economyService.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';

const data = new SlashCommandBuilder()
  .setName('spawn-item')
  .setDescription("⚙️ Faire apparaître un objet de la base de données dans l'inventaire de quelqu'un")
  .addUserOption(option =>
    option
      .setName('membre')
      .setDescription('Le membre cible')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('objet')
      .setDescription("L'objet à faire apparaître")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addIntegerOption(option =>
    option
      .setName('quantite')
      .setDescription("La quantité d'objets à faire apparaître (défaut : 1)")
      .setRequired(false)
      .setMinValue(1)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function autocomplete(interaction: AutocompleteInteraction) {
  const focusedValue = interaction.options.getFocused().toLowerCase();
  const guildId = interaction.guildId!;

  try {
    const items = await prisma.rpgItem.findMany({
      where: {
        OR: [
          { guildId: null },
          { guildId }
        ]
      }
    });

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
    const result = await adminSpawnItem(guildId, targetUser.id, itemId, quantity);

    await interaction.reply({
      embeds: [
        successEmbed(
          'Objet apparu !',
          `Vous avez fait apparaître **${quantity}x** ${result.itemEmoji} **${result.itemName}** dans l'inventaire de <@${targetUser.id}>.`
        )
      ]
    });
  } catch (err: unknown) {
    await interaction.reply({
      embeds: [errorEmbed('Erreur', err.message || "Impossible de faire apparaître l'objet.")],
      flags: [MessageFlags.Ephemeral]
    });
  }
}

export const spawnItemCommand = { data, execute, autocomplete } satisfies SlashCommandDefinition;
