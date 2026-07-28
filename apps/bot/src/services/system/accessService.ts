/**
 * accessService.ts
 *
 * Gestion de l'accès **à durée limitée** d'un serveur : périodes d'essai et,
 * plus tard, abonnements payants.
 *
 * L'activation historique (code → `guild.activated = true`) reste inchangée et
 * correspond à `accessType = 'PERMANENT'`. Ce service ajoute par-dessus une
 * couche générique : un accès porte un type, une date de fin, des rappels déjà
 * envoyés. Tout ce qui accorde du temps d'accès — code d'activation « essai »,
 * geste commercial depuis le dashboard, futur webhook de paiement — passe par
 * `grantAccess` / `extendAccess` et hérite gratuitement des rappels, de
 * l'expiration automatique et des embeds.
 *
 * Le cycle de vie est balayé une fois par jour par un cron (`access-lifecycle`).
 */

import {
  ChannelType,
  PermissionFlagsBits,
  type Client,
  type Guild,
  type GuildBasedChannel,
} from 'discord.js';
import { v2Message } from '@arcscord/components';
import prisma from '../../utils/db.js';
import { logger } from '../../utils/logger.js';
import { kotboContainer, COLORS_RAW } from '../../utils/embeds.js';
import { E } from '../../utils/emojis.js';
import { resolveGuildLocale } from '../../utils/i18n.js';
import * as m from '../../lib/paraglide/messages.js';

export type AccessType = 'PERMANENT' | 'TRIAL' | 'SUBSCRIPTION';

const MS_PER_DAY = 86_400_000;

/** Colonnes d'accès d'une guilde, telles que manipulées par ce service. */
export interface AccessFields {
  accessType: AccessType;
  accessExpiresAt: Date | null;
  accessExpiredAt: Date | null;
  accessRemindersSent: number[];
}

export interface AccessStatus extends AccessFields {
  guildId: string;
  activated: boolean;
  /** Jours restants arrondis au supérieur ; null si l'accès n'expire pas. */
  daysLeft: number | null;
  /** true si la date de fin est dépassée (que l'expiration ait été traitée ou non). */
  expired: boolean;
}

// ─────────────────────────────────────────────────────────────
// Calculs purs (testables sans base ni client Discord)
// ─────────────────────────────────────────────────────────────

/** Date de fin d'un accès de `durationDays` jours démarré à `from`. */
export function computeExpiry(durationDays: number, from: Date = new Date()): Date {
  return new Date(from.getTime() + durationDays * MS_PER_DAY);
}

/** Jours restants avant `expiresAt`, arrondis au supérieur (0 si déjà dépassé). */
export function daysUntil(expiresAt: Date, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / MS_PER_DAY));
}

/**
 * Paliers de rappel (exprimés en jours restants) pour une période de
 * `durationDays` jours : mi-parcours, J-3 et J-1.
 *
 * Les paliers hors de la période sont écartés, ce qui rend la cadence
 * auto-adaptative : 15 jours → [7, 3, 1], 7 jours → [3, 1], 2 jours → [1],
 * 1 jour → aucun rappel (seul le message de fin est envoyé).
 */
export function reminderMilestones(durationDays: number): number[] {
  const candidates = [Math.floor(durationDays / 2), 3, 1];
  const kept = candidates.filter((d) => d >= 1 && d < durationDays);
  return [...new Set(kept)].sort((a, b) => b - a);
}

/**
 * Palier de rappel à envoyer maintenant, et paliers à marquer comme traités.
 *
 * On retient le **plus petit** palier non envoyé encore atteignable : si le bot
 * a été hors ligne plusieurs jours, on n'envoie pas un « plus que 7 jours »
 * alors qu'il n'en reste que 2 — on envoie le bon message et on classe les
 * paliers dépassés comme déjà traités.
 */
export function dueReminder(
  daysLeft: number,
  milestones: number[],
  alreadySent: number[],
): { milestone: number | null; sent: number[] } {
  const reached = milestones.filter((ms) => ms >= daysLeft);
  const pending = reached.filter((ms) => !alreadySent.includes(ms));
  const milestone = pending.length > 0 ? Math.min(...pending) : null;
  const sent = [...new Set([...alreadySent, ...reached])].sort((a, b) => b - a);
  return { milestone, sent };
}

/** Garde-fou : au-delà, mieux vaut un accès permanent qu'une date absurde. */
export const MAX_ACCESS_DURATION_DAYS = 3650;

/**
 * Valide une demande d'accès venue de l'extérieur (API admin, futur webhook de
 * paiement) et la ramène à un couple type/durée exploitable.
 */
export function normalizeAccessGrant(
  rawType: unknown,
  rawDays: unknown,
): { accessType: AccessType; durationDays: number | null } | { error: string } {
  const type = typeof rawType === 'string' ? rawType.toUpperCase() : 'PERMANENT';

  if (type === 'PERMANENT') return { accessType: 'PERMANENT', durationDays: null };
  if (type !== 'TRIAL' && type !== 'SUBSCRIPTION') {
    return { error: "Type d'accès invalide (PERMANENT, TRIAL ou SUBSCRIPTION attendu)." };
  }

  const days = typeof rawDays === 'number' ? rawDays : Number(rawDays);
  if (!Number.isInteger(days) || days < 1 || days > MAX_ACCESS_DURATION_DAYS) {
    return { error: `La durée doit être un nombre entier de jours entre 1 et ${MAX_ACCESS_DURATION_DAYS}.` };
  }

  return { accessType: type, durationDays: days };
}

/**
 * Colonnes à écrire pour accorder un accès. Exposé à part pour pouvoir être
 * injecté dans un `upsert` existant (cf. `activateGuild`) sans écriture en plus.
 */
export function buildAccessFields(
  type: AccessType,
  durationDays: number | null | undefined,
  from: Date = new Date(),
): AccessFields {
  if (type === 'PERMANENT' || !durationDays || durationDays <= 0) {
    return {
      accessType: 'PERMANENT',
      accessExpiresAt: null,
      accessExpiredAt: null,
      accessRemindersSent: [],
    };
  }

  return {
    accessType: type,
    accessExpiresAt: computeExpiry(durationDays, from),
    accessExpiredAt: null,
    accessRemindersSent: [],
  };
}

// ─────────────────────────────────────────────────────────────
// Lecture / écriture de l'accès
// ─────────────────────────────────────────────────────────────

function toStatus(guildId: string, row: {
  activated: boolean;
  accessType: string;
  accessExpiresAt: Date | null;
  accessExpiredAt: Date | null;
  accessRemindersSent: number[];
}, now: Date = new Date()): AccessStatus {
  return {
    guildId,
    activated: row.activated,
    accessType: row.accessType as AccessType,
    accessExpiresAt: row.accessExpiresAt,
    accessExpiredAt: row.accessExpiredAt,
    accessRemindersSent: row.accessRemindersSent,
    daysLeft: row.accessExpiresAt ? daysUntil(row.accessExpiresAt, now) : null,
    expired: row.accessExpiresAt ? row.accessExpiresAt.getTime() <= now.getTime() : false,
  };
}

/** État d'accès d'un serveur, ou null s'il n'a jamais été enregistré. */
export async function getAccessStatus(guildId: string): Promise<AccessStatus | null> {
  const row = await prisma.guild.findUnique({
    where: { id: guildId },
    select: {
      activated: true,
      accessType: true,
      accessExpiresAt: true,
      accessExpiredAt: true,
      accessRemindersSent: true,
    },
  });

  return row ? toStatus(guildId, row) : null;
}

/**
 * Accorde (ou remplace) l'accès d'un serveur déjà activé.
 *
 * Point d'entrée pour les couches externes : un module de paiement appelle
 * `grantAccess(guildId, { type: 'SUBSCRIPTION', durationDays: 30 })` et tout le
 * cycle de vie (rappels, expiration, embeds) suit sans code supplémentaire.
 */
export async function grantAccess(
  guildId: string,
  options: { type: AccessType; durationDays?: number | null; from?: Date },
): Promise<AccessStatus> {
  const fields = buildAccessFields(options.type, options.durationDays, options.from);

  const row = await prisma.guild.update({
    where: { id: guildId },
    data: fields,
    select: {
      activated: true,
      accessType: true,
      accessExpiresAt: true,
      accessExpiredAt: true,
      accessRemindersSent: true,
    },
  });

  logger.info(
    'Access',
    `Accès ${fields.accessType} accordé à ${guildId}` +
      (fields.accessExpiresAt ? ` jusqu'au ${fields.accessExpiresAt.toISOString()}.` : ' (sans expiration).'),
  );

  return toStatus(guildId, row);
}

/**
 * Prolonge l'accès de `days` jours. La prolongation part de la date de fin
 * existante si elle est encore dans le futur (on ne perd pas les jours restants),
 * sinon de maintenant. Les rappels déjà envoyés sont remis à zéro pour que la
 * nouvelle période notifie à nouveau.
 *
 * Un accès PERMANENT n'est jamais dégradé : on le laisse tel quel.
 */
export async function extendAccess(
  guildId: string,
  days: number,
  options: { type?: AccessType } = {},
): Promise<AccessStatus | null> {
  if (days <= 0) throw new Error('La durée de prolongation doit être positive.');

  const current = await getAccessStatus(guildId);
  if (!current) return null;
  if (current.accessType === 'PERMANENT' && !options.type) return current;

  const now = new Date();
  const base =
    current.accessExpiresAt && current.accessExpiresAt.getTime() > now.getTime()
      ? current.accessExpiresAt
      : now;

  const row = await prisma.guild.update({
    where: { id: guildId },
    data: {
      accessType: options.type ?? current.accessType,
      accessExpiresAt: computeExpiry(days, base),
      accessExpiredAt: null,
      accessRemindersSent: [],
    },
    select: {
      activated: true,
      accessType: true,
      accessExpiresAt: true,
      accessExpiredAt: true,
      accessRemindersSent: true,
    },
  });

  logger.info('Access', `Accès de ${guildId} prolongé de ${days} jour(s) → ${row.accessExpiresAt?.toISOString()}.`);
  return toStatus(guildId, row);
}

// ─────────────────────────────────────────────────────────────
// Notifications
// ─────────────────────────────────────────────────────────────

function canSendIn(guild: Guild, channel: GuildBasedChannel | undefined): boolean {
  if (!channel) return false;
  if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) return false;
  const me = guild.members.me;
  if (!me) return false;
  return channel.permissionsFor(me)?.has(PermissionFlagsBits.SendMessages) ?? false;
}

/**
 * Salon où publier les messages de cycle de vie : salon de broadcast configuré,
 * sinon salon de logs, sinon salon système Discord, sinon le premier salon
 * textuel où le bot peut écrire.
 */
export async function resolveNoticeChannel(guild: Guild): Promise<GuildBasedChannel | null> {
  const dbGuild = await prisma.guild.findUnique({
    where: { id: guild.id },
    select: { broadcastChannelId: true, logChannelId: true },
  });

  const preferred = [dbGuild?.broadcastChannelId, dbGuild?.logChannelId, guild.systemChannelId];
  for (const channelId of preferred) {
    if (!channelId) continue;
    const channel = guild.channels.cache.get(channelId);
    if (canSendIn(guild, channel)) return channel!;
  }

  return guild.channels.cache.find((c) => canSendIn(guild, c)) ?? null;
}

interface NoticeContent {
  color: number;
  title: string;
  body: string;
  footer: string;
}

async function publishNotice(guild: Guild, content: NoticeContent): Promise<boolean> {
  const channel = await resolveNoticeChannel(guild);
  if (!channel || !channel.isTextBased()) {
    logger.warn('Access', `Aucun salon disponible pour notifier ${guild.id}.`);
    return false;
  }

  try {
    await channel.send(
      v2Message(
        kotboContainer({
          color: content.color,
          title: content.title,
          fields: [content.body],
          footerTitle: content.footer,
        }),
      ),
    );
    return true;
  } catch (err) {
    logger.warn('Access', `Échec de l'envoi de la notification d'accès dans ${guild.id}:`, err);
    return false;
  }
}

/** Le message de fin part aussi en MP au propriétaire : c'est lui le décideur. */
async function dmOwner(guild: Guild, content: NoticeContent): Promise<void> {
  try {
    const owner = await guild.fetchOwner();
    await owner.send(
      v2Message(
        kotboContainer({
          color: content.color,
          title: content.title,
          fields: [content.body],
          footerTitle: content.footer,
        }),
      ),
    );
  } catch {
    // MP fermés ou propriétaire injoignable : le message en salon suffit.
  }
}

/** `<t:…:F>` — Discord affiche la date dans le fuseau de chaque lecteur. */
function discordDate(date: Date, style: 'F' | 'R' = 'F'): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}

async function trialStartedContent(guildId: string, expiresAt: Date, days: number): Promise<NoticeContent> {
  const locale = await resolveGuildLocale(guildId);
  return {
    color: COLORS_RAW.success,
    title: `${E.fire} ${m.access_trial_started_title({ days: String(days) }, { locale })}`,
    body: m.access_trial_started_desc(
      { days: String(days), date: discordDate(expiresAt), relative: discordDate(expiresAt, 'R') },
      { locale },
    ),
    footer: m.access_notice_footer({}, { locale }),
  };
}

async function reminderContent(
  guildId: string,
  type: AccessType,
  expiresAt: Date,
  daysLeft: number,
): Promise<NoticeContent> {
  const locale = await resolveGuildLocale(guildId);
  const args = { days: String(daysLeft), date: discordDate(expiresAt), relative: discordDate(expiresAt, 'R') };
  return {
    color: COLORS_RAW.warning,
    title: `${E.clock} ${
      type === 'SUBSCRIPTION'
        ? m.access_sub_reminder_title({ days: String(daysLeft) }, { locale })
        : m.access_trial_reminder_title({ days: String(daysLeft) }, { locale })
    }`,
    body:
      type === 'SUBSCRIPTION'
        ? m.access_sub_reminder_desc(args, { locale })
        : m.access_trial_reminder_desc(args, { locale }),
    footer: m.access_notice_footer({}, { locale }),
  };
}

async function endedContent(guildId: string, type: AccessType, guildName: string): Promise<NoticeContent> {
  const locale = await resolveGuildLocale(guildId);
  return {
    color: COLORS_RAW.danger,
    title: `${E.warning} ${
      type === 'SUBSCRIPTION'
        ? m.access_sub_ended_title({}, { locale })
        : m.access_trial_ended_title({}, { locale })
    }`,
    body:
      type === 'SUBSCRIPTION'
        ? m.access_sub_ended_desc({ guild: guildName }, { locale })
        : m.access_trial_ended_desc({ guild: guildName }, { locale }),
    footer: m.access_notice_footer({}, { locale }),
  };
}

/**
 * Annonce publiquement le démarrage d'une période d'essai. Appelé juste après
 * l'activation par un code « essai ».
 */
export async function announceTrialStart(
  client: Client,
  guildId: string,
  expiresAt: Date,
  durationDays: number,
): Promise<void> {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  const content = await trialStartedContent(guildId, expiresAt, durationDays);
  await publishNotice(guild, content);
}

// ─────────────────────────────────────────────────────────────
// Cycle de vie (cron quotidien)
// ─────────────────────────────────────────────────────────────

/**
 * Termine l'accès d'un serveur : désactivation complète (comme un serveur
 * jamais activé) puis message de fin en salon **et** en MP au propriétaire.
 *
 * Contrairement à une désactivation manuelle, le code consommé n'est pas
 * recyclé : un essai arrivé à terme ne doit jamais pouvoir être rejoué.
 */
export async function expireAccess(client: Client, guildId: string): Promise<void> {
  const status = await getAccessStatus(guildId);
  if (!status || status.accessExpiredAt) return;

  const { deactivateGuild } = await import('../../utils/activation.js');
  await deactivateGuild(guildId, { recycleCode: false });

  await prisma.guild.update({
    where: { id: guildId },
    data: { accessExpiredAt: new Date() },
  });

  logger.info('Access', `Accès ${status.accessType} expiré pour ${guildId} : serveur désactivé.`);

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  const content = await endedContent(guildId, status.accessType, guild.name);
  await publishNotice(guild, content);
  await dmOwner(guild, content);
}

async function processReminder(
  client: Client,
  guildId: string,
  status: AccessStatus,
  durationDays: number,
): Promise<void> {
  if (!status.accessExpiresAt || status.daysLeft === null) return;

  const { milestone, sent } = dueReminder(
    status.daysLeft,
    reminderMilestones(durationDays),
    status.accessRemindersSent,
  );

  if (sent.length !== status.accessRemindersSent.length) {
    await prisma.guild.update({ where: { id: guildId }, data: { accessRemindersSent: sent } });
  }

  if (milestone === null) return;

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  const content = await reminderContent(guildId, status.accessType, status.accessExpiresAt, milestone);
  await publishNotice(guild, content);
  logger.info('Access', `Rappel J-${milestone} envoyé à ${guildId}.`);
}

/**
 * Durée initiale d'une période, reconstituée depuis le code d'activation
 * consommé. Sert à choisir les paliers de rappel adaptés à la période réelle.
 */
async function resolveDurationDays(guildId: string, status: AccessStatus): Promise<number> {
  const code = await prisma.activationCode.findFirst({
    where: { usedByGuildId: guildId },
    select: { durationDays: true },
  });
  if (code?.durationDays && code.durationDays > 0) return code.durationDays;

  // Accès accordé hors code (geste commercial, paiement) : on déduit une durée
  // plausible du temps restant pour garder des paliers cohérents.
  return Math.max(status.daysLeft ?? 1, 1);
}

/**
 * Balayage quotidien : envoie les rappels dus et coupe les accès arrivés à
 * échéance. Idempotent — un double passage ne renvoie rien deux fois.
 */
export async function runAccessLifecycleCheck(client: Client): Promise<void> {
  const now = new Date();

  const candidates = await prisma.guild.findMany({
    where: {
      activated: true,
      activatedViaStaffLink: false,
      accessExpiresAt: { not: null },
      accessExpiredAt: null,
    },
    select: {
      id: true,
      activated: true,
      accessType: true,
      accessExpiresAt: true,
      accessExpiredAt: true,
      accessRemindersSent: true,
    },
  });

  if (candidates.length === 0) return;
  logger.debug('Access', `${candidates.length} serveur(s) à accès limité à vérifier.`);

  for (const row of candidates) {
    const status = toStatus(row.id, row, now);
    try {
      if (status.expired) {
        await expireAccess(client, row.id);
        continue;
      }

      const durationDays = await resolveDurationDays(row.id, status);
      await processReminder(client, row.id, status, durationDays);
    } catch (err) {
      logger.error('Access', `Erreur de traitement du cycle de vie pour ${row.id}:`, err);
    }
  }
}
