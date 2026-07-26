import { IncomingMessage, ServerResponse } from 'node:http';
import { Client } from 'discord.js';
import prisma from '../../../utils/db.js';
import { logger } from '../../../utils/logger.js';
import {
  json,
  
  
  resolveDashboardAccess,
  
  
  
  
  
  resolveProfileRoleDisplay,
  type AuthClaims,
  type DashboardAccess,
} from '../../shared.js';
import {
  getStaffAlertsAndProgression,
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
} from '../../../services/staff/staffLeadershipService.js';
import {
  getStaffMember,
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
} from '../../../services/staff/staffManagementService.js';
import { getStaffProfileSnapshot } from '../../../services/progression/profileService.js';
import { handleAbsenceRoutes } from './leadership/absences.js';
import { handleMeetingRoutes } from './leadership/meetings.js';
import { handleTaskRoutes } from './leadership/tasks.js';
import { handleCallRoutes } from './leadership/calls.js';
import { handleApiKeyRoutes } from './leadership/apiKeys.js';
import { handleStaffRoutes } from './leadership/staff.js';
import { handleTestingPeriodRoutes } from './leadership/testingPeriods.js';
import { handleMentorReportRoutes } from './leadership/mentorReports.js';
import { handleNotificationRoutes } from './leadership/notifications.js';
import { handleTutoringRoutes } from './leadership/tutoring.js';
import { handleReminderRoutes } from './leadership/reminders.js';

/**
 * Handles global leadership routes (e.g. user profiles/stats under /api/dashboard/users/:userId/...)
 */
export async function handleLeadershipRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  parts: string[],
  url: URL,
  client: Client,
  user: AuthClaims
): Promise<boolean> {
  const method = req.method;
  const usersIdx = parts.indexOf('users');

  if (usersIdx !== -1 && method === 'GET') {
    const userId = parts[usersIdx + 1];
    if (!userId) {
      json(res, 400, { error: 'userId manquant' });
      return true;
    }

    // GET /api/dashboard/users/:userId/profile
    if (parts[usersIdx + 2] === 'profile') {
      try {
        const guildId = url.searchParams.get('guildId');
        if (!guildId) {
          json(res, 400, { error: 'guildId manquant' });
          return true;
        }

        const accessLevel = await resolveDashboardAccess(client, guildId, user.userId);
        if (accessLevel.level === 'none') {
          json(res, 403, { error: 'Accès refusé' });
          return true;
        }

        const requesterStaff = await getStaffMember(guildId, user.userId);
        const isManagerOrAdmin = accessLevel.canManageSettings || ['admin', 'moderator'].includes(accessLevel.level);
        if (!requesterStaff && !isManagerOrAdmin) {
          json(res, 403, { error: "Accès refusé. Vous devez faire partie de l'équipe staff pour voir ce profil." });
          return true;
        }

        const snapshot = await getStaffProfileSnapshot(guildId, userId);
        if (!snapshot) {
          json(res, 404, { error: 'Membre du staff introuvable' });
          return true;
        }

        const publicProfileRoleDisplay = snapshot.publicProfile
          ? await resolveProfileRoleDisplay(client, snapshot.publicProfile.guildId, snapshot.publicProfile.rolesSnapshot)
          : null;

        const isHighStaff = accessLevel.canManageSettings
          || ['admin', 'moderator'].includes(accessLevel.level)
          || (snapshot.staffMember.grade ?? '').toLowerCase().includes('direction');

        const accessibleTools: string[] = [];
        if (isHighStaff) {
          accessibleTools.push('Générateur Daily Algo');
          accessibleTools.push('Audit Code Police');
          accessibleTools.push('Management Staff');
          accessibleTools.push('Éditeur de Règlement');
        }

        const isOwnProfile = userId === user.userId;
        const canSeeSensitive = isOwnProfile || isManagerOrAdmin;

        json(res, 200, {
          staffMember: snapshot.staffMember,
          publicProfile: snapshot.publicProfile
            ? {
                ...snapshot.publicProfile,
                roles: publicProfileRoleDisplay?.roles ?? [],
                primaryRole: publicProfileRoleDisplay?.primaryRole ?? null,
              }
            : null,
          apiKeys: isOwnProfile
            ? snapshot.apiKeys.map((k) => ({
                id: k.id,
                displayKey: k.displayKey,
                name: k.name,
                permissions: k.permissions,
                lastUsedAt: k.lastUsedAt,
              }))
            : [],
          activeBlacklist: canSeeSensitive ? snapshot.activeBlacklist : null,
          blacklistHistory: canSeeSensitive ? snapshot.blacklistHistory : [],
          warnings: canSeeSensitive ? snapshot.warnings : [],
          testingPeriods: canSeeSensitive ? snapshot.testingPeriods : [],
          activities: snapshot.activities,
          absences: canSeeSensitive ? snapshot.absences : [],
          notesWritten: canSeeSensitive ? snapshot.notesWritten : [],
          notesAbout: canSeeSensitive ? snapshot.notesAbout : [],
          gradeHistory: canSeeSensitive ? snapshot.gradeHistory : [],
          stats: {
            ...snapshot.stats,
            activeWarnings: canSeeSensitive ? snapshot.stats.activeWarnings : 0,
            sanctionsIssued: canSeeSensitive ? snapshot.stats.sanctionsIssued : 0,
          },
          isBlacklisted: canSeeSensitive ? !!snapshot.activeBlacklist : false,
          blacklistReason: canSeeSensitive ? snapshot.activeBlacklist?.reason : null,
          blacklistEndDate: canSeeSensitive ? snapshot.activeBlacklist?.endDate : null,
          accessibleTools,
        });
      } catch (err) {
        logger.error('StaffAPI', 'Error getting user profile:', err);
        json(res, 500, { error: 'Erreur lors de la récupération du profil' });
      }
      return true;
    }

    // GET /api/dashboard/users/:userId/staff-stats
    if (parts[usersIdx + 2] === 'staff-stats') {
      try {
        const staffMember = await prisma.staffMember.findFirst({
          where: { userId },
          include: {
            warnings: { where: { isActive: true } },
            activities: { orderBy: { activityDate: 'desc' }, take: 30 },
          },
        });

        if (!staffMember) {
          json(res, 404, { error: 'Membre du staff introuvable' });
          return true;
        }

        const stats = {
          totalMessages: staffMember.activities.reduce((sum, a) => sum + a.messageCount, 0),
          totalVoiceMinutes: staffMember.activities.reduce((sum, a) => sum + a.voiceMinutes, 0),
          activeWarnings: staffMember.warnings.length,
          joinedStaffAt: staffMember.joinedStaffAt,
          currentRoleStartedAt: staffMember.currentRoleStartedAt,
          activities: staffMember.activities,
        };

        json(res, 200, { stats });
      } catch (err) {
        logger.error('StaffAPI', 'Error getting staff stats:', err);
        json(res, 500, { error: 'Erreur lors de la récupération des statistiques' });
      }
      return true;
    }
  }

  return false;
}

/**
 * Handles guild-specific leadership routes under /api/dashboard/guilds/:guildId/...
 */

/** Un handler par ressource ; chacun renvoie true s il a traite la requete. */
const LEADERSHIP_ROUTE_HANDLERS: Record<string, (
  req: IncomingMessage,
  res: ServerResponse,
  parts: string[],
  url: URL,
  client: Client,
  user: AuthClaims,
  guildId: string,
  access: DashboardAccess
) => Promise<boolean>> = {
  'absences': handleAbsenceRoutes,
  'meetings': handleMeetingRoutes,
  'tasks': handleTaskRoutes,
  'calls': handleCallRoutes,
  'api-keys': handleApiKeyRoutes,
  'staff': handleStaffRoutes,
  'testing-periods': handleTestingPeriodRoutes,
  'mentor-reports': handleMentorReportRoutes,
  'notifications': handleNotificationRoutes,
  'tutoring': handleTutoringRoutes,
  'reminders': handleReminderRoutes,
};

export async function handleGuildLeadershipRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  parts: string[],
  url: URL,
  client: Client,
  user: AuthClaims,
  guildId: string,
  access: DashboardAccess
): Promise<boolean> {
  const method = req.method;

  // 1. GET /api/dashboard/guilds/:guildId/leadership
  if (parts.length === 5 && parts[4] === 'leadership' && method === 'GET') {
    try {
      const metrics = await getStaffAlertsAndProgression(guildId);
      json(res, 200, { metrics });
    } catch (err) {
      logger.error('StaffAPI', 'Error getting leadership metrics:', err);
      json(res, 500, { error: 'Erreur lors de la récupération des métriques leadership' });
    }
    return true;
  }

  const handler = LEADERSHIP_ROUTE_HANDLERS[parts[4]];
  if (handler) {
    return handler(req, res, parts, url, client, user, guildId, access);
  }


  return false;
}
