import { IncomingMessage, ServerResponse } from 'node:http';
import { Client, EmbedBuilder } from 'discord.js';
import prisma from '../../../utils/db.js';
import { logger } from '../../../utils/logger.js';
import { COLORS } from '../../../utils/embeds.js';
import * as altAccountService from '../../../services/moderation/altAccountService.js';
import { scanGuildMembersForYoungAccounts, getDetectionEvidence } from '../../../services/moderation/dcDetectionService.js';
import { LinkedAccountType, LinkedAccountStatus } from '@prisma/client';
import {
  json,
  readJsonBody,
  getGuildName,
  getGuildMembers,
  buildMemberCaseData,
  pushAudit,
  broadcastDashboardStateChange,
  formatDurationFr,
  type AuthClaims,
  type DashboardAccess,
  type MemberCaseQuickAction,
} from '../../shared.js';
import {
  registerBanSanction,
  registerKickSanction,
  registerTimeoutSanction,
  registerWarnSanction,
  runGuildBan,
} from '../../../services/moderation/sanctionService.js';

export async function handleMembersRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  parts: string[],
  url: URL,
  client: Client,
  user: AuthClaims,
  guildId: string,
  access: DashboardAccess,
  featureAccess: any
): Promise<boolean> {
  const method = req.method;
  const auditUser = user.username ?? `User${user.userId}`;

  // 1. Linked Accounts Management
  if (parts[4] === 'linked-accounts') {
    const isAdmin = access.level === 'admin';
    const isStaff = isAdmin || access.level === 'moderator';

    if (!isStaff) {
      json(res, 403, { error: 'Accès refusé' });
      return true;
    }

    // GET /api/dashboard/guilds/:guildId/linked-accounts
    if (method === 'GET') {
      try {
        const linkedAccounts = await prisma.linkedAccount.findMany({
          where: { guildId },
          orderBy: { createdAt: 'desc' },
        });

        const enriched = await Promise.all(linkedAccounts.map(async (acc) => {
          const [p1, p2] = await Promise.all([
            prisma.memberProfile.findUnique({ where: { guildId_userId: { guildId, userId: acc.user1Id } } }),
            prisma.memberProfile.findUnique({ where: { guildId_userId: { guildId, userId: acc.user2Id } } }),
          ]);
          return {
            ...acc,
            user1: p1 ? { tag: p1.username, avatar: p1.avatarUrl } : { tag: acc.user1Id, avatar: null },
            user2: p2 ? { tag: p2.username, avatar: p2.avatarUrl } : { tag: acc.user2Id, avatar: null },
          };
        }));

        json(res, 200, enriched);
      } catch (err) {
        logger.error('LinkedAccountsAPI', 'Error fetching linked accounts:', err);
        json(res, 500, { error: 'Erreur lors de la récupération des comptes liés' });
      }
      return true;
    }

    // PATCH /api/dashboard/guilds/:guildId/linked-accounts/:id
    if (parts.length === 6 && method === 'PATCH') {
      try {
        const id = parts[5];
        const body = await readJsonBody<{ status: 'VALIDATED' | 'REJECTED' }>(req);
        
        if (!body?.status) {
          json(res, 400, { error: 'Statut requis' });
          return true;
        }

        const link = await prisma.linkedAccount.findUnique({
          where: { id }
        });

        if (!link) {
          json(res, 404, { error: 'Lien introuvable' });
          return true;
        }

        const updatedLink = await prisma.linkedAccount.update({
          where: { id },
          data: { status: body.status }
        });

        await pushAudit(guildId, {
          channelId: null,
          user: auditUser,
          action: body.status === 'VALIDATED' ? 'Validation Compte Lié' : 'Rejet Compte Lié',
          context: `Comptes: ${link.user1Id} et ${link.user2Id}`,
          module: 'Membres',
          eventType: 'Settings',
          details: `Statut: ${body.status} | Compte 1: ${link.user1Id} | Compte 2: ${link.user2Id}`,
        });

        if (body.status === 'VALIDATED') {
          const discordGuild = client.guilds.cache.get(guildId);
          const dmEmbed = new EmbedBuilder()
            .setColor(COLORS.success)
            .setTitle('🔗 Comptes liés officiellement')
            .setDescription(`Vos comptes **<@${link.user1Id}>** et **<@${link.user2Id}>** ont été reliés sur **${discordGuild?.name || 'le serveur'}**.`)
            .setTimestamp();

          try {
            const member1 = await client.users.fetch(link.user1Id).catch(() => null);
            if (member1) await member1.send({ embeds: [dmEmbed] }).catch(() => null);
          } catch (e) {}

          try {
            const member2 = await client.users.fetch(link.user2Id).catch(() => null);
            if (member2) await member2.send({ embeds: [dmEmbed] }).catch(() => null);
          } catch (e) {}
        }

        json(res, 200, updatedLink);
      } catch (err) {
        logger.error('LinkedAccountsAPI', 'Error updating linked account:', err);
        json(res, 500, { error: 'Erreur lors de la mise à jour du compte lié' });
      }
      return true;
    }

    // DELETE /api/dashboard/guilds/:guildId/linked-accounts/:id
    if (parts.length === 6 && method === 'DELETE') {
      try {
        const id = parts[5];
        const link = await prisma.linkedAccount.findUnique({
          where: { id }
        });

        if (!link) {
          json(res, 404, { error: 'Lien introuvable' });
          return true;
        }

        await prisma.linkedAccount.delete({
          where: { id }
        });

        await pushAudit(guildId, {
          channelId: null,
          user: auditUser,
          action: 'Suppression Compte Lié',
          context: `Comptes: ${link.user1Id} et ${link.user2Id}`,
          module: 'Membres',
          eventType: 'Settings',
          details: `Compte 1: ${link.user1Id} | Compte 2: ${link.user2Id}`,
        });

        const discordGuild = client.guilds.cache.get(guildId);
        const dmEmbed = new EmbedBuilder()
          .setColor(COLORS.warning)
          .setTitle('🔗 Comptes déliés')
          .setDescription(`Vos comptes **<@${link.user1Id}>** et **<@${link.user2Id}>** ont été séparés sur **${discordGuild?.name || 'le serveur'}**.`)
          .setTimestamp();

        try {
          const member1 = await client.users.fetch(link.user1Id).catch(() => null);
          if (member1) await member1.send({ embeds: [dmEmbed] }).catch(() => null);
        } catch (e) {}

        try {
          const member2 = await client.users.fetch(link.user2Id).catch(() => null);
          if (member2) await member2.send({ embeds: [dmEmbed] }).catch(() => null);
        } catch (e) {}

        json(res, 200, { success: true });
      } catch (err) {
        logger.error('LinkedAccountsAPI', 'Error deleting linked account:', err);
        json(res, 500, { error: 'Erreur lors de la suppression du compte lié' });
      }
      return true;
    }
  }

  // 2. Suspected DC Detections
  // GET /api/dashboard/guilds/:guildId/detections - List suspected DC detections with evidence
  if (parts.length === 5 && parts[4] === 'detections' && method === 'GET') {
    try {
      if (!access.canManageSettings && !featureAccess.double_accounts?.canView) {
        json(res, 403, { error: "Accès refusé. Le module Détections n'est pas accessible." });
        return true;
      }

      const discordGuild = client.guilds.cache.get(guildId);
      const discordMembers: Map<string, any> = new Map();

      if (discordGuild) {
        const allServerMembers = await getGuildMembers(discordGuild).catch(() => null);
        if (allServerMembers) {
          for (const member of allServerMembers.values()) {
            discordMembers.set(member.id, member);
          }
        }
      }

      const suspiciousMembers = await prisma.memberProfile.findMany({
        where: { guildId, isSuspectedDC: true },
        orderBy: [{ lastSeenAt: 'desc' }, { guildJoinedAt: 'desc' }],
        take: 200,
        select: {
          userId: true, username: true, displayName: true, userTag: true,
          avatarUrl: true, isBot: true, accountCreatedAt: true, guildJoinedAt: true,
          guildLeftAt: true, lastSeenAt: true, messageCount: true, isSuspectedDC: true,
        },
      });

      const detections = await Promise.all(suspiciousMembers.map(async (member) => {
        const discordMember = discordMembers.get(member.userId) ?? null;
        const accountCreatedAt = member.accountCreatedAt?.toISOString() ?? null;
        const guildJoinedAt = discordMember?.joinedAt?.toISOString() ?? member.guildJoinedAt?.toISOString() ?? null;
        const createdTs = member.accountCreatedAt?.getTime() ?? null;
        const joinedTs = discordMember?.joinedTimestamp ?? member.guildJoinedAt?.getTime() ?? null;
        const accountAgeMs = createdTs !== null && joinedTs !== null ? Math.max(0, joinedTs - createdTs) : null;

        const evidence = await getDetectionEvidence(guildId, member.userId).catch(() => null);

        const suspectedAlts: Array<{ userId: string; username: string | null; avatarUrl: string | null }> = [];
        if (evidence?.suspectedAlts) {
          for (const altId of evidence.suspectedAlts.slice(0, 5)) {
            const altProfile = await prisma.memberProfile.findUnique({
              where: { guildId_userId: { guildId, userId: altId } },
              select: { username: true, avatarUrl: true }
            }).catch(() => null);
            const altDiscord = discordMembers.get(altId);
            suspectedAlts.push({
              userId: altId,
              username: altProfile?.username ?? altDiscord?.user?.username ?? null,
              avatarUrl: altProfile?.avatarUrl ?? altDiscord?.user?.displayAvatarURL({ size: 64 }) ?? null,
            });
          }
        }

        return {
          id: member.userId,
          username: member.username ?? null,
          displayName: member.displayName ?? member.userTag ?? member.username ?? null,
          avatarUrl: member.avatarUrl ?? discordMember?.user.displayAvatarURL({ size: 256 }) ?? null,
          isBot: member.isBot,
          accountCreatedAt, guildJoinedAt,
          guildLeftAt: member.guildLeftAt?.toISOString() ?? null,
          lastSeenAt: member.lastSeenAt?.toISOString() ?? null,
          messageCount: member.messageCount ?? 0,
          isOnServer: !!discordMember,
          presenceStatus: discordMember?.presence?.status ?? (discordMember ? null : 'left'),
          accountAgeMs,
          accountAgeLabel: accountAgeMs !== null ? formatDurationFr(accountAgeMs) : 'Inconnue',
          suspectedAlts,
          evidence: evidence ? {
            reasons: evidence.reasons.map(r => ({ type: r.type, label: r.label, score: r.score, matchedUserId: r.matchedUserId, detail: r.detail })),
            totalScore: evidence.totalScore,
          } : null,
        };
      }));

      json(res, 200, { total: detections.length, detections });
    } catch (err) {
      logger.error('MembersAPI', 'Error fetching suspected detections:', err);
      json(res, 500, { error: 'Erreur lors du chargement des détections' });
    }
    return true;
  }

  // POST /api/dashboard/guilds/:guildId/detections/:userId/link - Link a detected user with their suspected alt
  if (parts.length === 7 && parts[4] === 'detections' && parts[6] === 'link' && method === 'POST') {
    try {
      if (!access.canManageSettings && !featureAccess.double_accounts?.canModerate) {
        json(res, 403, { error: 'Accès refusé.' });
        return true;
      }
      const targetUserId = parts[5];
      const body = await readJsonBody<{ altUserId: string; reason?: string }>(req);
      if (!body?.altUserId) {
        json(res, 400, { error: 'altUserId requis.' });
        return true;
      }
      await altAccountService.linkAccounts({
        guildId, user1Id: targetUserId, user2Id: body.altUserId,
        type: LinkedAccountType.AUTOMATIC, status: LinkedAccountStatus.VALIDATED,
        reason: body.reason || 'Lié depuis le dashboard (détection).',
        linkedByUserId: user.userId,
      });
      await prisma.memberProfile.updateMany({
        where: { guildId, userId: { in: [targetUserId, body.altUserId] } },
        data: { isSuspectedDC: false },
      }).catch(() => null);
      json(res, 200, { success: true });
    } catch (err) {
      logger.error('MembersAPI', 'Error linking from detection:', err);
      json(res, 500, { error: 'Erreur lors de la liaison.' });
    }
    return true;
  }

  // POST /api/dashboard/guilds/:guildId/detections/:userId/dismiss - Dismiss a detection (false positive)
  if (parts.length === 7 && parts[4] === 'detections' && parts[6] === 'dismiss' && method === 'POST') {
    try {
      if (!access.canManageSettings && !featureAccess.double_accounts?.canModerate) {
        json(res, 403, { error: 'Accès refusé.' });
        return true;
      }
      const targetUserId = parts[5];
      await prisma.memberProfile.updateMany({
        where: { guildId, userId: targetUserId },
        data: { isSuspectedDC: false },
      });
      json(res, 200, { success: true });
    } catch (err) {
      logger.error('MembersAPI', 'Error dismissing detection:', err);
      json(res, 500, { error: 'Erreur.' });
    }
    return true;
  }

  // POST /api/dashboard/guilds/:guildId/detections/scan - Trigger a rescan of guild members for young accounts
  if (parts.length === 6 && parts[4] === 'detections' && parts[5] === 'scan' && method === 'POST') {
    try {
      if (!access.canManageSettings && !featureAccess.double_accounts?.canModerate) {
        json(res, 403, { error: "Accès refusé. Vous n'avez pas les permissions nécessaires pour lancer un scan." });
        return true;
      }

      const discordGuild = client.guilds.cache.get(guildId);
      if (!discordGuild) {
        json(res, 404, { error: 'Serveur Discord introuvable ou inaccessible par le bot' });
        return true;
      }

      let thresholdMs: number | undefined = undefined;
      const body = await readJsonBody<{ thresholdDays?: number }>(req).catch(() => null);
      if (body && body.thresholdDays !== undefined) {
        const days = Number(body.thresholdDays);
        if (Number.isNaN(days) || days < 1 || days > 30 || !Number.isInteger(days)) {
          json(res, 400, { error: 'Le seuil de jours doit être un entier compris entre 1 et 30.' });
          return true;
        }
        thresholdMs = days * 24 * 60 * 60 * 1000;
      }

      const result = await scanGuildMembersForYoungAccounts(discordGuild, thresholdMs);

      json(res, 200, {
        success: true,
        scannedCount: result.scannedCount,
        flaggedCount: result.flaggedCount,
      });
    } catch (err) {
      logger.error('MembersAPI', 'Error scanning suspected detections:', err);
      json(res, 500, { error: 'Erreur lors du scan des détections' });
    }
    return true;
  }

  // 3. Members search, Case files, and Note editing
  // GET /api/dashboard/guilds/:guildId/members/search - Search members from Discord + database
  if (parts.length === 6 && parts[4] === 'members' && parts[5] === 'search' && method === 'GET') {
    try {
      const searchQuery = (url.searchParams.get('q') ?? '').trim().toLowerCase();
      const limit = Math.min(Number(url.searchParams.get('limit') ?? '24'), 100);
      const page = Math.max(Number(url.searchParams.get('page') ?? '1'), 1);
      const sortBy = url.searchParams.get('sortBy') ?? 'lastSeenAt';
      const sortOrder = url.searchParams.get('sortOrder') ?? 'desc';
      const serverStatus = url.searchParams.get('serverStatus') ?? 'on_server';
      const botFilter = url.searchParams.get('botFilter') ?? 'human';

      const validSortFields = ['lastSeenAt', 'messageCount', 'guildJoinedAt'];
      const finalSortBy = validSortFields.includes(sortBy) ? sortBy : 'lastSeenAt';

      const discordGuild = client.guilds.cache.get(guildId);
      const discordMembers: Map<string, any> = new Map();

      if (discordGuild) {
        try {
          const allServerMembers = await getGuildMembers(discordGuild);
          if (allServerMembers) {
            for (const member of allServerMembers.values()) {
              discordMembers.set(member.id, member);
            }
          }
        } catch (err) {
          logger.debug('MembersAPI', 'Could not fetch Discord members:', String(err));
        }
      }

      const allDbMembers = await prisma.memberProfile.findMany({
        where: { guildId },
        select: {
          userId: true,
          username: true,
          displayName: true,
          globalName: true,
          userTag: true,
          avatarUrl: true,
          isBot: true,
          lastSeenAt: true,
          guildJoinedAt: true,
          messageCount: true,
          guildLeftAt: true,
        },
      });

      const dbMemberMap = new Map(allDbMembers.map(m => [m.userId, m]));
      let allMembers: any[] = [];

      for (const [userId, discordMember] of discordMembers.entries()) {
        const dbMember = dbMemberMap.get(userId);
        allMembers.push({
          id: userId,
          username: dbMember?.username || discordMember.user.username,
          displayName: dbMember?.displayName || discordMember.displayName || discordMember.user.globalName || discordMember.user.username,
          avatarUrl: dbMember?.avatarUrl || discordMember.user.displayAvatarURL({ size: 256 }),
          isBot: discordMember.user.bot,
          lastSeenAt: dbMember?.lastSeenAt?.toISOString() ?? null,
          messageCount: dbMember?.messageCount || 0,
          guildJoinedAt: discordMember.joinedAt?.toISOString() ?? dbMember?.guildJoinedAt?.toISOString() ?? null,
          guildLeftAt: null,
          isOnServer: true,
          presenceStatus: discordMember.presence?.status ?? null,
        });
      }

      for (const dbMember of allDbMembers) {
        if (!discordMembers.has(dbMember.userId)) {
          allMembers.push({
            id: dbMember.userId,
            username: dbMember.username || 'Utilisateur inconnu',
            displayName: dbMember.displayName || dbMember.globalName || dbMember.userTag || dbMember.username || 'Utilisateur inconnu',
            avatarUrl: dbMember.avatarUrl,
            isBot: dbMember.isBot || false,
            lastSeenAt: dbMember.lastSeenAt?.toISOString() ?? null,
            messageCount: dbMember.messageCount || 0,
            guildJoinedAt: dbMember.guildJoinedAt?.toISOString() ?? null,
            guildLeftAt: dbMember.guildLeftAt?.toISOString() ?? null,
            isOnServer: false,
            presenceStatus: 'left',
          });
        }
      }

      const onServerCount = allMembers.filter(m => m.isOnServer).length;
      const leftCount = allMembers.filter(m => !m.isOnServer).length;
      const botCount = allMembers.filter(m => m.isBot).length;

      if (serverStatus === 'on_server') {
        allMembers = allMembers.filter(m => m.isOnServer);
      } else if (serverStatus === 'left') {
        allMembers = allMembers.filter(m => !m.isOnServer);
      }

      if (searchQuery) {
        allMembers = allMembers.filter(member =>
          member.username?.toLowerCase().includes(searchQuery) ||
          member.displayName?.toLowerCase().includes(searchQuery) ||
          member.id.includes(searchQuery)
        );
      }

      if (botFilter === 'human') {
        allMembers = allMembers.filter(m => !m.isBot);
      } else if (botFilter === 'bot') {
        allMembers = allMembers.filter(m => m.isBot);
      }

      const finalSortOrder = sortOrder === 'asc' ? 1 : -1;
      if (sortBy === 'messageCount') {
        allMembers.sort((a, b) => (a.messageCount - b.messageCount) * finalSortOrder);
      } else if (sortBy === 'guildJoinedAt') {
        allMembers.sort((a, b) => {
          const dateA = a.guildJoinedAt ? new Date(a.guildJoinedAt).getTime() : 0;
          const dateB = b.guildJoinedAt ? new Date(b.guildJoinedAt).getTime() : 0;
          return (dateA - dateB) * finalSortOrder;
        });
      } else {
        allMembers.sort((a, b) => {
          const dateA = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
          const dateB = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
          return (dateA - dateB) * finalSortOrder;
        });
      }
      
      const totalFound = allMembers.length;
      const totalPages = Math.ceil(totalFound / limit);
      const skip = (page - 1) * limit;
      const paginatedMembers = allMembers.slice(skip, skip + limit);

      const members = paginatedMembers.map(m => {
        const { _sortKey, ...member } = m;
        return member;
      });

      json(res, 200, {
        members,
        totalFound,
        totalPages,
        onServerCount,
        leftCount,
        botCount,
      });
    } catch (err) {
      logger.error('MembersAPI', 'Error searching members:', err);
      json(res, 500, { error: 'Erreur lors de la recherche de membres', details: String(err) });
    }
    return true;
  }

  // GET /api/dashboard/guilds/:guildId/members/:userId - Get member detailed case file
  if (parts.length === 6 && parts[4] === 'members' && method === 'GET') {
    try {
      const memberCase = await buildMemberCaseData(client, guildId, parts[5], user);
      if (!memberCase) {
        json(res, 404, { error: 'Membre introuvable ou identifiant invalide.' });
        return true;
      }
      json(res, 200, memberCase);
    } catch (err) {
      logger.error('MembersAPI', `Error building member case for ${parts[5]}:`, err);
      json(res, 500, { error: 'Erreur lors de la construction du dossier membre', details: String(err) });
    }
    return true;
  }

  // POST /api/dashboard/guilds/:guildId/members/:userId/link - Link alternative account
  if (parts.length === 7 && parts[4] === 'members' && parts[6] === 'link' && method === 'POST') {
    try {
      const u1Id = parts[5].startsWith('!') ? parts[5].substring(1) : parts[5];
      const body = await readJsonBody<{ targetAccountId?: string; reason?: string }>(req);
      const u2Id = body?.targetAccountId;
      const reason = body?.reason;

      if (!u2Id) {
        json(res, 400, { error: "L\'ID du compte cible est requis." });
        return true;
      }

      if (u1Id === u2Id) {
        json(res, 400, { error: 'Impossible de lier un compte à lui-même.' });
        return true;
      }

      const isStaffDb = await prisma.staffMember.findUnique({ where: { guildId_userId: { guildId: guildId, userId: user.userId } } });
      const isAdmin = access.level === 'admin';
      const isStaff = isAdmin || !!isStaffDb || access.level === 'moderator';

      if (!isStaff) {
        json(res, 403, { error: 'Accès refusé' });
        return true;
      }

      if (!isAdmin && !reason) {
        json(res, 400, { error: 'En tant que membre du staff, tu dois obligatoirement fournir une raison pour lier ces comptes.' });
        return true;
      }

      await altAccountService.linkAccounts({
        guildId,
        user1Id: u1Id,
        user2Id: u2Id,
        type: 'MANUAL',
        status: 'VALIDATED',
        reason: reason || 'Action Administrateur (Dashboard)',
        linkedByUserId: user.userId,
        metadata: { linkedBy: user.userId, source: 'dashboard', at: new Date().toISOString() }
      });

      const discordGuild = client.guilds.cache.get(guildId);
      const dmEmbed = new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle('🔗 Comptes liés officiellement')
        .setDescription(`Vos comptes **<@${u1Id}>** et **<@${u2Id}>** ont été reliés sur **${discordGuild?.name || 'le serveur'}**.`)
        .addFields({ name: 'Raison / Notes', value: reason || 'Liaison validée par le staff.', inline: false })
        .setTimestamp();

      try {
        const member1 = await client.users.fetch(u1Id).catch(() => null);
        if (member1) await member1.send({ embeds: [dmEmbed] }).catch(() => null);
      } catch (e) {}

      try {
        const member2 = await client.users.fetch(u2Id).catch(() => null);
        if (member2) await member2.send({ embeds: [dmEmbed] }).catch(() => null);
      } catch (e) {}

      json(res, 200, { success: true });
    } catch (err) {
      logger.error('MembersAPI', `Error linking accounts for ${parts[5]}:`, err);
      json(res, 500, { error: 'Erreur lors de la liaison des comptes', details: String(err) });
    }
    return true;
  }

  // DELETE /api/dashboard/guilds/:guildId/members/:userId/link/:targetId - Unlink accounts
  if (parts.length === 8 && parts[4] === 'members' && parts[6] === 'link' && method === 'DELETE') {
    try {
      const u1Id = parts[5].startsWith('!') ? parts[5].substring(1) : parts[5];
      const u2Id = parts[7];

      const isStaffDb = await prisma.staffMember.findUnique({ where: { guildId_userId: { guildId: guildId, userId: user.userId } } });
      const isAdmin = access.level === 'admin';
      const isStaff = isAdmin || !!isStaffDb || access.level === 'moderator';

      if (!isStaff) {
        json(res, 403, { error: 'Accès refusé' });
        return true;
      }

      await altAccountService.unlinkAccounts(guildId, u1Id, u2Id);
      
      const discordGuild = client.guilds.cache.get(guildId);
      const dmEmbed = new EmbedBuilder()
        .setColor(COLORS.warning)
        .setTitle('🔗 Comptes déliés')
        .setDescription(`Vos comptes **<@${u1Id}>** et **<@${u2Id}>** ont été séparés sur **${discordGuild?.name || 'le serveur'}**.`)
        .setTimestamp();

      try {
        const member1 = await client.users.fetch(u1Id).catch(() => null);
        if (member1) await member1.send({ embeds: [dmEmbed] }).catch(() => null);
      } catch (e) {}

      try {
        const member2 = await client.users.fetch(u2Id).catch(() => null);
        if (member2) await member2.send({ embeds: [dmEmbed] }).catch(() => null);
      } catch (e) {}

      json(res, 200, { success: true });
    } catch (err) {
      logger.error('MembersAPI', `Error unlinking accounts for ${parts[5]}:`, err);
      json(res, 500, { error: 'Erreur lors de la suppression de la liaison', details: String(err) });
    }
    return true;
  }

  // POST /api/dashboard/guilds/:guildId/members/:userId/actions - Moderation actions
  if (parts.length === 7 && parts[4] === 'members' && parts[6] === 'actions' && method === 'POST') {
    if (!access.canModerateContent) {
      json(res, 403, { error: 'Action de modération non autorisée.' });
      return true;
    }

    const userId = parts[5].startsWith('!') ? parts[5].substring(1) : parts[5];
    const body = await readJsonBody<{
      type?: MemberCaseQuickAction;
      reason?: string;
      durationMs?: number | null;
    }>(req);

    const action = body?.type;
    const reason = body?.reason?.trim() || 'Action lancée depuis le profil membre.';
    const discordGuild = client.guilds.cache.get(guildId);
    if (!discordGuild) {
      json(res, 404, { error: 'Serveur Discord introuvable.' });
      return true;
    }

    try {
      const targetUser = await client.users.fetch(userId).catch(() => null);
      const targetMember = await discordGuild.members.fetch(userId).catch(() => null);
      const moderator = { id: user.userId, tag: user.username ?? `Utilisateur ${user.userId}` };
      const target = {
        id: userId,
        tag: targetUser?.tag ?? targetMember?.user.tag ?? `Utilisateur ${userId}`,
      };

      if (!action || !['WARN', 'KICK', 'TIMEOUT', 'BAN'].includes(action)) {
        json(res, 400, { error: "Type d'action invalide." });
        return true;
      }

      if (action === 'WARN') {
        const sanction = await registerWarnSanction({ guildId, target, moderator, reason });

        await pushAudit(guildId, {
          user: auditUser,
          action: 'Warn depuis le profil membre',
          context: getGuildName(client, guildId),
          module: 'Sanctions',
          eventType: 'Manuel',
          details: `Warn appliqué à ${target.tag} (${target.id}). Raison: ${reason}`,
          channelId: null,
        });

        broadcastDashboardStateChange(guildId, 'member_warned');
        json(res, 200, { ok: true, sanctionId: sanction.id });
        return true;
      }

      if (action === 'KICK') {
        if (!targetMember) {
          json(res, 404, { error: 'Le membre doit être présent sur le serveur pour être expulsé.' });
          return true;
        }
        if (!targetMember.kickable) {
          json(res, 400, { error: 'Le bot ne peut pas exclure ce membre.' });
          return true;
        }

        await targetMember.kick(`${reason} | Modération: ${user.username ?? user.userId}`);
        const sanction = await registerKickSanction({ guildId, target, moderator, reason });

        await pushAudit(guildId, {
          user: auditUser,
          action: 'Kick depuis le profil membre',
          context: getGuildName(client, guildId),
          module: 'Sanctions',
          eventType: 'Manuel',
          details: `Kick appliqué à ${target.tag} (${target.id}). Raison: ${reason}`,
          channelId: null,
        });

        broadcastDashboardStateChange(guildId, 'member_kicked');
        json(res, 200, { ok: true, sanctionId: sanction.id });
        return true;
      }

      if (action === 'TIMEOUT') {
        if (!targetMember) {
          json(res, 404, { error: 'Le membre doit être présent sur le serveur pour un timeout.' });
          return true;
        }
        if (!targetMember.moderatable) {
          json(res, 400, { error: 'Le bot ne peut pas appliquer de timeout à ce membre.' });
          return true;
        }

        const durationMs = Number(body?.durationMs ?? 0);
        if (!Number.isFinite(durationMs) || durationMs <= 0) {
          json(res, 400, { error: 'Une durée valide en millisecondes est requise pour le timeout.' });
          return true;
        }

        const sanction = await registerTimeoutSanction({
          guildId,
          target,
          moderator,
          reason,
          durationMs,
          member: targetMember,
        });

        await pushAudit(guildId, {
          user: auditUser,
          action: 'Timeout depuis le profil membre',
          context: getGuildName(client, guildId),
          module: 'Sanctions',
          eventType: 'Manuel',
          details: `Timeout appliqué à ${target.tag} (${target.id}) pour ${Math.floor(durationMs / 1000)}s. Raison: ${reason}`,
          channelId: null,
        });

        broadcastDashboardStateChange(guildId, 'member_timeout');
        json(res, 200, { ok: true, sanctionId: sanction.id });
        return true;
      }

      if (action === 'BAN') {
        if (targetMember && !targetMember.bannable) {
          json(res, 400, { error: 'Le bot ne peut pas bannir ce membre.' });
          return true;
        }

        await runGuildBan(discordGuild, userId, `${reason} | Modération: ${user.username ?? user.userId}`);
        const sanction = await registerBanSanction({ guildId, target, moderator, reason });

        await pushAudit(guildId, {
          user: auditUser,
          action: 'Ban depuis le profil membre',
          context: getGuildName(client, guildId),
          module: 'Sanctions',
          eventType: 'Manuel',
          details: `Ban appliqué à ${target.tag} (${target.id}). Raison: ${reason}`,
          channelId: null,
        });

        broadcastDashboardStateChange(guildId, 'member_banned');
        json(res, 200, { ok: true, sanctionId: sanction.id });
        return true;
      }
    } catch (err) {
      logger.error('MembersAPI', `Error executing moderation action for ${userId}:`, err);
      json(res, 500, { error: "Erreur lors de l\'exécution de l\'action de modération", details: String(err) });
    }
    return true;
  }

  // PATCH /api/dashboard/guilds/:guildId/members/:userId/note - Edit moderator note
  if (parts.length === 7 && parts[4] === 'members' && parts[6] === 'note' && method === 'PATCH') {
    const userId = parts[5].startsWith('!') ? parts[5].substring(1) : parts[5];
    const body = await readJsonBody<{ note: string }>(req);

    try {
      const profile = await prisma.memberProfile.upsert({
        where: { guildId_userId: { guildId, userId } },
        update: { moderatorNote: body?.note ?? null },
        create: {
          guildId,
          userId,
          moderatorNote: body?.note ?? null,
        },
      });

      await pushAudit(guildId, {
        user: auditUser,
        action: 'Mise à jour note modérateur',
        context: getGuildName(client, guildId),
        module: 'Members',
        eventType: 'Manuel',
        details: `Note mise à jour pour l'utilisateur ${userId}.`,
        channelId: null,
      });

      json(res, 200, { ok: true, note: profile.moderatorNote });
    } catch (err) {
      logger.error('MembersAPI', `Error updating note for ${userId}:`, err);
      json(res, 500, { error: 'Erreur lors de la mise à jour de la note' });
    }
    return true;
  }

  // ==========================================
  // 4. Invitations Endpoints
  // ==========================================
  if (parts[4] === 'invitations') {
    // Check view access for GET routes
    if (method === 'GET') {
      if (!access.canManageSettings && !featureAccess?.members?.canView) {
        json(res, 403, { error: 'Accès refusé' });
        return true;
      }
    } else {
      // Check moderation access for state-changing routes
      const canModerate = access.canModerateContent || access.canManageSettings || featureAccess?.members?.canModerate;
      if (!canModerate) {
        json(res, 403, { error: 'Action non autorisée. Modération requise.' });
        return true;
      }
    }

    // GET /api/dashboard/guilds/:guildId/invitations
    if (!parts[5]) {
      if (method === 'GET') {
        try {
          const invitations = await prisma.guildInvite.findMany({
            where: { guildId },
            orderBy: { createdAt: 'desc' },
          });
          const suspendedInviters = await prisma.suspendedInviter.findMany({
            where: { guildId },
            orderBy: { createdAt: 'desc' },
          });
          const inviteUsage = await prisma.memberInvite.groupBy({
            by: ['inviteCode'],
            where: { guildId },
            _count: {
              _all: true,
              leftAt: true,
            },
            _max: {
              joinedAt: true,
            },
          });
          const inviterUsage = await prisma.memberInvite.groupBy({
            by: ['inviterId', 'inviterTag'],
            where: { guildId, inviterId: { not: null } },
            _count: {
              _all: true,
              leftAt: true,
            },
            _max: {
              joinedAt: true,
            },
          });
          const totalJoined = await prisma.memberInvite.count({
            where: { guildId },
          });
          const totalLeft = await prisma.memberInvite.count({
            where: { guildId, leftAt: { not: null } },
          });

          json(res, 200, {
            invitations,
            suspendedInviters,
            inviteUsage,
            inviterUsage,
            summary: { totalJoined, totalLeft },
          });
        } catch (err) {
          logger.error('InvitationsAPI', `Error listing invitations for guild ${guildId}:`, err);
          json(res, 500, { error: 'Erreur lors de la récupération des invitations' });
        }
        return true;
      }
    }

    // POST /api/dashboard/guilds/:guildId/invitations/suspended-inviters
    if (parts[5] === 'suspended-inviters' && !parts[6]) {
      if (method === 'POST') {
        try {
          const body = await readJsonBody<{
            userId: string;
            userTag?: string;
            reason?: string;
            cascade?: boolean;
          }>(req);

          if (!body?.userId || !isValidSnowflake(body.userId)) {
            json(res, 400, { error: 'ID utilisateur Discord invalide' });
            return true;
          }

          const userId = body.userId;
          const userTag = body.userTag || null;
          const reason = body.reason || null;
          const cascade = !!body.cascade;

          const suspendedInviter = await prisma.suspendedInviter.upsert({
            where: { guildId_userId: { guildId, userId } },
            update: { userTag, reason },
            create: { guildId, userId, userTag, reason },
          });

          let cascadeResult = null;

          if (cascade) {
            await prisma.guildInvite.updateMany({
              where: { guildId, inviterId: userId },
              data: { isSuspended: true },
            });

            const discordGuild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
            let purgedCount = 0;
            if (discordGuild) {
              const activeJoins = await prisma.memberInvite.findMany({
                where: {
                  guildId,
                  inviterId: userId,
                  leftAt: null,
                },
              });

              const now = new Date();
              for (const join of activeJoins) {
                const member = await discordGuild.members.fetch(join.userId).catch(() => null);
                if (member) {
                  await member.kick(`Purge cascade créateur suspendu ${userId} par ${auditUser}`).catch(() => null);
                  purgedCount++;
                }
                await prisma.memberInvite.updateMany({
                  where: { id: join.id },
                  data: { leftAt: now },
                });
              }
              cascadeResult = { purgedCount };
            }
          }

          await pushAudit(guildId, {
            user: auditUser,
            action: "Suspension créateur d\'invitations",
            context: getGuildName(client, guildId),
            module: 'Invitations',
            eventType: 'Manuel',
            details: `Créateur suspendu : ${userId} (${userTag || 'sans tag'}). Cascade : ${cascade ? 'Oui' : 'Non'}.`,
            channelId: null,
          });

          json(res, 201, { ok: true, suspendedInviter, cascade: cascadeResult });
        } catch (err) {
          logger.error('InvitationsAPI', 'Error suspending inviter:', err);
          json(res, 500, { error: 'Erreur lors de la suspension du créateur' });
        }
        return true;
      }
    }

    // DELETE /api/dashboard/guilds/:guildId/invitations/suspended-inviters/:userId
    if (parts[5] === 'suspended-inviters' && parts[6] && !parts[7]) {
      if (method === 'DELETE') {
        const userId = parts[6];
        if (!isValidSnowflake(userId)) {
          json(res, 400, { error: 'ID utilisateur Discord invalide' });
          return true;
        }

        try {
          const record = await prisma.suspendedInviter.findUnique({
            where: { guildId_userId: { guildId, userId } },
          });
          if (!record) {
            json(res, 404, { error: 'Créateur suspendu introuvable' });
            return true;
          }

          await prisma.suspendedInviter.delete({
            where: { guildId_userId: { guildId, userId } },
          });

          await prisma.guildInvite.updateMany({
            where: { guildId, inviterId: userId },
            data: { isSuspended: false },
          });

          await pushAudit(guildId, {
            user: auditUser,
            action: "Réhabilitation créateur d\'invitations",
            context: getGuildName(client, guildId),
            module: 'Invitations',
            eventType: 'Manuel',
            details: `Créateur réhabilité : ${userId}. Ses invitations ont été restaurées.`,
            channelId: null,
          });

          json(res, 200, { ok: true });
        } catch (err) {
          logger.error('InvitationsAPI', `Error removing suspended inviter ${userId}:`, err);
          json(res, 500, { error: 'Erreur lors de la réhabilitation du créateur' });
        }
        return true;
      }
    }

    // POST /api/dashboard/guilds/:guildId/invitations/inviters/:userId/purge
    if (parts[5] === 'inviters' && parts[6] && parts[7] === 'purge') {
      if (method === 'POST') {
        const userId = parts[6];
        if (!isValidSnowflake(userId)) {
          json(res, 400, { error: 'ID utilisateur Discord invalide' });
          return true;
        }

        try {
          const discordGuild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
          if (!discordGuild) {
            json(res, 404, { error: 'Serveur Discord introuvable' });
            return true;
          }

          const activeJoins = await prisma.memberInvite.findMany({
            where: {
              guildId,
              inviterId: userId,
              leftAt: null,
            },
          });

          let purgedCount = 0;
          const now = new Date();

          for (const join of activeJoins) {
            const member = await discordGuild.members.fetch(join.userId).catch(() => null);
            if (member) {
              await member.kick(`Purge en cascade par créateur ${userId} par ${auditUser}`).catch(() => null);
              purgedCount++;
            }
            await prisma.memberInvite.updateMany({
              where: { id: join.id },
              data: { leftAt: now },
            });
          }

          await pushAudit(guildId, {
            user: auditUser,
            action: 'Purge en cascade par créateur',
            context: getGuildName(client, guildId),
            module: 'Invitations',
            eventType: 'Manuel',
            details: `Membres invités par ${userId} purgés : ${purgedCount} membre(s) exclu(s).`,
            channelId: null,
          });

          json(res, 200, { ok: true, purgedCount });
        } catch (err) {
          logger.error('InvitationsAPI', `Error purging inviter members for ${userId}:`, err);
          json(res, 500, { error: 'Erreur lors de la purge en cascade des membres' });
        }
        return true;
      }
    }

    // Detail and other actions on single invite codes:
    // GET /api/dashboard/guilds/:guildId/invitations/:code
    // PUT /api/dashboard/guilds/:guildId/invitations/:code/suspend
    // DELETE /api/dashboard/guilds/:guildId/invitations/:code
    // POST /api/dashboard/guilds/:guildId/invitations/:code/purge
    if (parts[5] && parts[5] !== 'suspended-inviters' && parts[5] !== 'inviters') {
      const code = parts[5];
      if (!isValidInviteCode(code)) {
        json(res, 400, { error: "Code d\'invitation invalide" });
        return true;
      }

      // GET /api/dashboard/guilds/:guildId/invitations/:code
      if (method === 'GET' && !parts[6]) {
        try {
          const invite = await prisma.guildInvite.findUnique({
            where: { code },
          });
          if (!invite || invite.guildId !== guildId) {
            json(res, 404, { error: 'Invitation introuvable' });
            return true;
          }

          const daysParam = url.searchParams.get('days');
          const days = Number(daysParam) || 30;

          const now = new Date();
          const startDate = new Date();
          startDate.setDate(now.getDate() - days + 1);
          startDate.setHours(0, 0, 0, 0);

          const periodJoins = await prisma.memberInvite.findMany({
            where: {
              guildId,
              inviteCode: code,
              joinedAt: { gte: startDate },
            },
          });

          const totalJoined = periodJoins.length;
          const totalLeft = periodJoins.filter((j) => j.leftAt !== null).length;
          const totalStayed = totalJoined - totalLeft;

          const countsByDate = new Map<string, number>();
          for (const join of periodJoins) {
            const dateKey = join.joinedAt.toISOString().slice(0, 10);
            countsByDate.set(dateKey, (countsByDate.get(dateKey) || 0) + 1);
          }

          const labels: string[] = [];
          const counts: number[] = [];
          for (let i = 0; i < days; i++) {
            const d = new Date(startDate);
            d.setDate(startDate.getDate() + i);
            const dateKey = d.toISOString().slice(0, 10);
            labels.push(dateKey);
            counts.push(countsByDate.get(dateKey) || 0);
          }

          const joins = await prisma.memberInvite.findMany({
            where: { guildId, inviteCode: code },
            orderBy: { joinedAt: 'desc' },
          });

          const userIds = joins.map((j) => j.userId);
          const profiles = await prisma.memberProfile.findMany({
            where: { guildId, userId: { in: userIds } },
          });
          const profileMap = new Map(profiles.map((p) => [p.userId, p]));

          const enrichedJoins = joins.map((j) => {
            const p = profileMap.get(j.userId);
            return {
              userId: j.userId,
              userTag: p?.username || p?.userTag || `Utilisateur ${j.userId}`,
              joinedAt: j.joinedAt,
              leftAt: j.leftAt,
              avatarUrl: p?.avatarUrl || null,
            };
          });

          json(res, 200, {
            invite,
            trend: {
              totalJoined,
              totalLeft,
              totalStayed,
              labels,
              counts,
            },
            joins: enrichedJoins,
          });
        } catch (err) {
          logger.error('InvitationsAPI', `Error fetching invite details for ${code}:`, err);
          json(res, 500, { error: "Erreur lors de la récupération des détails de l\'invitation" });
        }
        return true;
      }

      // PUT /api/dashboard/guilds/:guildId/invitations/:code/suspend
      if (parts[6] === 'suspend') {
        if (method === 'PUT') {
          try {
            const body = await readJsonBody<{ suspended: boolean }>(req);
            const suspended = !!body?.suspended;

            const invite = await prisma.guildInvite.findUnique({
              where: { code },
            });
            if (!invite || invite.guildId !== guildId) {
              json(res, 404, { error: 'Invitation introuvable' });
              return true;
            }

            const updatedInvite = await prisma.guildInvite.update({
              where: { code },
              data: { isSuspended: suspended },
            });

            await pushAudit(guildId, {
              user: auditUser,
              action: suspended ? 'Suspension invitation' : 'Restauration invitation',
              context: getGuildName(client, guildId),
              module: 'Invitations',
              eventType: 'Manuel',
              details: `L'invitation ${code} a été ${suspended ? 'suspendue' : 'restaurée'}.`,
              channelId: null,
            });

            json(res, 200, { ok: true, invite: updatedInvite });
          } catch (err) {
            logger.error('InvitationsAPI', `Error toggling invite suspension for ${code}:`, err);
            json(res, 500, { error: "Erreur lors de la modification de l\'invitation" });
          }
          return true;
        }
      }

      // DELETE /api/dashboard/guilds/:guildId/invitations/:code
      if (method === 'DELETE' && !parts[6]) {
        try {
          const invite = await prisma.guildInvite.findUnique({
            where: { code },
          });
          if (!invite || invite.guildId !== guildId) {
            json(res, 404, { error: 'Invitation introuvable' });
            return true;
          }

          const updatedInvite = await prisma.guildInvite.update({
            where: { code },
            data: { isDeleted: true },
          });

          const discordGuild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
          if (discordGuild) {
            const discordInvites = await discordGuild.invites.fetch().catch(() => null);
            const discordInvite = discordInvites?.get(code);
            if (discordInvite) {
              await discordInvite.delete('Supprimée via le dashboard Kotbo').catch(() => null);
            }
          }

          await pushAudit(guildId, {
            user: auditUser,
            action: 'Suppression invitation',
            context: getGuildName(client, guildId),
            module: 'Invitations',
            eventType: 'Manuel',
            details: `L'invitation ${code} a été marquée comme supprimée.`,
            channelId: null,
          });

          json(res, 200, { ok: true, invite: updatedInvite });
        } catch (err) {
          logger.error('InvitationsAPI', `Error deleting invite ${code}:`, err);
          json(res, 500, { error: "Erreur lors de la suppression de l\'invitation" });
        }
        return true;
      }

      // POST /api/dashboard/guilds/:guildId/invitations/:code/purge
      if (parts[6] === 'purge') {
        if (method === 'POST') {
          try {
            const invite = await prisma.guildInvite.findUnique({
              where: { code },
            });
            if (!invite || invite.guildId !== guildId) {
              json(res, 404, { error: 'Invitation introuvable' });
              return true;
            }

            const discordGuild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
            if (!discordGuild) {
              json(res, 404, { error: 'Serveur Discord introuvable' });
              return true;
            }

            const activeJoins = await prisma.memberInvite.findMany({
              where: {
                guildId,
                inviteCode: code,
                leftAt: null,
              },
            });

            let purgedCount = 0;
            const now = new Date();

            for (const join of activeJoins) {
              const member = await discordGuild.members.fetch(join.userId).catch(() => null);
              if (member) {
                const reason = `Purge de l'invitation ${code} par ${auditUser}`;
                await member.kick(reason).catch((e) => {
                  logger.warn('InvitationsAPI', `Failed to kick member ${join.userId}:`, e);
                });
                purgedCount++;
              }
              await prisma.memberInvite.updateMany({
                where: { id: join.id },
                data: { leftAt: now },
              });
            }

            await pushAudit(guildId, {
              user: auditUser,
              action: 'Purge invitation',
              context: getGuildName(client, guildId),
              module: 'Invitations',
              eventType: 'Manuel',
              details: `Purge de l'invitation ${code} : ${purgedCount} membre(s) exclu(s).`,
              channelId: null,
            });

            json(res, 200, { ok: true, purgedCount });
          } catch (err) {
            logger.error('InvitationsAPI', `Error purging invite ${code}:`, err);
            json(res, 500, { error: "Erreur lors de la purge de l\'invitation" });
          }
          return true;
        }
      }
    }
  }

  return false;
}

function isValidSnowflake(id: string): boolean {
  return /^\d{17,20}$/.test(id);
}

function isValidInviteCode(code: string): boolean {
  return /^[a-zA-Z0-9_-]{2,20}$/.test(code);
}
