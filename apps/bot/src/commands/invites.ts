import { EmbedBuilder, MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import prisma from '../utils/db.js';
import { COLORS } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('invites')
  .setDescription("📩 Affiche les statistiques d'invitations d'un membre")
  .addUserOption((option) =>
    option
      .setName('membre')
      .setDescription('Membre à afficher (par défaut: toi)')
      .setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;

  if (!guildId) {
    await interaction.reply({
      content: '❌ Cette commande doit être utilisée dans un serveur.',
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferReply();

  const targetUser = interaction.options.getUser('membre') ?? interaction.user;

  // Récupérer toutes les invitations de l'utilisateur
  const invites = await prisma.memberInvite.findMany({
    where: { guildId, inviterId: targetUser.id },
    orderBy: { joinedAt: 'desc' },
  });

  const totalInvites = invites.length;

  if (totalInvites === 0) {
    await interaction.editReply({
      content: `❌ ${targetUser.username} n'a invité personne sur le serveur.`,
    });
    return;
  }

  // Calculer la rétention (membres toujours présents)
  const discordGuild = interaction.client.guilds.cache.get(guildId);
  let activeInvites = 0;
  let lostInvites = 0;

  for (const invite of invites) {
    try {
      const member = await discordGuild?.members.fetch(invite.userId).catch(() => null);
      if (member) {
        activeInvites++;
      } else {
        lostInvites++;
      }
    } catch {
      lostInvites++;
    }
  }

  const retentionRate = totalInvites > 0 ? Math.round((activeInvites / totalInvites) * 100) : 0;

  const embed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle(`📩 Invitations de ${targetUser.username}`)
    .setThumbnail(targetUser.displayAvatarURL())
    .addFields(
      { name: 'Total Invitations', value: String(totalInvites), inline: true },
      { name: 'Actifs (Présents)', value: String(activeInvites), inline: true },
      { name: 'Perdus (Partis)', value: String(lostInvites), inline: true },
      { name: 'Taux de Rétention', value: `${retentionRate}%`, inline: false }
    )
    .setFooter({ text: `Kotbo Analytics • Requis par ${interaction.user.username}` });

  // Ajouter les 5 dernières invitations
  if (invites.length > 0) {
    const recentInvites = invites.slice(0, 5).map(inv => {
      const date = inv.joinedAt.toLocaleDateString('fr-FR');
      return `• <@${inv.userId}> (Rejoint le ${date})`;
    }).join('\n');

    embed.addFields({ name: 'Dernières Invitations', value: recentInvites, inline: false });
  }

  await interaction.editReply({ embeds: [embed] });
}
