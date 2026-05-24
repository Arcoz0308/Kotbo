import { EmbedBuilder, MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { getStaffMember, getStaffMemberStats } from '../services/staffManagementService.js';
import { getStaffProfileSnapshot } from '../services/profileService.js';
import { COLORS, truncate } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('profil')
  .setDescription('👤 Affiche le profil staff détaillé')
  .addUserOption((option) =>
    option
      .setName('utilisateur')
      .setDescription('Membre staff à afficher (par défaut: toi)')
      .setRequired(false),
  );

function formatGrade(grade: string): string {
  const grades: Record<string, string> = {
    HELPER: '🤝 Helper',
    MODERATOR: '🛡️ Modérateur',
    ADMIN: '⚙️ Admin',
    OWNER: '👑 Propriétaire',
  };
  return grades[grade] ?? grade;
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatDuration(ms: number): string {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / 1000 / 60) % 60);
  const hours = Math.floor((ms / 1000 / 60 / 60) % 24);
  const days = Math.floor(ms / 1000 / 60 / 60 / 24);

  if (days > 0) return `${days}j ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatTestingPeriodStatus(status: string): string {
  if (status === 'PASSED') return '✅ Validée';
  if (status === 'FAILED') return '❌ Échouée';
  return '⏳ En cours';
}

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.editReply({ content: '❌ Cette commande ne peut être utilisée que sur un serveur.' });
      return;
    }

    const requesterStaff = await getStaffMember(guildId, interaction.user.id);
    if (!requesterStaff) {
      await interaction.editReply({ content: '❌ Cette commande est réservée aux membres du staff connectés sur le dashboard.' });
      return;
    }

    const user = interaction.options.getUser('utilisateur') ?? interaction.user;
    const targetStaff = await getStaffMember(guildId, user.id);

    if (!targetStaff) {
      await interaction.editReply({ content: `❌ ${user.username} n'est pas dans le staff.` });
      return;
    }

    const [detailStats, snapshot] = await Promise.all([
      getStaffMemberStats(guildId, user.id),
      getStaffProfileSnapshot(guildId, user.id),
    ]);

    const currentRoleTime = Date.now() - targetStaff.currentRoleStartedAt.getTime();
    const activeTesting = detailStats.testingPeriods.find((period) => period.status === 'ONGOING') ?? detailStats.testingPeriods[0] ?? null;
    const latestGradeChange = snapshot?.gradeHistory?.[0] ?? null;
    const recentWarnings = snapshot?.warnings?.slice(0, 5) ?? [];
    const recentNotes = snapshot?.notesAbout?.slice(0, 5) ?? [];
    const recentActivity = snapshot?.activities?.slice(0, 5) ?? [];

    const embed = new EmbedBuilder()
      .setColor(snapshot?.activeBlacklist ? COLORS.danger : COLORS.info)
      .setTitle(`👤 Profil Staff: ${targetStaff.displayName ?? targetStaff.username ?? user.username}`)
      .setDescription(`<@${user.id}>`)
      .setThumbnail(snapshot?.publicProfile?.avatarUrl ?? user.displayAvatarURL())
      .setFooter({ text: 'Kotbo · Profil staff' })
      .setTimestamp();

    if (snapshot?.publicProfile?.bannerUrl) {
      embed.setImage(snapshot.publicProfile.bannerUrl);
    }

    embed.addFields(
      {
        name: 'Grade actuel',
        value: formatGrade(targetStaff.grade),
        inline: true,
      },
      {
        name: 'Depuis ce grade',
        value: formatDuration(currentRoleTime),
        inline: true,
      },
      {
        name: 'Staff depuis',
        value: formatDate(targetStaff.joinedStaffAt),
        inline: true,
      },
      {
        name: 'Stats activité',
        value: [
          `Messages: **${detailStats.stats.totalMessages.toLocaleString('fr-FR')}**`,
          `Vocal: **${detailStats.stats.totalVoiceMinutes.toLocaleString('fr-FR')} min**`,
          `Warns actifs: **${detailStats.stats.activeWarnings}**`,
          `Sanctions suivies: **${snapshot?.stats.sanctionsIssued ?? detailStats.stats.activeWarnings}**`,
        ].join('\n'),
        inline: false,
      },
    );

    if (snapshot?.publicProfile) {
      embed.addFields(
        {
          name: 'Contact',
          value: [
            `Pseudo: **${snapshot.publicProfile.displayName ?? snapshot.publicProfile.globalName ?? snapshot.publicProfile.username ?? user.username}**`,
            `Tag: **${snapshot.publicProfile.userTag ?? '—'}**`,
            `Compte: **${formatDate(snapshot.publicProfile.accountCreatedAt)}**`,
            `Arrivé serveur: **${formatDate(snapshot.publicProfile.guildJoinedAt)}**`,
          ].join('\n'),
          inline: true,
        },
        {
          name: 'Signaux staff',
          value: [
            `Notes écrites: **${snapshot.notesWritten.length}**`,
            `Notes reçues: **${snapshot.notesAbout.length}**`,
            `Périodes de test: **${snapshot.testingPeriods.length}**`,
            `Clés API: **${snapshot.apiKeys.length}**`,
          ].join('\n'),
          inline: true,
        },
      );
    }

    if (snapshot?.activeBlacklist) {
      embed.addFields({
        name: 'Blacklist active',
        value: [
          `Raison: **${snapshot.activeBlacklist.reason}**`,
          `Début: **${formatDate(snapshot.activeBlacklist.startDate)}**`,
          `Fin: **${formatDate(snapshot.activeBlacklist.endDate)}**`,
        ].join('\n'),
        inline: false,
      });
    }

    if (activeTesting) {
      const reports = activeTesting.reports?.length ?? 0;
      embed.addFields({
        name: 'Période de test',
        value: [
          `Statut: **${formatTestingPeriodStatus(activeTesting.status)}**`,
          `Mentor: ${activeTesting.mentor ? `<@${activeTesting.mentor.userId}>` : '—'}`,
          `Début: **${formatDate(activeTesting.startDate)}**`,
          `Cible: **${activeTesting.targetGrade ?? '—'}**`,
          `Rapports: **${reports}**`,
        ].join('\n'),
        inline: false,
      });
    }

    if (latestGradeChange) {
      embed.addFields({
        name: 'Dernier changement de grade',
        value: [
          `Date: **${formatDate(latestGradeChange.dateIso)}**`,
          `Action: **${latestGradeChange.action}**`,
          truncate(latestGradeChange.details, 900),
        ].join('\n'),
        inline: false,
      });
    }

    if (recentWarnings.length > 0) {
      embed.addFields({
        name: 'Warns récents',
        value: truncate(recentWarnings.map((warn) => `• ${formatDate(warn.createdAt)} — ${warn.reason}`).join('\n'), 1024),
        inline: false,
      });
    }

    if (recentNotes.length > 0) {
      embed.addFields({
        name: 'Dernières notes',
        value: truncate(recentNotes.map((note) => `• ${formatDate(note.createdAt)} — ${note.content}`).join('\n'), 1024),
        inline: false,
      });
    }

    if (recentActivity.length > 0) {
      embed.addFields({
        name: 'Activité récente',
        value: truncate(recentActivity.map((entry) => `• ${formatDate(entry.activityDate)} — ${entry.messageCount} messages / ${entry.voiceMinutes} min`).join('\n'), 1024),
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Profil', `Erreur lors de la récupération du profil: ${String(error)}`);
    await interaction.editReply({ content: '❌ Une erreur est survenue lors de la récupération du profil.' });
  }
}