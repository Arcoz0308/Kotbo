import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Client, TextChannel } from 'discord.js';
import type { McpKeyPermission, SanctionType, SanctionStatus } from '@prisma/client';
import prisma from '../../utils/db.js';
import {
  registerWarnSanction,
  registerKickSanction,
  registerBanSanction,
  registerTimeoutSanction,
} from '../../services/moderation/sanctionService.js';

type McpToolHandler = (args: any) => Promise<ReturnType<typeof ok> | ReturnType<typeof err>> | ReturnType<typeof ok> | ReturnType<typeof err>;
type ToolSecurityScheme = { type: 'noauth' } | { type: 'oauth2'; scopes: string[] };

const ok = (data: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
});

const err = (msg: string, meta?: Record<string, unknown>) => ({
  content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }],
  isError: true,
  ...(meta ? { _meta: meta } : {}),
});

const oauthSecuritySchemes = [
  { type: 'oauth2', scopes: ['mcp'] },
] satisfies ToolSecurityScheme[];

export function registerMcpTools(
  server: McpServer,
  guildId: string,
  permissions: McpKeyPermission[],
  client: Client,
  options: { listAllTools?: boolean; wwwAuthenticate?: string; securitySchemes?: ToolSecurityScheme[] } = {}
) {
  const has = (p: McpKeyPermission) => permissions.includes(p);
  const shouldRegister = (p: McpKeyPermission) => options.listAllTools || has(p);
  const toolMeta = {
    securitySchemes: options.securitySchemes ?? oauthSecuritySchemes,
  };
  const guard = (permission: McpKeyPermission, handler: McpToolHandler): McpToolHandler => {
    return async (args: any) => {
      if (!has(permission)) {
        return err(`Autorisation MCP requise: permission ${permission}.`, {
          'mcp/www_authenticate': [
            options.wwwAuthenticate ?? 'Bearer error="insufficient_scope", error_description="Autorisation MCP Kotbo requise"',
          ],
        });
      }

      return handler(args);
    };
  };

  // ── READ_STATS ────────────────────────────────────────────────────────────

  if (shouldRegister('READ_STATS')) {
    server.registerTool(
      'get_guild_stats',
      {
        description: 'Récupère les statistiques du serveur Discord (membres, messages, sanctions) sur une période donnée.',
        inputSchema: { period_days: z.number().int().min(1).max(90).default(30).describe('Nombre de jours à analyser (1-90)') },
        _meta: toolMeta,
      },
      guard('READ_STATS', async ({ period_days }) => {
        const since = new Date();
        since.setDate(since.getDate() - period_days);
        const sinceKey = since.toISOString().slice(0, 10);

        const stats = await prisma.guildDailyStat.findMany({
          where: { guildId, dateKey: { gte: sinceKey } },
          orderBy: { dateKey: 'asc' },
        });

        const discordGuild = client.guilds.cache.get(guildId);

        const totals = stats.reduce(
          (acc: { messages: number; voiceMinutes: number; joins: number; leaves: number; sanctions: number }, s) => ({
            messages: acc.messages + s.messagesCount,
            voiceMinutes: acc.voiceMinutes + s.voiceMinutes,
            joins: acc.joins + s.membersJoined,
            leaves: acc.leaves + s.membersLeft,
            sanctions: acc.sanctions + s.sanctionsCount,
          }),
          { messages: 0, voiceMinutes: 0, joins: 0, leaves: 0, sanctions: 0 }
        );

        return ok({
          guildId,
          currentMemberCount: discordGuild?.memberCount ?? null,
          period: { from: sinceKey, days: period_days },
          totals,
          trend: stats.map((s) => ({
            date: s.dateKey,
            messages: s.messagesCount,
            voiceMinutes: s.voiceMinutes,
            joins: s.membersJoined,
            leaves: s.membersLeft,
            sanctions: s.sanctionsCount,
          })),
        });
      })
    );
  }

  // ── READ_MEMBERS ──────────────────────────────────────────────────────────

  if (shouldRegister('READ_MEMBERS')) {
    server.registerTool(
      'get_recent_messages',
      {
        description: 'Récupère les messages récents d\'un salon Discord (lecture en direct via l\'API Discord).',
        inputSchema: {
          channel_id: z.string().describe('ID du salon Discord'),
          limit: z.number().int().min(1).max(100).default(20).describe('Nombre de messages (1-100)'),
        },
        _meta: toolMeta,
      },
      guard('READ_MEMBERS', async ({ channel_id, limit }) => {
        const discordGuild = client.guilds.cache.get(guildId);
        if (!discordGuild) return err('Serveur Discord introuvable');

        const channel = discordGuild.channels.cache.get(channel_id);
        if (!channel) return err('Salon introuvable');
        if (!channel.isTextBased()) return err('Ce salon n\'est pas un salon textuel');

        const messages = await (channel as TextChannel).messages.fetch({ limit }).catch(() => null);
        if (!messages) return err('Impossible de lire les messages (permissions insuffisantes)');

        return ok(
          messages.map((m) => ({
            id: m.id,
            authorId: m.author.id,
            authorName: m.author.username,
            content: m.content,
            createdAt: m.createdAt.toISOString(),
          }))
        );
      })
    );

    server.registerTool(
      'get_member_profile',
      {
        description: 'Récupère le profil d\'un membre du serveur (activité, historique, informations Discord).',
        inputSchema: { member_id: z.string().describe('ID Discord du membre') },
        _meta: toolMeta,
      },
      guard('READ_MEMBERS', async ({ member_id }) => {
        const [profile, discordMember] = await Promise.all([
          prisma.memberProfile.findUnique({
            where: { guildId_userId: { guildId, userId: member_id } },
          }),
          client.guilds.cache.get(guildId)?.members.fetch(member_id).catch(() => null),
        ]);

        if (!profile && !discordMember) return err('Membre introuvable');

        return ok({
          userId: member_id,
          profile: profile
            ? {
                messageCount: profile.messageCount,
                voiceTimeSeconds: profile.voiceTimeSeconds,
                joinedAt: profile.guildJoinedAt?.toISOString(),
                lastSeenAt: profile.lastSeenAt.toISOString(),
                lastMessageAt: profile.lastMessageAt?.toISOString(),
                isSuspectedDC: profile.isSuspectedDC,
                moderatorNote: profile.moderatorNote,
              }
            : null,
          discord: discordMember
            ? {
                username: discordMember.user.username,
                displayName: discordMember.displayName,
                avatarUrl: discordMember.displayAvatarURL(),
                roles: discordMember.roles.cache.map((r) => ({ id: r.id, name: r.name })),
                joinedAt: discordMember.joinedAt?.toISOString(),
              }
            : null,
        });
      })
    );

    server.registerTool(
      'search_members',
      {
        description: 'Recherche des membres par nom d\'utilisateur ou nom d\'affichage.',
        inputSchema: {
          query: z.string().describe('Terme de recherche (username, displayName ou userId)'),
          limit: z.number().int().min(1).max(50).default(20),
        },
        _meta: toolMeta,
      },
      guard('READ_MEMBERS', async ({ query, limit }) => {
        const members = await prisma.memberProfile.findMany({
          where: {
            guildId,
            OR: [
              { userId: query },
              { username: { contains: query, mode: 'insensitive' } },
              { displayName: { contains: query, mode: 'insensitive' } },
            ],
          },
          take: limit,
          orderBy: { lastSeenAt: 'desc' },
          select: {
            userId: true,
            username: true,
            displayName: true,
            messageCount: true,
            lastSeenAt: true,
            guildJoinedAt: true,
          },
        });

        const enriched = members.map((m) => ({
          userId: m.userId,
          username: m.username,
          displayName: m.displayName,
          messageCount: m.messageCount,
          lastSeenAt: m.lastSeenAt.toISOString(),
          joinedAt: m.guildJoinedAt?.toISOString() ?? null,
        }));

        return ok(enriched);
      })
    );
  }

  // ── READ_SANCTIONS ────────────────────────────────────────────────────────

  if (shouldRegister('READ_SANCTIONS')) {
    server.registerTool(
      'get_sanctions',
      {
        description: 'Liste les sanctions du serveur avec filtres optionnels.',
        inputSchema: {
          member_id: z.string().optional().describe('Filtrer par ID du membre sanctionné'),
          type: z.enum(['WARN', 'KICK', 'TIMEOUT', 'TEMP_BAN', 'BAN', 'SOFTBAN']).optional(),
          status: z.enum(['ACTIVE', 'RESOLVED', 'FAILED']).optional(),
          limit: z.number().int().min(1).max(100).default(50),
          offset: z.number().int().min(0).default(0),
        },
        _meta: toolMeta,
      },
      guard('READ_SANCTIONS', async ({ member_id, type, status, limit, offset }) => {
        const [sanctions, total] = await Promise.all([
          prisma.sanction.findMany({
            where: {
              guildId,
              ...(member_id ? { targetUserId: member_id } : {}),
              ...(type ? { type: type as SanctionType } : {}),
              ...(status ? { status: status as SanctionStatus } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
          }),
          prisma.sanction.count({
            where: {
              guildId,
              ...(member_id ? { targetUserId: member_id } : {}),
              ...(type ? { type: type as SanctionType } : {}),
              ...(status ? { status: status as SanctionStatus } : {}),
            },
          }),
        ]);

        return ok({
          total,
          sanctions: sanctions.map((s) => ({
            id: s.id,
            type: s.type,
            status: s.status,
            targetUserId: s.targetUserId,
            targetTag: s.targetTag,
            moderatorUserId: s.moderatorUserId,
            moderatorTag: s.moderatorTag,
            reason: s.reason,
            durationSeconds: s.durationSeconds,
            expiresAt: s.expiresAt?.toISOString(),
            createdAt: s.createdAt.toISOString(),
            resolvedAt: s.resolvedAt?.toISOString(),
          })),
        });
      })
    );

    server.registerTool(
      'get_sanction_history',
      {
        description: 'Récupère l\'historique complet des sanctions pour un membre spécifique.',
        inputSchema: { member_id: z.string().describe('ID Discord du membre') },
        _meta: toolMeta,
      },
      guard('READ_SANCTIONS', async ({ member_id }) => {
        const [sanctions, reports] = await Promise.all([
          prisma.sanction.findMany({
            where: { guildId, targetUserId: member_id },
            orderBy: { createdAt: 'desc' },
          }),
          prisma.sanctionReport.findMany({
            where: { guildId, memberReference: member_id },
            orderBy: { createdAt: 'desc' },
          }),
        ]);

        const byType: Record<string, number> = {};
        for (const s of sanctions) {
          byType[s.type] = (byType[s.type] ?? 0) + 1;
        }

        return ok({
          memberId: member_id,
          summary: {
            total: sanctions.length,
            active: sanctions.filter((s) => s.status === 'ACTIVE').length,
            byType,
          },
          sanctions: sanctions.map((s) => ({
            id: s.id,
            type: s.type,
            status: s.status,
            reason: s.reason,
            moderatorTag: s.moderatorTag,
            durationSeconds: s.durationSeconds,
            createdAt: s.createdAt.toISOString(),
          })),
          reports: reports.map((r) => ({
            id: r.id,
            sanctionId: r.sanctionId,
            brokenRules: r.brokenRules,
            detailedReason: r.detailedReason,
            evidenceLinks: r.evidenceLinks,
            createdAt: r.createdAt.toISOString(),
          })),
        });
      })
    );
  }

  // ── READ_STAFF ────────────────────────────────────────────────────────────

  if (shouldRegister('READ_STAFF')) {
    server.registerTool(
      'get_staff_list',
      {
        description: 'Récupère la liste des membres du staff du serveur.',
        inputSchema: {
          include_inactive: z.boolean().default(false).describe('Inclure les membres inactifs'),
        },
        _meta: toolMeta,
      },
      guard('READ_STAFF', async ({ include_inactive }) => {
        const staffMembers = await prisma.staffMember.findMany({
          where: {
            guildId,
            ...(include_inactive ? {} : {}),
          },
          include: {
            absences: {
              where: { status: { in: ['PENDING', 'APPROVED'] } },
              select: { id: true, startDate: true, endDate: true, type: true },
            },
          },
          orderBy: { joinedStaffAt: 'desc' },
        });

        return ok(
          staffMembers.map((s) => ({
            id: s.id,
            userId: s.userId,
            username: s.username,
            displayName: s.displayName,
            grade: s.grade,
            joinedStaffAt: s.joinedStaffAt.toISOString(),
            isCurrentlyAbsent: s.absences.length > 0,
            absences: s.absences.map((a) => ({
              type: a.type,
              from: a.startDate.toISOString(),
              until: a.endDate?.toISOString() ?? null,
            })),
          }))
        );
      })
    );

    server.registerTool(
      'get_staff_member',
      {
        description: 'Récupère le profil détaillé d\'un membre du staff.',
        inputSchema: { member_id: z.string().describe('ID Discord du membre du staff') },
        _meta: toolMeta,
      },
      guard('READ_STAFF', async ({ member_id }) => {
        const staff = await prisma.staffMember.findUnique({
          where: { guildId_userId: { guildId, userId: member_id } },
          include: {
            warnings: { orderBy: { createdAt: 'desc' }, take: 10 },
            activities: { orderBy: { activityDate: 'desc' }, take: 30 },
          },
        });

        if (!staff) return err('Membre du staff introuvable');

        return ok({
          id: staff.id,
          userId: staff.userId,
          username: staff.username,
          displayName: staff.displayName,
          avatarUrl: staff.avatarUrl,
          grade: staff.grade,
          joinedStaffAt: staff.joinedStaffAt.toISOString(),
          warnings: staff.warnings.map((w) => ({
            reason: w.reason,
            type: w.type,
            issuedAt: w.createdAt.toISOString(),
            expiresAt: w.expiresAt?.toISOString(),
          })),
          recentActivity: staff.activities.map((a) => ({
            date: a.activityDate.toISOString(),
            messageCount: a.messageCount,
            voiceMinutes: a.voiceMinutes,
          })),
        });
      })
    );
  }

  // ── READ_TICKETS ──────────────────────────────────────────────────────────

  if (shouldRegister('READ_TICKETS')) {
    server.registerTool(
      'get_tickets',
      {
        description: 'Liste les tickets de support du serveur.',
        inputSchema: {
          status: z.enum(['OPEN', 'CLAIMED', 'CLOSED']).optional(),
          limit: z.number().int().min(1).max(50).default(20),
          offset: z.number().int().min(0).default(0),
        },
        _meta: toolMeta,
      },
      guard('READ_TICKETS', async ({ status, limit, offset }) => {
        const [tickets, total] = await Promise.all([
          prisma.ticket.findMany({
            where: {
              guildId,
              ...(status ? { status: status as 'OPEN' | 'CLAIMED' | 'CLOSED' } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
          }),
          prisma.ticket.count({
            where: {
              guildId,
              ...(status ? { status: status as 'OPEN' | 'CLAIMED' | 'CLOSED' } : {}),
            },
          }),
        ]);

        return ok({
          total,
          tickets: tickets.map((t) => ({
            id: t.id,
            userId: t.userId,
            status: t.status,
            reason: t.reason,
            description: t.description,
            claimedById: t.claimedById,
            createdAt: t.createdAt.toISOString(),
            closedAt: t.closedAt?.toISOString() ?? null,
          })),
        });
      })
    );
  }

  // ── WRITE_SANCTIONS ───────────────────────────────────────────────────────

  if (shouldRegister('WRITE_SANCTIONS')) {
    server.registerTool(
      'apply_sanction',
      {
        description: 'Applique une sanction à un membre du serveur Discord. Requiert la permission WRITE_SANCTIONS.',
        inputSchema: {
          member_id: z.string().describe('ID Discord du membre à sanctionner'),
          type: z.enum(['WARN', 'KICK', 'TIMEOUT', 'TEMP_BAN', 'BAN', 'SOFTBAN']),
          reason: z.string().min(1).max(512).describe('Raison de la sanction'),
          duration_seconds: z
            .number()
            .int()
            .positive()
            .max(2332800)
            .optional()
            .describe('Durée en secondes (obligatoire pour TIMEOUT et TEMP_BAN, max 27 jours)'),
          key_name: z.string().optional().describe('Nom de la clé MCP (pour l\'audit)'),
        },
        _meta: toolMeta,
      },
      guard('WRITE_SANCTIONS', async ({ member_id, type, reason, duration_seconds, key_name }) => {
        if ((type === 'TIMEOUT' || type === 'TEMP_BAN') && !duration_seconds) {
          return err(`duration_seconds est obligatoire pour le type ${type}`);
        }

        const discordGuild = client.guilds.cache.get(guildId);
        if (!discordGuild) return err('Serveur Discord introuvable');

        const target = await discordGuild.members.fetch(member_id).catch(() => null);
        if (!target) return err('Membre introuvable sur le serveur Discord');

        const actorTag = `MCP[${key_name ?? 'agent'}]`;
        const actor = { id: 'mcp_agent', tag: actorTag };
        const targetData = { id: member_id, tag: target.user.tag ?? target.user.username };

        try {
          let sanction;

          if (type === 'WARN') {
            sanction = await registerWarnSanction({ guildId, target: targetData, moderator: actor, reason, client });
          } else if (type === 'KICK') {
            sanction = await registerKickSanction({ guildId, target: targetData, moderator: actor, reason, client });
          } else if (type === 'TIMEOUT') {
            sanction = await registerTimeoutSanction({
              guildId,
              target: targetData,
              moderator: actor,
              reason,
              durationMs: duration_seconds! * 1000,
              member: target,
              client,
            });
          } else if (type === 'BAN' || type === 'TEMP_BAN') {
            sanction = await registerBanSanction({
              guildId,
              target: targetData,
              moderator: actor,
              reason,
              client,
              ...(duration_seconds ? { temporaryDurationMs: duration_seconds * 1000 } : {}),
            });
          } else {
            return err(`Type de sanction non supporté via MCP : ${type}`);
          }

          await prisma.dashboardAuditLog.create({
            data: {
              guildId,
              user: actorTag,
              action: `Sanction MCP - ${type}`,
              context: `Cible: ${targetData.tag} (${member_id})`,
              module: 'MCP',
              eventType: 'Action',
              details: `Type: ${type} | Cible: ${targetData.tag} | Raison: ${reason}`,
              dateIso: new Date(),
            },
          });

          return ok({ ok: true, sanctionId: sanction?.id ?? null, type, targetId: member_id });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return err(`Erreur lors de l'application de la sanction : ${msg}`);
        }
      })
    );
  }
}
