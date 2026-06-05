import { SanctionType, LinkedAccountType, LinkedAccountStatus } from '@prisma/client';
import prisma from '../../utils/db.js';
import { logger } from '../../utils/logger.js';
import { type Client, type GuildMember } from 'discord.js';
import * as sanctionService from './sanctionService.js';
import { createNotification } from '../staff/staffLeadershipService.js';

/**
 * Service pour la gestion des comptes liés (Main/Alt)
 */

/**
 * Récupère tous les IDs de comptes liés à un utilisateur (inclut l'utilisateur lui-même)
 */
export async function getAllLinkedUserIds(guildId: string, userId: string): Promise<string[]> {
  const linked = await prisma.linkedAccount.findMany({
    where: {
      guildId,
      status: LinkedAccountStatus.VALIDATED,
      OR: [
        { user1Id: userId },
        { user2Id: userId }
      ]
    }
  });

  const ids = new Set<string>();
  ids.add(userId);

  for (const link of linked) {
    ids.add(link.user1Id);
    ids.add(link.user2Id);
  }

  // Si on a trouvé des liens, on vérifie récursivement au cas où il y aurait une chaîne (rare mais possible)
  if (ids.size > 1) {
    let previousSize = 0;
    while (ids.size !== previousSize) {
      previousSize = ids.size;
      const currentIds = Array.from(ids);
      const moreLinked = await prisma.linkedAccount.findMany({
        where: {
          guildId,
          status: LinkedAccountStatus.VALIDATED,
          OR: [
            { user1Id: { in: currentIds } },
            { user2Id: { in: currentIds } }
          ]
        }
      });
      for (const link of moreLinked) {
        ids.add(link.user1Id);
        ids.add(link.user2Id);
      }
    }
  }

  return Array.from(ids);
}

/**
 * Lie deux comptes officiellement
 */
export async function linkAccounts(params: {
  guildId: string;
  user1Id: string;
  user2Id: string;
  type: LinkedAccountType;
  status?: LinkedAccountStatus;
  reason?: string;
  linkedByUserId?: string;
  metadata?: any;
}) {
  const { guildId, user1Id, user2Id, type, status = LinkedAccountStatus.VALIDATED, reason, linkedByUserId, metadata } = params;

  // Trier les IDs pour éviter les doublons inversés (user1 < user2)
  const [idA, idB] = [user1Id, user2Id].sort();

  if (idA === idB) return null;

  const result = await prisma.linkedAccount.upsert({
    where: {
      guildId_user1Id_user2Id: {
        guildId,
        user1Id: idA,
        user2Id: idB
      }
    },
    update: {
      type,
      status,
      reason,
      linkedByUserId,
      metadata: metadata || undefined
    },
    create: {
      guildId,
      user1Id: idA,
      user2Id: idB,
      type,
      status,
      reason,
      linkedByUserId,
      metadata: metadata || undefined
    }
  });

  // Notifier les deux utilisateurs (uniquement si validé)
  if (status === LinkedAccountStatus.VALIDATED) {
    await Promise.all([
      createNotification(guildId, idA, '🔗 Comptes liés', `Votre compte a été officiellement lié à <@${idB}>.`, 'SUCCESS', '/profile'),
      createNotification(guildId, idB, '🔗 Comptes liés', `Votre compte a été officiellement lié à <@${idA}>.`, 'SUCCESS', '/profile')
    ].map(p => p.catch(() => null)));
  }

  return result;
}

/**
 * Supprime un lien entre deux comptes
 */
export async function unlinkAccounts(guildId: string, user1Id: string, user2Id: string) {
  const [idA, idB] = [user1Id, user2Id].sort();

  const result = await prisma.linkedAccount.deleteMany({
    where: {
      guildId,
      user1Id: idA,
      user2Id: idB
    }
  });

  // Notifier les deux utilisateurs
  await Promise.all([
    createNotification(guildId, idA, '🔗 Liaison supprimée', `La liaison avec le compte <@${idB}> a été supprimée.`, 'INFO', '/profile'),
    createNotification(guildId, idB, '🔗 Liaison supprimée', `La liaison avec le compte <@${idA}> a été supprimée.`, 'INFO', '/profile')
  ].map(p => p.catch(() => null)));

  return result;
}

/**
 * Synchronise une sanction sur tous les comptes liés
 */
export async function synchronizeSanction(params: {
  client: Client;
  guildId: string;
  originalUserId: string;
  type: SanctionType;
  moderator: { id: string; tag: string };
  reason: string;
  durationMs?: number;
}) {
  const { client, guildId, originalUserId, type, moderator, reason, durationMs } = params;

  const linkedIds = await getAllLinkedUserIds(guildId, originalUserId);
  const otherIds = linkedIds.filter(id => id !== originalUserId);

  if (otherIds.length === 0) return;

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  logger.info('AltAccount', `Synchronisation de la sanction ${type} pour ${originalUserId} sur ses alts: ${otherIds.join(', ')}`);

  for (const altId of otherIds) {
    try {
      const altMember = await guild.members.fetch(altId).catch(() => null);
      
      const target = { id: altId, tag: altMember?.user.tag || `Utilisateur inconnu (${altId})` };
      const syncReason = `[Synchronisation DC] ${reason}`;

      switch (type) {
        case SanctionType.WARN:
          await sanctionService.registerWarnSanction({ guildId, target, moderator, reason: syncReason });
          break;
        
        case SanctionType.KICK:
          if (altMember) {
            await altMember.kick(syncReason).catch(() => null);
          }
          await sanctionService.registerKickSanction({ guildId, target, moderator, reason: syncReason });
          break;

        case SanctionType.TIMEOUT:
          if (altMember && durationMs) {
            await sanctionService.registerTimeoutSanction({ 
              guildId, 
              target, 
              moderator, 
              reason: syncReason, 
              durationMs, 
              member: altMember 
            });
          }
          break;

        case SanctionType.BAN:
        case SanctionType.TEMP_BAN:
          await guild.members.ban(altId, { reason: syncReason }).catch(() => null);
          await sanctionService.registerBanSanction({ 
            guildId, 
            target, 
            moderator, 
            reason: syncReason, 
            temporaryDurationMs: durationMs 
          });
          break;

        case SanctionType.SOFTBAN:
          await guild.members.ban(altId, { deleteMessageSeconds: 7 * 24 * 3600, reason: syncReason }).catch(() => null);
          await guild.members.unban(altId, `Unban synchronisation softban`).catch(() => null);
          await sanctionService.registerSoftbanSanction({ guildId, target, moderator, reason: syncReason });
          break;
      }
    } catch (error) {
      logger.error('AltAccount', `Erreur lors de la synchronisation de la sanction pour l'alt ${altId}:`, error);
    }
  }
}
