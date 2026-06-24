import type { SlashCommandDefinition } from '../../commands.js';
import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  AttachmentBuilder,
  MessageFlags,
  SeparatorSpacingSize,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { getPublicProfileSnapshot } from '../../services/progression/profileService.js';
import { getStaffMember } from '../../services/staff/staffManagementService.js';
import { generateProfileCard } from '../../services/core/imageService.js';
import { getMemberRankData } from '../../services/progression/levelingService.js';
import { COLORS_RAW, truncate, text } from '../../utils/embeds.js';
import { E, rankEmoji } from '../../utils/emojis.js';

const data = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('👤 Affiche le profil communautaire et la progression Daily Algo')
  .addUserOption((option) =>
    option
      .setName('membre')
      .setDescription('Membre à afficher (par défaut: toi)')
      .setRequired(false),
  )
  .addStringOption((option) =>
    option
      .setName('style')
      .setDescription("Style d'affichage")
      .setRequired(false)
      .addChoices(
        { name: 'Carte (Image)', value: 'card' },
        { name: 'Détaillé (Texte)', value: 'detail' },
      ),
  );

function formatDate(date: Date | null | undefined): string {
  if (!date) return '—';
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
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
    await interaction.reply({
      content: `${E.error} Cette commande doit être utilisée dans un serveur.`,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferReply();

  const user = interaction.options.getUser('membre') ?? interaction.user;
  const style = interaction.options.getString('style') ?? 'card';
  let snapshot = await getPublicProfileSnapshot(user.id, guildId);

  if (!snapshot) {
    snapshot = {
      memberProfile: {
        id: `${guildId}:${user.id}`, guildId, userId: user.id,
        userTag: user.tag, username: user.username,
        globalName: user.globalName ?? null,
        displayName: user.globalName ?? user.username,
        avatarUrl: user.displayAvatarURL(), bannerUrl: null,
        accentColor: user.accentColor || null, locale: null,
        isBot: user.bot, bio: null, isProfilePrivate: false,
        accountCreatedAt: user.createdAt, guildJoinedAt: null, guildLeftAt: null,
        firstSeenAt: new Date(), lastSeenAt: new Date(),
        lastMessageAt: null, lastMessageChannelId: null,
        messageCount: 0, voiceSessionCount: 0, voiceTimeSeconds: 0,
        voiceLastChannelId: null, voiceLastJoinedAt: null, voiceLastLeftAt: null,
        rolesSnapshot: [], isSuspectedDC: false, moderatorNote: null,
        createdAt: new Date(), updatedAt: new Date(),
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

  const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:5173';
  const profileLink = `${dashboardUrl}/profile/${user.id}`;

  // Private profile
  if (hasPrivateProfile) {
    const container = new ContainerBuilder()
      .setAccentColor(COLORS_RAW.warning)
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(text(`### ${E.lock} Profil privé · ${publicName}`))
          .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: profile.avatarUrl ?? user.displayAvatarURL() } }))
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text('Ce profil est en mode privé. Les informations détaillées sont masquées au public.'))
      .addTextDisplayComponents(text(`${E.arrow} **Identité** · @${profile.username ?? user.username}\n${E.arrow} **Visibilité** · Profil privé`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text(`-# ${E.info} Les membres du staff peuvent voir le profil complet via le dashboard.`));

    await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    return;
  }

  // Card mode (image)
  if (style === 'card') {
    let rankData: { level: number; xp: number; rank: number } | null = null;
    try {
      rankData = await getMemberRankData(guildId, user.id);
    } catch { /* leveling may be disabled */ }

    const imageBuffer = await generateProfileCard({
      displayName: publicName,
      username: profile.username ?? user.username,
      avatarUrl: profile.avatarUrl ?? user.displayAvatarURL(),
      bannerColor: profile.accentColor ? `#${profile.accentColor.toString(16).padStart(6, '0')}` : undefined,
      bio: profile.bio ?? undefined,
      messageCount: profile.messageCount,
      voiceTime: formatDuration(profile.voiceTimeSeconds),
      level: rankData?.level,
      xp: rankData?.xp,
      rank: rankData?.rank,
      joinedAt: formatDate(profile.guildJoinedAt),
      roles: profile.rolesSnapshot.slice(0, 10),
      streak: currentStreak,
      tier: currentTier,
    });

    const attachment = new AttachmentBuilder(imageBuffer, { name: 'profile.png' });

    const container = new ContainerBuilder()
      .setAccentColor(COLORS_RAW.primary)
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder({ media: { url: 'attachment://profile.png' } })
        )
      )
      .addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setLabel('Profil complet').setURL(profileLink).setStyle(ButtonStyle.Link)
        )
      );

    await interaction.editReply({
      components: [container],
      files: [attachment],
      flags: MessageFlags.IsComponentsV2,
    });
    return;
  }

  // Detail mode (V2 text)
  const inviteText = snapshot.invite
    ? `${snapshot.invite.inviterTag ?? snapshot.invite.inviterId ?? 'Inconnu'} · Code: \`${snapshot.invite.inviteCode ?? '—'}\``
    : "Aucune donnée d'invitation";

  const roles = profile.rolesSnapshot.length > 0
    ? truncate(profile.rolesSnapshot.map(r => `\`${r}\``).join(' '), 900)
    : 'Aucun rôle enregistré';

  const dailyAlgoLines = snapshot.dailyAlgoParticipations.length > 0
    ? truncate(snapshot.dailyAlgoParticipations.slice(0, 5).map((entry) => {
      const date = entry.dateKey ?? formatDate(entry.submittedAt);
      const points = entry.totalPoints !== null ? `${entry.totalPoints.toFixed(1)} pts` : '—';
      return `${E.arrow} ${date} — ${entry.status} · ${points}\n  *${entry.problemTitle}*`;
    }).join('\n'), 900)
    : '*Aucune participation récente*';

  const eventHistory = snapshot.eventParticipations.length > 0
    ? truncate(snapshot.eventParticipations.slice(0, 5).map((entry) =>
      `${E.arrow} ${formatDate(entry.createdAt)} — ${formatEventType(entry.eventType)} · ${entry.eventTitle}`
    ).join('\n'), 900)
    : '*Aucun événement participé*';

  const container = new ContainerBuilder()
    .setAccentColor(COLORS_RAW.primary)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          text(`### ${E.profile} ${publicName}`)
        )
        .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: profile.avatarUrl ?? user.displayAvatarURL() } }))
    )
    .addTextDisplayComponents(text(profile.bio?.trim() || '*Aucune bio renseignée*'))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(text([
      `**${E.stats} Vue générale**`,
      `${E.dot} Discord: <@${profile.userId}>`,
      `${E.dot} Rôles: **${profile.rolesSnapshot.length}**`,
      `${E.dot} Badge: **${currentTier}**`,
    ].join('\n')))
    .addTextDisplayComponents(text([
      `**${E.xp} Activité**`,
      `${E.dot} Points: **${currentPoints.toFixed(1)}**`,
      `${E.dot} Messages: **${profile.messageCount.toLocaleString('fr-FR')}**`,
      `${E.dot} Vocal: **${formatDuration(profile.voiceTimeSeconds)}**`,
      `${E.dot} Streak Daily Algo: **${currentStreak}**`,
      `${E.dot} Classement: ${rankEmoji(currentRank ?? 0)}`,
    ].join('\n')))
    .addTextDisplayComponents(text([
      `**${E.calendar} Arrivée & invitation**`,
      `${E.dot} Serveur: **${formatDate(profile.guildJoinedAt)}**`,
      `${E.dot} Compte: **${formatDate(profile.accountCreatedAt)}**`,
      `${E.dot} Dernière activité: **${formatDate(profile.lastSeenAt)}**`,
      `${E.dot} ${inviteText}`,
    ].join('\n')))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(text(`**${E.shield} Rôles**\n${roles}`))
    .addTextDisplayComponents(text(`**${E.calendar} Événements**\n${eventHistory}`))
    .addTextDisplayComponents(text(`**${E.fire} Daily Algo**\n${dailyAlgoLines}`));

  if (profile.guildLeftAt) {
    container.addTextDisplayComponents(text(`${E.warning} Parti le **${formatDate(profile.guildLeftAt)}**`));
  }

  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setLabel('Voir le profil complet').setURL(profileLink).setStyle(ButtonStyle.Link)
      )
    );

  await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

export const profileCommand = { data, execute } satisfies SlashCommandDefinition;
