import { EmbedBuilder, MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import {
  getDailyAlgoUserParticipations,
  getDailyAlgoUserProfile,
  type DailyAlgoUserParticipation,
} from '../services/dailyAlgoService.js';
import { COLORS, truncate } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('👤 Affiche le profil utilisateur et la progression Daily Algo')
  .addUserOption((option) =>
    option
      .setName('membre')
      .setDescription('Membre à afficher (par défaut: toi)')
      .setRequired(false),
  );

function tierBadge(tier: string): string {
  if (tier === 'Légende') return '👑 Légende';
  if (tier === 'Maître') return '🔥 Maître';
  if (tier === 'Apprenti') return '🛠️ Apprenti';
  return '🌱 Débutant';
}

function rankBadge(rank: number | null): string {
  if (!rank) return '—';
  if (rank === 1) return '🥇 #1';
  if (rank === 2) return '🥈 #2';
  if (rank === 3) return '🥉 #3';
  return `#${rank}`;
}

function statusBadge(status: DailyAlgoUserParticipation['status']): string {
  if (status === 'APPROVED') return '✅ Validé';
  if (status === 'REJECTED') return '❌ Rejeté';
  return '⏳ En attente';
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatParticipationLine(entry: DailyAlgoUserParticipation): string {
  const date = entry.dateKey ?? formatDate(entry.submittedAt);
  const runRank = entry.rankInRun ? ` · run ${rankBadge(entry.rankInRun)}` : '';
  const points = entry.totalPoints !== null ? ` · ${entry.totalPoints.toFixed(1)} pts` : '';
  const speed = entry.speedRank ? ` · arrivée #${entry.speedRank}` : '';
  return `• ${date} — ${statusBadge(entry.status)}${runRank}${points}${speed}\n  ${truncate(entry.problemTitle, 85)}`;
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

  const user = interaction.options.getUser('membre') ?? interaction.user;

  const [dailyProfile, participations] = await Promise.all([
    getDailyAlgoUserProfile(guildId, user.id),
    getDailyAlgoUserParticipations(guildId, user.id, 8),
  ]);

  const embed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle(`👤 Profil de ${user.globalName ?? user.username}`)
    .setThumbnail(user.displayAvatarURL())
    .setFooter({ text: 'Kotbo · Profil utilisateur' })
    .setTimestamp();

  if (!dailyProfile) {
    embed
      .setDescription('Aucune soumission Daily Algo validée pour le moment.')
      .addFields({
        name: 'Participations récentes',
        value: participations.length > 0
          ? truncate(participations.map((entry) => formatParticipationLine(entry)).join('\n'), 1024)
          : 'Aucune participation trouvée.',
        inline: false,
      });

    await interaction.reply({
      embeds: [embed],
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  embed.addFields(
    {
      name: 'Classement serveur',
      value: rankBadge(dailyProfile.rank),
      inline: true,
    },
    {
      name: 'Statut',
      value: tierBadge(dailyProfile.tier),
      inline: true,
    },
    {
      name: 'Streak',
      value: `${dailyProfile.currentStreak} en cours · record ${dailyProfile.bestStreak}`,
      inline: true,
    },
    {
      name: 'Performances Daily Algo',
      value: `Points cumulés: **${dailyProfile.totalPoints.toFixed(1)}**\nMoyenne: **${dailyProfile.averageScore.toFixed(1)}/5**\nMeilleur score: **${dailyProfile.bestScore.toFixed(1)}**\nSoumissions validées: **${dailyProfile.approvedCount}**`,
      inline: false,
    },
    {
      name: 'Participations récentes',
      value: participations.length > 0
        ? truncate(participations.map((entry) => formatParticipationLine(entry)).join('\n'), 1024)
        : 'Aucune participation trouvée.',
      inline: false,
    },
  );

  await interaction.reply({
    embeds: [embed],
    flags: [MessageFlags.Ephemeral],
  });
}
