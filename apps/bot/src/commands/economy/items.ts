import type { SlashCommandDefinition } from '../../commands.js';
import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import { getOrCreateRpgProfile, getOrCreateEconomyConfig } from '../../services/features/economyService.js';
import { errorEmbed, COLORS } from '../../utils/embeds.js';

interface LocalRpgItem {
  id: string;
  name: string;
  description: string;
  emoji: string;
  type: string;
}

interface LocalInventoryEntry {
  id: string;
  rpgProfileId: string;
  itemId: string;
  quantity: number;
  item: LocalRpgItem;
}

const data = new SlashCommandBuilder()
  .setName('items')
  .setDescription('🎒 Liste les objets que tu as achetés dans la boutique');

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;

  try {
    const profile = await getOrCreateRpgProfile(guildId, userId);
    const _config = await getOrCreateEconomyConfig(guildId);
    const inventory = profile.inventory as unknown as LocalInventoryEntry[];

    if (inventory.length === 0) {
      await interaction.reply({
        embeds: [
          errorEmbed(
            'Sac à dos vide',
            'Vous ne possédez aucun objet actuellement. Visitez la boutique avec `/shop` et achetez des objets avec `/buy` !'
          )
        ]
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🎒 Votre Inventaire')
      .setDescription(
        `Retrouvez ici tous vos objets achetés.\n*Pour vous équiper d'un objet ou boire une potion, utilisez* \`/use <objet>\` !`
      )
      .setColor(COLORS.primary)
      .setTimestamp();

    const list = inventory
      .map((entry) => {
        const item = entry.item;
        let desc = `${item.emoji} **${item.name}** (x${entry.quantity}) - *${item.type}*`;
        if (item.id === profile.weaponId) desc += " 🟢 *(Équipé en tant qu'Arme)*";
        if (item.id === profile.armorId) desc += " 🟢 *(Équipé en tant qu'Armure)*";
        return desc;
      })
      .join('\n');

    embed.addFields({ name: 'Contenu du sac à dos', value: list });

    await interaction.reply({ embeds: [embed] });
  } catch (err: unknown) {
    await interaction.reply({
      embeds: [errorEmbed('Erreur', err.message || "Impossible de lister l'inventaire.")],
      flags: [MessageFlags.Ephemeral]
    });
  }
}

export const itemsCommand = { data, execute } satisfies SlashCommandDefinition;
