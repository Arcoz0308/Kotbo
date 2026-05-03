import { type Client, type Guild, type Invite } from 'discord.js';
import prisma from '../utils/db.js';
import { logger } from '../utils/logger.js';

export type InviteStats = {
  inviterId: string;
  inviterTag: string;
  totalJoined: number;
  totalLeft: number;
  totalStayed: number;
};

/**
 * Synchronise les invitations Discord avec la base de données
 */
export async function syncGuildInvites(guild: Guild): Promise<void> {
  try {
    const invites = await guild.invites.fetch().catch(() => null);
    if (!invites) return;

    for (const invite of invites.values()) {
      await prisma.guildInvite.upsert({
        where: { code: invite.code },
        update: {
          uses: invite.uses ?? 0,
          maxUses: invite.maxUses ?? null,
          expiresAt: invite.expiresAt ? new Date(invite.expiresAt) : null,
          inviterId: invite.inviter?.id ?? null,
          inviterTag: invite.inviter?.tag ?? invite.inviter?.username ?? null,
          isTemporary: invite.temporary ?? false,
          isDeleted: false,
        },
        create: {
          guildId: guild.id,
          code: invite.code,
          uses: invite.uses ?? 0,
          maxUses: invite.maxUses ?? null,
          expiresAt: invite.expiresAt ? new Date(invite.expiresAt) : null,
          inviterId: invite.inviter?.id ?? null,
          inviterTag: invite.inviter?.tag ?? invite.inviter?.username ?? null,
          isTemporary: invite.temporary ?? false,
          isDeleted: false,
        },
      });
    }

    logger.debug('Invites', `Synchronisation terminée pour le serveur ${guild.id} (${invites.size} invitations)`);
  } catch (error) {
    logger.warn('Invites', `Erreur lors de la synchronisation des invitations pour ${guild.id}: ${String(error)}`);
  }
}

/**
 * Marque une invitation comme supprimée
 */
export async function markInviteAsDeleted(code: string): Promise<void> {
  await prisma.guildInvite.updateMany({
    where: { code },
    data: { isDeleted: true },
  }).catch(() => null);
}

/**
 * Récupère le classement des meilleurs inviteurs
 */
export async function getInviteLeaderboard(guildId: string, limit = 10): Promise<InviteStats[]> {
  const stats = await prisma.memberInvite.groupBy({
    by: ['inviterId', 'inviterTag'],
    where: {
      guildId,
      inviterId: { not: null },
    },
    _count: {
      id: true,
    },
  });

  const leaveStats = await prisma.memberInvite.groupBy({
    by: ['inviterId'],
    where: {
      guildId,
      inviterId: { not: null },
      leftAt: { not: null },
    },
    _count: {
      id: true,
    },
  });

  const leaveMap = new Map(leaveStats.map(s => [s.inviterId, s._count.id]));

  return stats
    .map(s => ({
      inviterId: s.inviterId!,
      inviterTag: s.inviterTag ?? 'Inconnu',
      totalJoined: s._count.id,
      totalLeft: leaveMap.get(s.inviterId!) ?? 0,
      totalStayed: s._count.id - (leaveMap.get(s.inviterId!) ?? 0),
    }))
    .sort((a, b) => b.totalStayed - a.totalStayed)
    .slice(0, limit);
}

/**
 * Récupère les stats d'un utilisateur spécifique
 */
export async function getUserInviteStats(guildId: string, userId: string): Promise<InviteStats | null> {
  const joins = await prisma.memberInvite.count({
    where: { guildId, inviterId: userId },
  });

  const leaves = await prisma.memberInvite.count({
    where: { guildId, inviterId: userId, leftAt: { not: null } },
  });

  const user = await prisma.memberInvite.findFirst({
    where: { inviterId: userId },
    select: { inviterTag: true },
  });

  return {
    inviterId: userId,
    inviterTag: user?.inviterTag ?? 'Inconnu',
    totalJoined: joins,
    totalLeft: leaves,
    totalStayed: joins - leaves,
  };
}

/**
 * Met à jour le départ d'un membre invité
 */
export async function recordInvitedMemberLeave(guildId: string, userId: string): Promise<void> {
  await prisma.memberInvite.updateMany({
    where: {
      guildId,
      userId,
      leftAt: null,
    },
    data: {
      leftAt: new Date(),
    },
  }).catch((error) => {
    logger.warn('Invites', `Erreur lors de l'enregistrement du départ de l'invité ${userId}: ${String(error)}`);
  });
}

/**
 * Synchronise toutes les guildes au démarrage
 */
export async function syncAllGuildsInvites(client: Client): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    await syncGuildInvites(guild);
  }
}
