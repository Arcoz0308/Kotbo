import type { SlashCommandDefinition } from '../../commands.js';
import { EmbedBuilder, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, type ChatInputCommandInteraction } from 'discord.js';
import { getPublicProfileSnapshot } from '../../services/progression/profileService.js';
import { getStaffMember } from '../../services/staff/staffManagementService.js';
import { COLORS, truncate } from '../../utils/embeds.js';

const data = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('👤 Affiche le profil communautaire et la progression Daily Algo')
  .addUserOption((option) =>
    option
      .setName('membre')
      .setDescription('Membre à afficher (par défaut: toi)')
      .setRequired(false),
  );

function rankBadge(rank: number | null | undefined): string {
  if (!rank) return '—';
  if (rank === 1) return '🥇 #1';
  if (rank === 2) return '🥈 #2';
  if (rank === 3) return '🥉 #3';
  return `#${rank}`;
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return '—';
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '0m';
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}j ${remainingHours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatEventType(eventType: string): string {
  const key = eventType.toUpperCase();
  if (key.includes('QUIZ')) return 'Quiz';
  if (key.includes('TALK')) return 'Talk';
  if (key.includes('GAME')) return 'Jeu';
  return eventType;
}

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;

  if (!guildId) {
    await interaction.reply({ content: '❌ Cette commande doit être utilisée dans un serveur.' });
    return;
  }

  await interaction.deferReply();

  const user = interaction.options.getUser('membre') ?? interaction.user;
  let snapshot = await getPublicProfileSnapshot(user.id, guildId);

  if (!snapshot) {
    // Generate fallback profile snapshot
    snapshot = {
      memberProfile: {
        id: `${guildId}:${user.id}`,
        guildId,
        userId: user.id,
        userTag: user.tag,
        username: user.username,
        globalName: user.globalName ?? null,
        displayName: user.globalName ?? user.username,
        avatarUrl: user.displayAvatarURL(),
        bannerUrl: null,
        accentColor: user.accentColor || null,
        locale: null,
        isBot: user.bot,
        bio: null,
        isProfilePrivate: false,
        accountCreatedAt: user.createdAt,
        guildJoinedAt: null,
        guildLeftAt: null,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        lastMessageAt: null,
        lastMessageChannelId: null,
        messageCount: 0,
        voiceSessionCount: 0,
        voiceTimeSeconds: 0,
        voiceLastChannelId: null,
        voiceLastJoinedAt: null,
        voiceLastLeftAt: null,
        rolesSnapshot: [],
        isSuspectedDC: false,
        moderatorNote: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      invite: null,
      eventParticipations: [],
      dailyAlgoProfile: null,
      dailyAlgoParticipations: [],
    };
  }

  const requesterStaff = await getStaffMember(guildId, interaction.user.id);
  const canSeePrivate = interaction.user.id === user.id || !!requesterStaff;
  const profile = snapshot.memberProfile;
  const publicName = profile.displayName ?? profile.globalName ?? profile.username ?? user.username;
  const hasPrivateProfile = profile.isProfilePrivate && !canSeePrivate;

  const currentPoints = snapshot.dailyAlgoProfile?.totalPoints ?? 0;
  const currentTier = snapshot.dailyAlgoProfile?.tier ?? 'Débutant';
  const currentStreak = snapshot.dailyAlgoProfile?.currentStreak ?? 0;
  const currentRank = snapshot.dailyAlgoProfile?.rank ?? null;

  const embed = new EmbedBuilder()
    .setColor(hasPrivateProfile ? COLORS.warning : COLORS.info)
    .setTitle(`👤 Profil communautaire de ${publicName}`)
    .setThumbnail(profile.avatarUrl ?? user.displayAvatarURL())
    .setFooter({ text: 'Kotbo · Profil communautaire' })
    .setTimestamp();

  if (profile.bannerUrl) {
    embed.setImage(profile.bannerUrl);
  }

  if (hasPrivateProfile) {
    embed
      .setDescription('Ce profil est en mode privé. Les informations détaillées sont masquées au public.')
      .addFields(
        {
          name: 'Identité',
          value: `@${profile.username ?? user.username}\n${profile.userTag ?? 'Compte Discord'}`,
          inline: true,
        },
        {
          name: 'Visibilité',
          value: 'Profil privé',
          inline: true,
        },
        {
          name: 'Accès staff',
          value: 'Les membres du staff peuvent toujours voir le profil complet depuis le dashboard.',
          inline: false,
        },
      );

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const inviteText = snapshot.invite
    ? `${snapshot.invite.inviterTag ?? snapshot.invite.inviterId ?? 'Inconnu'}\nCode: ${snapshot.invite.inviteCode ?? '—'}`
    : 'Aucune donnée d’invitation';

  const roles = profile.rolesSnapshot.length > 0
    ? truncate(profile.rolesSnapshot.map((role) => `• ${role}`).join('\n'), 1024)
    : 'Aucun rôle enregistré';

  const dailyAlgoLines = snapshot.dailyAlgoParticipations.length > 0
    ? truncate(snapshot.dailyAlgoParticipations.slice(0, 5).map((entry) => {
        const date = entry.dateKey ?? formatDate(entry.submittedAt);
        const points = entry.totalPoints !== null ? `${entry.totalPoints.toFixed(1)} pts` : '—';
        return `• ${date} — ${entry.status} · ${points}\n  ${entry.problemTitle}`;
      }).join('\n'), 1024)
    : 'Aucune participation Daily Algo récente';

  const eventHistory = snapshot.eventParticipations.length > 0
    ? truncate(snapshot.eventParticipations.slice(0, 5).map((entry) => {
        return `• ${formatDate(entry.createdAt)} — ${formatEventType(entry.eventType)} · ${entry.eventTitle}`;
      }).join('\n'), 1024)
    : 'Aucun événement participé';

  embed.setDescription(profile.bio?.trim() || 'Aucune bio renseignée pour le moment.');

  embed.addFields(
    {
      name: 'Vue générale',
      value: [
        `Pseudo: **${publicName}**`,
        `Discord: <@${profile.userId}>`,
        `Rôles visibles: **${profile.rolesSnapshot.length}**`,
        `Badge principal: **${currentTier}**`,
      ].join('\n'),
      inline: false,
    },
    {
      name: 'Activité',
      value: [
        `Points d'activité: **${currentPoints.toFixed(1)}**`,
        `Messages enregistrés: **${profile.messageCount.toLocaleString('fr-FR')}**`,
        `Vocal: **${formatDuration(profile.voiceTimeSeconds)}**`,
        `Streak Daily Algo: **${currentStreak}**`,
        `Classement Daily Algo: **${rankBadge(currentRank)}**`,
      ].join('\n'),
      inline: true,
    },
    {
      name: 'Arrivée & invitation',
      value: [
        `Serveur: **${formatDate(profile.guildJoinedAt)}**`,
        `Compte: **${formatDate(profile.accountCreatedAt)}**`,
        `Dernière activité: **${formatDate(profile.lastSeenAt)}**`,
        inviteText,
      ].join('\n'),
      inline: true,
    },
    {
      name: 'Badges & rôles',
      value: roles,
      inline: false,
    },
    {
      name: 'Historique événements',
      value: eventHistory,
      inline: false,
    },
    {
      name: 'Daily Algo récent',
      value: dailyAlgoLines,
      inline: false,
    },
  );

  if (profile.guildLeftAt) {
    embed.addFields({
      name: 'Statut serveur',
      value: `Parti le ${formatDate(profile.guildLeftAt)}`,
      inline: false,
    });
  }

  // Create Button linking to dashboard web page profile
  const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:5173';
  const profileLink = `${dashboardUrl}/profile/${user.id}`;
  
  const button = new ButtonBuilder()
    .setLabel('Voir le profil complet')
    .setURL(profileLink)
    .setStyle(ButtonStyle.Link);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

  await interaction.editReply({ embeds: [embed], components: [row] });
}

export const profileCommand = { data, execute } satisfies SlashCommandDefinition;
