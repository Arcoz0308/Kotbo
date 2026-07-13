import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  type Client,
  type Guild,
  type GuildMember,
  type User,
} from 'discord.js';
import { Prisma, SanctionType, type MemberProfile } from '@prisma/client';
import prisma from '../../utils/db.js';
import { truncate } from '../../utils/embeds.js';
import { formatDurationFr, getSanctionTypeBreakdown, listSanctionsByMember, type ListedSanction } from './sanctionService.js';
import * as altAccountService from './altAccountService.js';
import { getCrossServerSanctionSummary, type CrossServerSanctionSummary } from './crossServerSanctionService.js';
import { generateMemberStatsImage } from '../core/imageService.js';

export type MemberCaseSection = 'resume' | 'sanctions' | 'identite' | 'activite';

export const MEMBER_CASE_PAGE_SIZE = 5;

export type MemberCasePanel = {
  embed: EmbedBuilder;
  components: Array<ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>>;
  section: MemberCaseSection;
  pageIndex: number;
  totalPages: number;
  files?: import('discord.js').AttachmentBuilder[];
};

type MemberCaseContext = {
  guild: Guild;
  user: User | null;
  member: GuildMember | null;
  profile: MemberProfile | null;
  banned: boolean;
  sanctions: ListedSanction[];
  sanctionsTotal: number;
  sanctionsBreakdown: Record<SanctionType, number>;
  crossServer: CrossServerSanctionSummary;
  pageIndex: number;
  totalPages: number;
};

type MemberProfileSnapshot = {
  guildId: string;
  userId: string;
  userTag?: string | null;
  username?: string | null;
  globalName?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  accentColor?: number | null;
  locale?: string | null;
  isBot?: boolean;
  accountCreatedAt?: Date | null;
  guildJoinedAt?: Date | null;
  guildLeftAt?: Date | null;
  lastSeenAt?: Date | null;
  lastMessageAt?: Date | null;
  lastMessageChannelId?: string | null;
  messageCountDelta?: number;
  voiceSessionCountDelta?: number;
  voiceTimeSecondsDelta?: number;
  voiceLastChannelId?: string | null;
  voiceLastJoinedAt?: Date | null;
  voiceLastLeftAt?: Date | null;
  rolesSnapshot?: string[];
};

function normalizeString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function buildUserLabel(userId: string, label?: string | null): string {
  return `${normalizeString(label) ?? `Utilisateur ${userId}`} (<@${userId}>)`;
}

async function upsertMemberProfile(snapshot: MemberProfileSnapshot): Promise<void> {
  const now = new Date();
  const nextRolesSnapshot = snapshot.rolesSnapshot ?? [];

  const updateData: Prisma.MemberProfileUpdateInput = {
    userTag: snapshot.userTag ?? undefined,
    username: snapshot.username ?? undefined,
    globalName: snapshot.globalName ?? undefined,
    displayName: snapshot.displayName ?? undefined,
    avatarUrl: snapshot.avatarUrl ?? undefined,
    bannerUrl: snapshot.bannerUrl ?? undefined,
    accentColor: snapshot.accentColor ?? undefined,
    locale: snapshot.locale ?? undefined,
    isBot: snapshot.isBot ?? undefined,
    accountCreatedAt: snapshot.accountCreatedAt ?? undefined,
    guildJoinedAt: snapshot.guildJoinedAt ?? undefined,
    guildLeftAt: snapshot.guildLeftAt ?? undefined,
    lastSeenAt: snapshot.lastSeenAt ?? now,
    lastMessageAt: snapshot.lastMessageAt ?? undefined,
    lastMessageChannelId: snapshot.lastMessageChannelId ?? undefined,
    voiceLastChannelId: snapshot.voiceLastChannelId ?? undefined,
    voiceLastJoinedAt: snapshot.voiceLastJoinedAt ?? undefined,
    voiceLastLeftAt: snapshot.voiceLastLeftAt ?? undefined,
    rolesSnapshot: nextRolesSnapshot,
  };

  if (snapshot.messageCountDelta && snapshot.messageCountDelta > 0) {
    updateData.messageCount = { increment: snapshot.messageCountDelta };
  }

  if (snapshot.voiceSessionCountDelta && snapshot.voiceSessionCountDelta > 0) {
    updateData.voiceSessionCount = { increment: snapshot.voiceSessionCountDelta };
  }

  if (snapshot.voiceTimeSecondsDelta && snapshot.voiceTimeSecondsDelta > 0) {
    updateData.voiceTimeSeconds = { increment: snapshot.voiceTimeSecondsDelta };
  }

  try {
    await prisma.memberProfile.upsert({
      where: {
        guildId_userId: {
          guildId: snapshot.guildId,
          userId: snapshot.userId,
        },
      },
      create: {
        guildId: snapshot.guildId,
        userId: snapshot.userId,
        userTag: snapshot.userTag ?? null,
        username: snapshot.username ?? null,
        globalName: snapshot.globalName ?? null,
        displayName: snapshot.displayName ?? null,
        avatarUrl: snapshot.avatarUrl ?? null,
        bannerUrl: snapshot.bannerUrl ?? null,
        accentColor: snapshot.accentColor ?? null,
        locale: snapshot.locale ?? null,
        isBot: snapshot.isBot ?? false,
        accountCreatedAt: snapshot.accountCreatedAt ?? null,
        guildJoinedAt: snapshot.guildJoinedAt ?? null,
        guildLeftAt: snapshot.guildLeftAt ?? null,
        lastSeenAt: snapshot.lastSeenAt ?? now,
        lastMessageAt: snapshot.lastMessageAt ?? null,
        lastMessageChannelId: snapshot.lastMessageChannelId ?? null,
        messageCount: snapshot.messageCountDelta && snapshot.messageCountDelta > 0 ? snapshot.messageCountDelta : 0,
        voiceSessionCount: snapshot.voiceSessionCountDelta && snapshot.voiceSessionCountDelta > 0 ? snapshot.voiceSessionCountDelta : 0,
        voiceTimeSeconds: snapshot.voiceTimeSecondsDelta && snapshot.voiceTimeSecondsDelta > 0 ? snapshot.voiceTimeSecondsDelta : 0,
        voiceLastChannelId: snapshot.voiceLastChannelId ?? null,
        voiceLastJoinedAt: snapshot.voiceLastJoinedAt ?? null,
        voiceLastLeftAt: snapshot.voiceLastLeftAt ?? null,
        rolesSnapshot: nextRolesSnapshot,
      },
      update: updateData,
    });
  } catch (err: unknown) {
    // Defensive: if DB schema is not in sync with Prisma (missing columns), avoid crashing the whole flow.
    // Log the error and continue. Migration should be applied to fix the root cause.
    try {
      const { logger } = await import('../../utils/logger.js');
      logger.error('MemberProfile', `Upsert failed for ${snapshot.guildId}/${snapshot.userId}: ${String(err)}`);
    } catch { /* ignored */ }
    return;
  }
}

async function fetchGuildUserContext(guild: Guild, userId: string, pageIndex = 0): Promise<MemberCaseContext> {
  const linkedUserIds = await altAccountService.getAllLinkedUserIds(guild.id, userId);

  const [user, member, profile, bans, sanctions] = await Promise.all([
    guild.client.users.fetch(userId, { force: true }).catch(() => guild.client.users.cache.get(userId) ?? null),
    guild.members.cache.get(userId) ?? guild.members.fetch(userId).catch(() => null),
    prisma.memberProfile.findUnique({
      where: {
        guildId_userId: {
          guildId: guild.id,
          userId,
        },
      },
    }),
    guild.bans.fetch(userId).catch(() => null),
    listSanctionsByMember({
      guildId: guild.id,
      targetUserId: userId,
      targetUserIds: linkedUserIds,
      page: pageIndex,
      pageSize: MEMBER_CASE_PAGE_SIZE,
    }),
  ]);

  const [sanctionsBreakdown, crossServer] = await Promise.all([
    getSanctionTypeBreakdown(guild.id, userId, linkedUserIds),
    getCrossServerSanctionSummary(guild.client, guild.id, linkedUserIds),
  ]);
  const totalPages = Math.max(1, Math.ceil(sanctions.total / MEMBER_CASE_PAGE_SIZE));
  const safePageIndex = Math.min(Math.max(0, pageIndex), totalPages - 1);
  const pageSanctions = safePageIndex === pageIndex
    ? sanctions.sanctions
    : (await listSanctionsByMember({
        guildId: guild.id,
        targetUserId: userId,
        targetUserIds: linkedUserIds,
        page: safePageIndex,
        pageSize: MEMBER_CASE_PAGE_SIZE,
      })).sanctions;

  return {
    guild,
    user,
    member,
    profile,
    banned: Boolean(bans),
    sanctions: pageSanctions,
    sanctionsTotal: sanctions.total,
    sanctionsBreakdown,
    crossServer,
    pageIndex: safePageIndex,
    totalPages,
  };
}

const CROSS_SERVER_TYPE_LABELS: Record<SanctionType, string> = {
  WARN: 'Warn',
  KICK: 'Kick',
  TIMEOUT: 'Timeout',
  TEMP_BAN: 'Tempban',
  BAN: 'Ban',
  SOFTBAN: 'Softban',
};

/**
 * Construit le texte du bloc "casier cross-serveur" affiché dans l'embed des sanctions.
 * Retourne null s'il n'y a rien de pertinent à montrer.
 */
function buildCrossServerFieldValue(crossServer: CrossServerSanctionSummary): string | null {
  if (!crossServer.enabled || crossServer.total === 0) return null;

  const lines = crossServer.recent.slice(0, 5).map((entry) => {
    const label = CROSS_SERVER_TYPE_LABELS[entry.type] ?? entry.type;
    const duration = entry.durationSeconds ? ` · ${formatDurationFr(entry.durationSeconds * 1000)}` : '';
    const when = `<t:${Math.floor(new Date(entry.createdAt).getTime() / 1000)}:R>`;
    const state = entry.status === 'ACTIVE' ? '🔴' : '⚪';
    const reason = entry.reason.trim() ? `\n┗ *${truncate(entry.reason.trim(), 90)}*` : '';
    return `${state} **${label}**${duration} · ${truncate(entry.guildName, 30)} · ${when}${reason}`;
  });

  const breakdown = Object.entries(crossServer.breakdown)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `${CROSS_SERVER_TYPE_LABELS[type as SanctionType]} ×${count}`)
    .join(' · ');

  const extra = crossServer.total > 5 ? `\n*… et ${crossServer.total - 5} autre(s)*` : '';
  const footer = breakdown ? `\n\`${breakdown}\`` : '';

  return `${lines.join('\n')}${extra}${footer}`;
}

function buildSectionSelectRow(userId: string, section: MemberCaseSection, pageIndex: number): ActionRowBuilder<StringSelectMenuBuilder> {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`case:section:${userId}:${pageIndex}`)
    .setPlaceholder('Choisir une vue du casier')
    .addOptions(
      { label: 'Résumé', value: 'resume', emoji: '🪪', default: section === 'resume' },
      { label: 'Sanctions', value: 'sanctions', emoji: '🧾', default: section === 'sanctions' },
      { label: 'Identité', value: 'identite', emoji: '👤', default: section === 'identite' },
      { label: 'Activité', value: 'activite', emoji: '📊', default: section === 'activite' },
    );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

function buildSanctionSelectRow(userId: string): ActionRowBuilder<StringSelectMenuBuilder> {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`case:sanction_action:${userId}`)
    .setPlaceholder("Sanctionner l'utilisateur")
    .addOptions(
      { label: 'Avertissement (Warn)', value: 'warn', emoji: '⚠️' },
      { label: 'Exclusion temporaire (Timeout)', value: 'timeout', emoji: '⏳' },
      { label: 'Expulsion (Kick)', value: 'kick', emoji: '👢' },
      { label: 'Bannissement (Ban)', value: 'ban', emoji: '🔨' },
    );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

function buildCaseNavigationRow(userId: string, section: MemberCaseSection, pageIndex: number, totalPages: number): ActionRowBuilder<ButtonBuilder> {
  const prevDisabled = section !== 'sanctions' || pageIndex <= 0 || totalPages <= 1;
  const nextDisabled = section !== 'sanctions' || pageIndex >= totalPages - 1 || totalPages <= 1;

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`case:prev:${userId}:${section}:${pageIndex}`)
      .setLabel('Précédent')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(prevDisabled),
    new ButtonBuilder()
      .setCustomId(`case:refresh:${userId}:${section}:${pageIndex}`)
      .setLabel('Actualiser')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`case:next:${userId}:${section}:${pageIndex}`)
      .setLabel('Suivant')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(nextDisabled),
    new ButtonBuilder()
      .setCustomId(`case:note:${userId}`)
      .setLabel('Note')
      .setEmoji('📝')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`case:close:${userId}`)
      .setLabel('Fermer')
      .setStyle(ButtonStyle.Danger),
  );
}

function buildCaseTargetRow(userId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`case:open:${userId}`)
      .setLabel('Voir le casier')
      .setEmoji('📁')
      .setStyle(ButtonStyle.Primary),
  );
}

const MODERATOR_PERMISSIONS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageMessages,
];

function getPermissionLabel(member: GuildMember | null): string {
  if (!member) return 'Inconnu';
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return 'Administrateur';
  if (MODERATOR_PERMISSIONS.some((perm) => member.permissions.has(perm))) return 'Modérateur';
  return 'Membre';
}

const USER_FLAG_EMOJIS: Record<string, string> = {
  Staff: '🛠️',
  Partner: '🎫',
  Hypesquad: '🎉',
  HypeSquadOnlineHouse1: '🦁',
  HypeSquadOnlineHouse2: '🧠',
  HypeSquadOnlineHouse3: '⚖️',
  BugHunterLevel1: '🐛',
  BugHunterLevel2: '🐞',
  PremiumEarlySupporter: '🌟',
  VerifiedDeveloper: '👨‍💻',
  CertifiedModerator: '🛡️',
  VerifiedBot: '✅',
  ActiveDeveloper: '💻',
};

function getFlagsDisplay(user: User | null, isBot: boolean): string {
  const emojis: string[] = [];
  for (const flag of user?.flags?.toArray() ?? []) {
    const emoji = USER_FLAG_EMOJIS[flag];
    if (emoji && !emojis.includes(emoji)) emojis.push(emoji);
  }
  if (isBot) emojis.push('🤖');
  return emojis.length > 0 ? emojis.join(' ') : 'Aucun';
}

function getRolesDisplay(member: GuildMember | null): { count: number; text: string } {
  if (!member) return { count: 0, text: '*Membre non présent sur le serveur.*' };

  const roles = [...member.roles.cache.values()]
    .filter((role) => role.id !== member.guild.id)
    .sort((a, b) => b.position - a.position);

  if (roles.length === 0) return { count: 0, text: 'Aucun' };

  const mentions: string[] = [];
  let length = 0;
  for (const role of roles) {
    const mention = `<@&${role.id}>`;
    if (length + mention.length + 1 > 1000) break;
    mentions.push(mention);
    length += mention.length + 1;
  }

  const hidden = roles.length - mentions.length;
  return { count: roles.length, text: mentions.join(' ') + (hidden > 0 ? ` *+${hidden} autre${hidden > 1 ? 's' : ''}*` : '') };
}

function buildSummaryEmbed(context: MemberCaseContext): EmbedBuilder {
  const profile = context.profile;
  const user = context.user;
  const member = context.member;

  const userId = user?.id ?? profile?.userId ?? member?.id ?? 'inconnu';
  const username = user?.username ?? profile?.username ?? member?.user.username ?? 'inconnu';
  const globalName = user?.globalName ?? profile?.globalName ?? member?.user.globalName ?? username;
  const displayName = member?.displayName ?? profile?.displayName ?? globalName;

  const accountCreatedAt = user?.createdTimestamp
    ? `<t:${Math.floor(user.createdTimestamp / 1000)}:d> (<t:${Math.floor(user.createdTimestamp / 1000)}:R>)`
    : profile?.accountCreatedAt
      ? `<t:${Math.floor(profile.accountCreatedAt.getTime() / 1000)}:d> (<t:${Math.floor(profile.accountCreatedAt.getTime() / 1000)}:R>)`
      : 'Inconnue';

  const joinedAt = member?.joinedTimestamp
    ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:d> (<t:${Math.floor(member.joinedTimestamp / 1000)}:R>)`
    : profile?.guildJoinedAt
      ? `<t:${Math.floor(profile.guildJoinedAt.getTime() / 1000)}:d> (<t:${Math.floor(profile.guildJoinedAt.getTime() / 1000)}:R>)`
      : 'Inconnue';

  const leftAt = profile?.guildLeftAt
    ? `<t:${Math.floor(profile.guildLeftAt.getTime() / 1000)}:d> (<t:${Math.floor(profile.guildLeftAt.getTime() / 1000)}:R>)`
    : 'Inconnue';

  const statusLabel = member
    ? '✅ Membre du serveur'
    : context.banned
      ? '🔨 Banni du serveur'
      : '❌ Ancien membre';

  const msgCount = profile?.messageCount ?? 0;
  const lastMsg = profile?.lastMessageAt ? `<t:${Math.floor(profile.lastMessageAt.getTime() / 1000)}:R>` : 'Aucun';
  const voiceTime = formatDurationFr((profile?.voiceTimeSeconds ?? 0) * 1000);
  const lastVoice = profile?.voiceLastChannelId ? `<#${profile.voiceLastChannelId}>` : 'Aucun';

  const recentSanctions = context.sanctions.length > 0
    ? context.sanctions.slice(0, 3).map((s, i) => `**${i + 1}. ${s.type}** · ${truncate(s.reason, 60)} · <t:${Math.floor(s.createdAt.getTime() / 1000)}:R>`).join('\n')
    : '*Aucune sanction enregistrée pour ce membre.*';

  const roles = getRolesDisplay(member);
  const bannerUrl = user?.bannerURL({ size: 1024 }) ?? profile?.bannerUrl ?? null;

  const embed = new EmbedBuilder()
  const crossServerLine = context.crossServer.enabled && context.crossServer.total > 0
    ? `\n🌐 **Autres serveurs :** ${context.crossServer.total} sanction${context.crossServer.total > 1 ? 's' : ''} sur ${context.crossServer.serverCount} serveur${context.crossServer.serverCount > 1 ? 's' : ''}`
    : '';

  const description = `🌐 <@${userId}> (\`${username}\`)
${statusLabel}
────────────────────────

**Création du compte** ${accountCreatedAt}
**Membre depuis** ${joinedAt}${!member && !context.banned ? `\n**Dernier départ** ${leftAt}` : ''}${rolesText}
────────────────────────

📊 **Activité globale**
💬 **Messages :** ${msgCount} *(Dernier : ${lastMsg})*
🎙️ **Vocal :** ${voiceTime} *(Dernier : ${lastVoice})*
────────────────────────

✏️ **Note**${noteDisplay}
────────────────────────

🚨 **Dernières sanctions (${context.sanctions.length}/${context.sanctionsTotal})**
${recentSanctions}${crossServerLine}
────────────────────────

\`ID\` \`${userId}\``;

  return new EmbedBuilder()
    .setColor(context.banned ? 0xd62828 : member ? 0x2a9d8f : 0x5865f2)
    .setAuthor({
      name: `🧑‍⚖️ ${globalName}`,
      iconURL: user?.displayAvatarURL() ?? undefined,
    })
    .setThumbnail(user?.displayAvatarURL({ size: 256 }) ?? null)
    .setDescription(`🌐 <@${userId}> (\`${username}\`)\n${statusLabel}`)
    .addFields(
      { name: 'Création du compte', value: accountCreatedAt, inline: false },
      { name: 'Membre depuis', value: joinedAt, inline: false },
    );

  if (!member && !context.banned) {
    embed.addFields({ name: 'Dernier départ', value: leftAt, inline: false });
  }

  embed.addFields({ name: 'Pseudo', value: `\`${displayName}\``, inline: false });

  if (member?.premiumSinceTimestamp) {
    const boostTs = Math.floor(member.premiumSinceTimestamp / 1000);
    embed.addFields({ name: 'Boost depuis', value: `<t:${boostTs}:d> (<t:${boostTs}:R>)`, inline: false });
  }

  embed.addFields(
    { name: `Rôles (${roles.count})`, value: roles.text, inline: false },
    { name: 'Permissions', value: `\`${getPermissionLabel(member)}\``, inline: false },
    { name: 'Flags', value: getFlagsDisplay(user, profile?.isBot ?? user?.bot ?? false), inline: false },
    { name: '📊 Activité globale', value: `💬 **Messages :** ${msgCount} *(Dernier : ${lastMsg})*\n🎙️ **Vocal :** ${voiceTime} *(Dernier : ${lastVoice})*`, inline: false },
    { name: '✏️ Note', value: profile?.moderatorNote ? `> ${profile.moderatorNote.replace(/\n/g, '\n> ')}` : '*Aucune note.*', inline: false },
    { name: `🚨 Dernières sanctions (${context.sanctions.length}/${context.sanctionsTotal})`, value: recentSanctions, inline: false },
    { name: 'ID', value: `\`${userId}\``, inline: false },
  );

  if (bannerUrl) embed.setImage(bannerUrl);

  return embed;
}

function buildIdentityEmbed(context: MemberCaseContext): EmbedBuilder {
  const profile = context.profile;
  const user = context.user;
  const userId = user?.id ?? profile?.userId ?? context.member?.id ?? 'inconnu';
  const userTag = user?.tag ?? profile?.userTag ?? context.member?.user.tag ?? `Utilisateur ${userId}`;
  const globalName = user?.globalName ?? profile?.globalName ?? 'Inconnu';
  const username = user?.username ?? profile?.username ?? 'Inconnu';
  const locale = profile?.locale ?? (user as { locale?: string | null } | null)?.locale ?? 'Inconnue';
  const accentColor = profile?.accentColor != null
    ? `#${profile.accentColor.toString(16).padStart(6, '0')}`
    : 'Inconnue';
  const avatarUrl = profile?.avatarUrl ?? user?.displayAvatarURL({ size: 512 });
  const bannerUrl = profile?.bannerUrl ?? null;

  return new EmbedBuilder()
    .setColor(0x8ecae6)
    .setTitle('👤 Identité du compte')
    .setDescription(buildUserLabel(userId, userTag))
    .addFields(
      { name: 'ID Discord', value: userId, inline: true },
      { name: "Nom d'utilisateur", value: username, inline: true },
      { name: 'Nom global', value: globalName, inline: true },
      { name: 'Locale', value: locale, inline: true },
      { name: 'Compte bot', value: profile?.isBot ? 'Oui' : user?.bot ? 'Oui' : 'Non', inline: true },
      { name: "Couleur d'accent", value: accentColor, inline: true },
      { name: 'Avatar', value: avatarUrl ?? 'Inconnu', inline: false },
      { name: 'Bannière', value: bannerUrl ?? 'Aucune', inline: false },
    )
    .setTimestamp();
}

function buildActivityEmbed(context: MemberCaseContext): EmbedBuilder {
  const profile = context.profile;
  const lastVoice = profile?.voiceLastChannelId ? `<#${profile.voiceLastChannelId}>` : 'Aucun';
  const lastVoiceJoin = profile?.voiceLastJoinedAt
    ? `<t:${Math.floor(profile.voiceLastJoinedAt.getTime() / 1000)}:F> (<t:${Math.floor(profile.voiceLastJoinedAt.getTime() / 1000)}:R>)`
    : 'Inconnu';
  const lastVoiceLeave = profile?.voiceLastLeftAt
    ? `<t:${Math.floor(profile.voiceLastLeftAt.getTime() / 1000)}:F> (<t:${Math.floor(profile.voiceLastLeftAt.getTime() / 1000)}:R>)`
    : 'Inconnu';
  const rolesSnapshot = profile?.rolesSnapshot ?? [];
  const rolesPreview = rolesSnapshot.length > 0
    ? rolesSnapshot.slice(0, 12).map((roleId) => `<@&${roleId}>`).join(', ')
    : 'Aucun';

  return new EmbedBuilder()
    .setColor(0xffb703)
    .setTitle('📊 Activité serveur')
    .setDescription(buildUserLabel(context.user?.id ?? profile?.userId ?? context.member?.id ?? 'inconnu', context.user?.tag ?? profile?.userTag ?? context.member?.user.tag ?? null))
    .addFields(
      { name: 'Messages observés', value: `${profile?.messageCount ?? 0}`, inline: true },
      { name: 'Dernier message', value: profile?.lastMessageAt ? `<t:${Math.floor(profile.lastMessageAt.getTime() / 1000)}:R>` : 'Aucun', inline: true },
      { name: 'Dernier salon message', value: profile?.lastMessageChannelId ? `<#${profile.lastMessageChannelId}>` : 'Aucun', inline: true },
      { name: 'Sessions vocales', value: `${profile?.voiceSessionCount ?? 0}`, inline: true },
      { name: 'Temps vocal total', value: formatDurationFr((profile?.voiceTimeSeconds ?? 0) * 1000), inline: true },
      { name: 'Dernier salon vocal', value: lastVoice, inline: true },
      { name: 'Début dernière session vocale', value: lastVoiceJoin, inline: true },
      { name: 'Fin dernière session vocale', value: lastVoiceLeave, inline: true },
      { name: 'Rôles mémorisés', value: rolesPreview, inline: false },
    )
    .setTimestamp();
}

function buildSanctionsEmbed(context: MemberCaseContext): EmbedBuilder {
  const total = context.sanctionsTotal;
  const sanctions = context.sanctions;
  const summary = sanctions.length > 0
    ? sanctions.map((sanction, index) => {
        const reason = truncate(sanction.reason, 140);
        const moderator = sanction.moderatorTag ?? `<@${sanction.moderatorUserId}>`;
        const duration = sanction.durationSeconds ? ` · ${formatDurationFr(sanction.durationSeconds * 1000)}` : '';
        return `**${index + 1}. ${sanction.type}** (${sanction.status})${duration}\nMotif: ${reason}\nModération: ${moderator} · <t:${Math.floor(sanction.createdAt.getTime() / 1000)}:R>`;
      }).join('\n\n')
    : 'Aucune sanction sur cette page.';

  const warningCount = context.sanctionsBreakdown.WARN ?? 0;
  const timeoutCount = context.sanctionsBreakdown.TIMEOUT ?? 0;
  const kickCount = context.sanctionsBreakdown.KICK ?? 0;
  const tempBanCount = context.sanctionsBreakdown.TEMP_BAN ?? 0;
  const banCount = context.sanctionsBreakdown.BAN ?? 0;

  const embed = new EmbedBuilder()
    .setColor(0xef476f)
    .setTitle('🧾 Casier disciplinaire')
    .setDescription(summary)
    .addFields(
      { name: 'Total', value: `${total}`, inline: true },
      { name: 'Warn', value: `${warningCount}`, inline: true },
      { name: 'Timeout', value: `${timeoutCount}`, inline: true },
      { name: 'Kick', value: `${kickCount}`, inline: true },
      { name: 'Tempban', value: `${tempBanCount}`, inline: true },
      { name: 'Ban', value: `${banCount}`, inline: true },
    )
    .setFooter({ text: `Page ${context.pageIndex + 1} / ${context.totalPages}` })
    .setTimestamp();

  const crossServerValue = buildCrossServerFieldValue(context.crossServer);
  if (crossServerValue) {
    embed.addFields({
      name: `🌐 Autres serveurs (${context.crossServer.total} · ${context.crossServer.serverCount} serveur${context.crossServer.serverCount > 1 ? 's' : ''})`,
      value: truncate(crossServerValue, 1024),
      inline: false,
    });
  }

  return embed;
}

export async function touchMemberProfileFromMember(member: GuildMember): Promise<void> {
  await upsertMemberProfile({
    guildId: member.guild.id,
    userId: member.id,
    userTag: member.user.tag,
    username: member.user.username,
    globalName: member.user.globalName,
    displayName: member.displayName,
    avatarUrl: member.user.displayAvatarURL({ size: 256 }),
    bannerUrl: null,
    accentColor: member.user.accentColor,
    locale: null,
    isBot: member.user.bot,
    accountCreatedAt: member.user.createdAt,
    guildJoinedAt: member.joinedAt ?? null,
    guildLeftAt: null,
    lastSeenAt: new Date(),
    rolesSnapshot: [...member.roles.cache.keys()].filter((roleId) => roleId !== member.guild.id),
  });
}

export async function touchMemberProfileFromUser(guildId: string, user: User, extra?: Partial<MemberProfileSnapshot>): Promise<void> {
  await upsertMemberProfile({
    guildId,
    userId: user.id,
    userTag: user.tag,
    username: user.username,
    globalName: user.globalName,
    displayName: extra?.displayName ?? user.globalName ?? user.username,
    avatarUrl: user.displayAvatarURL({ size: 256 }),
    bannerUrl: null,
    accentColor: user.accentColor,
    locale: extra?.locale ?? null,
    isBot: user.bot,
    accountCreatedAt: user.createdAt,
    guildJoinedAt: extra?.guildJoinedAt ?? null,
    guildLeftAt: extra?.guildLeftAt ?? null,
    lastSeenAt: extra?.lastSeenAt ?? new Date(),
    lastMessageAt: extra?.lastMessageAt ?? null,
    lastMessageChannelId: extra?.lastMessageChannelId ?? null,
    rolesSnapshot: extra?.rolesSnapshot ?? [],
  });
}

const lastProfileTouch = new Map<string, number>();
const profileMessageCountBuffer = new Map<string, number>();

async function flushProfileMessageCounts(): Promise<void> {
  const entries = [...profileMessageCountBuffer.entries()];
  if (entries.length === 0) return;

  for (const [key, delta] of entries) {
    const [guildId, userId] = key.split(':');
    if (!guildId || !userId) continue;

    profileMessageCountBuffer.delete(key);
    lastProfileTouch.set(key, Date.now());

    await prisma.memberProfile.update({
      where: { guildId_userId: { guildId, userId } },
      data: {
        messageCount: { increment: delta },
        lastSeenAt: new Date(),
      }
    }).catch(() => {
      // Ignorer si le profil n'existe pas en base encore
    });
  }
}

setInterval(() => { void flushProfileMessageCounts(); }, 60_000);

process.on('beforeExit', () => {
  void flushProfileMessageCounts();
});

export async function touchMemberMessageActivity(params: {
  guildId: string;
  user: User;
  channelId: string;
  displayName?: string | null;
}): Promise<void> {
  const key = `${params.guildId}:${params.user.id}`;
  const now = Date.now();
  const lastTouch = lastProfileTouch.get(key) ?? 0;

  profileMessageCountBuffer.set(key, (profileMessageCountBuffer.get(key) ?? 0) + 1);

  if (now - lastTouch < 30_000) {
    return;
  }

  lastProfileTouch.set(key, now);
  const delta = profileMessageCountBuffer.get(key) ?? 1;
  profileMessageCountBuffer.delete(key);

  await upsertMemberProfile({
    guildId: params.guildId,
    userId: params.user.id,
    userTag: params.user.tag,
    username: params.user.username,
    globalName: params.user.globalName,
    displayName: params.displayName ?? params.user.globalName ?? params.user.username,
    avatarUrl: params.user.displayAvatarURL({ size: 256 }),
    accentColor: params.user.accentColor,
    isBot: params.user.bot,
    accountCreatedAt: params.user.createdAt,
    lastSeenAt: new Date(),
    lastMessageAt: new Date(),
    lastMessageChannelId: params.channelId,
    messageCountDelta: delta,
  });
}

export async function touchMemberVoiceJoin(params: {
  guildId: string;
  user: User;
  channelId: string;
  displayName?: string | null;
  joinedAt?: Date | null;
}): Promise<void> {
  await upsertMemberProfile({
    guildId: params.guildId,
    userId: params.user.id,
    userTag: params.user.tag,
    username: params.user.username,
    globalName: params.user.globalName,
    displayName: params.displayName ?? params.user.globalName ?? params.user.username,
    avatarUrl: params.user.displayAvatarURL({ size: 256 }),
    accentColor: params.user.accentColor,
    isBot: params.user.bot,
    accountCreatedAt: params.user.createdAt,
    lastSeenAt: new Date(),
    voiceSessionCountDelta: 1,
    voiceLastChannelId: params.channelId,
    voiceLastJoinedAt: params.joinedAt ?? new Date(),
    voiceLastLeftAt: null,
  });
}

export async function touchMemberVoiceLeave(params: {
  guildId: string;
  user: User;
  channelId: string;
  displayName?: string | null;
  joinedAt?: Date | null;
  durationSeconds?: number | null;
}): Promise<void> {
  await upsertMemberProfile({
    guildId: params.guildId,
    userId: params.user.id,
    userTag: params.user.tag,
    username: params.user.username,
    globalName: params.user.globalName,
    displayName: params.displayName ?? params.user.globalName ?? params.user.username,
    avatarUrl: params.user.displayAvatarURL({ size: 256 }),
    accentColor: params.user.accentColor,
    isBot: params.user.bot,
    accountCreatedAt: params.user.createdAt,
    lastSeenAt: new Date(),
    voiceLastChannelId: params.channelId,
    voiceLastJoinedAt: params.joinedAt ?? undefined,
    voiceLastLeftAt: new Date(),
    voiceTimeSecondsDelta: params.durationSeconds && params.durationSeconds > 0 ? params.durationSeconds : 0,
  });
}

export async function touchMemberJoin(member: GuildMember): Promise<void> {
  await touchMemberProfileFromMember(member);
}

export async function touchMemberLeave(params: {
  guildId: string;
  user: User;
  displayName?: string | null;
  guildJoinedAt?: Date | null;
}): Promise<void> {
  await upsertMemberProfile({
    guildId: params.guildId,
    userId: params.user.id,
    userTag: params.user.tag,
    username: params.user.username,
    globalName: params.user.globalName,
    displayName: params.displayName ?? params.user.globalName ?? params.user.username,
    avatarUrl: params.user.displayAvatarURL({ size: 256 }),
    accentColor: params.user.accentColor,
    isBot: params.user.bot,
    accountCreatedAt: params.user.createdAt,
    guildJoinedAt: params.guildJoinedAt ?? undefined,
    guildLeftAt: new Date(),
    lastSeenAt: new Date(),
  });
}

export async function touchSanctionTargetIdentity(params: {
  guildId: string;
  userId: string;
  userTag?: string | null;
}): Promise<void> {
  await upsertMemberProfile({
    guildId: params.guildId,
    userId: params.userId,
    userTag: params.userTag ?? null,
    lastSeenAt: new Date(),
  });
}

export async function buildMemberCasePanel(
  guild: Guild,
  userId: string,
  section: MemberCaseSection = 'resume',
  pageIndex = 0,
): Promise<MemberCasePanel> {
  const contextPageIndex = section === 'sanctions' ? pageIndex : 0;
  const context = await fetchGuildUserContext(guild, userId, contextPageIndex);

  let embed: EmbedBuilder;
  let files: import('discord.js').AttachmentBuilder[] | undefined;

  if (section === 'sanctions') {
    embed = buildSanctionsEmbed(context);
  } else if (section === 'identite') {
    embed = buildIdentityEmbed(context);
  } else if (section === 'activite') {
    embed = buildActivityEmbed(context);

    try {
      const periodDays = 14;
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - periodDays);
      const startDateKey = `${sinceDate.getFullYear()}-${String(sinceDate.getMonth() + 1).padStart(2, '0')}-${String(sinceDate.getDate()).padStart(2, '0')}`;

      const dailyStats = await prisma.memberDailyStat.findMany({
        where: { guildId: guild.id, userId, dateKey: { gte: startDateKey } },
        orderBy: { dateKey: 'asc' },
      });

      const activeDays = dailyStats.length;
      let totalMessages = 0;
      let totalVoice = 0;
      let peakDayMessages = 0;

      const dailyData = dailyStats.map(stat => {
        totalMessages += stat.messagesCount;
        totalVoice += stat.voiceMinutes;
        if (stat.messagesCount > peakDayMessages) peakDayMessages = stat.messagesCount;
        return {
          date: stat.dateKey,
          messages: stat.messagesCount,
          voice: stat.voiceMinutes,
        };
      });

      const username = context.user?.username ?? context.profile?.username ?? context.member?.user.username ?? 'inconnu';

      const imageBuffer = await generateMemberStatsImage(
        username,
        periodDays,
        { totalMessages, totalVoice, activeDays, peakDayMessages },
        dailyData
      );

      const attachment = new AttachmentBuilder(imageBuffer, { name: 'activity_stats.png' });
      embed.setImage('attachment://activity_stats.png');
      files = [attachment];
    } catch (error) {
      import('../../utils/logger.js').then(({ logger }) => {
        logger.error('Casier', `Erreur de génération du graphique d'activité: ${String(error)}`);
      });
    }
  } else {
    embed = buildSummaryEmbed(context);
  }

  const components: Array<ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>> = [
    buildSectionSelectRow(userId, section, context.pageIndex),
    buildCaseNavigationRow(userId, section, context.pageIndex, context.totalPages),
    buildSanctionSelectRow(userId),
  ];

  return {
    embed,
    components,
    section,
    pageIndex: context.pageIndex,
    totalPages: context.totalPages,
    files,
  };
}

export function buildMemberCaseActionRow(userId: string): ActionRowBuilder<ButtonBuilder> {
  return buildCaseTargetRow(userId);
}

export async function getMemberCaseFooterLabel(guild: Guild, userId: string): Promise<string> {
  const profile = await prisma.memberProfile.findUnique({
    where: {
      guildId_userId: {
        guildId: guild.id,
        userId,
      },
    },
  });

  return profile?.userTag ?? `Utilisateur ${userId}`;
}
