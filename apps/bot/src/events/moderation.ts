import { AuditLogEvent, Events, type Client, type GuildAuditLogsEntry } from 'discord.js';
import { registerBanSanction, registerKickSanction, registerObservedTimeoutSanction } from '../services/moderation/sanctionService.js';
import { logger } from '../utils/logger.js';

type Actor = {
  id: string;
  tag: string;
};

type Target = {
  id: string;
  tag: string;
};

const MANUAL_REASON_BY_ACTION: Record<'KICK' | 'BAN' | 'TIMEOUT', string> = {
  KICK: 'Kick appliqué manuellement via Discord (hors commande bot).',
  BAN: 'Ban appliqué manuellement via Discord (hors commande bot).',
  TIMEOUT: 'Timeout appliqué manuellement via Discord (hors commande bot).',
};

function readTargetId(entry: GuildAuditLogsEntry): string | null {
  if (typeof entry.targetId === 'string' && entry.targetId.length > 0) {
    return entry.targetId;
  }

  const target = entry.target as { id?: string } | null;
  if (target?.id && target.id.length > 0) {
    return target.id;
  }

  return null;
}

function readTimeoutUntil(entry: GuildAuditLogsEntry): Date | null {
  for (const change of entry.changes) {
    if (change.key !== 'communication_disabled_until') continue;

    const value = change.new;
    const parsed =
      typeof value === 'string' || typeof value === 'number'
        ? new Date(value)
        : null;

    if (!parsed || Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed;
  }

  return null;
}

async function resolveUserTag(client: Client, userId: string, fallback: string): Promise<string> {
  try {
    const user = client.users.cache.get(userId) ?? await client.users.fetch(userId);
    return user.tag || fallback;
  } catch {
    return fallback;
  }
}

function userFallbackLabel(user: { tag?: string | null; username?: string | null } | null, userId: string): string {
  if (!user) return `Utilisateur ${userId}`;
  return user.tag || user.username || `Utilisateur ${userId}`;
}

export function registerModerationAuditListener(client: Client): void {
  client.on(Events.GuildAuditLogEntryCreate, async (entry, guild) => {
    const botUserId = client.user?.id;
    if (!botUserId) return;

    const executorId = entry.executorId;
    if (!executorId || executorId === botUserId) return;

    const targetId = readTargetId(entry);
    if (!targetId || targetId === executorId) return;

    try {
      const action = entry.action;
      const moderator: Actor = {
        id: executorId,
        tag: await resolveUserTag(client, executorId, userFallbackLabel(entry.executor, executorId)),
      };
      const target: Target = {
        id: targetId,
        tag: await resolveUserTag(client, targetId, userFallbackLabel(entry.target as { tag?: string | null; username?: string | null } | null, targetId)),
      };

      if (action === AuditLogEvent.MemberKick) {
        await registerKickSanction({
          guildId: guild.id,
          target,
          moderator,
          reason: entry.reason?.trim() || MANUAL_REASON_BY_ACTION.KICK,
          client,
        });
        return;
      }

      if (action === AuditLogEvent.MemberBanAdd) {
        await registerBanSanction({
          guildId: guild.id,
          target,
          moderator,
          reason: entry.reason?.trim() || MANUAL_REASON_BY_ACTION.BAN,
          client,
        });
        return;
      }

      if (action === AuditLogEvent.MemberUpdate) {
        const timeoutUntil = readTimeoutUntil(entry);
        if (!timeoutUntil || timeoutUntil.getTime() <= Date.now() + 1000) return;

        await registerObservedTimeoutSanction({
          guildId: guild.id,
          target,
          moderator,
          reason: entry.reason?.trim() || MANUAL_REASON_BY_ACTION.TIMEOUT,
          expiresAt: timeoutUntil,
        });
      }
    } catch (error) {
      logger.error('Modération', `Erreur de synchronisation des sanctions depuis l'audit Discord (guilde ${guild.id}):`, error);
    }
  });
}
