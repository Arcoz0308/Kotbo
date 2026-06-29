import { IncomingMessage, ServerResponse } from 'node:http';
import { Client } from 'discord.js';
import jwt from 'jsonwebtoken';
import { logger } from '../../utils/logger.js';
import { isGuildActivated } from '../../utils/activation.js';
import {
  json,
  verifyAuth,
  resolveAdminAccess,
  resolveDashboardAccess,
  hasDashboardAdminPermission,
  DashboardAccessLevel,
  AuthClaims,
} from '../shared.js';
import { getCurrentInstance, isWhiteLabelInstance } from '../../utils/instanceContext.js';
import prisma from '../../utils/db.js';

export async function handleUserRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  parts: string[],
  url: URL,
  client: Client
): Promise<boolean> {
  const method = req.method;

  if (parts[0] !== 'api' || parts[1] !== 'user') {
    return false;
  }

  const user = verifyAuth(req);
  if (!user) {
    json(res, 401, { error: 'Non authentifié' });
    return true;
  }

  // GET /api/user/me
  if (parts[2] === 'me' && method === 'GET') {
    const authHeader = req.headers.authorization;
    const token = authHeader!.split(' ')[1];
    const decoded = jwt.decode(token) as AuthClaims | null;
    if (!decoded) {
      json(res, 400, { error: 'Token invalide' });
      return true;
    }
    const isBotAdmin = await resolveAdminAccess(client, decoded.userId);
    json(res, 200, { id: decoded.userId, username: decoded.username, avatar: decoded.avatar, isBotAdmin });
    return true;
  }

  // GET /api/user/guilds
  if (parts[2] === 'guilds' && method === 'GET') {
    try {
      // For white-label instances, only show guilds bound to this instance
      let instanceGuildIds: Set<string> | null = null;
      if (isWhiteLabelInstance()) {
        const instance = getCurrentInstance();
        const boundGuilds = await prisma.guild.findMany({
          where: { instanceId: instance.id },
          select: { id: true },
        });
        instanceGuildIds = new Set(boundGuilds.map(g => g.id));
      }

      const isGlobalAdmin = await resolveAdminAccess(client, user.userId);
      const accessibleGuildsList: Array<{
        id: string;
        name: string;
        icon: string | null;
        owner: boolean;
        botPresent: boolean;
        accessLevel: Exclude<DashboardAccessLevel, 'none'>;
      }> = [];

      for (const botGuild of client.guilds.cache.values()) {
        const guildId = botGuild.id;

        // White-label: skip guilds not bound to this instance
        if (instanceGuildIds && !instanceGuildIds.has(guildId)) continue;

        const activated = isGuildActivated(guildId);
        if (!activated && !isGlobalAdmin) continue;

        const member = await botGuild.members.fetch(user.userId).catch(() => null);
        if (!member && !isGlobalAdmin) continue;

        const perms = member?.permissions.bitfield ?? BigInt(0);
        const isAdmin = hasDashboardAdminPermission(perms);

        let hasAccess = isGlobalAdmin || isAdmin;
        let accessLevel: Exclude<DashboardAccessLevel, 'none'> = (isGlobalAdmin || isAdmin) ? 'admin' : 'moderator';

        if (!hasAccess) {
          try {
            const access = await resolveDashboardAccess(
              client,
              guildId,
              user.userId,
              perms,
            );
            if (access.canViewDashboard) {
              hasAccess = true;
              accessLevel = access.level === 'admin' ? 'admin' : 'moderator';
            }
          } catch (err) {
            logger.warn('DashboardAPI', `Failed to resolve access for guild ${guildId}:`, err);
          }
        }

        if (hasAccess) {
          accessibleGuildsList.push({
            id: guildId,
            name: botGuild.name ?? guildId,
            icon: botGuild.icon ?? null,
            owner: botGuild.ownerId === user.userId,
            botPresent: true,
            accessLevel
          });
        }
      }

      const payload = accessibleGuildsList.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'fr'));
      json(res, 200, { guilds: payload });
    } catch (err) {
      logger.error('API', 'Unexpected error in /api/user/guilds:', err);
      json(res, 500, { error: 'Une erreur interne est survenue' });
    }
    return true;
  }

  return false;
}
