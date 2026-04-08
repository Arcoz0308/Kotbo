import { EmbedBuilder, MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import {
  DAILY_ALGO_SCORING_RULES,
  getDailyAlgoUserProfile,
  getGuildDailyAlgoRanking,
  getPreviousDailyAlgoRun,
  formatDailyAlgoDate,
} from '../services/dailyAlgoService.js';
import { COLORS, truncate } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('daily-algo')
  .setDescription('📚 Infos et stats Daily Algo')
  .addStringOption((option) =>
    option
      .setName('vue')
      .setDescription('Choisir la vue Daily Algo')
      .setRequired(false)
      .addChoices(
        { name: 'Défi précédent', value: 'previous' },
        { name: 'Barème de notation', value: 'scoring' },
        { name: 'Classement serveur', value: 'ranking' },
        { name: 'Profil & progression', value: 'profile' },
      ),
  )
  .addUserOption((option) =>
    option
      .setName('membre')
      .setDescription('Membre ciblé (utile pour la vue profil)')
      .setRequired(false),
  );

function formatTierBadge(tier: string): string {
  if (tier === 'Légende') return '👑 Légende';
  if (tier === 'Maître') return '🔥 Maître';
  if (tier === 'Apprenti') return '🛠️ Apprenti';
  return '🌱 Débutant';
}

function rankMedal(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `#${rank}`;
}

async function replyPreviousRun(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
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

async function replyScoring(interaction: ChatInputCommandInteraction): Promise<void> {
  const criteriaLines = DAILY_ALGO_SCORING_RULES.criteria
    .map((criterion) => `${criterion.label}: ${criterion.max}/5`)
    .join('\n');

  const embed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle('🧮 Barème exact du Daily Algo')
    .setDescription('Score final = moyenne des 5 critères, puis ajout du bonus rapidité.')
    .addFields(
      {
        name: 'Critères (poids identique)',
        value: criteriaLines,
        inline: false,
      },
      {
        name: 'Bonus rapidité',
        value: '🥇 +3 points\n🥈 +2 points\n🥉 +1 point',
        inline: false,
      },
      {
        name: 'Statuts progression',
        value: '🌱 Débutant · 🛠️ Apprenti · 🔥 Maître · 👑 Légende',
        inline: false,
      },
    )
    .setFooter({ text: 'Kotbo · Daily Algo' })
    .setTimestamp();

  await interaction.reply({
    embeds: [embed],
    flags: [MessageFlags.Ephemeral],
  });
}

async function replyRanking(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
  const ranking = await getGuildDailyAlgoRanking(guildId);

  if (ranking.length === 0) {
    await interaction.reply({
      content: 'ℹ️ Aucun classement disponible pour le moment. Il faut au moins une soumission validée.',
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const top = ranking.slice(0, 10);
  const lines = top.map((entry) => (
    `${rankMedal(entry.rank)} **${entry.authorName}** — ${entry.totalPoints.toFixed(1)} pts · moyenne ${entry.averageScore.toFixed(1)}/5 · ${formatTierBadge(entry.tier)}`
  ));

  const currentUserRank = ranking.find((entry) => entry.authorId === interaction.user.id) ?? null;
  const userLine = currentUserRank
    ? `Ton rang: **#${currentUserRank.rank}** sur **${ranking.length}** · streak **${currentUserRank.currentStreak}** · ${formatTierBadge(currentUserRank.tier)}`
    : 'Tu n\'es pas encore classé (aucune soumission validée).';

  const embed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle('📊 Classement Daily Algo du serveur')
    .setDescription(lines.join('\n'))
    .addFields({
      name: 'Comparaison Discord',
      value: userLine,
      inline: false,
    })
    .setFooter({ text: 'Kotbo · Daily Algo' })
    .setTimestamp();

  await interaction.reply({
    embeds: [embed],
    flags: [MessageFlags.Ephemeral],
  });
}

async function replyProfile(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
  const targetUser = interaction.options.getUser('membre') ?? interaction.user;
  const profile = await getDailyAlgoUserProfile(guildId, targetUser.id);

  if (!profile) {
    await interaction.reply({
      content: `ℹ️ ${targetUser.username} n'a pas encore de soumission validée sur ce serveur.`,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle(`🎯 Profil Daily Algo · ${profile.authorName}`)
    .addFields(
      {
        name: 'Classement',
        value: `#${profile.rank}`,
        inline: true,
      },
      {
        name: 'Statut',
        value: formatTierBadge(profile.tier),
        inline: true,
      },
      {
        name: 'Série (streak)',
        value: `${profile.currentStreak} en cours · record ${profile.bestStreak}`,
        inline: true,
      },
      {
        name: 'Performance',
        value: `Points cumulés: **${profile.totalPoints.toFixed(1)}**\nMoyenne: **${profile.averageScore.toFixed(1)}/5**\nMeilleur score: **${profile.bestScore.toFixed(1)}**`,
        inline: false,
      },
      {
        name: 'Participation',
        value: `${profile.approvedCount} soumission(s) validée(s)`,
        inline: false,
      },
    )
    .setFooter({ text: 'Kotbo · Daily Algo' })
    .setTimestamp();

  await interaction.reply({
    embeds: [embed],
    flags: [MessageFlags.Ephemeral],
  });
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;

  if (!guildId) {
    await interaction.reply({
      content: '❌ Cette commande doit être utilisée dans un serveur.',
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const view = interaction.options.getString('vue') ?? 'previous';

  if (view === 'scoring') {
    await replyScoring(interaction);
    return;
  }

  if (view === 'ranking') {
    await replyRanking(interaction, guildId);
    return;
  }

  if (view === 'profile') {
    await replyProfile(interaction, guildId);
    return;
  }

  await replyPreviousRun(interaction, guildId);
}
