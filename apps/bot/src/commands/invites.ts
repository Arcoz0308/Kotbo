import { EmbedBuilder, MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { COLORS } from '../utils/embeds.js';
import { getInviteLeaderboard, getUserInviteStats } from '../services/inviteService.js';
import prisma from '../utils/db.js';

export const data = new SlashCommandBuilder()
  .setName('invites')
  .setDescription("📩 Gestion et statistiques d'invitations")
  .addSubcommand(sub =>
    sub
      .setName('stats')
      .setDescription("Affiche les statistiques d'un membre")
      .addUserOption(option =>
        option.setName('membre').setDescription('Le membre à vérifier (par défaut: vous)').setRequired(false)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('leaderboard')
      .setDescription("Affiche le classement des meilleurs inviteurs")
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  const subcommand = interaction.options.getSubcommand();

  if (!guildId) {
    await interaction.reply({
      content: '❌ Cette commande doit être utilisée dans un serveur.',
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferReply();

  if (subcommand === 'stats') {
    const targetUser = interaction.options.getUser('membre') ?? interaction.user;
    const stats = await getUserInviteStats(guildId, targetUser.id);

    if (!stats || stats.totalJoined === 0) {
      await interaction.editReply({
        content: `❌ ${targetUser.id === interaction.user.id ? 'Vous n\'avez' : targetUser.username + ' n\'a'} invité personne sur le serveur.`,
      });
      return;
    }

    const retentionRate = stats.totalJoined > 0 ? Math.round((stats.totalStayed / stats.totalJoined) * 100) : 0;

    const embed = new EmbedBuilder()
      .setColor(COLORS.info)
      .setTitle(`📩 Invitations de ${targetUser.username}`)
      .setThumbnail(targetUser.displayAvatarURL())
      .addFields(
        { name: 'Total Invitations', value: String(stats.totalJoined), inline: true },
        { name: 'Actifs (Présents)', value: String(stats.totalStayed), inline: true },
        { name: 'Perdus (Partis)', value: String(stats.totalLeft), inline: true },
        { name: 'Taux de Rétention', value: `${retentionRate}%`, inline: false }
      )
      .setFooter({ text: `Kotbo Analytics • Requis par ${interaction.user.username}` })
      .setTimestamp();

    // Ajouter les 5 dernières invitations
    const recentInvites = await prisma.memberInvite.findMany({
      where: { guildId, inviterId: targetUser.id },
      orderBy: { joinedAt: 'desc' },
      take: 5,
    });

    if (recentInvites.length > 0) {
      const list = recentInvites.map(inv => {
        const date = `<t:${Math.floor(inv.joinedAt.getTime() / 1000)}:d>`;
        const status = inv.leftAt ? '❌ Parti' : '✅ Présent';
        return `• <@${inv.userId}> (${date}) - ${status}`;
      }).join('\n');

      embed.addFields({ name: 'Dernières Invitations', value: list, inline: false });
    }

    await interaction.editReply({ embeds: [embed] });
  } else if (subcommand === 'leaderboard') {
    const leaderboard = await getInviteLeaderboard(guildId);

    if (leaderboard.length === 0) {
      await interaction.editReply({
        content: '❌ Aucune statistique d\'invitation disponible pour ce serveur.',
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(COLORS.info)
      .setTitle('🏆 Classement des Inviteurs')
      .setDescription('Classement basé sur le nombre de membres **restant** sur le serveur.')
      .setTimestamp();

    const list = leaderboard.map((s, i) => {
      const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      return `${rank} **${s.inviterTag}** : **${s.totalStayed}** restants (Total: ${s.totalJoined}, Partis: ${s.totalLeft})`;
    }).join('\n');

    embed.addFields({ name: 'Top 10', value: list });

    await interaction.editReply({ embeds: [embed] });
  }
}
