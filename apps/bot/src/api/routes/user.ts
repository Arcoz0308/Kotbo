import { IncomingMessage, ServerResponse } from 'node:http';
import { Client } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { isGuildActivated } from '../../utils/activation.js';
import {
  json,
  verifyAuth,
  resolveAdminAccess,
  resolveDashboardAccess,
  hasDashboardAdminPermission,
  DashboardAccessLevel,
} from '../shared.js';
import { getCurrentInstance, isWhiteLabelInstance } from '../../utils/instanceContext.js';
import prisma from '../../utils/db.js';
import { fetchExternal } from '../../utils/http.js';

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  const worker = async () => {
    for (;;) {
      const index = nextIndex++;
      if (index >= values.length) return;
      results[index] = await mapper(values[index]);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker()),
  );
  return results;
}

type DiscordOAuthGuild = {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
};

async function fetchOAuthGuilds(accessToken: string): Promise<DiscordOAuthGuild[]> {
  const guilds: DiscordOAuthGuild[] = [];
  let after: string | null = null;

  for (;;) {
    const params = new URLSearchParams({ limit: '200', with_counts: 'false' });
    if (after) params.set('after', after);
    const response = await fetchExternal(`https://discord.com/api/v10/users/@me/guilds?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error(`Discord guilds API: ${response.status}`);
    const page = await response.json() as DiscordOAuthGuild[];
    guilds.push(...page);
    if (page.length < 200) return guilds;
    after = page[page.length - 1]?.id ?? null;
    if (!after) return guilds;
  }
}

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

  const user = await verifyAuth(req);
  if (!user) {
    json(res, 401, { error: 'Non authentifié' });
    return true;
  }

  // GET /api/user/me
  if (parts[2] === 'me' && method === 'GET') {
    const isBotAdmin = await resolveAdminAccess(client, user.userId);
    json(res, 200, { id: user.userId, username: user.username, avatar: user.avatar, isBotAdmin });
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

      const [isGlobalAdmin, staffLinks, oauthGuilds] = await Promise.all([
        resolveAdminAccess(client, user.userId),
        prisma.staffServerLink.findMany({
          where: { enabled: true },
          select: { mainGuildId: true, staffGuildId: true },
        }),
        user.discordToken
          ? fetchOAuthGuilds(user.discordToken).catch((err) => {
              logger.warn('DashboardAPI', `Discord OAuth guild list unavailable: ${String(err)}`);
              return null;
            })
          : Promise.resolve(null),
      ]);

      const accessibleGuildsList: Array<{
        id: string;
        name: string;
        icon: string | null;
        owner: boolean;
        botPresent: boolean;
        accessLevel: Exclude<DashboardAccessLevel, 'none'>;
        isStaffServer: boolean;
        pairedGuildId: string | null;
      }> = [];

      const staffGuildToMain = new Map(staffLinks.map((l) => [l.staffGuildId, l.mainGuildId]));
      const mainGuildToStaff = new Map(staffLinks.map((l) => [l.mainGuildId, l.staffGuildId]));

      const oauthById = new Map((oauthGuilds ?? []).map((guild) => [guild.id, guild]));
      const candidates = Array.from(client.guilds.cache.values()).filter((botGuild) => {
        if (instanceGuildIds && !instanceGuildIds.has(botGuild.id)) return false;
        if (!isGuildActivated(botGuild.id) && !isGlobalAdmin) return false;
        // Un administrateur global conserve la vue de toutes les guildes. Pour
        // les autres, l'intersection OAuth élimine immédiatement les serveurs
        // dont ils ne sont pas membres, sans un appel REST par guilde.
        return isGlobalAdmin || oauthGuilds === null || oauthById.has(botGuild.id);
      });

      const resolved = await mapWithConcurrency(candidates, 8, async (botGuild) => {
        const oauthGuild = oauthById.get(botGuild.id);
        let permissions = BigInt(0);
        try {
          permissions = oauthGuild?.permissions ? BigInt(oauthGuild.permissions) : BigInt(0);
        } catch {
          permissions = BigInt(0);
        }

        if (isGlobalAdmin || hasDashboardAdminPermission(permissions)) {
          return { botGuild, accessLevel: 'admin' as const, owner: oauthGuild?.owner ?? botGuild.ownerId === user.userId };
        }

        // Repli lorsque Discord OAuth est momentanément indisponible : la
        // concurrence est bornée, contrairement à l'ancienne waterfall.
        if (!oauthGuilds) {
          const member = await botGuild.members.fetch(user.userId).catch(() => null);
          if (!member) return null;
          permissions = member.permissions.bitfield;
          if (hasDashboardAdminPermission(permissions)) {
            return { botGuild, accessLevel: 'admin' as const, owner: botGuild.ownerId === user.userId };
          }
        }

        try {
          const access = await resolveDashboardAccess(client, botGuild.id, user.userId, permissions);
          if (!access.canViewDashboard) return null;
          return {
            botGuild,
            accessLevel: access.level === 'admin' ? 'admin' as const : 'moderator' as const,
            owner: oauthGuild?.owner ?? botGuild.ownerId === user.userId,
          };
        } catch (err) {
          logger.warn('DashboardAPI', `Failed to resolve access for guild ${botGuild.id}:`, err);
          return null;
        }
      });

      for (const entry of resolved) {
        if (!entry) continue;
        const { botGuild, accessLevel, owner } = entry;
        accessibleGuildsList.push({
          id: botGuild.id,
          name: botGuild.name ?? botGuild.id,
          icon: botGuild.icon ?? null,
          owner,
          botPresent: true,
          accessLevel,
          isStaffServer: staffGuildToMain.has(botGuild.id),
          pairedGuildId: staffGuildToMain.get(botGuild.id) ?? mainGuildToStaff.get(botGuild.id) ?? null,
        });
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
