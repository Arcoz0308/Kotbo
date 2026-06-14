import type { SlashCommandDefinition } from '../../commands.js';
import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import prisma from '../../utils/db.js';
import { getOrCreateEconomyConfig, getOrCreateRpgProfile } from '../../services/features/economyService.js';
import { errorEmbed, COLORS } from '../../utils/embeds.js';

interface LocalRpgItem {
  id: string;
  name: string;
  description: string;
  emoji: string;
  type: string;
  atkBonus: number;
  defBonus: number;
  spdBonus: number;
  hpRestore: number;
  energyRestore: number;
  price: number;
}

const data = new SlashCommandBuilder()
  .setName('shop')
  .setDescription('🛒 Liste les objets disponibles dans la boutique');

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;

  try {
    const config = await getOrCreateEconomyConfig(guildId);
    const profile = await getOrCreateRpgProfile(guildId, userId);

    const items = await prisma.rpgItem.findMany({
      where: {
        OR: [
          { guildId: null },
          { guildId }
        ],
        purchasable: true
      },
      orderBy: { price: 'asc' }
    });

    if (items.length === 0) {
      await interaction.reply({
        content: 'La boutique est vide actuellement.',
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🛒 Boutique du Serveur')
      .setDescription(
        `Achetez des objets pour améliorer vos statistiques et voyager en toute sécurité !\nVotre Solde: **${profile.balance}** ${config.currencyEmoji}\n\n*Pour acheter un objet, utilise* \`/buy <objet>\` !`
      )
      .setColor(COLORS.primary)
      .setTimestamp();

    const typesMap: Record<string, string> = {
      WEAPON: '🗡️ Armes',
      ARMOR: '🦺 Armures',
      POTION: '🧪 Potions',
      QUEST: '🔑 Objets de quête'
    };

    // Group items by type
    const groupedItems = items.reduce((acc: Record<string, LocalRpgItem[]>, item: any) => {
      const localItem = item as LocalRpgItem;
      acc[localItem.type] = acc[localItem.type] || [];
      acc[localItem.type].push(localItem);
      return acc;
    }, {} as Record<string, LocalRpgItem[]>);

    for (const [type, itemArray] of Object.entries(groupedItems)) {
      const list = itemArray
        .map((item: LocalRpgItem) => {
          let stats = '';
          if (item.atkBonus) stats += ` (+${item.atkBonus} ATK)`;
          if (item.defBonus) stats += ` (+${item.defBonus} DEF)`;
          if (item.hpRestore) stats += ` (Restaure ${item.hpRestore} HP)`;
          if (item.energyRestore) stats += ` (Restaure ${item.energyRestore} Énergie)`;
          return `${item.emoji} **${item.name}** - **${item.price}** 🪙\n*${item.description}*${stats}`;
        })
        .join('\n\n');
      embed.addFields({ name: typesMap[type] || type, value: list || 'Vide' });
    }

    await interaction.reply({ embeds: [embed] });
  } catch (err: any) {
    await interaction.reply({
      embeds: [errorEmbed('Erreur', err.message || 'Impossible d’ouvrir la boutique.')],
      flags: [MessageFlags.Ephemeral]
    });
  }
}

export const shopCommand = { data, execute } satisfies SlashCommandDefinition;
