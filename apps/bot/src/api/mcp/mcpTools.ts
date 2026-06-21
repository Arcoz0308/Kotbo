import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Client, TextChannel, ChannelType } from 'discord.js';
import type { McpKeyPermission, SanctionType, SanctionStatus } from '@prisma/client';
import prisma from '../../utils/db.js';
import {
  registerWarnSanction,
  registerKickSanction,
  registerBanSanction,
  registerTimeoutSanction,
} from '../../services/moderation/sanctionService.js';
import { renameChannelToClosed } from '../../services/features/ticketService.js';

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

// Renvoie une "erreur" structurée listant les candidats possibles quand une
// recherche par nom est ambiguë, pour que l'agent (ou l'utilisateur) puisse
// préciser sans avoir à connaître les IDs à l'avance.
const ambiguous = (raw: string, kind: string, candidates: unknown[]) => ({
  content: [
    {
      type: 'text' as const,
      text: JSON.stringify(
        {
          error: `Plusieurs ${kind} correspondent à « ${raw} ».`,
          hint: 'Rappelle le même outil en reprenant le nom exact (ou l\'ID) d\'un des candidats ci-dessous.',
          candidates,
        },
        null,
        2
      ),
    },
  ],
  isError: true,
});

const MENTION_USER = /^<@!?(\d+)>$/;
const MENTION_CHANNEL = /^<#(\d+)>$/;
const SNOWFLAKE = /^\d{16,20}$/;

type MemberResolution =
  | { ok: true; userId: string; label: string }
  | { ok: false; response: ReturnType<typeof err> };

// Accepte un ID Discord, une mention <@id>, ou un nom (username / displayName /
// globalName / tag) et le résout vers un userId unique. En cas d'ambiguïté ou
// d'absence de résultat, renvoie une réponse d'erreur exploitable directement.
async function resolveMember(guildId: string, raw: string): Promise<MemberResolution> {
  const input = raw.trim();

  const mention = input.match(MENTION_USER);
  const directId = mention ? mention[1] : SNOWFLAKE.test(input) ? input : null;
  if (directId) {
    return { ok: true, userId: directId, label: directId };
  }

  const name = input.replace(/^@/, '');
  const matches = await prisma.memberProfile.findMany({
    where: {
      guildId,
      OR: [
        { username: { contains: name, mode: 'insensitive' } },
        { displayName: { contains: name, mode: 'insensitive' } },
        { globalName: { contains: name, mode: 'insensitive' } },
        { userTag: { contains: name, mode: 'insensitive' } },
      ],
    },
    take: 10,
    orderBy: { lastSeenAt: 'desc' },
    select: { userId: true, username: true, displayName: true, globalName: true, userTag: true },
  });

  const lower = name.toLowerCase();
  const exact = matches.filter(
    (m) =>
      m.username?.toLowerCase() === lower ||
      m.displayName?.toLowerCase() === lower ||
      m.globalName?.toLowerCase() === lower ||
      m.userTag?.toLowerCase() === lower
  );

  const pick = exact.length === 1 ? exact[0] : matches.length === 1 ? matches[0] : null;
  if (pick) {
    return { ok: true, userId: pick.userId, label: pick.displayName ?? pick.username ?? pick.userId };
  }

  if (matches.length === 0) {
    return {
      ok: false,
      response: err(`Aucun membre ne correspond à « ${raw} ». Vérifie l'orthographe ou utilise search_members.`),
    };
  }

  return {
    ok: false,
    response: ambiguous(
      raw,
      'membres',
      matches.map((m) => ({
        userId: m.userId,
        username: m.username,
        displayName: m.displayName,
      }))
    ),
  };
}

type ChannelResolution =
  | { ok: true; channel: TextChannel }
  | { ok: false; response: ReturnType<typeof err> };

// Accepte un ID de salon, une mention <#id>, ou un nom de salon (avec ou sans #)
// et le résout vers un salon textuel unique.
function resolveChannel(guildId: string, client: Client, raw: string): ChannelResolution {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return { ok: false, response: err('Serveur Discord introuvable') };

  const input = raw.trim();
  const mention = input.match(MENTION_CHANNEL);
  const directId = mention ? mention[1] : SNOWFLAKE.test(input) ? input : null;
  if (directId) {
    const ch = guild.channels.cache.get(directId);
    if (!ch) return { ok: false, response: err('Salon introuvable') };
    if (!ch.isTextBased()) return { ok: false, response: err('Ce salon n\'est pas un salon textuel') };
    return { ok: true, channel: ch as TextChannel };
  }

  const name = input.replace(/^#/, '').toLowerCase();
  const textChannels = guild.channels.cache.filter((c) => c.isTextBased());

  let matches = textChannels.filter((c) => c.name.toLowerCase() === name);
  if (matches.size === 0) matches = textChannels.filter((c) => c.name.toLowerCase().includes(name));

  if (matches.size === 0) {
    return { ok: false, response: err(`Aucun salon ne correspond à « ${raw} ».`) };
  }
  if (matches.size > 1) {
    return {
      ok: false,
      response: ambiguous(
        raw,
        'salons',
        matches.map((c) => ({ id: c.id, name: c.name })).slice(0, 10)
      ),
    };
  }

  return { ok: true, channel: matches.first() as TextChannel };
}

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

  // Journalise une action MCP dans l'audit log du dashboard.
  const audit = (keyName: string | undefined, action: string, context: string, details: string) =>
    prisma.dashboardAuditLog
      .create({
        data: {
          guildId,
          user: `MCP[${keyName ?? 'agent'}]`,
          action,
          context,
          module: 'MCP',
          eventType: 'Action',
          details,
          dateIso: new Date(),
        },
      })
      .catch(() => undefined);

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
          channel: z.string().describe('Nom du salon (ex: « general », avec ou sans #), mention <#id> ou ID'),
          limit: z.number().int().min(1).max(100).default(20).describe('Nombre de messages (1-100)'),
        },
        _meta: toolMeta,
      },
      guard('READ_MEMBERS', async ({ channel, limit }) => {
        const resolved = resolveChannel(guildId, client, channel);
        if (!resolved.ok) return resolved.response;

        const messages = await resolved.channel.messages.fetch({ limit }).catch(() => null);
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
        inputSchema: { member: z.string().describe('Nom, surnom, @mention ou ID Discord du membre') },
        _meta: toolMeta,
      },
      guard('READ_MEMBERS', async ({ member }) => {
        const resolved = await resolveMember(guildId, member);
        if (!resolved.ok) return resolved.response;
        const member_id = resolved.userId;

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
          member: z.string().optional().describe('Filtrer par membre : nom, surnom, @mention ou ID'),
          type: z.enum(['WARN', 'KICK', 'TIMEOUT', 'TEMP_BAN', 'BAN', 'SOFTBAN']).optional(),
          status: z.enum(['ACTIVE', 'RESOLVED', 'FAILED']).optional(),
          limit: z.number().int().min(1).max(100).default(50),
          offset: z.number().int().min(0).default(0),
        },
        _meta: toolMeta,
      },
      guard('READ_SANCTIONS', async ({ member, type, status, limit, offset }) => {
        let member_id: string | undefined;
        if (member) {
          const resolved = await resolveMember(guildId, member);
          if (!resolved.ok) return resolved.response;
          member_id = resolved.userId;
        }

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
        inputSchema: { member: z.string().describe('Nom, surnom, @mention ou ID Discord du membre') },
        _meta: toolMeta,
      },
      guard('READ_SANCTIONS', async ({ member }) => {
        const resolved = await resolveMember(guildId, member);
        if (!resolved.ok) return resolved.response;
        const member_id = resolved.userId;

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
        inputSchema: { member: z.string().describe('Nom, surnom, @mention ou ID Discord du membre du staff') },
        _meta: toolMeta,
      },
      guard('READ_STAFF', async ({ member }) => {
        const resolved = await resolveMember(guildId, member);
        if (!resolved.ok) return resolved.response;
        const member_id = resolved.userId;

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
          member: z.string().describe('Nom, surnom, @mention ou ID Discord du membre à sanctionner'),
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
      guard('WRITE_SANCTIONS', async ({ member, type, reason, duration_seconds, key_name }) => {
        if ((type === 'TIMEOUT' || type === 'TEMP_BAN') && !duration_seconds) {
          return err(`duration_seconds est obligatoire pour le type ${type}`);
        }

        const resolved = await resolveMember(guildId, member);
        if (!resolved.ok) return resolved.response;
        const member_id = resolved.userId;

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

    server.registerTool(
      'revoke_sanction',
      {
        description:
          'Lève une sanction active d\'un membre : déban et/ou retrait du timeout. Requiert la permission WRITE_SANCTIONS.',
        inputSchema: {
          member: z.string().describe('Nom, surnom, @mention ou ID Discord du membre'),
          type: z
            .enum(['BAN', 'TIMEOUT'])
            .optional()
            .describe('Type de sanction à lever (si omis, lève tout ce qui est actif)'),
          reason: z.string().max(512).optional().describe('Raison de la levée (audit)'),
          key_name: z.string().optional().describe('Nom de la clé MCP (pour l\'audit)'),
        },
        _meta: toolMeta,
      },
      guard('WRITE_SANCTIONS', async ({ member, type, reason, key_name }) => {
        const resolved = await resolveMember(guildId, member);
        if (!resolved.ok) return resolved.response;
        const userId = resolved.userId;

        const guild = client.guilds.cache.get(guildId);
        if (!guild) return err('Serveur Discord introuvable');

        const motif = reason ?? 'Levée via MCP';
        const actions: string[] = [];

        if (!type || type === 'BAN') {
          const ban = await guild.bans.fetch(userId).catch(() => null);
          if (ban) {
            const done = await guild.members.unban(userId, motif).then(() => true).catch(() => false);
            if (done) actions.push('unban');
          }
        }

        if (!type || type === 'TIMEOUT') {
          const target = await guild.members.fetch(userId).catch(() => null);
          if (target?.isCommunicationDisabled()) {
            const done = await target.timeout(null, motif).then(() => true).catch(() => false);
            if (done) actions.push('untimeout');
          }
        }

        if (actions.length === 0) {
          return err('Aucune sanction active à lever pour ce membre (ni ban ni timeout en cours).');
        }

        const revokedTypes: SanctionType[] = actions.includes('unban')
          ? (['BAN', 'TEMP_BAN'] as SanctionType[])
          : [];
        if (actions.includes('untimeout')) revokedTypes.push('TIMEOUT' as SanctionType);

        await prisma.sanction.updateMany({
          where: { guildId, targetUserId: userId, status: 'ACTIVE', type: { in: revokedTypes } },
          data: { status: 'RESOLVED' as SanctionStatus, resolvedAt: new Date() },
        });

        await audit(
          key_name,
          'Levée de sanction MCP',
          `Cible: ${resolved.label} (${userId})`,
          `Actions: ${actions.join(', ')} | Raison: ${motif}`
        );

        return ok({ ok: true, userId, actions });
      })
    );
  }

  // ── READ_STATS : navigation du serveur ────────────────────────────────────

  if (shouldRegister('READ_STATS')) {
    server.registerTool(
      'list_channels',
      {
        description:
          'Liste les salons du serveur (nom, type, ID). Pratique pour retrouver un salon par son nom plutôt que par ID.',
        inputSchema: {
          query: z.string().optional().describe('Filtre optionnel sur le nom du salon'),
          type: z.enum(['text', 'voice', 'category', 'all']).default('all').describe('Type de salon à lister'),
        },
        _meta: toolMeta,
      },
      guard('READ_STATS', async ({ query, type }) => {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return err('Serveur Discord introuvable');

        const kindOf = (c: { type: ChannelType; isTextBased: () => boolean; isVoiceBased: () => boolean }) =>
          c.type === ChannelType.GuildCategory ? 'category' : c.isVoiceBased() ? 'voice' : c.isTextBased() ? 'text' : 'other';

        let channels = [...guild.channels.cache.values()];
        if (query) {
          const q = query.toLowerCase();
          channels = channels.filter((c) => c.name.toLowerCase().includes(q));
        }
        if (type !== 'all') channels = channels.filter((c) => kindOf(c) === type);

        return ok(
          channels
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((c) => ({ id: c.id, name: c.name, type: kindOf(c), parentId: c.parentId }))
        );
      })
    );

    server.registerTool(
      'list_roles',
      {
        description: 'Liste les rôles du serveur (nom, ID, couleur, position, mentionnable).',
        inputSchema: { query: z.string().optional().describe('Filtre optionnel sur le nom du rôle') },
        _meta: toolMeta,
      },
      guard('READ_STATS', async ({ query }) => {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return err('Serveur Discord introuvable');

        let roles = [...guild.roles.cache.values()].filter((r) => r.id !== guild.id);
        if (query) {
          const q = query.toLowerCase();
          roles = roles.filter((r) => r.name.toLowerCase().includes(q));
        }

        return ok(
          roles
            .sort((a, b) => b.position - a.position)
            .map((r) => ({
              id: r.id,
              name: r.name,
              color: r.hexColor,
              position: r.position,
              mentionable: r.mentionable,
              memberCount: r.members.size,
            }))
        );
      })
    );

    server.registerTool(
      'get_server_info',
      {
        description: 'Informations générales du serveur Discord (nom, membres, salons, rôles, boosts).',
        inputSchema: {},
        _meta: toolMeta,
      },
      guard('READ_STATS', async () => {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return err('Serveur Discord introuvable');

        return ok({
          id: guild.id,
          name: guild.name,
          description: guild.description,
          memberCount: guild.memberCount,
          channelCount: guild.channels.cache.size,
          roleCount: guild.roles.cache.size,
          ownerId: guild.ownerId,
          boostTier: guild.premiumTier,
          boostCount: guild.premiumSubscriptionCount ?? 0,
          iconUrl: guild.iconURL(),
          createdAt: guild.createdAt.toISOString(),
        });
      })
    );
  }

  // ── WRITE_MESSAGES ────────────────────────────────────────────────────────

  if (shouldRegister('WRITE_MESSAGES')) {
    server.registerTool(
      'send_message',
      {
        description:
          'Envoie un message dans un salon Discord en tant que bot. Requiert la permission WRITE_MESSAGES.',
        inputSchema: {
          channel: z.string().describe('Nom du salon (ex: « general »), mention <#id> ou ID'),
          content: z.string().min(1).max(2000).describe('Contenu du message (max 2000 caractères)'),
          key_name: z.string().optional().describe('Nom de la clé MCP (pour l\'audit)'),
        },
        _meta: toolMeta,
      },
      guard('WRITE_MESSAGES', async ({ channel, content, key_name }) => {
        const resolved = resolveChannel(guildId, client, channel);
        if (!resolved.ok) return resolved.response;

        const sent = await resolved.channel.send({ content }).catch((e) => {
          const msg = e instanceof Error ? e.message : String(e);
          return msg;
        });
        if (typeof sent === 'string') return err(`Impossible d'envoyer le message : ${sent}`);

        await audit(
          key_name,
          'Message envoyé MCP',
          `Salon: #${resolved.channel.name} (${resolved.channel.id})`,
          content.slice(0, 200)
        );

        return ok({ ok: true, messageId: sent.id, channelId: resolved.channel.id, channelName: resolved.channel.name });
      })
    );
  }

  // ── WRITE_TICKETS ─────────────────────────────────────────────────────────

  if (shouldRegister('WRITE_TICKETS')) {
    server.registerTool(
      'reply_ticket',
      {
        description: 'Envoie un message dans le salon d\'un ticket en tant que bot. Requiert WRITE_TICKETS.',
        inputSchema: {
          ticket_id: z.string().describe('ID du ticket (issu de get_tickets)'),
          content: z.string().min(1).max(2000).describe('Contenu du message'),
          key_name: z.string().optional().describe('Nom de la clé MCP (pour l\'audit)'),
        },
        _meta: toolMeta,
      },
      guard('WRITE_TICKETS', async ({ ticket_id, content, key_name }) => {
        const ticket = await prisma.ticket.findFirst({ where: { id: ticket_id, guildId } });
        if (!ticket) return err('Ticket introuvable');
        if (!ticket.channelId) return err('Ce ticket n\'a pas de salon associé');

        const channel = client.guilds.cache.get(guildId)?.channels.cache.get(ticket.channelId);
        if (!channel || !channel.isTextBased()) return err('Salon du ticket introuvable');

        const sent = await (channel as TextChannel).send({ content }).catch(() => null);
        if (!sent) return err('Impossible d\'envoyer le message dans le ticket');

        await audit(key_name, 'Réponse ticket MCP', `Ticket: ${ticket.id}`, content.slice(0, 200));

        return ok({ ok: true, ticketId: ticket.id, messageId: sent.id });
      })
    );

    server.registerTool(
      'close_ticket',
      {
        description:
          'Ferme un ticket : marque le ticket comme fermé en base et renomme son salon (préfixe « fermer- »). Requiert WRITE_TICKETS.',
        inputSchema: {
          ticket_id: z.string().describe('ID du ticket (issu de get_tickets)'),
          reason: z.string().max(512).optional().describe('Raison de la fermeture'),
          key_name: z.string().optional().describe('Nom de la clé MCP (pour l\'audit)'),
        },
        _meta: toolMeta,
      },
      guard('WRITE_TICKETS', async ({ ticket_id, reason, key_name }) => {
        const ticket = await prisma.ticket.findFirst({ where: { id: ticket_id, guildId } });
        if (!ticket) return err('Ticket introuvable');
        if (ticket.status === 'CLOSED') return err('Ce ticket est déjà fermé');

        await prisma.ticket.update({
          where: { id: ticket.id },
          data: { status: 'CLOSED', closedAt: new Date(), closedByName: `MCP[${key_name ?? 'agent'}]` },
        });

        if (ticket.channelId) {
          const channel = client.guilds.cache.get(guildId)?.channels.cache.get(ticket.channelId);
          if (channel?.isTextBased()) {
            await (channel as TextChannel)
              .send({ content: `🔒 Ticket fermé via IA${reason ? ` — ${reason}` : ''}.` })
              .catch(() => null);
          }
          await renameChannelToClosed(client, ticket.channelId).catch(() => undefined);
        }

        await audit(key_name, 'Fermeture ticket MCP', `Ticket: ${ticket.id}`, reason ?? '(sans raison)');

        return ok({ ok: true, ticketId: ticket.id, status: 'CLOSED' });
      })
    );
  }

  // ── READ_COMMUNITY ────────────────────────────────────────────────────────

  if (shouldRegister('READ_COMMUNITY')) {
    server.registerTool(
      'get_leaderboard',
      {
        description: 'Classement des membres par XP/niveau, nombre de messages ou temps vocal.',
        inputSchema: {
          by: z.enum(['xp', 'messages', 'voice']).default('xp').describe('Critère du classement'),
          limit: z.number().int().min(1).max(50).default(10),
        },
        _meta: toolMeta,
      },
      guard('READ_COMMUNITY', async ({ by, limit }) => {
        if (by === 'xp') {
          const rows = await prisma.memberLevel.findMany({
            where: { guildId },
            orderBy: { xp: 'desc' },
            take: limit,
          });
          const profiles = await prisma.memberProfile.findMany({
            where: { guildId, userId: { in: rows.map((r) => r.userId) } },
            select: { userId: true, username: true, displayName: true },
          });
          const nameOf = new Map(profiles.map((p) => [p.userId, p.displayName ?? p.username ?? p.userId]));
          return ok(
            rows.map((r, i) => ({
              rank: i + 1,
              userId: r.userId,
              name: nameOf.get(r.userId) ?? r.userId,
              level: r.level,
              xp: r.xp,
            }))
          );
        }

        const field = by === 'voice' ? 'voiceTimeSeconds' : 'messageCount';
        const rows = await prisma.memberProfile.findMany({
          where: { guildId },
          orderBy: { [field]: 'desc' },
          take: limit,
          select: { userId: true, username: true, displayName: true, messageCount: true, voiceTimeSeconds: true },
        });
        return ok(
          rows.map((r, i) => ({
            rank: i + 1,
            userId: r.userId,
            name: r.displayName ?? r.username ?? r.userId,
            messageCount: r.messageCount,
            voiceTimeSeconds: r.voiceTimeSeconds,
          }))
        );
      })
    );

    server.registerTool(
      'get_suggestions',
      {
        description: 'Liste les suggestions de la communauté avec filtre optionnel par statut.',
        inputSchema: {
          status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'IMPLEMENTED']).optional(),
          limit: z.number().int().min(1).max(50).default(20),
        },
        _meta: toolMeta,
      },
      guard('READ_COMMUNITY', async ({ status, limit }) => {
        const suggestions = await prisma.suggestion.findMany({
          where: { guildId, ...(status ? { status } : {}) },
          orderBy: { createdAt: 'desc' },
          take: limit,
        });
        return ok(
          suggestions.map((s) => ({
            id: s.id,
            content: s.content,
            status: s.status,
            author: s.username,
            authorId: s.userId,
            upvotes: s.upvoters.length,
            downvotes: s.downvoters.length,
            response: s.responseText,
            createdAt: s.createdAt.toISOString(),
          }))
        );
      })
    );

    server.registerTool(
      'get_events',
      {
        description: 'Liste les événements du serveur.',
        inputSchema: {
          status: z.string().optional().describe('Filtre optionnel sur le statut (ex: DRAFT, SCHEDULED, ACTIVE, ENDED)'),
          limit: z.number().int().min(1).max(50).default(20),
        },
        _meta: toolMeta,
      },
      guard('READ_COMMUNITY', async ({ status, limit }) => {
        const events = await prisma.event.findMany({
          where: { guildId, ...(status ? { status: status as never } : {}) },
          orderBy: { createdAt: 'desc' },
          take: limit,
          include: { _count: { select: { participants: true } } },
        });
        return ok(
          events.map((e) => ({
            id: e.id,
            title: e.title,
            description: e.description,
            type: e.type,
            status: e.status,
            triggerType: e.triggerType,
            triggerValue: e.triggerValue,
            participants: e._count.participants,
            createdAt: e.createdAt.toISOString(),
          }))
        );
      })
    );

    server.registerTool(
      'get_giveaways',
      {
        description: 'Liste les giveaways du serveur.',
        inputSchema: {
          active_only: z.boolean().default(false).describe('Ne retourner que les giveaways en cours'),
          limit: z.number().int().min(1).max(50).default(20),
        },
        _meta: toolMeta,
      },
      guard('READ_COMMUNITY', async ({ active_only, limit }) => {
        const giveaways = await prisma.giveaway.findMany({
          where: { guildId, ...(active_only ? { ended: false } : {}) },
          orderBy: { endsAt: 'desc' },
          take: limit,
        });
        return ok(
          giveaways.map((g) => ({
            id: g.id,
            prize: g.prize,
            description: g.description,
            winnerCount: g.winnerCount,
            ended: g.ended,
            endsAt: g.endsAt.toISOString(),
            participants: g.participants.length,
            winners: g.winners,
          }))
        );
      })
    );
  }
}
