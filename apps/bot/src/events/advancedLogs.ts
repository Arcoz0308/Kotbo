import {
  AuditLogEvent,
  ActionRowBuilder,
  ButtonBuilder,
  EmbedBuilder,
  Events,
  Guild,
  type Client,
  type GuildBasedChannel,
  type GuildAuditLogsEntry,
  type GuildMember,
  type Message,
  type PartialMessage,
  type Role,
  type VoiceState,
} from 'discord.js';
import prisma from '../utils/db.js';
import { logger } from '../utils/logger.js';
import {
  buildMemberCaseActionRow,
  touchMemberJoin,
  touchMemberLeave,
  touchMemberMessageActivity,
  touchMemberProfileFromMember,
  touchMemberVoiceJoin,
  touchMemberVoiceLeave,
  touchSanctionTargetIdentity,
} from '../services/memberCaseService.js';

type MessageSnapshot = {
  guildId: string;
  channelId: string;
  authorId: string;
  authorTag: string;
  content: string;
  attachments: string[];
  createdAt: number;
};

type VoiceSession = {
  joinedAt: number;
  channelId: string;
};

type CachedLogChannel = {
  channelId: string | null;
  expiresAt: number;
};

type InviteSnapshot = {
  code: string;
  uses: number;
  inviterId: string | null;
  inviterTag: string | null;
};

type MemberInviteUsage = {
  code: string;
  inviterId: string | null;
  inviterTag: string | null;
  joinedAt: number;
};

const messageSnapshotStore = new Map<string, MessageSnapshot>();
const voiceSessionStore = new Map<string, VoiceSession>();
const logChannelCache = new Map<string, CachedLogChannel>();
const inviteUsageCache = new Map<string, Map<string, InviteSnapshot>>();
const memberInviteUsageCache = new Map<string, MemberInviteUsage>();

const LOG_CHANNEL_CACHE_TTL_MS = 60_000;
const MESSAGE_SNAPSHOT_TTL_MS = 4 * 60 * 60 * 1000;
const MESSAGE_SNAPSHOT_MAX_SIZE = 3_000;
const AUDIT_LOOKBACK_MS = 12_000;
const MAX_BULK_AUTHOR_PREVIEW = 8;

function truncate(value: string, max = 1000): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function stripLeadingEmoji(value: string): string {
  return value.replace(/^[^\p{L}\p{N}]+/u, '').trim();
}

function embedSummary(embed: EmbedBuilder): { action: string; details: string } {
  const payload = embed.toJSON();
  const rawTitle = payload.title?.trim() || 'Événement Discord';
  const action = stripLeadingEmoji(rawTitle) || rawTitle;
  const description = payload.description?.trim() || '';
  const fieldPreview = (payload.fields ?? [])
    .slice(0, 4)
    .map((field) => {
      const fieldName = field.name.trim().toLowerCase();
      if (fieldName.startsWith('membre')) return `${field.value}`;
      return `${field.name}: ${field.value}`;
    })
    .join(' | ');

  const details = truncate([description, fieldPreview].filter(Boolean).join(' | '), 900) || 'Aucun détail.';
  return { action, details };
}

function formatUser(id: string, tag: string): string {
  return `${tag} (<@${id}>)`;
}

function parseTimestamp(value: string | number | Date | null): number | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
}

function safeTag(member: { user?: { tag?: string; username?: string } } | null, id: string): string {
  return member?.user?.tag ?? member?.user?.username ?? `Utilisateur ${id}`;
}

function formatDurationUntil(untilTimestamp: number | null): string {
  if (!untilTimestamp) return 'Aucune durée';
  return `<t:${Math.floor(untilTimestamp / 1000)}:F> (<t:${Math.floor(untilTimestamp / 1000)}:R>)`;
}

function formatChannelName(channel: GuildBasedChannel): string {
  return `<#${channel.id}> (${channel.name})`;
}

function isGuildNamedChannel(channel: unknown): channel is GuildBasedChannel {
  if (!channel || typeof channel !== 'object') return false;
  const candidate = channel as { guild?: unknown; name?: unknown };
  return !!candidate.guild && typeof candidate.name === 'string';
}

function isFullGuild(guild: unknown): guild is Guild {
  return guild instanceof Guild;
}

function voiceSessionKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function memberInviteKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function formatDurationMs(value: number): string {
  const totalSeconds = Math.max(0, Math.floor(value / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function cleanupMessageSnapshots(): void {
  const now = Date.now();

  for (const [messageId, snapshot] of messageSnapshotStore.entries()) {
    if (now - snapshot.createdAt > MESSAGE_SNAPSHOT_TTL_MS) {
      messageSnapshotStore.delete(messageId);
    }
  }

  if (messageSnapshotStore.size <= MESSAGE_SNAPSHOT_MAX_SIZE) return;

  const entries = [...messageSnapshotStore.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
  const overflow = messageSnapshotStore.size - MESSAGE_SNAPSHOT_MAX_SIZE;
  for (let index = 0; index < overflow; index += 1) {
    const oldest = entries[index];
    if (!oldest) break;
    messageSnapshotStore.delete(oldest[0]);
  }
}

async function getGuildLogChannelId(guildId: string): Promise<string | null> {
  const now = Date.now();
  const cached = logChannelCache.get(guildId);
  if (cached && cached.expiresAt > now) {
    return cached.channelId;
  }

  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { logChannelId: true },
  });

  const channelId = guild?.logChannelId ?? null;
  logChannelCache.set(guildId, { channelId, expiresAt: now + LOG_CHANNEL_CACHE_TTL_MS });
  return channelId;
}

async function sendLogEmbed(
  guild: Guild,
  embed: EmbedBuilder,
  components?: Array<ActionRowBuilder<ButtonBuilder>>,
): Promise<void> {
  const summary = embedSummary(embed);
  const channelId = await getGuildLogChannelId(guild.id);
  
  await prisma.dashboardAuditLog.create({
    data: {
      guildId: guild.id,
      channelId,
      user: 'Système',
      action: summary.action,
      context: guild.name,
      module: 'Logs avancés',
      eventType: 'Discord',
      details: summary.details,
      dateIso: new Date(),
    }
  }).catch((error) => {
    logger.warn('Logs', `Impossible de persister le log dashboard pour ${guild.id}: ${String(error)}`);
  });

  if (!channelId) return;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  await channel.send({ embeds: [embed], components }).catch((error) => {
    logger.warn('Logs', `Impossible d'envoyer un log dans ${guild.id}: ${String(error)}`);
  });
}

async function recordMessageAudit(message: Message | PartialMessage): Promise<void> {
  if (!message.guildId || !message.author || message.author.bot) return;

  await prisma.dashboardAuditLog.create({
    data: {
      guildId: message.guildId,
      channelId: message.channelId,
      user: formatUser(message.author.id, message.author.tag ?? message.author.username ?? `Utilisateur ${message.author.id}`),
      action: 'Message envoyé',
      context: message.guild?.name ?? `Serveur ${message.guildId}`,
      module: 'Messages',
      eventType: 'Discord',
      details: truncate([
        message.content?.trim() ? `Contenu: ${message.content.trim()}` : 'Contenu: _vide_',
        message.attachments.size > 0 ? `Pièces jointes: ${[...message.attachments.values()].slice(0, 5).map((attachment) => attachment.url).join(' | ')}` : null,
      ].filter(Boolean).join(' | '), 900),
      dateIso: new Date(),
    },
  }).catch((error) => {
    logger.warn('Logs', `Impossible de persister le message de ${message.author?.id ?? 'inconnu'}: ${String(error)}`);
  });
}

async function fetchGuildInviteSnapshot(guild: Guild): Promise<Map<string, InviteSnapshot> | null> {
  const invites = await guild.invites.fetch().catch(() => null);
  if (!invites) return null;

  const snapshot = new Map<string, InviteSnapshot>();
  for (const invite of invites.values()) {
    snapshot.set(invite.code, {
      code: invite.code,
      uses: invite.uses ?? 0,
      inviterId: invite.inviter?.id ?? null,
      inviterTag: invite.inviter?.tag ?? invite.inviter?.username ?? null,
    });
  }
  return snapshot;
}

async function refreshGuildInviteCache(guild: Guild): Promise<void> {
  const snapshot = await fetchGuildInviteSnapshot(guild);
  if (!snapshot) return;
  inviteUsageCache.set(guild.id, snapshot);
}

async function resolveUsedInviteOnJoin(guild: Guild): Promise<InviteSnapshot | null> {
  const previous = inviteUsageCache.get(guild.id) ?? new Map<string, InviteSnapshot>();
  const current = await fetchGuildInviteSnapshot(guild);
  if (!current) return null;

  let usedInvite: InviteSnapshot | null = null;

  for (const [code, currentInvite] of current.entries()) {
    const previousUses = previous.get(code)?.uses ?? 0;
    if (currentInvite.uses > previousUses) {
      usedInvite = currentInvite;
      break;
    }
  }

  inviteUsageCache.set(guild.id, current);
  return usedInvite;
}

function formatInviteCreator(invite: { inviterId: string | null; inviterTag: string | null }): string {
  if (!invite.inviterId) return 'Inconnu';
  const tag = invite.inviterTag ?? `Utilisateur ${invite.inviterId}`;
  return `${tag} (<@${invite.inviterId}>)`;
}

async function resolveUserTag(client: Client, userId: string): Promise<string> {
  const user = await client.users.fetch(userId).catch(() => null);
  if (!user) return `Utilisateur ${userId}`;
  return user.tag ?? user.username ?? `Utilisateur ${userId}`;
}

function snapshotFromMessage(message: Message | PartialMessage): MessageSnapshot | null {
  if (!message.guildId || !message.channelId || !message.author) return null;

  return {
    guildId: message.guildId,
    channelId: message.channelId,
    authorId: message.author.id,
    authorTag: message.author.tag,
    content: message.content ?? '',
    attachments: [...message.attachments.values()].map((attachment) => attachment.url),
    createdAt: Date.now(),
  };
}

function shouldIgnoreMessage(message: Message | PartialMessage): boolean {
  return !message.guildId || !!message.author?.bot;
}

async function resolveMessageDeleteActor(
  guild: Guild,
  message: Message | PartialMessage,
  snapshot: MessageSnapshot | null,
): Promise<string> {
  const authorId = snapshot?.authorId ?? message.author?.id;
  const authorTag = snapshot?.authorTag ?? message.author?.tag;

  if (!authorId || !authorTag) {
    return 'Inconnu';
  }

  try {
    const audit = await guild.fetchAuditLogs({ type: AuditLogEvent.MessageDelete, limit: 6 });
    const now = Date.now();

    const matching = audit.entries.find((entry: GuildAuditLogsEntry<AuditLogEvent.MessageDelete>) => {
      const targetId = entry.targetId;
      if (targetId !== authorId) return false;

      const createdAt = entry.createdTimestamp ?? 0;
      if (now - createdAt > AUDIT_LOOKBACK_MS) return false;

      const extra = entry.extra as { channel?: { id?: string } } | null;
      const extraChannelId = extra?.channel?.id;
      if (extraChannelId && extraChannelId !== (snapshot?.channelId ?? message.channelId)) return false;

      return true;
    });

    if (!matching?.executor) {
      return formatUser(authorId, authorTag);
    }

    const executorId = matching.executor.id;
    if (!executorId) {
      return formatUser(authorId, authorTag);
    }

    return formatUser(
      executorId,
      matching.executor.tag ?? matching.executor.username ?? `Utilisateur ${executorId}`,
    );
  } catch {
    return formatUser(authorId, authorTag);
  }
}

async function resolveBulkDeleteActor(
  guild: Guild,
  channelId: string,
  deletedCount: number,
): Promise<string> {
  try {
    const audit = await guild.fetchAuditLogs({ type: AuditLogEvent.MessageBulkDelete, limit: 6 });
    const now = Date.now();

    const matching = audit.entries.find((entry: GuildAuditLogsEntry<AuditLogEvent.MessageBulkDelete>) => {
      const createdAt = entry.createdTimestamp ?? 0;
      if (now - createdAt > AUDIT_LOOKBACK_MS) return false;

      const extra = entry.extra as { channel?: { id?: string }; count?: number } | null;
      const extraChannelId = extra?.channel?.id;
      const extraCount = typeof extra?.count === 'number' ? extra.count : null;

      if (extraChannelId && extraChannelId !== channelId) return false;
      if (extraCount !== null && extraCount !== deletedCount) return false;
      return true;
    });

    const executor = matching?.executor;
    const executorId = executor?.id;
    if (!executor || !executorId) return 'Inconnu';
    return formatUser(executorId, executor.tag ?? executor.username ?? `Utilisateur ${executorId}`);
  } catch {
    return 'Inconnu';
  }
}

function buildBulkDeleteEmbed(
  channelId: string,
  deletedCount: number,
  deletedBy: string,
  authorPreview: string,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xbc4749)
    .setTitle('🧹 Suppression de messages en masse')
    .addFields(
      { name: 'Salon', value: `<#${channelId}>`, inline: true },
      { name: 'Messages supprimés', value: `${deletedCount}`, inline: true },
      { name: 'Supprimé par', value: deletedBy, inline: true },
      { name: 'Auteurs estimés', value: authorPreview, inline: false },
    )
    .setTimestamp();
}

function buildMessageDeleteEmbed(
  snapshot: MessageSnapshot,
  deletedBy: string,
): EmbedBuilder {
  const content = snapshot.content.trim().length > 0 ? truncate(snapshot.content, 1000) : '_Aucun texte_';
  const attachments = snapshot.attachments.length > 0
    ? snapshot.attachments.slice(0, 5).map((url) => `• ${url}`).join('\n')
    : '_Aucune pièce jointe_';

  return new EmbedBuilder()
    .setColor(0xe63946)
    .setTitle('🗑️ Message supprimé')
    .addFields(
      { name: 'Salon', value: `<#${snapshot.channelId}>`, inline: true },
      { name: 'Auteur', value: formatUser(snapshot.authorId, snapshot.authorTag), inline: true },
      { name: 'Supprimé par', value: deletedBy, inline: true },
      { name: 'Contenu', value: content, inline: false },
      { name: 'Pièces jointes', value: attachments, inline: false },
    )
    .setTimestamp();
}

function buildMessageEditEmbed(
  beforeContent: string,
  afterContent: string,
  channelId: string,
  authorId: string,
  authorTag: string,
): EmbedBuilder {
  const before = beforeContent.trim().length > 0 ? truncate(beforeContent, 900) : '_Aucun texte_';
  const after = afterContent.trim().length > 0 ? truncate(afterContent, 900) : '_Aucun texte_';

  return new EmbedBuilder()
    .setColor(0xf4a261)
    .setTitle('✏️ Message modifié')
    .addFields(
      { name: 'Salon', value: `<#${channelId}>`, inline: true },
      { name: 'Auteur', value: formatUser(authorId, authorTag), inline: true },
      { name: 'Avant', value: before, inline: false },
      { name: 'Après', value: after, inline: false },
    )
    .setTimestamp();
}

function buildVoiceEmbed(
  actionTitle: string,
  member: GuildMember | null,
  userId: string,
  fields: Array<{ name: string; value: string; inline?: boolean }>,
): EmbedBuilder {
  const userTag = member?.user.tag ?? `Utilisateur ${userId}`;

  return new EmbedBuilder()
    .setColor(0x457b9d)
    .setTitle(actionTitle)
    .setDescription(formatUser(userId, userTag))
    .addFields(fields)
    .setTimestamp();
}

function buildMemberEmbed(
  title: string,
  color: number,
  member: { id: string; user: { tag: string; createdTimestamp: number }; guild: Guild },
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(formatUser(member.id, member.user.tag))
    .addFields(
      { name: 'Compte créé', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
      { name: 'Membre', value: `${member.guild.memberCount}`, inline: true },
    )
    .setTimestamp();
}

function buildChannelEventEmbed(title: string, color: number, channel: GuildBasedChannel, details: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .addFields(
      { name: 'Salon', value: formatChannelName(channel), inline: false },
      { name: 'Détails', value: details, inline: false },
    )
    .setTimestamp();
}

function buildRoleEventEmbed(title: string, color: number, role: Role, details: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .addFields(
      { name: 'Rôle', value: `<@&${role.id}> (${role.name})`, inline: false },
      { name: 'Détails', value: details, inline: false },
    )
    .setTimestamp();
}

function summarizePermissionChanges(previous: string[], current: string[]): string {
  const previousSet = new Set(previous);
  const currentSet = new Set(current);

  const added: string[] = [];
  const removed: string[] = [];

  for (const permission of currentSet) {
    if (!previousSet.has(permission)) added.push(permission);
  }
  for (const permission of previousSet) {
    if (!currentSet.has(permission)) removed.push(permission);
  }

  const addedPreview = added.length > 0 ? added.slice(0, 12).join(', ') : 'Aucune';
  const removedPreview = removed.length > 0 ? removed.slice(0, 12).join(', ') : 'Aucune';
  return `Ajoutées: ${addedPreview}\nRetirées: ${removedPreview}`;
}

function summarizeMemberRoleChanges(oldMember: GuildMember, newMember: GuildMember): string | null {
  const oldRoleIds = new Set(oldMember.roles.cache.keys());
  const newRoleIds = new Set(newMember.roles.cache.keys());

  const added = [...newMember.roles.cache.values()].filter((role) => !oldRoleIds.has(role.id));
  const removed = [...oldMember.roles.cache.values()].filter((role) => !newRoleIds.has(role.id));

  if (added.length === 0 && removed.length === 0) return null;

  const addedText = added.length > 0 ? added.map((role) => `<@&${role.id}>`).join(', ') : 'Aucun';
  const removedText = removed.length > 0 ? removed.map((role) => `<@&${role.id}>`).join(', ') : 'Aucun';

  return `Rôles ajoutés: ${addedText}\nRôles retirés: ${removedText}`;
}

function buildModerationEmbed(
  title: string,
  color: number,
  targetId: string,
  targetTag: string,
  moderatorId: string,
  moderatorTag: string,
  reason: string,
  extraFields: Array<{ name: string; value: string; inline?: boolean }> = [],
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .addFields(
      { name: 'Membre ciblé', value: formatUser(targetId, targetTag), inline: true },
      { name: 'Modérateur', value: formatUser(moderatorId, moderatorTag), inline: true },
      { name: 'Raison', value: reason.trim() || 'Aucune raison fournie', inline: false },
      ...extraFields,
    )
    .setTimestamp();
}

export function registerAdvancedLogsListener(client: Client): void {
  client.on(Events.MessageCreate, (message) => {
    if (shouldIgnoreMessage(message)) return;

    const snapshot = snapshotFromMessage(message);
    if (!snapshot) return;

    void recordMessageAudit(message);

    messageSnapshotStore.set(message.id, snapshot);
    void touchMemberMessageActivity({
      guildId: snapshot.guildId,
      user: message.author,
      channelId: message.channelId,
      displayName: message.member?.displayName ?? message.author.globalName ?? message.author.username,
    }).catch((error) => {
      logger.warn('Casier', `Impossible de mettre à jour l'activité message de ${message.author.id}: ${String(error)}`);
    });
    cleanupMessageSnapshots();
  });

  client.on(Events.MessageDelete, async (message) => {
    if (shouldIgnoreMessage(message)) return;
    if (!message.guild) return;

    const snapshot = messageSnapshotStore.get(message.id) ?? snapshotFromMessage(message);
    if (!snapshot) return;

    messageSnapshotStore.delete(message.id);

    const deletedBy = await resolveMessageDeleteActor(message.guild, message, snapshot);
    const embed = buildMessageDeleteEmbed(snapshot, deletedBy);
    const components = [buildMemberCaseActionRow(snapshot.authorId)];
    await sendLogEmbed(message.guild, embed, components);
  });

  client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    if (shouldIgnoreMessage(newMessage)) return;
    if (!newMessage.guild) return;

    const snapshot = messageSnapshotStore.get(newMessage.id) ?? snapshotFromMessage(oldMessage);
    if (!snapshot) return;

    const newContent = newMessage.content ?? '';
    const previousContent = snapshot.content ?? '';
    if (newContent === previousContent) {
      return;
    }

    const embed = buildMessageEditEmbed(
      previousContent,
      newContent,
      snapshot.channelId,
      snapshot.authorId,
      snapshot.authorTag,
    );

    messageSnapshotStore.set(newMessage.id, {
      ...snapshot,
      content: newContent,
      attachments: [...newMessage.attachments.values()].map((attachment) => attachment.url),
      createdAt: Date.now(),
    });

    await sendLogEmbed(newMessage.guild, embed, [buildMemberCaseActionRow(snapshot.authorId)]);
  });

  client.on(Events.MessageBulkDelete, async (messages, channel) => {
    if (!('guild' in channel) || !channel.guild) return;

    const guild = channel.guild;
    const channelId = channel.id;

    const total = messages.size;
    if (total === 0) return;

    const authorCount = new Map<string, number>();

    for (const message of messages.values()) {
      const snapshot = messageSnapshotStore.get(message.id) ?? snapshotFromMessage(message);
      if (!snapshot) continue;

      const key = `${snapshot.authorTag} (${snapshot.authorId})`;
      authorCount.set(key, (authorCount.get(key) ?? 0) + 1);
      messageSnapshotStore.delete(message.id);
    }

    const preview = [...authorCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_BULK_AUTHOR_PREVIEW)
      .map(([author, count]) => `• ${author}: ${count}`)
      .join('\n');

    const deletedBy = await resolveBulkDeleteActor(guild, channelId, total);

    const embed = buildBulkDeleteEmbed(
      channelId,
      total,
      deletedBy,
      preview.length > 0 ? preview : 'Auteur non déterminé (messages non présents en cache).',
    );

    await sendLogEmbed(guild, embed);
  });

  client.on(Events.VoiceStateUpdate, async (oldState: VoiceState, newState: VoiceState) => {
    const guild = newState.guild ?? oldState.guild;
    if (!guild) return;

    const userId = newState.id;
    const member = newState.member ?? oldState.member ?? null;
    const key = voiceSessionKey(guild.id, userId);

    if (!oldState.channelId && newState.channelId) {
      voiceSessionStore.set(key, {
        joinedAt: Date.now(),
        channelId: newState.channelId,
      });

      const embed = buildVoiceEmbed('🔊 Connexion vocale', member, userId, [
        { name: 'Salon', value: `<#${newState.channelId}>`, inline: true },
      ]);

      if (member) {
        void touchMemberVoiceJoin({
          guildId: guild.id,
          user: member.user,
          channelId: newState.channelId,
          displayName: member.displayName,
          joinedAt: new Date(),
        }).catch((error) => {
          logger.warn('Casier', `Impossible de mettre à jour l'activité vocale de ${member.id}: ${String(error)}`);
        });
      }

      await sendLogEmbed(guild, embed, [buildMemberCaseActionRow(userId)]);
      return;
    }

    if (oldState.channelId && !newState.channelId) {
      const session = voiceSessionStore.get(key);
      voiceSessionStore.delete(key);

      const joinedAt = session?.joinedAt ?? Date.now();
      const duration = formatDurationMs(Date.now() - joinedAt);
      const previousChannelId = oldState.channelId ?? session?.channelId;
      if (!previousChannelId) return;

      const embed = buildVoiceEmbed('🔇 Déconnexion vocale', member, userId, [
        { name: 'Salon', value: `<#${previousChannelId}>`, inline: true },
        { name: 'Temps en vocal', value: duration, inline: true },
      ]);

      if (member) {
        void touchMemberVoiceLeave({
          guildId: guild.id,
          user: member.user,
          channelId: previousChannelId,
          displayName: member.displayName,
          joinedAt: session?.joinedAt ? new Date(session.joinedAt) : undefined,
          durationSeconds: Math.max(0, Math.floor((Date.now() - joinedAt) / 1000)),
        }).catch((error) => {
          logger.warn('Casier', `Impossible de fermer l'activité vocale de ${member.id}: ${String(error)}`);
        });
      }

      await sendLogEmbed(guild, embed, [buildMemberCaseActionRow(userId)]);
      return;
    }

    if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
      const previousSession = voiceSessionStore.get(key);
      const joinedAt = previousSession?.joinedAt ?? Date.now();
      const duration = formatDurationMs(Date.now() - joinedAt);

      voiceSessionStore.set(key, {
        joinedAt: Date.now(),
        channelId: newState.channelId,
      });

      const embed = buildVoiceEmbed('🔁 Changement de salon vocal', member, userId, [
        { name: 'Depuis', value: `<#${oldState.channelId}>`, inline: true },
        { name: 'Vers', value: `<#${newState.channelId}>`, inline: true },
        { name: 'Temps dans le salon précédent', value: duration, inline: false },
      ]);

      if (member) {
        void touchMemberVoiceLeave({
          guildId: guild.id,
          user: member.user,
          channelId: oldState.channelId,
          displayName: member.displayName,
          joinedAt: previousSession?.joinedAt ? new Date(previousSession.joinedAt) : undefined,
          durationSeconds: Math.max(0, Math.floor((Date.now() - joinedAt) / 1000)),
        }).catch((error) => {
          logger.warn('Casier', `Impossible de clore l'ancien salon vocal de ${member.id}: ${String(error)}`);
        });

        void touchMemberVoiceJoin({
          guildId: guild.id,
          user: member.user,
          channelId: newState.channelId,
          displayName: member.displayName,
          joinedAt: new Date(),
        }).catch((error) => {
          logger.warn('Casier', `Impossible de démarrer la nouvelle session vocale de ${member.id}: ${String(error)}`);
        });
      }

      await sendLogEmbed(guild, embed, [buildMemberCaseActionRow(userId)]);
    }
  });

  client.on(Events.GuildMemberAdd, async (member) => {
    const usedInvite = await resolveUsedInviteOnJoin(member.guild);

    void touchMemberJoin(member).catch((error) => {
      logger.warn('Casier', `Impossible de synchroniser l'arrivée du membre ${member.id}: ${String(error)}`);
    });

    if (usedInvite) {
      memberInviteUsageCache.set(memberInviteKey(member.guild.id, member.id), {
        code: usedInvite.code,
        inviterId: usedInvite.inviterId,
        inviterTag: usedInvite.inviterTag,
        joinedAt: Date.now(),
      });
    }

    const base = buildMemberEmbed('✅ Membre connecté au serveur', 0x2a9d8f, member);
    const inviteCode = usedInvite?.code ?? 'Inconnue / vanity / impossible à détecter';
    const inviter = usedInvite ? formatInviteCreator(usedInvite) : 'Inconnu';

    const embed = EmbedBuilder.from(base).addFields(
      { name: 'Invite utilisée', value: inviteCode, inline: true },
      { name: 'Créateur de l\'invite', value: inviter, inline: true },
      { name: 'ID créateur', value: usedInvite?.inviterId ?? 'Inconnu', inline: true },
    );

    await sendLogEmbed(member.guild, embed, [buildMemberCaseActionRow(member.id)]);
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    const inviteKey = memberInviteKey(member.guild.id, member.id);
    const joinedInvite = memberInviteUsageCache.get(inviteKey) ?? null;
    memberInviteUsageCache.delete(inviteKey);

    void touchMemberLeave({
      guildId: member.guild.id,
      user: member.user,
      displayName: member.displayName,
      guildJoinedAt: member.joinedAt ?? null,
    }).catch((error) => {
      logger.warn('Casier', `Impossible de synchroniser la sortie du membre ${member.id}: ${String(error)}`);
    });

    const embed = buildMemberEmbed(
      '👋 Membre déconnecté du serveur',
      0x8d99ae,
      {
        id: member.id,
        user: {
          tag: member.user?.tag ?? member.user?.username ?? `Utilisateur ${member.id}`,
          createdTimestamp: member.user?.createdTimestamp ?? Date.now(),
        },
        guild: member.guild,
      },
    ).addFields(
      {
        name: 'Invite d\'arrivée',
        value: joinedInvite?.code ?? 'Inconnue (pas détectée pendant cette session bot)',
        inline: true,
      },
      {
        name: 'Créateur de l\'invite',
        value: joinedInvite
          ? formatInviteCreator({ inviterId: joinedInvite.inviterId, inviterTag: joinedInvite.inviterTag })
          : 'Inconnu',
        inline: true,
      },
      {
        name: 'ID créateur',
        value: joinedInvite?.inviterId ?? 'Inconnu',
        inline: true,
      },
    );

    await sendLogEmbed(member.guild, embed, [buildMemberCaseActionRow(member.id)]);
  });

  client.on(Events.InviteCreate, async (invite) => {
    if (!isFullGuild(invite.guild)) return;
    await refreshGuildInviteCache(invite.guild);
  });

  client.on(Events.InviteDelete, async (invite) => {
    if (!isFullGuild(invite.guild)) return;
    await refreshGuildInviteCache(invite.guild);
  });

  client.on(Events.ChannelCreate, async (channel) => {
    if (!isGuildNamedChannel(channel)) return;

    const embed = buildChannelEventEmbed(
      '🧱 Salon créé',
      0x2a9d8f,
      channel,
      `Type: ${channel.type}`,
    );
    await sendLogEmbed(channel.guild, embed);
  });

  client.on(Events.ChannelDelete, async (channel) => {
    if (!isGuildNamedChannel(channel)) return;

    const embed = buildChannelEventEmbed(
      '🗑️ Salon supprimé',
      0xe63946,
      channel,
      `Type: ${channel.type}`,
    );
    await sendLogEmbed(channel.guild, embed);
  });

  client.on(Events.ChannelUpdate, async (oldChannel, newChannel) => {
    if (!isGuildNamedChannel(oldChannel) || !isGuildNamedChannel(newChannel)) return;

    if (oldChannel.name === newChannel.name) {
      const oldTopic = 'topic' in oldChannel ? oldChannel.topic : null;
      const newTopic = 'topic' in newChannel ? newChannel.topic : null;
      const oldNsfw = 'nsfw' in oldChannel ? oldChannel.nsfw : null;
      const newNsfw = 'nsfw' in newChannel ? newChannel.nsfw : null;
      const oldSlow = 'rateLimitPerUser' in oldChannel ? oldChannel.rateLimitPerUser : null;
      const newSlow = 'rateLimitPerUser' in newChannel ? newChannel.rateLimitPerUser : null;

      if (oldTopic === newTopic && oldNsfw === newNsfw && oldSlow === newSlow) {
        return;
      }
    }

    const details: string[] = [];
    if (oldChannel.name !== newChannel.name) {
      details.push(`Nom: ${oldChannel.name} -> ${newChannel.name}`);
    }

    if ('topic' in oldChannel && 'topic' in newChannel && oldChannel.topic !== newChannel.topic) {
      details.push(`Sujet: ${(oldChannel.topic ?? 'Aucun')} -> ${(newChannel.topic ?? 'Aucun')}`);
    }

    if ('nsfw' in oldChannel && 'nsfw' in newChannel && oldChannel.nsfw !== newChannel.nsfw) {
      details.push(`NSFW: ${oldChannel.nsfw ? 'Oui' : 'Non'} -> ${newChannel.nsfw ? 'Oui' : 'Non'}`);
    }

    if (
      'rateLimitPerUser' in oldChannel
      && 'rateLimitPerUser' in newChannel
      && oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser
    ) {
      details.push(`Slowmode: ${oldChannel.rateLimitPerUser}s -> ${newChannel.rateLimitPerUser}s`);
    }

    const embed = buildChannelEventEmbed(
      '🛠️ Salon modifié',
      0xf4a261,
      newChannel,
      details.length > 0 ? details.join('\n') : 'Modification détectée.',
    );

    await sendLogEmbed(newChannel.guild, embed);
  });

  client.on(Events.GuildRoleCreate, async (role) => {
    const embed = buildRoleEventEmbed('🆕 Rôle créé', 0x2a9d8f, role, `Couleur: #${role.color.toString(16).padStart(6, '0')}`);
    await sendLogEmbed(role.guild, embed);
  });

  client.on(Events.GuildRoleDelete, async (role) => {
    const embed = buildRoleEventEmbed('🗑️ Rôle supprimé', 0xe63946, role, `Couleur: #${role.color.toString(16).padStart(6, '0')}`);
    await sendLogEmbed(role.guild, embed);
  });

  client.on(Events.GuildRoleUpdate, async (oldRole, newRole) => {
    const changes: string[] = [];

    if (oldRole.name !== newRole.name) changes.push(`Nom: ${oldRole.name} -> ${newRole.name}`);
    if (oldRole.color !== newRole.color) {
      changes.push(
        `Couleur: #${oldRole.color.toString(16).padStart(6, '0')} -> #${newRole.color.toString(16).padStart(6, '0')}`,
      );
    }
    if (oldRole.hoist !== newRole.hoist) changes.push(`Affiché séparément: ${oldRole.hoist ? 'Oui' : 'Non'} -> ${newRole.hoist ? 'Oui' : 'Non'}`);
    if (oldRole.mentionable !== newRole.mentionable) {
      changes.push(`Mentionnable: ${oldRole.mentionable ? 'Oui' : 'Non'} -> ${newRole.mentionable ? 'Oui' : 'Non'}`);
    }

    if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
      changes.push(summarizePermissionChanges(oldRole.permissions.toArray(), newRole.permissions.toArray()));
    }

    if (changes.length === 0) return;

    const embed = buildRoleEventEmbed('🛠️ Rôle modifié', 0xf4a261, newRole, changes.join('\n'));
    await sendLogEmbed(newRole.guild, embed);
  });

  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    if (oldMember.partial || newMember.partial) return;

    void touchMemberProfileFromMember(newMember).catch((error) => {
      logger.warn('Casier', `Impossible de synchroniser le profil du membre ${newMember.id}: ${String(error)}`);
    });

    const roleChanges = summarizeMemberRoleChanges(oldMember, newMember);
    if (roleChanges) {
      const memberTag = safeTag(newMember, newMember.id);
      const embed = new EmbedBuilder()
        .setColor(0x6d597a)
        .setTitle('🧷 Rôles membre modifiés')
        .addFields(
          { name: 'Membre', value: formatUser(newMember.id, memberTag), inline: false },
          { name: 'Changements', value: roleChanges, inline: false },
        )
        .setTimestamp();

      await sendLogEmbed(newMember.guild, embed, [buildMemberCaseActionRow(newMember.id)]);
    }

    const oldTimeout = oldMember.communicationDisabledUntilTimestamp ?? null;
    const newTimeout = newMember.communicationDisabledUntilTimestamp ?? null;
    if (oldTimeout !== newTimeout) {
      const memberTag = safeTag(newMember, newMember.id);
      const title = newTimeout && newTimeout > Date.now()
        ? (oldTimeout ? '⏱️ Timeout modifié' : '⏱️ Timeout appliqué')
        : '✅ Timeout retiré';

      const embed = new EmbedBuilder()
        .setColor(newTimeout && newTimeout > Date.now() ? 0xe9c46a : 0x2a9d8f)
        .setTitle(title)
        .addFields(
          { name: 'Membre', value: formatUser(newMember.id, memberTag), inline: false },
          { name: 'Ancienne échéance', value: formatDurationUntil(oldTimeout), inline: true },
          { name: 'Nouvelle échéance', value: formatDurationUntil(newTimeout), inline: true },
        )
        .setTimestamp();

      await sendLogEmbed(newMember.guild, embed, [buildMemberCaseActionRow(newMember.id)]);
    }
  });

  client.on(Events.GuildAuditLogEntryCreate, async (entry, guild) => {
    const executorId = entry.executorId;
    const targetId = typeof entry.targetId === 'string' ? entry.targetId : null;
    if (!executorId || !targetId) return;

    if (
      entry.action !== AuditLogEvent.MemberKick
      && entry.action !== AuditLogEvent.MemberBanAdd
      && entry.action !== AuditLogEvent.MemberBanRemove
      && entry.action !== AuditLogEvent.MemberUpdate
    ) {
      return;
    }

    const moderatorTag = await resolveUserTag(client, executorId);
    const targetTag = await resolveUserTag(client, targetId);
    const reason = entry.reason?.trim() ?? 'Aucune raison fournie';

    void touchSanctionTargetIdentity({ guildId: guild.id, userId: targetId, userTag: targetTag }).catch(() => null);
    void touchSanctionTargetIdentity({ guildId: guild.id, userId: executorId, userTag: moderatorTag }).catch(() => null);

    if (entry.action === AuditLogEvent.MemberKick) {
      const embed = buildModerationEmbed(
        '🥾 Expulsion (kick)',
        0xf77f00,
        targetId,
        targetTag,
        executorId,
        moderatorTag,
        reason,
      );
      await sendLogEmbed(guild, embed, [buildMemberCaseActionRow(targetId), buildMemberCaseActionRow(executorId)]);
      return;
    }

    if (entry.action === AuditLogEvent.MemberBanAdd) {
      const embed = buildModerationEmbed(
        '🔨 Bannissement',
        0xd62828,
        targetId,
        targetTag,
        executorId,
        moderatorTag,
        reason,
      );
      await sendLogEmbed(guild, embed, [buildMemberCaseActionRow(targetId), buildMemberCaseActionRow(executorId)]);
      return;
    }

    if (entry.action === AuditLogEvent.MemberBanRemove) {
      const embed = buildModerationEmbed(
        '🟢 Débannissement',
        0x2a9d8f,
        targetId,
        targetTag,
        executorId,
        moderatorTag,
        reason,
      );
      await sendLogEmbed(guild, embed, [buildMemberCaseActionRow(targetId), buildMemberCaseActionRow(executorId)]);
      return;
    }

    if (entry.action === AuditLogEvent.MemberUpdate) {
      const timeoutChange = entry.changes.find((change) => change.key === 'communication_disabled_until');
      if (!timeoutChange) return;

      const oldUntil = parseTimestamp((timeoutChange.old ?? null) as string | number | Date | null);
      const newUntil = parseTimestamp((timeoutChange.new ?? null) as string | number | Date | null);

      const timeoutTitle = newUntil && newUntil > Date.now()
        ? (oldUntil ? '⏱️ Timeout mis à jour' : '⏱️ Timeout appliqué')
        : '✅ Timeout retiré';

      const embed = buildModerationEmbed(
        timeoutTitle,
        0xe9c46a,
        targetId,
        targetTag,
        executorId,
        moderatorTag,
        reason,
        [
          { name: 'Ancienne échéance', value: formatDurationUntil(oldUntil), inline: true },
          { name: 'Nouvelle échéance', value: formatDurationUntil(newUntil), inline: true },
        ],
      );

      await sendLogEmbed(guild, embed, [buildMemberCaseActionRow(targetId), buildMemberCaseActionRow(executorId)]);
    }
  });

  logger.success('Logs', 'Écouteur de logs avancés enregistré');

  for (const guild of client.guilds.cache.values()) {
    void refreshGuildInviteCache(guild);
  }
}
