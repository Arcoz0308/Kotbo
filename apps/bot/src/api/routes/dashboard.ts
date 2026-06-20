import { IncomingMessage, ServerResponse } from 'node:http';
import { Client } from 'discord.js';
import {
  json,
  verifyAuth,
  resolveAdminAccess,
  resolveDashboardAccess,
  resolveFeatureAccessMap,
} from '../shared.js';
import { isGuildActivated } from '../../utils/activation.js';
import { logger } from '../../utils/logger.js';
import { cache } from '../../utils/cache.js';

// Sub-routers imports
import { handleGeneralRoutes, handleGuildGeneralRoutes } from './dashboard/general.js';
import { handleAnalyticsRoutes } from './dashboard/analytics.js';
import { handleRecruitmentWebhookRoute, handleRecruitmentRoutes } from './dashboard/recruitment.js';
import { handleRecruitmentFormRoutes } from './dashboard/recruitmentForms.js';
import { handleCustomFormRoutes } from './dashboard/customForms.js';
import { handleMembersRoutes } from './dashboard/members.js';
import { handleLeadershipRoutes, handleGuildLeadershipRoutes } from './dashboard/leadership.js';
import { handleModulesRoutes } from './dashboard/modules.js';
import { handleEventsRoutes } from './dashboard/events.js';
import { handleGeneralistModulesRoutes } from './dashboard/generalistModules.js';
import { handleBackupRoutes } from './dashboard/backups.js';
import { handleScheduleRoutes } from './dashboard/schedules.js';
import { handleMCPKeyRoutes } from './dashboard/mcp.js';

export async function handleDashboardRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  parts: string[],
  url: URL,
  client: Client
): Promise<boolean> {
  const method = req.method;

  // 1. Check if the path belongs to api/dashboard
  if (parts[0] !== 'api' || parts[1] !== 'dashboard') {
    return false;
  }

  logger.info('DashboardRouting', `Incoming: ${method} ${url.pathname} | parts: ${JSON.stringify(parts)}`);

  // 2. Bypass authentication for recruitment webhook (POST /api/dashboard/guilds/:guildId/recruitment/candidatures)
  if (parts.length === 6 && parts[2] === 'guilds' && parts[4] === 'recruitment' && parts[5] === 'candidatures' && method === 'POST') {
    if (await handleRecruitmentWebhookRoute(req, res, parts, client)) {
      return true;
    }
  }

  // 3. Enforce authentication for all other dashboard routes
  const user = verifyAuth(req);
  if (!user) {
    json(res, 401, { error: 'Non authentifié' });
    return true;
  }

  // 4. Try general, non-guild-specific routes first (translate, list guilds, staff profile snapshots)
  if (await handleGeneralRoutes(req, res, parts, url, client, user)) {
    return true;
  }
  if (await handleLeadershipRoutes(req, res, parts, url, client, user)) {
    return true;
  }

  // 5. Check if it's a guild-specific route (/api/dashboard/guilds/:guildId/...)
  if (parts.length >= 4 && parts[2] === 'guilds') {
    const guildId = parts[3];

    // Check dashboard access
    const access = await resolveDashboardAccess(client, guildId, user.userId);
    if (!access.canViewDashboard) {
      json(res, 403, { error: 'Accès refusé au dashboard pour ce serveur.' });
      return true;
    }

    // Check guild activation (bypassed for owner and global admins, and during activation requests)
    const isGlobalAdmin = await resolveAdminAccess(client, user.userId);
    const isActivationRequest = parts.length === 5 && parts[4] === 'activate' && method === 'POST';
    if (!isGuildActivated(guildId) && !isActivationRequest && !isGlobalAdmin) {
      json(res, 403, { error: 'Activation requise', needsActivation: true });
      return true;
    }

    // Gating check for write actions
    const isSanctionAction = (parts.length === 6 || parts.length === 7)
      && parts[4] === 'sanctions'
      && parts[5] === 'reports'
      && (method === 'POST' || method === 'PATCH');

    const isDailyAlgoReviewAction = parts.length === 6
      && parts[4] === 'daily-algo-submissions'
      && method === 'PATCH';

    const isStaffAbsenceAction = parts.length === 5
      && parts[4] === 'absences'
      && method === 'POST';

    const isMeetingAction = parts[4] === 'meetings'
      && (method === 'POST' || method === 'PATCH' || method === 'DELETE');

    const isNotificationAction = parts[4] === 'notifications';

    const isNewsAction = parts[4] === 'news'
      && (method === 'POST' || method === 'PATCH' || method === 'DELETE');

    if (!access.canManageSettings && method !== 'GET' && !isSanctionAction && !isDailyAlgoReviewAction && !isStaffAbsenceAction && !isNotificationAction && !isMeetingAction && !isNewsAction) {
      json(res, 403, { error: 'Action réservée aux administrateurs du dashboard.' });
      return true;
    }

    if (isNewsAction && !access.canModerateContent) {
      json(res, 403, { error: 'Action de gestion des actualités non autorisée.' });
      return true;
    }

    if (isDailyAlgoReviewAction && !access.canModerateDailyAlgo) {
      json(res, 403, { error: 'Action de modération Daily Algo non autorisée.' });
      return true;
    }

    // Dispatch to guild-specific sub-routers
    if (await handleGuildGeneralRoutes(req, res, parts, url, client, user, guildId, access)) {
      if (method !== 'GET') await cache.invalidateGuild(guildId);
      return true;
    }
    if (await handleAnalyticsRoutes(req, res, parts, url, client, user, guildId, access)) {
      if (method !== 'GET') await cache.invalidateGuild(guildId);
      return true;
    }
    if (await handleRecruitmentRoutes(req, res, parts, url, client, user, guildId, access)) {
      if (method !== 'GET') await cache.invalidateGuild(guildId);
      return true;
    }
    if (await handleRecruitmentFormRoutes(req, res, parts, url, client, user, guildId, access)) {
      if (method !== 'GET') await cache.invalidateGuild(guildId);
      return true;
    }
    if (await handleCustomFormRoutes(req, res, parts, url, client, user, guildId, access)) {
      if (method !== 'GET') await cache.invalidateGuild(guildId);
      return true;
    }
    if (['linked-accounts', 'detections', 'members', 'invitations'].includes(parts[4])) {
      const discordGuild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
      const member = discordGuild ? await discordGuild.members.fetch(user.userId).catch(() => null) : null;
      const roleIds = member ? member.roles.cache.map((r) => r.id) : [];
      const featureAccess = await resolveFeatureAccessMap(client, guildId, access, user.userId, roleIds);
      if (await handleMembersRoutes(req, res, parts, url, client, user, guildId, access, featureAccess)) {
        if (method !== 'GET') await cache.invalidateGuild(guildId);
        return true;
      }
    }
    if (await handleGuildLeadershipRoutes(req, res, parts, url, client, user, guildId, access)) {
      if (method !== 'GET') await cache.invalidateGuild(guildId);
      return true;
    }
    if (await handleModulesRoutes(req, res, parts, url, client, user, guildId, access)) {
      if (method !== 'GET') await cache.invalidateGuild(guildId);
      return true;
    }
    if (await handleGeneralistModulesRoutes(req, res, parts, url, client, user, guildId, access)) {
      if (method !== 'GET') await cache.invalidateGuild(guildId);
      return true;
    }
    if (await handleEventsRoutes(req, res, parts, url, client, user, guildId, access)) {
      if (method !== 'GET') await cache.invalidateGuild(guildId);
      return true;
    }
    if (await handleBackupRoutes(req, res, parts, url, client, user)) {
      if (method !== 'GET') await cache.invalidateGuild(guildId);
      return true;
    }
    if (await handleScheduleRoutes(req, res, parts, url, client, user)) {
      if (method !== 'GET') await cache.invalidateGuild(guildId);
      return true;
    }
    if (await handleMCPKeyRoutes(req, res, parts, url, client, user, guildId, access)) {
      if (method !== 'GET') await cache.invalidateGuild(guildId);
      return true;
    }
  }

  return false;
}
