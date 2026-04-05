import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
  EmbedBuilder,
} from 'discord.js';
import prisma from '../utils/db.js';
import { COLORS, infoEmbed } from '../utils/embeds.js';
import { getParisDayRange } from '../services/interestService.js';

function computeRecoveryPriority(item: { createdAt: Date; interestScore: number | null }): number {
  const ageHours = Math.max(0, (Date.now() - item.createdAt.getTime()) / (1000 * 60 * 60));
  const freshnessBoost = Math.max(0, 1.5 - (ageHours / 24));
  const negativePenalty = Math.max(0, Math.abs(Math.min(0, item.interestScore ?? 0)));
  return freshnessBoost - (negativePenalty * 0.35);
}

export const data = new SlashCommandBuilder()
  .setName('news-rattrapage')
  .setDescription('🧠 Liste les news filtrées aujourd\'hui et permet de les reclasser')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addIntegerOption((o) =>
    o
      .setName('limite')
      .setDescription('Nombre max de sujets à afficher (1-50)')
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(50),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const guildId = interaction.guildId!;
  const limit = interaction.options.getInteger('limite') ?? 50;
  const { start, end } = getParisDayRange();

  const filteredItems = await prisma.feedItem.findMany({
    where: {
      feed: { guildId },
      interestDecision: 'FILTERED_OUT',
      createdAt: { gte: start, lt: end },
    },
    include: { feed: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  if (filteredItems.length === 0) {
    await interaction.editReply({
      embeds: [infoEmbed('Aucun sujet filtré', 'Aucune news n\'a été filtrée par l\'algo aujourd\'hui.')],
    });
    return;
  }

  const prioritizedItems = [...filteredItems]
    .map((item) => ({ item, priority: computeRecoveryPriority(item) }))
    .sort((a, b) => b.priority - a.priority)
    .map((entry) => entry.item);

  const lines = prioritizedItems.map((item, index) => {
    const topics = item.topics.length > 0 ? item.topics.slice(0, 3).join(', ') : 'sujet non détecté';
    const score = typeof item.interestScore === 'number' ? item.interestScore.toFixed(2) : 'n/a';
    const reason = item.interestReason ? item.interestReason.slice(0, 90) : 'raison non disponible';
    return `${index + 1}. **${item.title}**\n   ↳ ${item.feed.name} • ${topics}\n   ↳ score ${score} • ${reason}`;
  });

  const embed = new EmbedBuilder()
    .setColor(COLORS.warning)
    .setTitle('🧠 Sujets non envoyés (filtrés par goûts)')
    .setDescription(lines.join('\n\n').slice(0, 3900))
    .setFooter({ text: 'Sélectionne les sujets à reclasser comme intéressants.' })
    .setTimestamp();

  const options = prioritizedItems.slice(0, 50).map((item) => ({
    label: item.title.length > 95 ? `${item.title.slice(0, 92)}...` : item.title,
    value: item.id,
    description: (`${item.feed.name} • score ${(item.interestScore ?? 0).toFixed(2)}`).slice(0, 95),
  }));

  const rows: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
  const firstBatch = options.slice(0, 25);
  const secondBatch = options.slice(25, 50);

  if (firstBatch.length > 0) {
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('news:recovery:topics:1')
          .setPlaceholder('Marquer des sujets comme intéressants (1/2)')
          .setMinValues(1)
          .setMaxValues(Math.min(5, firstBatch.length))
          .addOptions(firstBatch),
      ),
    );
  }

  if (secondBatch.length > 0) {
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('news:recovery:topics:2')
          .setPlaceholder('Marquer des sujets comme intéressants (2/2)')
          .setMinValues(1)
          .setMaxValues(Math.min(5, secondBatch.length))
          .addOptions(secondBatch),
      ),
    );
  }

  await interaction.editReply({ embeds: [embed], components: rows });
}
