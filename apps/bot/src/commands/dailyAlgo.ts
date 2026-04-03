import { EmbedBuilder, MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { getPreviousDailyAlgoRun, formatDailyAlgoDate } from '../services/dailyAlgoService.js';
import { COLORS, truncate } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('daily-algo')
  .setDescription('📚 Affiche le Daily Algo précédent');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;

  if (!guildId) {
    await interaction.reply({
      content: '❌ Cette commande doit être utilisée dans un serveur.',
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const previousRun = await getPreviousDailyAlgoRun(guildId);

  if (!previousRun) {
    await interaction.reply({
      content: 'ℹ️ Aucun Daily Algo précédent n\'a encore été publié sur ce serveur.',
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const dateLabel = formatDailyAlgoDate(previousRun.dateKey ?? '');

  const embed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle(`📚 Daily Algo du ${dateLabel}`)
    .addFields(
      {
        name: '📌 Titre',
        value: truncate(previousRun.problem.title, 256),
        inline: false,
      },
      {
        name: '⚙️ Difficulté',
        value: `\`${truncate(previousRun.problem.difficulty, 32)}\``,
        inline: true,
      },
      {
        name: '🗓️ Date',
        value: dateLabel,
        inline: true,
      },
      {
        name: '❓ Question',
        value: truncate(previousRun.problem.description, 1800),
        inline: false,
      },
    )
    .setFooter({ text: 'Kotbo · Daily Algo' })
    .setTimestamp(previousRun.createdAt);

  await interaction.reply({
    embeds: [embed],
    flags: [MessageFlags.Ephemeral],
  });
}
