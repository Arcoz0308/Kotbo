import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type Client,
  type Guild,
  type GuildMember,
  type User,
} from 'discord.js';
import { Prisma, SanctionType, type MemberProfile } from '@prisma/client';
import prisma from '../utils/db.js';
import { truncate } from '../utils/embeds.js';
import { formatDurationFr, getSanctionTypeBreakdown, listSanctionsByMember, type ListedSanction } from './sanctionService.js';

export type MemberCaseSection = 'resume' | 'sanctions' | 'identite' | 'activite';

export const MEMBER_CASE_PAGE_SIZE = 5;

export type MemberCasePanel = {
  embed: EmbedBuilder;
  components: Array<ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>>;
  section: MemberCaseSection;
  pageIndex: number;
  totalPages: number;
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
}

async function fetchGuildUserContext(guild: Guild, userId: string, pageIndex = 0): Promise<MemberCaseContext> {
  const [user, member, profile, bans, sanctions] = await Promise.all([
    guild.client.users.fetch(userId).catch(() => null),
    guild.members.fetch(userId).catch(() => null),
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
      page: pageIndex,
      pageSize: MEMBER_CASE_PAGE_SIZE,
    }),
  ]);

  const sanctionsBreakdown = await getSanctionTypeBreakdown(guild.id, userId);
  const totalPages = Math.max(1, Math.ceil(sanctions.total / MEMBER_CASE_PAGE_SIZE));
  const safePageIndex = Math.min(Math.max(0, pageIndex), totalPages - 1);
  const pageSanctions = safePageIndex === pageIndex
    ? sanctions.sanctions
    : (await listSanctionsByMember({
        guildId: guild.id,
        targetUserId: userId,
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
    pageIndex: safePageIndex,
    totalPages,
  };
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

function buildSummaryEmbed(context: MemberCaseContext): EmbedBuilder {
  const profile = context.profile;
  const userLabel = buildUserLabel(context.user?.id ?? profile?.userId ?? context.member?.id ?? 'inconnu', context.user?.tag ?? profile?.userTag ?? context.member?.user.tag ?? null);
  const accountCreatedAt = context.user?.createdTimestamp
    ? `<t:${Math.floor(context.user.createdTimestamp / 1000)}:F> (<t:${Math.floor(context.user.createdTimestamp / 1000)}:R>)`
    : profile?.accountCreatedAt
      ? `<t:${Math.floor(profile.accountCreatedAt.getTime() / 1000)}:F> (<t:${Math.floor(profile.accountCreatedAt.getTime() / 1000)}:R>)`
      : 'Inconnu';

  const joinedAt = context.member?.joinedTimestamp
    ? `<t:${Math.floor(context.member.joinedTimestamp / 1000)}:F> (<t:${Math.floor(context.member.joinedTimestamp / 1000)}:R>)`
    : profile?.guildJoinedAt
      ? `<t:${Math.floor(profile.guildJoinedAt.getTime() / 1000)}:F> (<t:${Math.floor(profile.guildJoinedAt.getTime() / 1000)}:R>)`
      : 'Inconnu';

  const leftAt = profile?.guildLeftAt
    ? `<t:${Math.floor(profile.guildLeftAt.getTime() / 1000)}:F> (<t:${Math.floor(profile.guildLeftAt.getTime() / 1000)}:R>)`
    : context.banned
      ? 'Banni du serveur'
      : 'Toujours présent / non renseigné';

  const statusLabel = context.member
    ? 'Présent sur le serveur'
    : context.banned
      ? 'Banni du serveur'
      : 'Hors serveur';

  const recentSanctions = context.sanctions.length > 0
    ? context.sanctions.slice(0, 3).map((sanction, index) => {
        const reason = truncate(sanction.reason, 120);
        return `${index + 1}. ${sanction.type} · ${reason} · <t:${Math.floor(sanction.createdAt.getTime() / 1000)}:R>`;
      }).join('\n')
    : 'Aucune sanction enregistrée.';

  return new EmbedBuilder()
    .setColor(context.banned ? 0xd62828 : context.member ? 0x2a9d8f : 0x5865f2)
    .setTitle('📁 Casier utilisateur')
    .setDescription(userLabel)
    .addFields(
      { name: 'Statut', value: statusLabel, inline: true },
      { name: 'Compte créé', value: accountCreatedAt, inline: true },
      { name: 'Entrée serveur', value: joinedAt, inline: true },
      { name: 'Dernière sortie', value: leftAt, inline: true },
      { name: 'Messages observés', value: `${profile?.messageCount ?? 0}`, inline: true },
      { name: 'Temps vocal total', value: formatDurationFr((profile?.voiceTimeSeconds ?? 0) * 1000), inline: true },
      { name: 'Dernier pseudo connu', value: profile?.displayName ?? context.member?.displayName ?? context.user?.username ?? 'Inconnu', inline: false },
      { name: 'Dernier salon vocal', value: profile?.voiceLastChannelId ? `<#${profile.voiceLastChannelId}>` : 'Aucun', inline: true },
      { name: 'Dernier message', value: profile?.lastMessageAt ? `<t:${Math.floor(profile.lastMessageAt.getTime() / 1000)}:R>` : 'Aucun', inline: true },
      { name: 'Sanctions récentes', value: recentSanctions, inline: false },
    )
    .setFooter({ text: `Serveur ${context.guild.name} · ${context.sanctionsTotal} sanction(s)` })
    .setTimestamp();
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
      { name: 'Nom d’utilisateur', value: username, inline: true },
      { name: 'Nom global', value: globalName, inline: true },
      { name: 'Locale', value: locale, inline: true },
      { name: 'Compte bot', value: profile?.isBot ? 'Oui' : user?.bot ? 'Oui' : 'Non', inline: true },
      { name: 'Couleur d’accent', value: accentColor, inline: true },
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

  return new EmbedBuilder()
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

export async function touchMemberMessageActivity(params: {
  guildId: string;
  user: User;
  channelId: string;
  displayName?: string | null;
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
    lastMessageAt: new Date(),
    lastMessageChannelId: params.channelId,
    messageCountDelta: 1,
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

  const embed = section === 'sanctions'
    ? buildSanctionsEmbed(context)
    : section === 'identite'
      ? buildIdentityEmbed(context)
      : section === 'activite'
        ? buildActivityEmbed(context)
        : buildSummaryEmbed(context);

  const components: Array<ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>> = [
    buildSectionSelectRow(userId, section, context.pageIndex),
    buildCaseNavigationRow(userId, section, context.pageIndex, context.totalPages),
  ];

  return {
    embed,
    components,
    section,
    pageIndex: context.pageIndex,
    totalPages: context.totalPages,
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
