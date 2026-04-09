import { EmbedBuilder, MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { getStaffMember, getStaffMemberStats, getActiveBlacklist } from '../services/staffManagementService.js';
import { COLORS } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('profil')
  .setDescription('👤 Affiche le profil staff')
  .addUserOption((option) =>
    option
      .setName('utilisateur')
      .setDescription('Utilisateur à afficher (par défaut: toi)')
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

function formatDate(date: Date): string {
  return date.toLocaleDateString('fr-FR', {
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

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const guildId = interaction.guildId;
    if (!guildId) {
      return await interaction.editReply({
        content: '❌ Cette commande ne peut être utilisée que sur un serveur',
      });
    }

    const user = interaction.options.getUser('utilisateur') ?? interaction.user;
    const staffMember = await getStaffMember(guildId, user.id);

    if (!staffMember) {
      return await interaction.editReply({
        content: `❌ ${user.username} n'est pas dans le staff`,
      });
    }

    // Récupérer les stats
    const result = await getStaffMemberStats(guildId, user.id);
    const blacklist = await getActiveBlacklist(guildId, user.id);

    // Calculer le temps depuis le changement de grade
    const currentRoleTime = Date.now() - staffMember.currentRoleStartedAt.getTime();

    // Créer l'embed
    const embed = new EmbedBuilder()
      .setColor(COLORS.info)
      .setTitle(`👤 Profil Staff: ${staffMember.displayName}`)
      .setDescription(`<@${user.id}>`)
      .addFields(
        {
          name: '📊 Grade Actuel',
          value: formatGrade(staffMember.grade),
          inline: true,
        },
        {
          name: '⏱️ Depuis ce grade',
          value: formatDuration(currentRoleTime),
          inline: true,
        },
        {
          name: '📅 Membre du staff depuis',
          value: formatDate(staffMember.joinedStaffAt),
          inline: true,
        },
        {
          name: '💬 Messages',
          value: `${result.stats.totalMessages.toLocaleString('fr-FR')}`,
          inline: true,
        },
        {
          name: '🎙️ Temps en vocal',
          value: `${result.stats.totalVoiceMinutes} minutes`,
          inline: true,
        },
        {
          name: '⚠️ Avertissements actifs',
          value: `${result.stats.activeWarnings}`,
          inline: true,
        },
      );

    // Ajouter la blacklist si active
    if (blacklist) {
      const endDate = blacklist.endDate ? formatDate(blacklist.endDate) : 'Permanent';
      embed.addFields({
        name: '🚫 Statut Blacklist',
        value: `**${blacklist.reason}**\nExpire le: ${endDate}`,
        inline: false,
      });
      embed.setColor(COLORS.danger);
    }

    // Ajouter la période de test si active
    if (result.testingPeriods && result.testingPeriods.length > 0) {
      const activeTesting = result.testingPeriods.find((t) => t.status === 'ONGOING');
      if (activeTesting) {
        const testStart = formatDate(activeTesting.createdAt);
        embed.addFields({
          name: '🧪 Période de Test',
          value: `Mentor: <@${activeTesting.mentorId}>\nDémarré le: ${testStart}`,
          inline: false,
        });
      }
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Profil', `Erreur lors de la récupération du profil: ${String(error)}`);
    await interaction.editReply({
      content: '❌ Une erreur est survenue lors de la récupération du profil',
    });
  }
}
