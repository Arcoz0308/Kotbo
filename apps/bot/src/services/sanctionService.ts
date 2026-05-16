import { EmbedBuilder, Guild, GuildMember, type Client } from 'discord.js';
import { Prisma, SanctionStatus, SanctionType } from '@prisma/client';
import prisma from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { COLORS } from '../utils/embeds.js';
import { notifyDashboardSanctionReportRequired } from '../api/dashboardApi.js';
import { createNotification } from './staffLeadershipService.js';
import * as altAccountService from './altAccountService.js';

const MAX_DISCORD_TIMEOUT_MS = 27 * 24 * 60 * 60 * 1000;
const RENEWAL_BUFFER_MS = 60 * 1000;
const SANCTION_DEDUPE_WINDOW_MS = 30 * 1000;
let hasLoggedSanctionSchemaMismatch = false;

type Actor = {
  id: string;
  tag: string;
};

type Target = {
  id: string;
  tag: string;
};

async function touchSanctionTargetIdentity(params: { guildId: string; userId: string; userTag: string }): Promise<void> {
  await prisma.memberProfile.upsert({
    where: {
      guildId_userId: {
        guildId: params.guildId,
        userId: params.userId,
      },
    },
    create: {
      guildId: params.guildId,
      userId: params.userId,
      userTag: params.userTag,
      lastSeenAt: new Date(),
    },
    update: {
      userTag: params.userTag,
      lastSeenAt: new Date(),
    },
  });
}

function getDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function incrementModerationStats(guildId: string, type: SanctionType): Promise<void> {
  const dateKey = getDateKey();
  const updateData: any = { sanctionsCount: { increment: 1 } };

  if (type === SanctionType.WARN) updateData.warnsCount = { increment: 1 };
  else if (type === SanctionType.KICK) updateData.kicksCount = { increment: 1 };
  else if (type === SanctionType.TIMEOUT) updateData.timeoutsCount = { increment: 1 };
  else if (type === SanctionType.BAN || type === SanctionType.TEMP_BAN) updateData.bansCount = { increment: 1 };

  await prisma.guildDailyStat.upsert({
    where: { guildId_dateKey: { guildId, dateKey } },
    create: {
      guildId,
      dateKey,
      sanctionsCount: 1,
      warnsCount: type === SanctionType.WARN ? 1 : 0,
      kicksCount: type === SanctionType.KICK ? 1 : 0,
      timeoutsCount: type === SanctionType.TIMEOUT ? 1 : 0,
      bansCount: (type === SanctionType.BAN || type === SanctionType.TEMP_BAN) ? 1 : 0,
    },
    update: updateData,
  }).catch((error) => {
    logger.debug('Analytics', `Guild moderation stat error: ${String(error)}`);
  });
}

const DURATION_UNITS_MS: Record<string, number> = {
  s: 1000,
  sec: 1000,
  secs: 1000,
  seconde: 1000,
  secondes: 1000,
  m: 60 * 1000,
  min: 60 * 1000,
  mins: 60 * 1000,
  minute: 60 * 1000,
  minutes: 60 * 1000,
  h: 60 * 60 * 1000,
  heure: 60 * 60 * 1000,
  heures: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  j: 24 * 60 * 60 * 1000,
  jour: 24 * 60 * 60 * 1000,
  jours: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
  semaine: 7 * 24 * 60 * 60 * 1000,
  semaines: 7 * 24 * 60 * 60 * 1000,
};

function normalizeDurationInput(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/,/g, '.')
    .replace(/\s+/g, ' ');
}

export function parseDurationToMs(input: string): number | null {
  const normalized = normalizeDurationInput(input);
  if (!normalized) return null;

  const pattern = /(\d+(?:\.\d+)?)\s*([a-zA-Z]+)/g;
  let total = 0;
  let matched = false;

  for (const match of normalized.matchAll(pattern)) {
    const rawValue = match[1];
    const rawUnit = match[2];
    if (!rawValue || !rawUnit) continue;

    const value = Number(rawValue);
    const unit = rawUnit.toLowerCase();
    const unitMs = DURATION_UNITS_MS[unit];

    if (!Number.isFinite(value) || value <= 0 || !unitMs) {
      return null;
    }

    total += Math.round(value * unitMs);
    matched = true;
  }

  if (!matched) return null;
  if (total < 1000) return null;
  return total;
}

export function formatDurationFr(durationMs: number): string {
  const totalSeconds = Math.max(1, Math.floor(durationMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} jour${days > 1 ? 's' : ''}`);
  if (hours > 0) parts.push(`${hours} heure${hours > 1 ? 's' : ''}`);
  if (minutes > 0) parts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);
  if (seconds > 0 && parts.length === 0) parts.push(`${seconds} seconde${seconds > 1 ? 's' : ''}`);

  return parts.join(' ');
}

function buildActionReason(reason: string, moderatorTag: string): string {
  const base = reason.trim().slice(0, 350);
  return `${base} | Modération: ${moderatorTag}`;
}

function nextRenewalAt(now: Date, chunkMs: number): Date {
  const next = new Date(now.getTime() + chunkMs - RENEWAL_BUFFER_MS);
  if (next <= now) {
    return new Date(now.getTime() + 1000);
  }
  return next;
}

function isSanctionsSchemaMismatchError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code !== 'P2021' && error.code !== 'P2022') {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes('sanction') || message.includes('nextactionat');
}

async function applyTimeoutChunk(member: GuildMember, durationMs: number, reason: string): Promise<void> {
  const safeMs = Math.max(1000, Math.min(durationMs, MAX_DISCORD_TIMEOUT_MS));
  await member.timeout(safeMs, reason);
}

async function findRecentSanction(params: {
  guildId: string;
  type: SanctionType;
  targetUserId: string;
  moderatorUserId: string;
}) {
  return prisma.sanction.findFirst({
    where: {
      guildId: params.guildId,
      type: params.type,
      targetUserId: params.targetUserId,
      moderatorUserId: params.moderatorUserId,
      createdAt: { gte: new Date(Date.now() - SANCTION_DEDUPE_WINDOW_MS) },
    },
    orderBy: { createdAt: 'desc' },
  });
}

async function emitSanctionReportReminder(params: {
  guildId: string;
  sanctionId: string;
  sanctionType: SanctionType;
  targetTag: string | null;
  targetUserId: string;
  moderatorTag: string | null;
  moderatorUserId: string;
}) {
  try {
    // Notification temps réel (WS)
    await notifyDashboardSanctionReportRequired({
      guildId: params.guildId,
      sanctionId: params.sanctionId,
      sanctionType: params.sanctionType,
      targetTag: params.targetTag ?? `Utilisateur ${params.targetUserId}`,
      moderatorTag: params.moderatorTag ?? `Modérateur ${params.moderatorUserId}`,
    });

    // Notification persistante (Inbox)
    await createNotification(
      params.guildId,
      params.moderatorUserId,
      'Rapport de sanction requis',
      `Vous devez remplir un rapport pour la sanction appliquée à ${params.targetTag || params.targetUserId}.`,
      'WARNING',
      '/sanctions'
    ).catch(() => null);

  } catch (error) {
    logger.warn(
      'Sanctions',
      `Notification dashboard impossible pour la sanction ${params.sanctionId}: ${error instanceof Error ? error.message : 'erreur inconnue'}`,
    );
  }
}

async function notifyStaffOfSanction(guildId: string, sanction: any) {
  const staff = await prisma.staffMember.findMany({
    where: { guildId }
  });

  const typeLabel = {
    WARN: 'Avertissement',
    KICK: 'Exclusion',
    TIMEOUT: 'Timeout',
    TEMP_BAN: 'Bannissement temporaire',
    BAN: 'Bannissement définitif'
  }[sanction.type as string] || 'Sanction';

  for (const member of staff) {
    if (member.userId === sanction.moderatorUserId || member.userId === sanction.targetUserId) continue; // Don't notify the moderator themselves or the target

    await createNotification(
      guildId,
      member.userId,
      `${typeLabel} : ${sanction.targetTag}`,
      `${sanction.moderatorTag} a appliqué un ${typeLabel.toLowerCase()} à ${sanction.targetTag} pour : ${sanction.reason}`,
      sanction.type === 'BAN' || sanction.type === 'TEMP_BAN' ? 'ERROR' : 'WARNING',
      `/members/${sanction.targetUserId}`
    ).catch(() => null);
  }
}

async function propagateSanction(client: Client, originalGuildId: string, sanction: any) {
  const originalGuild = await prisma.guild.findUnique({
    where: { id: originalGuildId },
    select: { propagateSanctions: true }
  });

  if (!originalGuild?.propagateSanctions) return;

  const otherGuilds = await prisma.guild.findMany({
    where: {
      id: { not: originalGuildId },
      sanctionSyncEnabled: true,
      sanctionAlertChannelId: { not: null }
    }
  });

  for (const guildConfig of otherGuilds) {
    try {
      const guild = client.guilds.cache.get(guildConfig.id) || await client.guilds.fetch(guildConfig.id).catch(() => null);
      if (!guild) continue;

      const channel = guild.channels.cache.get(guildConfig.sanctionAlertChannelId!) || await guild.channels.fetch(guildConfig.sanctionAlertChannelId!).catch(() => null);
      if (!channel || !('send' in channel)) continue;

      const typeLabel = {
        WARN: 'Avertissement',
        KICK: 'Exclusion',
        TIMEOUT: 'Timeout',
        TEMP_BAN: 'Bannissement temporaire',
        BAN: 'Bannissement définitif'
      }[sanction.type as string] || 'Sanction';

      const embed = new EmbedBuilder()
        .setColor(COLORS.warning)
        .setTitle('⚠️ Propagation de Sanction')
        .setDescription(`Un utilisateur a été sanctionné sur un autre serveur Kotbo.`)
        .addFields(
          { name: 'Utilisateur', value: `${sanction.targetTag} (<@${sanction.targetUserId}>)`, inline: true },
          { name: 'Type', value: typeLabel, inline: true },
          { name: 'Raison', value: sanction.reason || 'Aucune raison fournie', inline: false },
          { name: 'Source', value: guild.name, inline: true }
        )
        .setTimestamp();

      await (channel as any).send({ embeds: [embed] }).catch(() => null);
    } catch (err) {
      logger.debug('Sanctions', `Error propagating sanction to guild ${guildConfig.id}: ${String(err)}`);
    }
  }
}

export async function registerWarnSanction(params: {
  guildId: string;
  target: Target;
  moderator: Actor;
  reason: string;
  client?: Client;
  isSync?: boolean;
}) {
  const existing = await findRecentSanction({
    guildId: params.guildId,
    type: SanctionType.WARN,
    targetUserId: params.target.id,
    moderatorUserId: params.moderator.id,
  });

  if (existing) return existing;

  const sanction = await prisma.sanction.create({
    data: {
      guildId: params.guildId,
      type: SanctionType.WARN,
      status: SanctionStatus.RESOLVED,
      targetUserId: params.target.id,
      targetTag: params.target.tag,
      moderatorUserId: params.moderator.id,
      moderatorTag: params.moderator.tag,
      reason: params.reason,
      resolvedAt: new Date(),
      resolutionNote: 'Avertissement enregistré.'
    }
  });

  void incrementModerationStats(params.guildId, SanctionType.WARN).catch(() => null);

  void touchSanctionTargetIdentity({
    guildId: params.guildId,
    userId: params.target.id,
    userTag: params.target.tag,
  }).catch(() => null);

  void notifyStaffOfSanction(params.guildId, sanction).catch(() => null);

  // Notifier l'utilisateur concerné (si profil existant)
  await createNotification(
    params.guildId,
    params.target.id,
    'Avertissement reçu',
    `Vous avez reçu un avertissement pour la raison suivante : ${params.reason}`,
    'WARNING',
    '/profile'
  ).catch(() => null);

  if (params.client && !params.isSync) {
    void propagateSanction(params.client, params.guildId, sanction).catch(() => null);
    void altAccountService.synchronizeSanction({
      client: params.client,
      guildId: params.guildId,
      originalUserId: params.target.id,
      type: SanctionType.WARN,
      moderator: params.moderator,
      reason: params.reason
    }).catch(() => null);
  }

  return sanction;
}

export async function registerKickSanction(params: {
  guildId: string;
  target: Target;
  moderator: Actor;
  reason: string;
  client?: Client;
  isSync?: boolean;
}) {
  const existing = await findRecentSanction({
    guildId: params.guildId,
    type: SanctionType.KICK,
    targetUserId: params.target.id,
    moderatorUserId: params.moderator.id,
  });

  if (existing) return existing;

  const sanction = await prisma.sanction.create({
    data: {
      guildId: params.guildId,
      type: SanctionType.KICK,
      status: SanctionStatus.RESOLVED,
      targetUserId: params.target.id,
      targetTag: params.target.tag,
      moderatorUserId: params.moderator.id,
      moderatorTag: params.moderator.tag,
      reason: params.reason,
      resolvedAt: new Date(),
      resolutionNote: 'Exclusion exécutée.'
    }
  });

  void incrementModerationStats(params.guildId, SanctionType.KICK).catch(() => null);

  void touchSanctionTargetIdentity({
    guildId: params.guildId,
    userId: params.target.id,
    userTag: params.target.tag,
  }).catch(() => null);

  await emitSanctionReportReminder({
    guildId: sanction.guildId,
    sanctionId: sanction.id,
    sanctionType: sanction.type,
    targetTag: sanction.targetTag,
    targetUserId: sanction.targetUserId,
    moderatorTag: sanction.moderatorTag,
    moderatorUserId: sanction.moderatorUserId,
  });

  void notifyStaffOfSanction(params.guildId, sanction).catch(() => null);

  if (params.client && !params.isSync) {
    void propagateSanction(params.client, params.guildId, sanction).catch(() => null);
    void altAccountService.synchronizeSanction({
      client: params.client,
      guildId: params.guildId,
      originalUserId: params.target.id,
      type: SanctionType.KICK,
      moderator: params.moderator,
      reason: params.reason
    }).catch(() => null);
  }

  return sanction;
}

export async function registerBanSanction(params: {
  guildId: string;
  target: Target;
  moderator: Actor;
  reason: string;
  temporaryDurationMs?: number;
  client?: Client;
  isSync?: boolean;
}) {
  const isTemporary = Boolean(params.temporaryDurationMs && params.temporaryDurationMs > 0);
  const sanctionType = isTemporary ? SanctionType.TEMP_BAN : SanctionType.BAN;
  const existing = await findRecentSanction({
    guildId: params.guildId,
    type: sanctionType,
    targetUserId: params.target.id,
    moderatorUserId: params.moderator.id,
  });

  if (existing) return existing;

  const now = new Date();
  const expiresAt = isTemporary ? new Date(now.getTime() + (params.temporaryDurationMs as number)) : null;

  const sanction = await prisma.sanction.create({
    data: {
      guildId: params.guildId,
      type: sanctionType,
      status: isTemporary ? SanctionStatus.ACTIVE : SanctionStatus.RESOLVED,
      targetUserId: params.target.id,
      targetTag: params.target.tag,
      moderatorUserId: params.moderator.id,
      moderatorTag: params.moderator.tag,
      reason: params.reason,
      durationSeconds: isTemporary ? Math.floor((params.temporaryDurationMs as number) / 1000) : null,
      expiresAt,
      nextActionAt: expiresAt,
      resolvedAt: isTemporary ? null : now,
      resolutionNote: isTemporary ? 'Bannissement temporaire actif.' : 'Bannissement définitif exécuté.'
    }
  });

  void incrementModerationStats(params.guildId, sanctionType).catch(() => null);

  void touchSanctionTargetIdentity({
    guildId: params.guildId,
    userId: params.target.id,
    userTag: params.target.tag,
  }).catch(() => null);

  await emitSanctionReportReminder({
    guildId: sanction.guildId,
    sanctionId: sanction.id,
    sanctionType: sanction.type,
    targetTag: sanction.targetTag,
    targetUserId: sanction.targetUserId,
    moderatorTag: sanction.moderatorTag,
    moderatorUserId: sanction.moderatorUserId,
  });

  void notifyStaffOfSanction(params.guildId, sanction).catch(() => null);

  if (params.client && !params.isSync) {
    void propagateSanction(params.client, params.guildId, sanction).catch(() => null);
    void altAccountService.synchronizeSanction({
      client: params.client,
      guildId: params.guildId,
      originalUserId: params.target.id,
      type: sanctionType,
      moderator: params.moderator,
      reason: params.reason,
      durationMs: params.temporaryDurationMs
    }).catch(() => null);
  }

  return sanction;
}

export async function registerTimeoutSanction(params: {
  guildId: string;
  target: Target;
  moderator: Actor;
  reason: string;
  durationMs: number;
  member: GuildMember;
  client?: Client;
  isSync?: boolean;
}) {
  const existing = await findRecentSanction({
    guildId: params.guildId,
    type: SanctionType.TIMEOUT,
    targetUserId: params.target.id,
    moderatorUserId: params.moderator.id,
  });

  if (existing) return existing;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + params.durationMs);
  const chunkMs = Math.min(params.durationMs, MAX_DISCORD_TIMEOUT_MS);

  await applyTimeoutChunk(params.member, chunkMs, buildActionReason(params.reason, params.moderator.tag));

  const sanction = await prisma.sanction.create({
    data: {
      guildId: params.guildId,
      type: SanctionType.TIMEOUT,
      status: SanctionStatus.ACTIVE,
      targetUserId: params.target.id,
      targetTag: params.target.tag,
      moderatorUserId: params.moderator.id,
      moderatorTag: params.moderator.tag,
      reason: params.reason,
      durationSeconds: Math.floor(params.durationMs / 1000),
      expiresAt,
      nextActionAt: nextRenewalAt(now, chunkMs),
      resolutionNote: 'Timeout actif.'
    }
  });

  void incrementModerationStats(params.guildId, SanctionType.TIMEOUT).catch(() => null);

  void touchSanctionTargetIdentity({
    guildId: params.guildId,
    userId: params.target.id,
    userTag: params.target.tag,
  }).catch(() => null);

  await emitSanctionReportReminder({
    guildId: sanction.guildId,
    sanctionId: sanction.id,
    sanctionType: sanction.type,
    targetTag: sanction.targetTag,
    targetUserId: sanction.targetUserId,
    moderatorTag: sanction.moderatorTag,
    moderatorUserId: sanction.moderatorUserId,
  });

  void notifyStaffOfSanction(params.guildId, sanction).catch(() => null);

  if (params.client && !params.isSync) {
    void propagateSanction(params.client, params.guildId, sanction).catch(() => null);
    void altAccountService.synchronizeSanction({
      client: params.client,
      guildId: params.guildId,
      originalUserId: params.target.id,
      type: SanctionType.TIMEOUT,
      moderator: params.moderator,
      reason: params.reason,
      durationMs: params.durationMs
    }).catch(() => null);
  }

  return sanction;
}

export async function registerObservedTimeoutSanction(params: {
  guildId: string;
  target: Target;
  moderator: Actor;
  reason: string;
  expiresAt: Date;
}) {
  const existing = await findRecentSanction({
    guildId: params.guildId,
    type: SanctionType.TIMEOUT,
    targetUserId: params.target.id,
    moderatorUserId: params.moderator.id,
  });

  if (existing) return existing;

  const now = new Date();
  const remainingMs = Math.max(1000, params.expiresAt.getTime() - now.getTime());
  const chunkMs = Math.min(remainingMs, MAX_DISCORD_TIMEOUT_MS);

  const sanction = await prisma.sanction.create({
    data: {
      guildId: params.guildId,
      type: SanctionType.TIMEOUT,
      status: SanctionStatus.ACTIVE,
      targetUserId: params.target.id,
      targetTag: params.target.tag,
      moderatorUserId: params.moderator.id,
      moderatorTag: params.moderator.tag,
      reason: params.reason,
      durationSeconds: Math.floor(remainingMs / 1000),
      expiresAt: params.expiresAt,
      nextActionAt: nextRenewalAt(now, chunkMs),
      resolutionNote: 'Timeout observé et synchronisé.'
    }
  });

  void incrementModerationStats(params.guildId, SanctionType.TIMEOUT).catch(() => null);

  await emitSanctionReportReminder({
    guildId: sanction.guildId,
    sanctionId: sanction.id,
    sanctionType: sanction.type,
    targetTag: sanction.targetTag,
    targetUserId: sanction.targetUserId,
    moderatorTag: sanction.moderatorTag,
    moderatorUserId: sanction.moderatorUserId,
  });

  return sanction;
}

export async function processScheduledSanctions(client: Client): Promise<void> {
  try {
    await processTimeoutRenewals(client);
    await processTempBans(client);

    hasLoggedSanctionSchemaMismatch = false;
  } catch (error) {
    if (!isSanctionsSchemaMismatchError(error)) {
      throw error;
    }

    if (!hasLoggedSanctionSchemaMismatch) {
      hasLoggedSanctionSchemaMismatch = true;
      logger.error(
        'Sanctions',
        'Schéma Prisma des sanctions non synchronisé (table/colonne manquante). Lancez `bun db:push` (ou `bun db:migrate`) puis redémarrez le bot.'
      );
    }
  }
}

async function processTimeoutRenewals(client: Client): Promise<void> {
  const now = new Date();

  const sanctions = await prisma.sanction.findMany({
    where: {
      type: SanctionType.TIMEOUT,
      status: SanctionStatus.ACTIVE,
      expiresAt: { not: null },
      nextActionAt: { lte: now }
    },
    orderBy: { nextActionAt: 'asc' },
    take: 50
  });

  for (const sanction of sanctions) {
    const expiresAt = sanction.expiresAt;
    if (!expiresAt) continue;

    try {
      const guild = await client.guilds.fetch(sanction.guildId).catch(() => null);
      if (!guild) {
        await prisma.sanction.update({
          where: { id: sanction.id },
          data: {
            status: SanctionStatus.FAILED,
            resolvedAt: new Date(),
            resolutionNote: 'Serveur introuvable pour renouveler le timeout.'
          }
        });
        continue;
      }

      const member = await guild.members.fetch(sanction.targetUserId).catch(() => null);
      if (!member) {
        await prisma.sanction.update({
          where: { id: sanction.id },
          data: {
            status: SanctionStatus.FAILED,
            resolvedAt: new Date(),
            resolutionNote: 'Membre introuvable pour renouveler le timeout.'
          }
        });
        continue;
      }

      const remainingMs = expiresAt.getTime() - now.getTime();
      if (remainingMs <= 0) {
        await member.timeout(null, 'Timeout expiré automatiquement').catch(() => null);
        await prisma.sanction.update({
          where: { id: sanction.id },
          data: {
            status: SanctionStatus.RESOLVED,
            resolvedAt: new Date(),
            nextActionAt: null,
            resolutionNote: 'Timeout expiré automatiquement.'
          }
        });
        continue;
      }

      const chunkMs = Math.min(remainingMs, MAX_DISCORD_TIMEOUT_MS);
      await applyTimeoutChunk(member, chunkMs, buildActionReason(sanction.reason, sanction.moderatorTag ?? sanction.moderatorUserId));

      const refreshedNow = new Date();
      const refreshedRemainingMs = expiresAt.getTime() - refreshedNow.getTime();
      const refreshedChunk = Math.min(Math.max(1000, refreshedRemainingMs), MAX_DISCORD_TIMEOUT_MS);

      await prisma.sanction.update({
        where: { id: sanction.id },
        data: {
          nextActionAt: nextRenewalAt(refreshedNow, refreshedChunk),
          resolutionNote: refreshedRemainingMs > MAX_DISCORD_TIMEOUT_MS
            ? 'Timeout prolongé automatiquement.'
            : 'Dernière fenêtre de timeout en cours.'
        }
      });
    } catch (error) {
      logger.error('Sanctions', `Erreur renouvellement timeout ${sanction.id}:`, error);
      await prisma.sanction.update({
        where: { id: sanction.id },
        data: {
          status: SanctionStatus.FAILED,
          resolvedAt: new Date(),
          nextActionAt: null,
          resolutionNote: `Échec du renouvellement du timeout: ${error instanceof Error ? error.message : 'erreur inconnue'}`
        }
      }).catch(() => null);
    }
  }
}

async function processTempBans(client: Client): Promise<void> {
  const now = new Date();

  const sanctions = await prisma.sanction.findMany({
    where: {
      type: SanctionType.TEMP_BAN,
      status: SanctionStatus.ACTIVE,
      expiresAt: { lte: now }
    },
    orderBy: { expiresAt: 'asc' },
    take: 50
  });

  for (const sanction of sanctions) {
    try {
      const guild = await client.guilds.fetch(sanction.guildId).catch(() => null);
      if (!guild) {
        await prisma.sanction.update({
          where: { id: sanction.id },
          data: {
            status: SanctionStatus.FAILED,
            resolvedAt: new Date(),
            nextActionAt: null,
            resolutionNote: 'Serveur introuvable pour débannir automatiquement.'
          }
        });
        continue;
      }

      await guild.members.unban(sanction.targetUserId, 'Tempban expiré automatiquement').catch(() => null);

      await prisma.sanction.update({
        where: { id: sanction.id },
        data: {
          status: SanctionStatus.RESOLVED,
          resolvedAt: new Date(),
          nextActionAt: null,
          resolutionNote: 'Tempban expiré et levé automatiquement.'
        }
      });
    } catch (error) {
      logger.error('Sanctions', `Erreur de levée tempban ${sanction.id}:`, error);
      await prisma.sanction.update({
        where: { id: sanction.id },
        data: {
          status: SanctionStatus.FAILED,
          resolvedAt: new Date(),
          nextActionAt: null,
          resolutionNote: `Échec de levée du tempban: ${error instanceof Error ? error.message : 'erreur inconnue'}`
        }
      }).catch(() => null);
    }
  }
}

export async function countWarns(guildId: string, targetUserId: string): Promise<number> {
  return prisma.sanction.count({
    where: {
      guildId,
      targetUserId,
      type: SanctionType.WARN
    }
  });
}

export interface ListedSanction {
  id: string;
  type: SanctionType;
  status: SanctionStatus;
  reason: string;
  durationSeconds: number | null;
  expiresAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
  moderatorTag: string | null;
  moderatorUserId: string;
}

export async function listSanctionsByMember(params: {
  guildId: string;
  targetUserId: string;
  page: number;
  pageSize: number;
}): Promise<{ total: number; sanctions: ListedSanction[] }> {
  const page = Math.max(0, params.page);
  const pageSize = Math.max(1, Math.min(20, params.pageSize));

  const [total, sanctions] = await prisma.$transaction([
    prisma.sanction.count({
      where: {
        guildId: params.guildId,
        targetUserId: params.targetUserId,
      },
    }),
    prisma.sanction.findMany({
      where: {
        guildId: params.guildId,
        targetUserId: params.targetUserId,
      },
      orderBy: { createdAt: 'desc' },
      skip: page * pageSize,
      take: pageSize,
      select: {
        id: true,
        type: true,
        status: true,
        reason: true,
        durationSeconds: true,
        expiresAt: true,
        resolvedAt: true,
        createdAt: true,
        moderatorTag: true,
        moderatorUserId: true,
      },
    }),
  ]);

  return { total, sanctions };
}

export async function getSanctionTypeBreakdown(guildId: string, targetUserId: string): Promise<Record<SanctionType, number>> {
  const rows = await prisma.sanction.groupBy({
    by: ['type'],
    where: {
      guildId,
      targetUserId,
    },
    _count: {
      type: true,
    },
  });

  const breakdown: Record<SanctionType, number> = {
    WARN: 0,
    KICK: 0,
    TIMEOUT: 0,
    TEMP_BAN: 0,
    BAN: 0,
  };

  for (const row of rows) {
    breakdown[row.type] = row._count.type;
  }

  return breakdown;
}

export async function createSanctionReport(params: {
  guildId: string;
  sanctionId?: string | null;
  staffPseudo: string;
  incidentAt: Date;
  memberPseudo: string;
  memberReference: string;
  sanctionType: SanctionType;
  sanctionDurationLabel?: string | null;
  brokenRules: string;
  detailedReason: string;
  evidenceLinks: string[];
  additionalNotes?: string | null;
  createdByUserId: string;
  createdByTag?: string | null;
}) {
  return prisma.sanctionReport.create({
    data: {
      guildId: params.guildId,
      sanctionId: params.sanctionId ?? null,
      staffPseudo: params.staffPseudo,
      incidentAt: params.incidentAt,
      memberPseudo: params.memberPseudo,
      memberReference: params.memberReference,
      sanctionType: params.sanctionType,
      sanctionDurationLabel: params.sanctionDurationLabel ?? null,
      brokenRules: params.brokenRules,
      detailedReason: params.detailedReason,
      evidenceLinks: params.evidenceLinks,
      additionalNotes: params.additionalNotes ?? null,
      createdByUserId: params.createdByUserId,
      createdByTag: params.createdByTag ?? null,
    }
  });
}

export async function runGuildBan(guild: Guild, userId: string, reason: string): Promise<void> {
  await guild.members.ban(userId, { reason, deleteMessageSeconds: 0 });
}

export async function checkMissingReports() {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  
  // Trouver les sanctions sans rapport (SanctionReport) créées il y a plus de 3 jours
  // On filtre les sanctions qui nécessitent un rapport (BAN, KICK, TIMEOUT)
  const sanctions = await prisma.sanction.findMany({
    where: {
      createdAt: { lte: threeDaysAgo },
      type: { in: [SanctionType.BAN, SanctionType.TEMP_BAN, SanctionType.KICK, SanctionType.TIMEOUT] },
      reports: { none: {} }
    },
    include: {
      reports: true
    }
  });

  for (const sanction of sanctions) {
    // Notifier le modérateur à nouveau
    await createNotification(
      sanction.guildId,
      sanction.moderatorUserId,
      'RAPPEL : Rapport manquant (3 jours+)',
      `Le rapport pour la sanction sur ${sanction.targetTag} est toujours manquant après 3 jours.`,
      'ERROR',
      '/sanctions'
    ).catch(() => null);

    // Notifier le supérieur du modérateur
    const moderator = await prisma.staffMember.findUnique({
      where: { guildId_userId: { guildId: sanction.guildId, userId: sanction.moderatorUserId } }
    });

    if (moderator && moderator.grade !== 'Staff') {
      // On cherche les managers/admins pour les alerter
      const managers = await prisma.staffMember.findMany({
        where: {
          guildId: sanction.guildId,
          grade: { in: ['Manager', 'Admin', 'Administrateur', 'Direction', 'Fondateur'] }
        }
      });

      for (const manager of managers) {
        if (manager.userId === sanction.moderatorUserId) continue;

        await createNotification(
          sanction.guildId,
          manager.userId,
          'Alerte : Rapport non rempli par un staff',
          `Le modérateur ${sanction.moderatorTag} n'a pas rempli le rapport pour sa sanction sur ${sanction.targetTag} depuis 3 jours.`,
          'ERROR',
          `/members/${sanction.targetUserId}`
        ).catch(() => null);
      }
    }
  }
}
