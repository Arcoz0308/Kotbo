import { IncomingMessage, ServerResponse } from 'node:http';
import { Client, ChannelType, PermissionFlagsBits, EmbedBuilder, TextChannel } from 'discord.js';
import prisma from '../../../utils/db.js';
import { logger } from '../../../utils/logger.js';
import { COLORS } from '../../../utils/embeds.js';
import {
  json,
  readJsonBody,
  getGuildName,
  resolveDashboardAccess,
  pushAudit,
  safePushAudit,
  extractDiscordSnowflake,
  describeUnknownError,
  resolveFeatureAccessMap,
  type AuthClaims,
  type DashboardAccess,
} from '../../shared.js';
import {
  getStaffAlertsAndProgression,
  getAbsences,
  createAbsence,
  deleteAbsence,
  updateAbsenceStatus,
  getMeetings,
  createMeeting,
  updateMeeting,
  deleteMeeting,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  createNotification,
  getStaffCalendarData,
  getPolls,
  createPoll,
  castPollVote,
  deleteManagerNote,
  getManagerNotes,
  createManagerNote,
  getCalls,
  createCall,
  updateCall,
  deleteCall,
  getTasks,
  createTask,
  updateTask,
  deleteTask,
} from '../../../services/staff/staffLeadershipService.js';
import {
  getStaffMember,
  addStaffMember,
  toggleTutorStatus,
  updateStaffGrade,
  removeStaffMember,
  getStaffMemberStats,
  issueStaffWarning,
  blacklistStaff,
  createTestingPeriod,
  addMentorReport,
  endTestingPeriod,
  getStaffRoles,
  createStaffRole,
  reorderStaffRoles,
  deleteStaffRole,
  updateStaffRole,
  createAPIKey,
  getAPIKeys,
  deleteAPIKey,
  hashAPIKey,
  generateAPIKey,
  getStaffHierarchies,
  createStaffHierarchy,
  updateStaffHierarchy,
  deleteStaffHierarchy,
  getHierarchySchema,
  addMemberToHierarchy,
  removeMemberFromHierarchy,
  syncStaffHierarchyMemberships,
  importRoleMembers,
} from '../../../services/staff/staffManagementService.js';
import { getStaffProfileSnapshot } from '../../../services/progression/profileService.js';
import * as tutoringService from '../../../services/core/tutoringService.js';
import * as altAccountService from '../../../services/moderation/altAccountService.js';
import { TutoringItemState } from '@prisma/client';

type RoleDisplay = {
  id: string;
  name: string;
};

type PrimaryRoleDisplay = RoleDisplay | null;

function isDisplayableRoleName(name: string): boolean {
  const trimmedName = name.trim();
  return trimmedName.length > 0 && trimmedName !== '@everyone' && !/^[\W_]+$/u.test(trimmedName);
}

async function resolveProfileRoleDisplay(client: Client, guildId: string, roleIds: string[]): Promise<{
  roles: RoleDisplay[];
  primaryRole: PrimaryRoleDisplay;
}> {
  const guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);

  if (!guild) {
    return { roles: [], primaryRole: null };
  }

  const resolvedRoles = roleIds
    .map((roleId) => guild.roles.cache.get(roleId) ?? guild.roles.cache.find((role) => role.name === roleId) ?? null)
    .filter((role): role is NonNullable<typeof role> => !!role && role.name !== '@everyone')
    .sort((left, right) => right.position - left.position || left.id.localeCompare(right.id));

  const primaryRole = resolvedRoles.find((role) => isDisplayableRoleName(role.name)) ?? resolvedRoles[0] ?? null;

  return {
    roles: resolvedRoles.map((role) => ({
      id: role.id,
      name: role.name,
    })),
    primaryRole: primaryRole
      ? {
          id: primaryRole.id,
          name: primaryRole.name,
        }
      : null,
  };
}

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
  const auditUser = user.username ?? `User${user.userId}`;

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

  // 2. Absences routes
  if (parts[4] === 'absences') {
    // GET /api/dashboard/guilds/:guildId/absences
    if (parts.length === 5 && method === 'GET') {
      try {
        const absences = await getAbsences(guildId);
        json(res, 200, { absences });
      } catch (err) {
        logger.error('StaffAPI', 'Error getting absences:', err);
        json(res, 500, { error: 'Erreur lors de la récupération des absences' });
      }
      return true;
    }

    // GET /api/dashboard/guilds/:guildId/absences/calendar-data
    if (parts.length === 6 && parts[5] === 'calendar-data' && method === 'GET') {
      const startStr = url.searchParams.get('start');
      const endStr = url.searchParams.get('end');
      const staffIdsStr = url.searchParams.get('staffIds');

      if (!startStr || !endStr) {
        json(res, 400, { error: 'start et end sont obligatoires' });
        return true;
      }

      try {
        const start = new Date(startStr);
        const end = new Date(endStr);
        const staffIds = staffIdsStr ? staffIdsStr.split(',') : undefined;

        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
          json(res, 400, { error: 'La période du calendrier est invalide' });
          return true;
        }

        const data = await getStaffCalendarData(guildId, start, end, staffIds);
        json(res, 200, data);
      } catch (err) {
        logger.error('StaffAPI', `Error getting calendar data for guild ${guildId}:`, err);
        json(res, 500, { error: 'Erreur lors de la récupération des données du calendrier' });
      }
      return true;
    }

    // GET /api/dashboard/guilds/:guildId/absences/config
    if (parts.length === 6 && parts[5] === 'config' && method === 'GET') {
      try {
        const config = await prisma.dashboardFeatureConfig.findUnique({
          where: { guildId_featureKey: { guildId, featureKey: 'absences' } },
          include: { roleAccess: true, roleAccessByRole: true, notificationTargets: true }
        });
        json(res, 200, { config });
      } catch (err) {
        logger.error('StaffAPI', 'Error getting absence config:', err);
        json(res, 500, { error: 'Erreur lors de la récupération de la configuration' });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/absences/config
    if (parts.length === 6 && parts[5] === 'config' && method === 'POST') {
      if (!access.canManageSettings) {
        json(res, 403, { error: 'Accès refusé' });
        return true;
      }

      try {
        const body = await readJsonBody<{
          managerRoleLevels: number[];
          webhookUrl?: string | null;
          channelId?: string | null;
          notificationRoleId?: string | null;
          notifyViaDiscordChannel?: boolean;
        }>(req);

        const currentConfig = await prisma.dashboardFeatureConfig.findUnique({
          where: { guildId_featureKey: { guildId, featureKey: 'absences' } }
        });

        const currentMetadata = (currentConfig?.metadata as Record<string, any>) || {};
        const updatedMetadata = {
          ...currentMetadata,
          webhookUrl: body?.webhookUrl ?? currentMetadata.webhookUrl
        };

        const config = await prisma.dashboardFeatureConfig.upsert({
          where: { guildId_featureKey: { guildId, featureKey: 'absences' } },
          update: {
            featureName: 'Absences Staff',
            channelId: body?.channelId ?? undefined,
            notificationRoleId: body?.notificationRoleId ?? undefined,
            notifyViaDiscordChannel: body?.notifyViaDiscordChannel ?? undefined,
            metadata: updatedMetadata,
          },
          create: {
            guildId,
            featureKey: 'absences',
            featureName: 'Absences Staff',
            channelId: body?.channelId ?? null,
            notificationRoleId: body?.notificationRoleId ?? null,
            notifyViaDiscordChannel: body?.notifyViaDiscordChannel ?? true,
            metadata: updatedMetadata,
          }
        });

        await prisma.dashboardRoleAccess.deleteMany({
          where: { featureConfigId: config.id }
        });

        if (body?.managerRoleLevels && body.managerRoleLevels.length > 0) {
          await prisma.dashboardRoleAccess.createMany({
            data: body.managerRoleLevels.map(level => ({
              guildId,
              featureConfigId: config.id,
              staffRoleLevel: level,
              canModerate: true,
              canView: true
            }))
          });
        }

        json(res, 200, { ok: true });
      } catch (err) {
        logger.error('StaffAPI', 'Error updating absence config:', err);
        json(res, 500, { error: 'Erreur lors de la mise à jour de la configuration' });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/absences
    if (parts.length === 5 && method === 'POST') {
      try {
        const body = await readJsonBody<{
          staffUserId?: string;
          type: string;
          startDate: string;
          endDate?: string;
          reason: string;
          superiorUserId: string;
          message?: string;
          confirmIndefinite?: boolean;
        }>(req);

        const staffUserId = body?.staffUserId?.trim() || user.userId;
        const type = body?.type?.trim();
        const reason = body?.reason?.trim();
        const superiorUserId = body?.superiorUserId?.trim();

        if (!type || !body?.startDate || !reason || !superiorUserId) {
          json(res, 400, { error: 'type, startDate, reason et superiorUserId sont obligatoires' });
          return true;
        }

        if (!access.canManageSettings && staffUserId !== user.userId) {
          json(res, 403, { error: 'Vous ne pouvez créer des absences que pour vous-même.' });
          return true;
        }

        if (staffUserId === superiorUserId) {
          json(res, 400, { error: 'Vous devez sélectionner un supérieur différent du membre absent' });
          return true;
        }

        const staffMember = await getStaffMember(guildId, staffUserId);
        if (!staffMember) {
          json(res, 404, { error: 'Le staff ciblé est introuvable' });
          return true;
        }

        const superiorStaff = await getStaffMember(guildId, superiorUserId);
        if (!superiorStaff) {
          json(res, 400, { error: 'Le supérieur indiqué ne fait pas partie du staff' });
          return true;
        }

        const startDate = new Date(body.startDate);
        const endDate = body.endDate ? new Date(body.endDate) : undefined;

        if (Number.isNaN(startDate.getTime()) || (endDate && Number.isNaN(endDate.getTime()))) {
          json(res, 400, { error: 'Date invalide' });
          return true;
        }

        if (endDate && endDate < startDate) {
          json(res, 400, { error: 'La date de fin doit être postérieure ou égale à la date de début' });
          return true;
        }

        if (!endDate && !body.confirmIndefinite) {
          json(res, 400, { error: 'Confirmez explicitement l\'absence indéterminée' });
          return true;
        }

        const absence = await createAbsence({
          guildId,
          staffMemberId: staffMember.id,
          startDate,
          endDate,
          reason,
          type,
          message: body.message,
          superiorUserId,
        });

        await pushAudit(guildId, {
          user: auditUser,
          action: 'Création absence',
          context: getGuildName(client, guildId),
          module: 'Staff Management',
          eventType: 'Manuel',
          details: `Absence ${absence.id} créée pour ${staffUserId} (${type})`,
          channelId: null,
        });

        json(res, 201, { absence });
      } catch (err) {
        logger.error('StaffAPI', 'Error creating absence:', err);
        json(res, 500, { error: err instanceof Error ? err.message : 'Erreur lors de la création de l\'absence' });
      }
      return true;
    }

    // PATCH /api/dashboard/guilds/:guildId/absences/:absenceId
    if (parts.length === 6 && method === 'PATCH') {
      const absenceId = parts[5];
      try {
        const body = await readJsonBody<{
          status: 'ACKNOWLEDGED' | 'APPROVED' | 'REJECTED' | 'CANCELED' | 'ENDED';
          note?: string;
        }>(req);

        if (!body?.status) {
          json(res, 400, { error: 'status est obligatoire' });
          return true;
        }

        const allowedStatuses = new Set(['ACKNOWLEDGED', 'APPROVED', 'REJECTED', 'CANCELED', 'ENDED']);
        if (!allowedStatuses.has(body.status)) {
          json(res, 400, { error: 'Status absence invalide' });
          return true;
        }

        const existingAbsence = await prisma.staffAbsence.findFirst({
          where: { id: absenceId, guildId },
          select: { id: true }
        });
        if (!existingAbsence) {
          json(res, 404, { error: 'Absence introuvable' });
          return true;
        }

        const absence = await updateAbsenceStatus(guildId, absenceId, body.status, user.userId, body.note);

        await pushAudit(guildId, {
          user: auditUser,
          action: `Décision absence (${body.status})`,
          context: getGuildName(client, guildId),
          module: 'Staff Management',
          eventType: 'Manuel',
          details: `Absence ${absenceId} mise au statut ${body.status}`,
          channelId: null,
        });

        json(res, 200, { absence });
      } catch (err) {
        logger.error('StaffAPI', 'Error updating absence status:', err);
        json(res, 500, { error: 'Erreur lors de la mise à jour de l\'absence' });
      }
      return true;
    }

    // DELETE /api/dashboard/guilds/:guildId/absences/:absenceId
    if (parts.length === 6 && method === 'DELETE') {
      const absenceId = parts[5];
      try {
        const absence = await prisma.staffAbsence.findFirst({
          where: { id: absenceId, guildId },
          include: { staffMember: true }
        });

        if (!absence) {
          json(res, 404, { error: 'Absence introuvable' });
          return true;
        }

        const isOwner = absence.staffMember.userId === user.userId;
        if (!isOwner && !access.canManageSettings) {
          json(res, 403, { error: 'Vous ne pouvez supprimer que vos propres absences.' });
          return true;
        }

        await deleteAbsence(guildId, absenceId);

        await pushAudit(guildId, {
          user: auditUser,
          action: 'Suppression absence',
          context: getGuildName(client, guildId),
          module: 'Staff Management',
          eventType: 'Manuel',
          details: `Absence ${absenceId} supprimée`,
          channelId: null,
        });

        json(res, 200, { ok: true });
      } catch (err) {
        logger.error('StaffAPI', 'Error deleting absence:', err);
        json(res, 500, { error: 'Erreur lors de la suppression de l\'absence' });
      }
      return true;
    }
  }

  // 3. Meetings routes
  if (parts[4] === 'meetings') {
    // GET /api/dashboard/guilds/:guildId/meetings
    if (parts.length === 5 && method === 'GET') {
      try {
        const meetings = await getMeetings(guildId);
        json(res, 200, { meetings });
      } catch (err) {
        logger.error('StaffAPI', 'Error getting meetings:', err);
        json(res, 500, { error: 'Erreur lors de la récupération des réunions' });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/meetings
    if (parts.length === 5 && method === 'POST') {
      try {
        const body = await readJsonBody<{
          title: string;
          description?: string;
          scheduledAt: string;
        }>(req);

        if (!body?.title || !body?.scheduledAt) {
          json(res, 400, { error: 'title et scheduledAt sont obligatoires' });
          return true;
        }

        const scheduledAt = new Date(body.scheduledAt);
        if (Number.isNaN(scheduledAt.getTime())) {
          json(res, 400, { error: 'Date de réunion invalide' });
          return true;
        }

        const meeting = await createMeeting(
          client,
          guildId,
          user.userId,
          body.title,
          body.description || '',
          scheduledAt
        );

        await pushAudit(guildId, {
          user: auditUser,
          action: 'Création réunion',
          context: getGuildName(client, guildId),
          module: 'Staff Management',
          eventType: 'Manuel',
          details: `Réunion "${body.title}" planifiée pour le ${scheduledAt.toLocaleString('fr-FR')}`,
          channelId: null,
        });

        json(res, 201, { meeting });
      } catch (err: any) {
        logger.error('StaffAPI', 'Error creating meeting:', err);
        json(res, err.message?.includes('Configurez') ? 400 : 500, { error: err.message || 'Erreur lors de la création de la réunion' });
      }
      return true;
    }

    // PATCH /api/dashboard/guilds/:guildId/meetings/:meetingId
    if (parts.length === 6 && method === 'PATCH') {
      const meetingId = parts[5];
      try {
        const body = await readJsonBody<{
          title?: string;
          description?: string;
          scheduledAt?: string;
          endedAt?: string;
          status?: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED';
        }>(req);

        const data: any = {};
        if (body?.title) data.title = body.title;
        if (body?.description !== undefined) data.description = body.description;
        if (body?.scheduledAt) data.scheduledAt = new Date(body.scheduledAt);
        if (body?.endedAt) data.endedAt = new Date(body.endedAt);
        if (body?.status) data.status = body.status;

        const meeting = await updateMeeting(client, guildId, meetingId, data);

        await pushAudit(guildId, {
          user: auditUser,
          action: 'Mise à jour réunion',
          context: getGuildName(client, guildId),
          module: 'Staff Management',
          eventType: 'Manuel',
          details: `Réunion ${meetingId} mise à jour. Statut: ${meeting.status}`,
          channelId: null,
        });

        json(res, 200, { meeting });
      } catch (err: any) {
        logger.error('StaffAPI', `Error updating meeting ${meetingId}: ${err.message}`, err.stack);
        json(res, 500, { error: 'Erreur lors de la mise à jour de la réunion', details: err.message });
      }
      return true;
    }

    // DELETE /api/dashboard/guilds/:guildId/meetings/:meetingId
    if (parts.length === 6 && method === 'DELETE') {
      const meetingId = parts[5];
      const deleteEvent = url.searchParams.get('deleteEvent') === 'true';
      const deleteMessage = url.searchParams.get('deleteMessage') === 'true';
      const deleteNotifications = url.searchParams.get('deleteNotifications') === 'true';

      try {
        await deleteMeeting(client, guildId, meetingId, { deleteEvent, deleteMessage, deleteNotifications });

        await pushAudit(guildId, {
          user: auditUser,
          action: 'Suppression réunion',
          context: getGuildName(client, guildId),
          module: 'Staff Management',
          eventType: 'Manuel',
          details: `Réunion ${meetingId} supprimée (Event: ${deleteEvent}, Msg: ${deleteMessage}, Notif: ${deleteNotifications}).`,
          channelId: null,
        });

        json(res, 200, { ok: true });
      } catch (err) {
        logger.error('StaffAPI', 'Error deleting meeting:', err);
        json(res, 500, { error: 'Erreur lors de la suppression de la réunion' });
      }
      return true;
    }
  }

  // Tasks routes
  if (parts[4] === 'tasks') {
    // GET /api/dashboard/guilds/:guildId/tasks
    if (parts.length === 5 && method === 'GET') {
      try {
        const assigneeId = url.searchParams.get('assigneeId') || undefined;
        const tasks = await getTasks(guildId, assigneeId);
        json(res, 200, { tasks });
      } catch (err) {
        logger.error('StaffAPI', 'Error getting tasks:', err);
        json(res, 500, { error: 'Erreur lors de la récupération des tâches' });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/tasks
    if (parts.length === 5 && method === 'POST') {
      try {
        const body = await readJsonBody<{
          title: string;
          description?: string | null;
          priority: 'LOW' | 'MEDIUM' | 'HIGH';
          dueDate?: string | null;
          assigneeId: string;
        }>(req);

        if (!body?.title || !body?.assigneeId) {
          json(res, 400, { error: 'title et assigneeId sont obligatoires' });
          return true;
        }

        const dueDate = body.dueDate ? new Date(body.dueDate) : null;
        const task = await createTask(
          guildId,
          user.userId,
          body.title,
          body.description || null,
          body.priority || 'MEDIUM',
          dueDate,
          body.assigneeId
        );

        await pushAudit(guildId, {
          user: auditUser,
          action: 'Création tâche',
          context: getGuildName(client, guildId),
          module: 'Staff Management',
          eventType: 'Manuel',
          details: `Tâche "${body.title}" créée pour ${body.assigneeId}`,
          channelId: null,
        });

        json(res, 201, { task });
      } catch (err: any) {
        logger.error('StaffAPI', 'Error creating task:', err);
        json(res, 500, { error: err.message || 'Erreur lors de la création de la tâche' });
      }
      return true;
    }

    // PATCH /api/dashboard/guilds/:guildId/tasks/:taskId
    if (parts.length === 6 && method === 'PATCH') {
      const taskId = parts[5];
      try {
        const body = await readJsonBody<{
          title?: string;
          description?: string | null;
          status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
          priority?: 'LOW' | 'MEDIUM' | 'HIGH';
          dueDate?: string | null;
          assigneeId?: string;
        }>(req);

        const updateData: any = {};
        if (body?.title) updateData.title = body.title;
        if (body?.description !== undefined) updateData.description = body.description;
        if (body?.status) updateData.status = body.status;
        if (body?.priority) updateData.priority = body.priority;
        if (body?.dueDate !== undefined) updateData.dueDate = body.dueDate ? new Date(body.dueDate) : null;
        if (body?.assigneeId) updateData.assigneeId = body.assigneeId;

        const task = await updateTask(taskId, updateData);

        await pushAudit(guildId, {
          user: auditUser,
          action: 'Mise à jour tâche',
          context: getGuildName(client, guildId),
          module: 'Staff Management',
          eventType: 'Manuel',
          details: `Tâche ${taskId} mise à jour. Statut: ${task.status}`,
          channelId: null,
        });

        json(res, 200, { task });
      } catch (err: any) {
        logger.error('StaffAPI', 'Error updating task:', err);
        json(res, 500, { error: err.message || 'Erreur lors de la mise à jour de la tâche' });
      }
      return true;
    }

    // DELETE /api/dashboard/guilds/:guildId/tasks/:taskId
    if (parts.length === 6 && method === 'DELETE') {
      const taskId = parts[5];
      try {
        await deleteTask(taskId);

        await pushAudit(guildId, {
          user: auditUser,
          action: 'Suppression tâche',
          context: getGuildName(client, guildId),
          module: 'Staff Management',
          eventType: 'Manuel',
          details: `Tâche ${taskId} supprimée`,
          channelId: null,
        });

        json(res, 200, { ok: true });
      } catch (err) {
        logger.error('StaffAPI', 'Error deleting task:', err);
        json(res, 500, { error: 'Erreur lors de la suppression de la tâche' });
      }
      return true;
    }
  }

  // Calls routes
  if (parts[4] === 'calls') {
    // GET /api/dashboard/guilds/:guildId/calls
    if (parts.length === 5 && method === 'GET') {
      try {
        const calls = await getCalls(guildId);
        json(res, 200, { calls });
      } catch (err) {
        logger.error('StaffAPI', 'Error getting calls:', err);
        json(res, 500, { error: 'Erreur lors de la récupération des appels' });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/calls
    if (parts.length === 5 && method === 'POST') {
      try {
        const body = await readJsonBody<{
          title: string;
          description?: string | null;
          scheduledAt: string;
          channelMode: string;
          channelType?: string | null;
          discordChannelId?: string | null;
          isTempChannel?: boolean;
          inviteeUserIds?: string[];
        }>(req);

        if (!body?.title || !body?.scheduledAt || !body?.channelMode) {
          json(res, 400, { error: 'title, scheduledAt et channelMode sont obligatoires' });
          return true;
        }

        const scheduledAt = new Date(body.scheduledAt);
        if (Number.isNaN(scheduledAt.getTime())) {
          json(res, 400, { error: 'Date d\'appel invalide' });
          return true;
        }

        const call = await createCall(
          client,
          guildId,
          user.userId,
          body.title,
          body.description || null,
          scheduledAt,
          body.channelMode,
          body.channelType || null,
          body.discordChannelId || null,
          body.isTempChannel !== false,
          body.inviteeUserIds || []
        );

        await pushAudit(guildId, {
          user: auditUser,
          action: 'Création appel',
          context: getGuildName(client, guildId),
          module: 'Staff Management',
          eventType: 'Manuel',
          details: `Appel "${body.title}" planifié pour le ${scheduledAt.toLocaleString('fr-FR')}`,
          channelId: null,
        });

        json(res, 201, { call });
      } catch (err: any) {
        logger.error('StaffAPI', 'Error creating call:', err);
        json(res, 500, { error: err.message || 'Erreur lors de la planification de l\'appel' });
      }
      return true;
    }

    // PATCH /api/dashboard/guilds/:guildId/calls/:callId
    if (parts.length === 6 && method === 'PATCH') {
      const callId = parts[5];
      try {
        const body = await readJsonBody<{
          title?: string;
          description?: string | null;
          scheduledAt?: string;
          endedAt?: string;
          status?: 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELED';
          invitees?: string[];
        }>(req);

        const updateData: any = {};
        if (body?.title) updateData.title = body.title;
        if (body?.description !== undefined) updateData.description = body.description;
        if (body?.scheduledAt) updateData.scheduledAt = new Date(body.scheduledAt);
        if (body?.endedAt) updateData.endedAt = new Date(body.endedAt);
        if (body?.status) updateData.status = body.status;
        if (body?.invitees) updateData.invitees = body.invitees;

        const call = await updateCall(client, guildId, callId, updateData);

        await pushAudit(guildId, {
          user: auditUser,
          action: 'Mise à jour appel',
          context: getGuildName(client, guildId),
          module: 'Staff Management',
          eventType: 'Manuel',
          details: `Appel ${callId} mis à jour. Statut: ${call.status}`,
          channelId: null,
        });

        json(res, 200, { call });
      } catch (err: any) {
        logger.error('StaffAPI', 'Error updating call:', err);
        json(res, 500, { error: err.message || 'Erreur lors de la mise à jour de l\'appel' });
      }
      return true;
    }

    // DELETE /api/dashboard/guilds/:guildId/calls/:callId
    if (parts.length === 6 && method === 'DELETE') {
      const callId = parts[5];
      try {
        await deleteCall(client, guildId, callId);

        await pushAudit(guildId, {
          user: auditUser,
          action: 'Suppression appel',
          context: getGuildName(client, guildId),
          module: 'Staff Management',
          eventType: 'Manuel',
          details: `Appel ${callId} supprimé`,
          channelId: null,
        });

        json(res, 200, { ok: true });
      } catch (err) {
        logger.error('StaffAPI', 'Error deleting call:', err);
        json(res, 500, { error: 'Erreur lors de la suppression de l\'appel' });
      }
      return true;
    }
  }

  // 4. API Keys routes
  if (parts[4] === 'api-keys') {
    // POST /api/dashboard/guilds/:guildId/api-keys
    if (method === 'POST' && !parts[5]) {
      try {
        const body = await readJsonBody<{
          name?: string;
          permissions?: string[];
        }>(req);

        const { fullKey, displayKey } = generateAPIKey();
        const keyHash = hashAPIKey(fullKey);

        const apiKey = await createAPIKey(
          guildId,
          user.userId,
          keyHash,
          displayKey,
          body?.name || 'Mon clé API',
          body?.permissions || ['daily_algo:create_exercise']
        );

        await pushAudit(guildId, {
          user: user.username ?? `User${user.userId}`,
          action: 'Création clé API',
          context: getGuildName(client, guildId),
          module: 'Staff Management',
          eventType: 'Manuel',
          details: `Clé API créée: ${displayKey}`,
          channelId: null
        });

        json(res, 201, {
          id: apiKey.id,
          fullKey,
          displayKey: apiKey.displayKey,
          name: apiKey.name,
          permissions: apiKey.permissions,
        });
      } catch (err) {
        logger.error('StaffAPI', 'Error creating API key:', err);
        json(res, 500, { error: 'Erreur lors de la création de la clé API' });
      }
      return true;
    }

    // GET /api/dashboard/guilds/:guildId/api-keys
    if (method === 'GET' && !parts[5]) {
      try {
        const keys = await getAPIKeys(guildId, user.userId);
        json(res, 200, { keys });
      } catch (err) {
        logger.error('StaffAPI', 'Error getting API keys:', err);
        json(res, 500, { error: 'Erreur lors de la récupération des clés API' });
      }
      return true;
    }

    // DELETE /api/dashboard/guilds/:guildId/api-keys/:keyId
    if (method === 'DELETE' && parts[5]) {
      const keyId = parts[5];
      try {
        const key = await prisma.aPIKey.findUnique({ where: { id: keyId } });
        if (!key) {
          json(res, 404, { error: 'Clé API introuvable' });
          return true;
        }
        const requesterStaff = await getStaffMember(guildId, user.userId);
        if (!requesterStaff || (key.createdByUserId !== requesterStaff.id && access.level !== 'admin')) {
          json(res, 403, { error: 'Non autorisé à supprimer cette clé API' });
          return true;
        }

        await deleteAPIKey(keyId);

        await pushAudit(guildId, {
          user: user.username ?? `User${user.userId}`,
          action: 'Suppression clé API',
          context: getGuildName(client, guildId),
          module: 'Staff Management',
          eventType: 'Manuel',
          details: `Clé API supprimée: ${keyId}`,
          channelId: null
        });

        json(res, 200, { ok: true });
      } catch (err) {
        logger.error('StaffAPI', 'Error deleting API key:', err);
        json(res, 500, { error: 'Erreur lors de la suppression de la clé API' });
      }
      return true;
    }
  }

  // 5. Staff routes
  if (parts[4] === 'staff') {
    const isModerator = access.level === 'admin' || access.level === 'moderator';
    if (!isModerator) {
      json(res, 403, { error: 'Accès modérateur requis' });
      return true;
    }

    const isMentorReportPost = parts[5] === 'mentor-reports' && method === 'POST';
    if (method !== 'GET' && !isMentorReportPost) {
      let hasConfigurePermission = access.level === 'admin';

      if (!hasConfigurePermission) {
        const discordGuild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
        const member = discordGuild ? await discordGuild.members.fetch(user.userId).catch(() => null) : null;
        const roleIds = member ? Array.from(member.roles.cache.keys()) : [];
        const featureAccess = await resolveFeatureAccessMap(client, guildId, access, user.userId, roleIds);

        if (parts[5] === 'roles') {
          hasConfigurePermission = !!featureAccess.staff_roles?.canConfigure;
        } else if (parts[5] === 'members') {
          hasConfigurePermission = !!featureAccess.staff_directory?.canConfigure;
        } else if (parts[5] === 'warnings') {
          hasConfigurePermission = !!featureAccess.discipline?.canConfigure;
        } else if (parts[5] === 'blacklist') {
          hasConfigurePermission = !!featureAccess.discipline?.canConfigure;
        } else if (parts[5] === 'config') {
          hasConfigurePermission = !!featureAccess.staff_roles?.canConfigure || !!featureAccess.staff_directory?.canConfigure;
        } else if (parts[5] === 'hierarchies') {
          hasConfigurePermission = !!featureAccess.staff_roles?.canConfigure;
        }
      }

      if (!hasConfigurePermission) {
        json(res, 403, { error: 'Accès administrateur ou permission de configuration requise' });
        return true;
      }
    }

    // GET /api/dashboard/guilds/:guildId/staff/algo-schedule
    if (parts[5] === 'algo-schedule' && method === 'GET' && !parts[6]) {
      try {
        const rangeDays = Number(url.searchParams.get('range') || '14');
        const runs = await prisma.dailyAlgoRun.findMany({
          where: { guildId },
          include: { problem: true },
          orderBy: { createdAt: 'desc' },
          take: rangeDays
        });
        json(res, 200, { runs });
      } catch (err) {
        logger.error('StaffAPI', 'Error getting algo schedule:', err);
        json(res, 500, { error: 'Erreur lors de la récupération du planning Daily Algo' });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/staff/algo-ensure
    if (parts[5] === 'algo-ensure' && method === 'POST') {
      try {
        json(res, 200, { ok: true, message: 'Génération de planning demandée' });
      } catch (err) {
        logger.error('StaffAPI', 'Error triggering algo ensure:', err);
        json(res, 500, { error: 'Erreur lors de la génération du planning' });
      }
      return true;
    }

    // GET /api/dashboard/guilds/:guildId/staff/alerts
    if (parts[5] === 'alerts' && method === 'GET' && !parts[6]) {
      try {
        const metrics = await getStaffAlertsAndProgression(guildId);
        json(res, 200, { metrics });
      } catch (err) {
        logger.error('StaffAPI', 'Error getting staff alerts:', err);
        json(res, 500, { error: 'Erreur lors de la récupération des alertes' });
      }
      return true;
    }

    // GET /api/dashboard/guilds/:guildId/staff/discord-members
    if (parts[5] === 'discord-members' && method === 'GET' && !parts[6]) {
      try {
        const rawQuery = (url.searchParams.get('q') ?? url.searchParams.get('query') ?? '').trim();
        const staffOnly = url.searchParams.get('staffOnly') === 'true';
        const parsedLimit = Number(url.searchParams.get('limit') ?? '12');
        const limit = Number.isFinite(parsedLimit)
          ? Math.min(25, Math.max(1, Math.trunc(parsedLimit)))
          : 12;

        const discordGuild = client.guilds.cache.get(guildId)
          ?? await client.guilds.fetch(guildId).catch(() => null);

        if (!discordGuild) {
          json(res, 404, { error: 'Serveur Discord introuvable' });
          return true;
        }

        const mentionMatch = rawQuery.match(/<@!?(\d{15,25})>/);
        const directId = mentionMatch?.[1] ?? (/^\d{15,25}$/.test(rawQuery) ? rawQuery : null);

        let candidates = [] as Array<{
          id: string;
          username: string;
          displayName: string | null;
          userTag: string | null;
          avatarUrl: string | null;
          roleIds: string[];
        }>;

        if (directId) {
          const member = await discordGuild.members.fetch(directId).catch(() => null);
          if (member && !member.user.bot) {
            candidates = [{
              id: member.user.id,
              username: member.user.username,
              displayName: member.displayName ?? null,
              userTag: member.user.tag ?? null,
              avatarUrl: member.displayAvatarURL() || null,
              roleIds: member.roles.cache
                .map((role) => role.id)
                .filter((roleId) => roleId !== discordGuild.roles.everyone.id),
            }];
          }
        } else if (rawQuery) {
          const query = rawQuery.replace(/^@+/, '').trim();
          const members = await discordGuild.members.search({ query, limit }).catch(() => null);

          candidates = members
            ? members
              .filter((member) => !member.user.bot)
              .map((member) => ({
                id: member.user.id,
                username: member.user.username,
                displayName: member.displayName ?? null,
                userTag: member.user.tag ?? null,
                avatarUrl: member.displayAvatarURL() || null,
                roleIds: member.roles.cache
                  .map((role) => role.id)
                  .filter((roleId) => roleId !== discordGuild.roles.everyone.id),
              }))
            : [];
        }

        if (staffOnly) {
          const staffMembers = await prisma.staffMember.findMany({
            where: { guildId },
            select: { userId: true }
          });
          const staffUserIds = new Set(staffMembers.map(m => m.userId));
          candidates = candidates.filter(c => staffUserIds.has(c.id));
        }

        const members = candidates
          .sort((a, b) => (a.displayName || a.username).localeCompare((b.displayName || b.username), 'fr'))
          .slice(0, limit);

        json(res, 200, { members });
      } catch (err) {
        logger.error('StaffAPI', 'Error searching Discord members:', err);
        json(res, 500, { error: 'Erreur lors de la recherche des membres Discord' });
      }
      return true;
    }

    // GET /api/dashboard/guilds/:guildId/staff/members
    if (parts[5] === 'members' && method === 'GET' && !parts[6]) {
      try {
        await syncStaffHierarchyMemberships(guildId).catch(() => null);

        const members = await prisma.staffMember.findMany({
          where: { guildId },
          include: {
            warnings: { where: { isActive: true } },
            blacklistEntries: { where: { isActive: true } },
            testingPeriods: { where: { status: 'ONGOING' } },
            hierarchyGrades: { include: { hierarchy: true } },
          },
          orderBy: { grade: 'asc' },
        });

        json(res, 200, { members });
      } catch (err) {
        logger.error('StaffAPI', 'Error listing staff members:', err);
        json(res, 500, { error: 'Erreur lors de la récupération des membres staff' });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/staff/members
    if (parts[5] === 'members' && method === 'POST' && !parts[6]) {
      try {
        const body = await readJsonBody<{
          userId: string;
          grade: string;
          userTag?: string;
          username?: string;
          displayName?: string;
          avatarUrl?: string;
          createTestingPeriod?: boolean;
        }>(req);

        if (!body?.userId || !body?.grade) {
          json(res, 400, { error: 'userId et grade sont obligatoires' });
          return true;
        }

        const member = await addStaffMember(
          guildId,
          body.userId,
          body.grade as any,
          body.userTag,
          body.username,
          body.displayName,
          body.avatarUrl,
        );

        if (body.createTestingPeriod !== false) {
          await createTestingPeriod(guildId, body.userId);
        }

        await pushAudit(guildId, {
          user: user.username ?? `User${user.userId}`,
          action: 'Ajout membre staff',
          context: getGuildName(client, guildId),
          module: 'Staff Management',
          eventType: 'Manuel',
          details: `Nouveau membre staff: ${body.username || body.userId} (${body.grade}) (Tutorat: ${body.createTestingPeriod !== false ? 'OUI' : 'NON'})`,
          channelId: null
        });

        json(res, 201, { member });
      } catch (err) {
        logger.error('StaffAPI', 'Error adding staff member:', err);
        json(res, 500, { error: 'Erreur lors de l\'ajout du membre staff' });
      }
      return true;
    }

    // GET /api/dashboard/guilds/:guildId/staff/members/:userId
    if (parts[5] === 'members' && parts[6] && method === 'GET' && !parts[7]) {
      const staffUserId = parts[6];
      try {
        const stats = await getStaffMemberStats(guildId, staffUserId);
        json(res, 200, stats);
      } catch (err) {
        logger.error('StaffAPI', 'Error getting staff member details:', err);
        json(res, 500, { error: 'Erreur lors de la récupération des détails' });
      }
      return true;
    }

    // PATCH /api/dashboard/guilds/:guildId/staff/members/:userId
    if (parts[5] === 'members' && parts[6] && method === 'PATCH' && !parts[7]) {
      const staffUserId = parts[6];
      try {
        const body = await readJsonBody<{
          grade?: string;
          action?: string;
        }>(req);

        if (body?.grade) {
          await updateStaffGrade(guildId, staffUserId, body.grade as any);

          await pushAudit(guildId, {
            user: user.username ?? `User${user.userId}`,
            action: 'Changement de grade staff',
            context: getGuildName(client, guildId),
            module: 'Staff Management',
            eventType: 'Manuel',
            details: `Grade changé pour ${staffUserId}: ${body.grade}`,
            channelId: null
          });
        }

        if (body?.action === 'remove') {
          await removeStaffMember(guildId, staffUserId);

          await pushAudit(guildId, {
            user: user.username ?? `User${user.userId}`,
            action: 'Retrait member staff',
            context: getGuildName(client, guildId),
            module: 'Staff Management',
            eventType: 'Manuel',
            details: `Membre staff retiré: ${staffUserId}`,
            channelId: null
          });
        }

        json(res, 200, { ok: true });
      } catch (err) {
        logger.error('StaffAPI', 'Error updating staff member:', err);
        json(res, 500, { error: 'Erreur lors de la mise à jour du membre staff' });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/staff/members/:userId/tutor
    if (parts[5] === 'members' && parts[6] && parts[7] === 'tutor' && method === 'POST') {
      const staffUserId = parts[6];
      try {
        const member = await toggleTutorStatus(guildId, staffUserId);

        await pushAudit(guildId, {
          user: user.username ?? `User${user.userId}`,
          action: member.isTutor ? 'Activation tuteur' : 'Désactivation tuteur',
          context: getGuildName(client, guildId),
          module: 'Staff Management',
          eventType: 'Manuel',
          details: `Statut tuteur modifié pour ${staffUserId}: ${member.isTutor ? 'ON' : 'OFF'}`,
          channelId: null
        });

        json(res, 200, { member });
      } catch (err) {
        logger.error('StaffAPI', 'Error toggling tutor status:', err);
        json(res, 500, { error: 'Erreur lors de la modification du statut tuteur' });
      }
      return true;
    }

    // GET /api/dashboard/guilds/:guildId/staff/:staffUserId/notes (checks regex ID)
    if (/^\d+$/.test(parts[5]) && parts[6] === 'notes' && method === 'GET') {
      const staffUserId = parts[5];
      try {
        const notes = await getManagerNotes(guildId, staffUserId);
        json(res, 200, { notes });
      } catch (err) {
        logger.error('StaffAPI', 'Error getting manager notes:', err);
        json(res, 500, { error: 'Erreur lors de la récupération des notes' });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/staff/:staffUserId/notes
    if (/^\d+$/.test(parts[5]) && parts[6] === 'notes' && method === 'POST') {
      const staffUserId = parts[5];
      try {
        const body = await readJsonBody<{ content: string }>(req);

        if (!body?.content) {
          json(res, 400, { error: 'Le contenu de la note est requis' });
          return true;
        }
        const note = await createManagerNote(guildId, staffUserId, user.userId, body.content);

        await pushAudit(guildId, {
          user: user.username ?? `User${user.userId}`,
          action: 'Ajout note manager',
          context: getGuildName(client, guildId),
          module: 'Staff Management',
          eventType: 'Manuel',
          details: `Note ajoutée pour le membre ${staffUserId}`,
          channelId: null
        });

        json(res, 201, { note });
      } catch (err) {
        logger.error('StaffAPI', 'Error creating manager note:', err);
        json(res, 500, { error: 'Erreur lors de la création de la note' });
      }
      return true;
    }

    // DELETE /api/dashboard/guilds/:guildId/staff/:staffUserId/notes/:noteId
    if (/^\d+$/.test(parts[5]) && parts[6] === 'notes' && parts[7] && method === 'DELETE') {
      const noteId = parts[7];
      try {
        await deleteManagerNote(noteId);

        await pushAudit(guildId, {
          user: user.username ?? `User${user.userId}`,
          action: 'Suppression note manager',
          context: getGuildName(client, guildId),
          module: 'Staff Management',
          eventType: 'Manuel',
          details: `Note supprimée: ${noteId}`,
          channelId: null
        });

        json(res, 200, { ok: true });
      } catch (err) {
        logger.error('StaffAPI', 'Error deleting manager note:', err);
        json(res, 500, { error: 'Erreur lors de la suppression de la note' });
      }
      return true;
    }

    // GET /api/dashboard/guilds/:guildId/staff/warnings
    if (parts[5] === 'warnings' && method === 'GET' && !parts[6]) {
      try {
        const warnings = await prisma.staffWarning.findMany({
          where: { guildId },
          include: { staffMember: true },
          orderBy: { createdAt: 'desc' },
        });

        const formattedWarnings = await Promise.all(warnings.map(async (w) => {
          const issuedBy = await client.users.fetch(w.issuedByUserId).catch(() => null);
          return {
            id: w.id,
            staffUserId: w.staffMember.userId,
            staffDisplayName: w.staffMember.displayName || w.staffMember.username,
            staffAvatarUrl: w.staffMember.avatarUrl,
            reason: w.reason,
            issuedByTag: issuedBy?.tag || w.issuedByUserId,
            createdAt: w.createdAt.toISOString(),
            expiresAt: w.expiresAt?.toISOString() || null,
            isActive: w.isActive,
          };
        }));

        json(res, 200, { warnings: formattedWarnings });
      } catch (err) {
        logger.error('StaffAPI', 'Error fetching staff warnings:', err);
        json(res, 500, { error: 'Erreur lors de la récupération des avertissements staff' });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/staff/warnings
    if (parts[5] === 'warnings' && method === 'POST' && !parts[6]) {
      try {
        const body = await readJsonBody<{
          staffUserId: string;
          reason: string;
          expiresAt?: string;
        }>(req);

        if (!body?.staffUserId || !body?.reason) {
          json(res, 400, { error: 'staffUserId et reason sont obligatoires' });
          return true;
        }

        const warning = await issueStaffWarning(
          guildId,
          body.staffUserId,
          user.userId,
          body.reason,
          body.expiresAt ? new Date(body.expiresAt) : undefined
        );

        await pushAudit(guildId, {
          user: user.username ?? `User${user.userId}`,
          action: 'Avertissement staff',
          context: getGuildName(client, guildId),
          module: 'Staff Management',
          eventType: 'Manuel',
          details: `Avertissement généré: ${body.reason}`,
          channelId: null
        });

        json(res, 201, { warning });
      } catch (err) {
        logger.error('StaffAPI', 'Error issuing warning:', err);
        json(res, 500, { error: 'Erreur lors de la génération de l\'avertissement' });
      }
      return true;
    }

    // DELETE /api/dashboard/guilds/:guildId/staff/warnings/:warningId
    if (parts[5] === 'warnings' && parts[6] && method === 'DELETE') {
      const warningId = parts[6];
      try {
        const warning = await prisma.staffWarning.findFirst({
          where: { id: warningId, guildId },
          include: { staffMember: true }
        });

        if (!warning) {
          json(res, 404, { error: 'Avertissement introuvable' });
          return true;
        }

        await prisma.staffWarning.delete({
          where: { id: warningId },
        });

        await pushAudit(guildId, {
          user: user.username ?? `User${user.userId}`,
          action: 'Suppression avertissement staff',
          context: getGuildName(client, guildId),
          module: 'Staff Management',
          eventType: 'Manuel',
          details: `Avertissement supprimé pour ${warning.staffMember.username || warning.staffMember.userId}: ${warning.reason}`,
          channelId: null
        });

        json(res, 200, { ok: true });
      } catch (err) {
        logger.error('StaffAPI', 'Error deleting staff warning:', err);
        json(res, 500, { error: 'Erreur lors de la suppression de l\'avertissement' });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/staff/blacklist
    if (parts[5] === 'blacklist' && method === 'POST' && !parts[6]) {
      try {
        const body = await readJsonBody<{
          staffUserId: string;
          reason: string;
          endDate?: string;
        }>(req);

        if (!body?.staffUserId || !body?.reason) {
          json(res, 400, { error: 'staffUserId et reason sont obligatoires' });
          return true;
        }

        const blacklist = await blacklistStaff(
          guildId,
          body.staffUserId,
          user.userId,
          body.reason,
          body.endDate ? new Date(body.endDate) : undefined
        );

        await pushAudit(guildId, {
          user: user.username ?? `User${user.userId}`,
          action: 'Blacklist staff',
          context: getGuildName(client, guildId),
          module: 'Staff Management',
          eventType: 'Manuel',
          details: `Blacklist appliquée: ${body.reason}`,
          channelId: null
        });

        json(res, 201, { blacklist });
      } catch (err) {
        logger.error('StaffAPI', 'Error blacklisting staff:', err);
        json(res, 500, { error: 'Erreur lors de la blacklist' });
      }
      return true;
    }

    // DELETE /api/dashboard/guilds/:guildId/staff/blacklist/:userId
    if (parts[5] === 'blacklist' && parts[6] && method === 'DELETE') {
      const targetUserId = parts[6];
      try {
        const linkedUserIds = await altAccountService.getAllLinkedUserIds(guildId, targetUserId);
        const members = await prisma.staffMember.findMany({
          where: { guildId, userId: { in: linkedUserIds } }
        });

        if (members.length === 0) {
          json(res, 404, { error: 'Membre staff introuvable' });
          return true;
        }

        await prisma.staffBlacklist.updateMany({
          where: {
            guildId,
            staffUserId: { in: members.map((member) => member.id) },
            isActive: true
          },
          data: {
            isActive: false
          }
        });

        await Promise.all(
          members
            .filter((member) => member.grade === 'Blacklisted')
            .map((member) => prisma.staffMember.delete({ where: { id: member.id } }).catch(() => null))
        );

        await pushAudit(guildId, {
          user: user.username ?? `User${user.userId}`,
          action: 'Retrait blacklist staff',
          context: getGuildName(client, guildId),
          module: 'Staff Management',
          eventType: 'Manuel',
          details: `Blacklist retirée pour ${members.map((member) => member.username || member.userId).join(', ')}`,
          channelId: null
        });

        json(res, 200, { ok: true });
      } catch (err) {
        logger.error('StaffAPI', 'Error removing from staff blacklist:', err);
        json(res, 500, { error: 'Erreur lors du retrait de la blacklist' });
      }
      return true;
    }

    // GET /api/dashboard/guilds/:guildId/staff/roles
    if (parts[5] === 'roles' && method === 'GET' && !parts[6]) {
      try {
        const roles = await getStaffRoles(guildId);
        json(res, 200, { roles });
      } catch (err) {
        logger.error('StaffAPI', 'Error getting staff roles:', err);
        json(res, 500, { error: 'Erreur lors de la récupération des rôles staff' });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/staff/roles
    if (parts[5] === 'roles' && method === 'POST' && !parts[6]) {
      try {
        const body = await readJsonBody<{
          name: string;
          level: number;
          discordRoleId?: string;
          color?: string;
          hierarchyId?: string;
          isResponsable?: boolean;
        }>(req);

        if (!body?.name || typeof body?.level !== 'number') {
          json(res, 400, { error: 'name et level sont obligatoires' });
          return true;
        }

        const role = await createStaffRole(
          guildId,
          body.name,
          body.level,
          body.discordRoleId,
          body.color,
          body.hierarchyId,
          body.isResponsable
        );

        await pushAudit(guildId, {
          user: user.username ?? `User${user.userId}`,
          action: 'Création rôle staff',
          context: getGuildName(client, guildId),
          module: 'Staff Management',
          eventType: 'Manuel',
          details: `Nouveau rôle staff: ${body.name}`,
          channelId: null
        });

        json(res, 201, { role });
      } catch (err) {
        logger.error('StaffAPI', 'Error creating staff role:', err);
        json(res, 500, { error: 'Erreur lors de la création du rôle staff' });
      }
      return true;
    }

    // PATCH /api/dashboard/guilds/:guildId/staff/roles/order
    if (parts[5] === 'roles' && parts[6] === 'order' && method === 'PATCH') {
      try {
        const body = await readJsonBody<{
          orderedRoleIds: string[];
        }>(req);

        if (!Array.isArray(body?.orderedRoleIds)) {
          json(res, 400, { error: 'orderedRoleIds doit être un tableau' });
          return true;
        }

        await reorderStaffRoles(guildId, body.orderedRoleIds);

        await pushAudit(guildId, {
          user: user.username ?? `User${user.userId}`,
          action: 'Réorganisation rôles staff',
          context: getGuildName(client, guildId),
          module: 'Staff Management',
          eventType: 'Manuel',
          details: `Ordre mis à jour pour ${body.orderedRoleIds.length} rôle(s)`,
          channelId: null
        });

        json(res, 200, { success: true });
      } catch (err) {
        logger.error('StaffAPI', 'Error reordering staff roles:', err);
        json(res, 500, { error: 'Erreur lors du réordonnancement des rôles staff' });
      }
      return true;
    }

    // PATCH /api/dashboard/guilds/:guildId/staff/roles/:roleId
    if (parts[5] === 'roles' && parts[6] && parts[6] !== 'order' && method === 'PATCH') {
      const roleId = parts[6];
      try {
        const body = await readJsonBody<{
          name?: string;
          level?: number;
          discordRoleId?: string | null;
          color?: string | null;
          hierarchyId?: string | null;
          isResponsable?: boolean;
          sortOrder?: number;
        }>(req);

        const updated = await updateStaffRole(guildId, roleId, body ?? {});
        if (!updated) {
          json(res, 404, { error: 'Rôle staff introuvable' });
          return true;
        }

        await pushAudit(guildId, {
          user: user.username ?? `User${user.userId}`,
          action: 'Modification rôle staff',
          context: getGuildName(client, guildId),
          module: 'Staff Management',
          eventType: 'Manuel',
          details: `Rôle staff modifié: ${updated.name} (Hiérarchie: ${updated.hierarchyId ?? 'aucune'})`,
          channelId: null
        });

        json(res, 200, { role: updated });
      } catch (err) {
        logger.error('StaffAPI', 'Error updating staff role:', err);
        json(res, 500, { error: 'Erreur lors de la modification du rôle staff' });
      }
      return true;
    }

    // DELETE /api/dashboard/guilds/:guildId/staff/roles/:roleId
    if (parts[5] === 'roles' && parts[6] && method === 'DELETE') {
      const roleId = parts[6];
      try {
        const deleted = await deleteStaffRole(guildId, roleId);
        if (!deleted) {
          json(res, 404, { error: 'Rôle staff introuvable' });
          return true;
        }

        await pushAudit(guildId, {
          user: user.username ?? `User${user.userId}`,
          action: 'Suppression rôle staff',
          context: getGuildName(client, guildId),
          module: 'Staff Management',
          eventType: 'Manuel',
          details: `Rôle staff supprimé: ${deleted.name} (${roleId})`,
          channelId: null
        });

        json(res, 200, { ok: true });
      } catch (err) {
        logger.error('StaffAPI', 'Error deleting staff role:', err);
        json(res, 500, { error: 'Erreur lors de la suppression du rôle staff' });
      }
      return true;
    }

    // GET /api/dashboard/guilds/:guildId/staff/config
    if (parts[5] === 'config' && !parts[6]) {
      if (method === 'GET') {
        try {
          const guild = await prisma.guild.findUnique({
            where: { id: guildId },
            select: {
              baseStaffRoleId: true,
              testStaffRoleId: true,
              chiefStaffRoleId: true,
              chiefStaffUserId: true,
              meetingAnnouncementChannelId: true,
              meetingVoiceChannelId: true,
              staffAnnouncementChannelId: true,
              warnsToDemote: true,
              warnsToBlacklist: true,
              blacklistPermanentByDefault: true,
              actionMode: true,
              demoteRemoveAllRoles: true,
            },
          });

          if (!guild) {
            json(res, 404, { error: 'Serveur introuvable' });
            return true;
          }

          json(res, 200, { config: guild });
        } catch (err) {
          logger.error('StaffAPI', 'Error getting staff config:', err);
          json(res, 500, { error: 'Erreur lors de la récupération de la configuration staff' });
        }
        return true;
      }

      // PATCH /api/dashboard/guilds/:guildId/staff/config
      if (method === 'PATCH') {
        try {
          const body = await readJsonBody<{
            baseStaffRoleId?: string | null;
            testStaffRoleId?: string | null;
            chiefStaffRoleId?: string | null;
            chiefStaffUserId?: string | null;
            meetingAnnouncementChannelId?: string | null;
            meetingVoiceChannelId?: string | null;
            staffAnnouncementChannelId?: string | null;
            warnsToDemote?: number;
            warnsToBlacklist?: number;
            blacklistPermanentByDefault?: boolean;
            actionMode?: string;
            demoteRemoveAllRoles?: boolean;
          }>(req);

          const data: any = {};
          if (Object.prototype.hasOwnProperty.call(body ?? {}, 'baseStaffRoleId')) {
            data.baseStaffRoleId = extractDiscordSnowflake(body?.baseStaffRoleId ?? null);
          }
          if (Object.prototype.hasOwnProperty.call(body ?? {}, 'testStaffRoleId')) {
            data.testStaffRoleId = extractDiscordSnowflake(body?.testStaffRoleId ?? null);
          }
          if (Object.prototype.hasOwnProperty.call(body ?? {}, 'chiefStaffRoleId')) {
            data.chiefStaffRoleId = extractDiscordSnowflake(body?.chiefStaffRoleId ?? null);
          }
          if (Object.prototype.hasOwnProperty.call(body ?? {}, 'chiefStaffUserId')) {
            data.chiefStaffUserId = extractDiscordSnowflake(body?.chiefStaffUserId ?? null);
          }
          if (Object.prototype.hasOwnProperty.call(body ?? {}, 'meetingAnnouncementChannelId')) {
            data.meetingAnnouncementChannelId = extractDiscordSnowflake(body?.meetingAnnouncementChannelId ?? null);
          }
          if (Object.prototype.hasOwnProperty.call(body ?? {}, 'meetingVoiceChannelId')) {
            data.meetingVoiceChannelId = extractDiscordSnowflake(body?.meetingVoiceChannelId ?? null);
          }
          if (Object.prototype.hasOwnProperty.call(body ?? {}, 'staffAnnouncementChannelId')) {
            data.staffAnnouncementChannelId = extractDiscordSnowflake(body?.staffAnnouncementChannelId ?? null);
          }

          if (Object.prototype.hasOwnProperty.call(body ?? {}, 'warnsToDemote')) {
            data.warnsToDemote = Number(body?.warnsToDemote) || 0;
          }
          if (Object.prototype.hasOwnProperty.call(body ?? {}, 'warnsToBlacklist')) {
            data.warnsToBlacklist = Number(body?.warnsToBlacklist) || 0;
          }
          if (Object.prototype.hasOwnProperty.call(body ?? {}, 'blacklistPermanentByDefault')) {
            data.blacklistPermanentByDefault = !!body?.blacklistPermanentByDefault;
          }
          if (Object.prototype.hasOwnProperty.call(body ?? {}, 'actionMode')) {
            data.actionMode = body?.actionMode || 'MANUAL';
          }
          if (Object.prototype.hasOwnProperty.call(body ?? {}, 'demoteRemoveAllRoles')) {
            data.demoteRemoveAllRoles = !!body?.demoteRemoveAllRoles;
          }

          const updatedGuild = await prisma.guild.update({
            where: { id: guildId },
            data,
            select: {
              baseStaffRoleId: true,
              testStaffRoleId: true,
              chiefStaffRoleId: true,
              chiefStaffUserId: true,
              meetingAnnouncementChannelId: true,
              meetingVoiceChannelId: true,
              staffAnnouncementChannelId: true,
              warnsToDemote: true,
              warnsToBlacklist: true,
              blacklistPermanentByDefault: true,
              actionMode: true,
              demoteRemoveAllRoles: true,
            },
          });

          await pushAudit(guildId, {
            user: user.username ?? `User${user.userId}`,
            action: 'Mise à jour config staff',
            context: getGuildName(client, guildId),
            module: 'Staff Management',
            eventType: 'Manuel',
            details: `Configuration staff mise à jour (Rôles: ${updatedGuild.baseStaffRoleId ?? 'aucun'}/${updatedGuild.testStaffRoleId ?? 'aucun'}, Sanctions: ${updatedGuild.warnsToDemote} warns p. démo / ${updatedGuild.warnsToBlacklist} warns p. bl, Mode: ${updatedGuild.actionMode})`,
            channelId: null,
          });

          json(res, 200, { config: updatedGuild });
        } catch (err) {
          logger.error('StaffAPI', 'Error updating staff config:', err);
          json(res, 500, { error: 'Erreur lors de la mise à jour de la configuration staff' });
        }
        return true;
      }
    }

    // GET /api/dashboard/guilds/:guildId/staff/hierarchies
    if (parts[5] === 'hierarchies' && method === 'GET' && !parts[6]) {
      try {
        const hierarchies = await getStaffHierarchies(guildId);
        json(res, 200, { hierarchies });
      } catch (err) {
        logger.error('StaffAPI', 'Error getting staff hierarchies:', err);
        json(res, 500, { error: 'Erreur lors de la récupération des hiérarchies staff' });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/staff/hierarchies
    if (parts[5] === 'hierarchies' && method === 'POST' && !parts[6]) {
      try {
        const body = await readJsonBody<{
          name: string;
          description?: string;
          color?: string;
          icon?: string;
          discordRoleId?: string;
          responsableUserId?: string;
          parentHierarchyId?: string | null;
        }>(req);

        if (!body?.name) {
          json(res, 400, { error: 'name est obligatoire' });
          return true;
        }

        const hierarchy = await createStaffHierarchy(
          guildId,
          body.name,
          body.description,
          body.color,
          body.icon,
          body.discordRoleId,
          body.responsableUserId,
          body.parentHierarchyId
        );

        void safePushAudit(guildId, {
          user: user.username ?? `User${user.userId}`,
          action: 'Création hiérarchie staff',
          context: getGuildName(client, guildId),
          module: 'Staff Management',
          eventType: 'Manuel',
          details: `Hiérarchie créée: ${body.name}`,
          channelId: null
        }, 'staff hierarchy creation');

        json(res, 201, { hierarchy });
      } catch (err) {
        logger.error('StaffAPI', 'Error creating staff hierarchy:', err);
        json(res, err instanceof Error && /Hiérarchie/i.test(err.message)
          ? 400
          : 500, { error: err instanceof Error ? err.message : 'Erreur lors de la création de la hiérarchie staff' });
      }
      return true;
    }

    // GET /api/dashboard/guilds/:guildId/staff/hierarchies/schema
    if (parts[5] === 'hierarchies' && parts[6] === 'schema' && method === 'GET' && !parts[7]) {
      try {
        const schema = await getHierarchySchema(guildId);
        json(res, 200, schema);
      } catch (err) {
        logger.error('StaffAPI', 'Error getting hierarchy schema:', err);
        json(res, 500, { error: 'Erreur lors de la récupération de l\'organigramme' });
      }
      return true;
    }

    // PATCH /api/dashboard/guilds/:guildId/staff/hierarchies/:id
    if (parts[5] === 'hierarchies' && parts[6] && parts[6] !== 'schema' && !parts[7] && method === 'PATCH') {
      const hierarchyId = parts[6];
      try {
        const body = await readJsonBody<{
          name?: string;
          description?: string | null;
          color?: string | null;
          icon?: string | null;
          discordRoleId?: string | null;
          responsableUserId?: string | null;
          parentHierarchyId?: string | null;
          enabled?: boolean;
          sortOrder?: number;
        }>(req);

        const updated = await updateStaffHierarchy(guildId, hierarchyId, body ?? {});
        if (!updated) {
          json(res, 404, { error: 'Hiérarchie introuvable' });
          return true;
        }

        void safePushAudit(guildId, {
          user: user.username ?? `User${user.userId}`,
          action: 'Modification hiérarchie staff',
          context: getGuildName(client, guildId),
          module: 'Staff Management',
          eventType: 'Manuel',
          details: `Hiérarchie modifiée: ${updated.name}`,
          channelId: null
        }, 'staff hierarchy update');

        json(res, 200, { hierarchy: updated });
      } catch (err) {
        logger.error('StaffAPI', 'Error updating staff hierarchy:', err);
        const errorMessage = describeUnknownError(err);
        json(res, /Hiérarchie/i.test(errorMessage)
          ? 400
          : 500, { error: errorMessage });
      }
      return true;
    }

    // DELETE /api/dashboard/guilds/:guildId/staff/hierarchies/:id
    if (parts[5] === 'hierarchies' && parts[6] && parts[6] !== 'schema' && !parts[7] && method === 'DELETE') {
      const hierarchyId = parts[6];
      try {
        const deleted = await deleteStaffHierarchy(guildId, hierarchyId);
        if (!deleted) {
          json(res, 404, { error: 'Hiérarchie introuvable' });
          return true;
        }

        void safePushAudit(guildId, {
          user: user.username ?? `User${user.userId}`,
          action: 'Suppression hiérarchie staff',
          context: getGuildName(client, guildId),
          module: 'Staff Management',
          eventType: 'Manuel',
          details: `Hiérarchie supprimée: ${deleted.name}`,
          channelId: null
        }, 'staff hierarchy deletion');

        json(res, 200, { ok: true });
      } catch (err) {
        logger.error('StaffAPI', 'Error deleting staff hierarchy:', err);
        json(res, 500, { error: 'Erreur lors de la suppression de la hiérarchie staff' });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/staff/hierarchies/:id/import-roles
    if (parts[5] === 'hierarchies' && parts[6] && parts[7] === 'import-roles' && method === 'POST') {
      const hierarchyId = parts[6];
      try {
        const body = await readJsonBody<{
          discordRoleId: string;
          grade: string;
        }>(req);

        if (!body?.discordRoleId || !body?.grade) {
          json(res, 400, { error: 'discordRoleId et grade sont obligatoires' });
          return true;
        }

        const result = await importRoleMembers(guildId, hierarchyId, body.discordRoleId, body.grade);
        json(res, 200, result);
      } catch (err: any) {
        logger.error('StaffAPI', 'Error importing role members:', err);
        json(res, 500, { error: err.message || 'Erreur lors de l\'import' });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/staff/members/:userId/hierarchy-grade
    if (parts[5] === 'members' && parts[6] && parts[7] === 'hierarchy-grade' && !parts[8] && method === 'POST') {
      const userId = parts[6];
      try {
        const body = await readJsonBody<{
          hierarchyId?: string | null;
          grade?: string | null;
        }>(req);

        const result = await addMemberToHierarchy(guildId, userId, body?.hierarchyId ?? null, body?.grade ?? null);
        json(res, 200, { ok: true, grade: result });
      } catch (err: any) {
        logger.error('StaffAPI', 'Error adding member to hierarchy:', err);
        json(res, /détecter automatiquement/i.test(err.message)
          ? 400
          : 500, { error: err.message || 'Erreur lors de l\'ajout' });
      }
      return true;
    }

    // DELETE /api/dashboard/guilds/:guildId/staff/members/:userId/hierarchy-grade/:hierarchyId
    if (parts[5] === 'members' && parts[6] && parts[7] === 'hierarchy-grade' && parts[8] && method === 'DELETE') {
      const userId = parts[6];
      const hierarchyId = parts[8];
      try {
        await removeMemberFromHierarchy(guildId, userId, hierarchyId);
        json(res, 200, { ok: true });
      } catch (err: any) {
        logger.error('StaffAPI', 'Error removing member from hierarchy:', err);
        json(res, 500, { error: err.message || 'Erreur lors du retrait' });
      }
      return true;
    }

    // GET /api/dashboard/guilds/:guildId/staff/polls
    if (parts[5] === 'polls' && method === 'GET' && !parts[6]) {
      try {
        const polls = await getPolls(guildId);
        json(res, 200, { polls });
      } catch (err) {
        logger.error('StaffAPI', 'Error getting polls:', err);
        json(res, 500, { error: 'Erreur lors de la récupération des sondages' });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/staff/polls
    if (parts[5] === 'polls' && method === 'POST' && !parts[6]) {
      try {
        const body = await readJsonBody<{
          title: string;
          description?: string;
          options: string[];
          closesAt?: string;
          isAnonymous?: boolean;
        }>(req);

        if (!body?.title || !Array.isArray(body?.options) || body.options.length < 2) {
          json(res, 400, { error: 'title et au moins 2 options sont obligatoires' });
          return true;
        }

        const author = await getStaffMember(guildId, user.userId);
        if (!author) {
          json(res, 403, { error: 'Le créateur doit être membre du staff' });
          return true;
        }

        const poll = await createPoll(
          guildId,
          author.id,
          body.title.trim(),
          body.description?.trim() || '',
          body.options.map((opt) => opt.trim()).filter(Boolean),
          body.isAnonymous ?? true,
          body.closesAt ? new Date(body.closesAt) : undefined
        );

        await pushAudit(guildId, {
          user: user.username ?? `User${user.userId}`,
          action: 'Création sondage staff',
          context: getGuildName(client, guildId),
          module: 'Staff Management',
          eventType: 'Manuel',
          details: `Sondage créé: ${poll.title}`,
          channelId: null
        });

        json(res, 201, { poll });
      } catch (err) {
        logger.error('StaffAPI', 'Error creating poll:', err);
        json(res, 500, { error: 'Erreur lors de la création du sondage' });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/staff/polls/vote
    if (parts[5] === 'polls' && parts[6] === 'vote' && method === 'POST') {
      try {
        const body = await readJsonBody<{
          pollId: string;
          optionId: string;
        }>(req);

        if (!body?.pollId || !body?.optionId) {
          json(res, 400, { error: 'pollId et optionId sont obligatoires' });
          return true;
        }

        const voter = await getStaffMember(guildId, user.userId);
        if (!voter) {
          json(res, 403, { error: 'Le votant doit être membre du staff' });
          return true;
        }

        const poll = await prisma.staffPoll.findFirst({
          where: { id: body.pollId, guildId },
          include: { options: true },
        });

        if (!poll) {
          json(res, 404, { error: 'Sondage introuvable' });
          return true;
        }

        if (poll.status !== 'OPEN') {
          json(res, 400, { error: 'Ce sondage est fermé' });
          return true;
        }

        if (poll.closesAt && poll.closesAt.getTime() <= Date.now()) {
          json(res, 400, { error: 'Ce sondage est expiré' });
          return true;
        }

        const optionExists = poll.options.some((option) => option.id === body.optionId);
        if (!optionExists) {
          json(res, 400, { error: 'Option de vote invalide' });
          return true;
        }

        const vote = await castPollVote(body.pollId, voter.id, body.optionId);
        json(res, 200, { vote });
      } catch (err) {
        logger.error('StaffAPI', 'Error casting poll vote:', err);
        json(res, 500, { error: 'Erreur lors du vote' });
      }
      return true;
    }

    // PATCH /api/dashboard/guilds/:guildId/staff/polls/:pollId/close
    if (parts[5] === 'polls' && parts[6] && parts[7] === 'close' && method === 'PATCH') {
      const pollId = parts[6];
      try {
        const result = await prisma.staffPoll.updateMany({
          where: { id: pollId, guildId },
          data: { status: 'CLOSED' },
        });

        if (result.count === 0) {
          json(res, 404, { error: 'Sondage introuvable' });
          return true;
        }

        await pushAudit(guildId, {
          user: user.username ?? `User${user.userId}`,
          action: 'Clôture sondage staff',
          context: getGuildName(client, guildId),
          module: 'Staff Management',
          eventType: 'Manuel',
          details: `Sondage clôturé: ${pollId}`,
          channelId: null
        });

        json(res, 200, { ok: true });
      } catch (err) {
        logger.error('StaffAPI', 'Error closing poll:', err);
        json(res, 500, { error: 'Erreur lors de la clôture du sondage' });
      }
      return true;
    }

    // GET /api/dashboard/guilds/:guildId/staff/resignations
    if (parts[5] === 'resignations' && method === 'GET' && !parts[6]) {
      try {
        const isAdmin = access.level === 'admin';
        const resignations = await prisma.staffResignation.findMany({
          where: {
            guildId,
            ...(isAdmin ? {} : {
              staffMember: { userId: user.userId }
            })
          },
          orderBy: [
            { status: 'asc' },
            { createdAt: 'desc' }
          ],
          include: {
            staffMember: {
              select: { userId: true, username: true, displayName: true, avatarUrl: true, grade: true }
            }
          }
        });
        json(res, 200, {
          resignations: resignations.map(r => ({
            id: r.id,
            guildId: r.guildId,
            staffUserId: r.staffUserId,
            reason: r.reason,
            status: r.status,
            decisionByUserId: r.decisionByUserId,
            decisionNote: r.decisionNote,
            decidedAt: r.decidedAt?.toISOString() ?? null,
            ticketChannelId: r.ticketChannelId,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
            staffMember: r.staffMember
          }))
        });
      } catch (err) {
        logger.error('ResignationsAPI', 'Error fetching resignations:', err);
        json(res, 500, { error: 'Erreur lors du chargement des demandes' });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/staff/resignations
    if (parts[5] === 'resignations' && method === 'POST' && !parts[6]) {
      try {
        const body = await readJsonBody<{ reason: string }>(req);

        if (!body?.reason?.trim()) {
          json(res, 400, { error: 'Le motif est obligatoire' });
          return true;
        }

        const staffMember = await prisma.staffMember.findFirst({
          where: { guildId, userId: user.userId }
        });

        if (!staffMember) {
          json(res, 403, { error: 'Vous ne faites pas partie du staff' });
          return true;
        }

        const existingPending = await prisma.staffResignation.findFirst({
          where: { guildId, staffUserId: staffMember.id, status: 'PENDING' }
        });

        if (existingPending) {
          json(res, 409, { error: 'Une demande de démission est déjà en cours', resignation: existingPending });
          return true;
        }

        const reason = body.reason.trim().slice(0, 500);
        const resignation = await prisma.staffResignation.create({
          data: {
            guildId,
            staffUserId: staffMember.id,
            reason,
            status: 'PENDING'
          }
        });

        const managers = await prisma.staffMember.findMany({
          where: {
            guildId,
            grade: { in: ['Manager', 'Admin', 'Administrateur', 'Fondateur', 'Direction'] }
          }
        });

        if (managers.length > 0) {
          await Promise.all(managers.map(async (m) => {
            await createNotification(
              guildId,
              m.userId,
              '🔔 Demande de démission',
              `${staffMember.username ?? user.userId} a soumis une demande de démission via le dashboard.\nMotif : ${reason}`,
              'WARNING',
              '/staff-management?tab=resignations',
              true
            ).catch(() => null);

            try {
              const managerUser = await client.users.fetch(m.userId).catch(() => null);
              if (managerUser) {
                const discordGuild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);
                const serverName = discordGuild ? discordGuild.name : '';
                const embed = new EmbedBuilder()
                  .setTitle('🔔 Nouvelle demande de démission')
                  .setDescription(
                    `**${staffMember.username ?? user.userId}** a soumis une demande de démission via le dashboard.\n\n` +
                    `**Motif :**\n> ${reason}\n\n` +
                    `Rendez-vous sur le dashboard pour traiter cette demande.`
                  )
                  .setColor(COLORS.warning)
                  .setTimestamp()
                  .setFooter({ text: `Référence : ${resignation.id}${serverName ? ` · Serveur : ${serverName}` : ''}` });
                await managerUser.send({ embeds: [embed] }).catch(() => null);
              }
            } catch {}
          }));
        }

        json(res, 201, { resignation });
      } catch (err) {
        logger.error('ResignationsAPI', 'Error creating resignation:', err);
        json(res, 500, { error: 'Erreur lors de la soumission' });
      }
      return true;
    }

    // PATCH /api/dashboard/guilds/:guildId/staff/resignations/:resignationId
    if (parts[5] === 'resignations' && parts[6] && method === 'PATCH' && !parts[7]) {
      if (access.level !== 'admin') {
        json(res, 403, { error: 'Accès refusé' });
        return true;
      }
      const resignationId = parts[6];

      try {
        const body = await readJsonBody<{ action: 'APPROVED' | 'REJECTED'; note?: string }>(req);

        if (!body?.action || !['APPROVED', 'REJECTED'].includes(body.action)) {
          json(res, 400, { error: 'action doit être APPROVED ou REJECTED' });
          return true;
        }

        const resignation = await prisma.staffResignation.findFirst({
          where: { id: resignationId, guildId },
          include: { staffMember: { select: { userId: true, username: true, displayName: true } } }
        });

        if (!resignation) {
          json(res, 404, { error: 'Demande introuvable' });
          return true;
        }

        if (resignation.status !== 'PENDING') {
          json(res, 409, { error: 'Cette demande a déjà été traitée' });
          return true;
        }

        const updated = await prisma.staffResignation.update({
          where: { id: resignationId },
          data: {
            status: body.action,
            decisionByUserId: user.userId,
            decisionNote: body.note ?? null,
            decidedAt: new Date()
          }
        });

        await createNotification(
          guildId,
          resignation.staffMember.userId,
          body.action === 'APPROVED' ? '✅ Démission approuvée' : '❌ Démission refusée',
          body.action === 'APPROVED'
            ? `Votre demande de démission a été approuvée.${body.note ? `\nNote : ${body.note}` : ''}`
            : `Votre demande de démission a été refusée.${body.note ? `\nMotif : ${body.note}` : ''}`,
          body.action === 'APPROVED' ? 'SUCCESS' : 'ERROR',
          '/profile',
          true
        ).catch(() => null);

        try {
          const discordUser = await client.users.fetch(resignation.staffMember.userId).catch(() => null);
          if (discordUser) {
            const discordGuild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);
            const serverName = discordGuild ? discordGuild.name : '';
            const dmEmbed = new EmbedBuilder()
              .setTitle(body.action === 'APPROVED' ? '✅ Démission approuvée' : '❌ Démission refusée')
              .setDescription(
                body.action === 'APPROVED'
                  ? `Votre demande de démission a été **approuvée** par la direction.${body.note ? `\n\n📝 **Note :** ${body.note}` : ''}`
                  : `Votre demande de démission a été **refusée** par la direction.${body.note ? `\n\n📝 **Motif :** ${body.note}` : ''}`
              )
              .setColor(body.action === 'APPROVED' ? COLORS.success : COLORS.warning)
              .setTimestamp();
            if (serverName) {
              dmEmbed.setFooter({ text: `Serveur : ${serverName}` });
            }
            await discordUser.send({ embeds: [dmEmbed] }).catch(() => null);
          }
        } catch {}

        await pushAudit(guildId, {
          user: user.username ?? `User${user.userId}`,
          action: `Démission ${body.action === 'APPROVED' ? 'approuvée' : 'refusée'}`,
          context: getGuildName(client, guildId),
          module: 'Staff Management',
          eventType: 'Manuel',
          details: `Résignation ${resignationId} de ${resignation.staffMember.username ?? resignation.staffMember.userId} → ${body.action}${body.note ? ` (${body.note})` : ''}`,
          channelId: null
        });

        json(res, 200, { resignation: updated });
      } catch (err) {
        logger.error('ResignationsAPI', 'Error updating resignation:', err);
        json(res, 500, { error: 'Erreur lors du traitement de la demande' });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/staff/resignations/:resignationId/ticket
    if (parts[5] === 'resignations' && parts[6] && parts[7] === 'ticket' && method === 'POST') {
      if (access.level !== 'admin') {
        json(res, 403, { error: 'Accès refusé' });
        return true;
      }
      const resignationId = parts[6];

      try {
        const resignation = await prisma.staffResignation.findFirst({
          where: { id: resignationId, guildId },
          include: { staffMember: { select: { userId: true, username: true, displayName: true } } }
        });

        if (!resignation) {
          json(res, 404, { error: 'Demande introuvable' });
          return true;
        }

        if (resignation.status !== 'PENDING') {
          json(res, 409, { error: 'Impossible d\'ouvrir un ticket : la demande est déjà traitée' });
          return true;
        }

        if (resignation.ticketChannelId) {
          json(res, 409, { error: 'Un ticket est déjà ouvert pour cette demande', ticketChannelId: resignation.ticketChannelId });
          return true;
        }

        const guildConfig = await prisma.guild.findUnique({
          where: { id: guildId },
          select: { ticketCategoryId: true, ticketStaffRoleId: true }
        });

        const discordGuild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);
        if (!discordGuild) {
          json(res, 503, { error: 'Serveur Discord non disponible' });
          return true;
        }

        const targetDiscordUser = await client.users.fetch(resignation.staffMember.userId).catch(() => null);
        const staffName = resignation.staffMember.displayName ?? resignation.staffMember.username ?? resignation.staffMember.userId;
        const channelName = `demission-${staffName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30)}`;

        const permissionOverwrites: any[] = [
          {
            id: discordGuild.id,
            deny: [PermissionFlagsBits.ViewChannel]
          }
        ];

        if (guildConfig?.ticketStaffRoleId) {
          permissionOverwrites.push({
            id: guildConfig.ticketStaffRoleId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
          });
        }

        if (targetDiscordUser) {
          permissionOverwrites.push({
            id: targetDiscordUser.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
          });
        }

        const ticketChannel = await discordGuild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: guildConfig?.ticketCategoryId ?? undefined,
          permissionOverwrites,
          reason: `Discussion de démission pour ${staffName}`
        }).catch(() => null);

        if (!ticketChannel) {
          json(res, 500, { error: 'Impossible de créer le salon Discord' });
          return true;
        }

        if (ticketChannel instanceof TextChannel) {
          const introEmbed = new EmbedBuilder()
            .setTitle('📝 Discussion — Demande de démission')
            .setDescription(
              `Ce salon a été créé pour discuter de la demande de démission de **${staffName}**.\n\n` +
              `**Motif fourni :**\n> ${resignation.reason}\n\n` +
              `Merci d'utiliser ce canal pour toute discussion avant de prendre une décision finale.`
            )
            .setColor(COLORS.info)
            .setTimestamp()
            .setFooter({ text: `Référence : ${resignation.id}` });

          await ticketChannel.send({ content: targetDiscordUser ? `<@${targetDiscordUser.id}>` : '', embeds: [introEmbed] }).catch(() => null);
        }

        await prisma.staffResignation.update({
          where: { id: resignationId },
          data: { ticketChannelId: ticketChannel.id }
        });

        json(res, 201, { ticketChannelId: ticketChannel.id, channelName: ticketChannel.name });
      } catch (err) {
        logger.error('ResignationsAPI', 'Error creating resignation ticket:', err);
        json(res, 500, { error: 'Erreur lors de la création du ticket' });
      }
      return true;
    }
  }

  // 6. Testing-periods routes
  if (parts[4] === 'testing-periods') {
    const accessLevel = await resolveDashboardAccess(client, guildId, user.userId);
    if (accessLevel.level !== 'admin' && !accessLevel.canManageTutoring) {
      json(res, 403, { error: 'Accès tuteur ou admin requis' });
      return true;
    }

    // GET /api/dashboard/guilds/:guildId/testing-periods
    if (method === 'GET' && !parts[5]) {
      try {
        const periods = await prisma.testingPeriod.findMany({
          where: { guildId },
          orderBy: { createdAt: 'desc' },
          include: {
            staffMember: true,
            mentor: true,
            reports: {
              orderBy: { createdAt: 'desc' },
              include: { author: true },
            },
          },
        });

        json(res, 200, { periods });
      } catch (err) {
        logger.error('StaffAPI', 'Error getting testing periods:', err);
        json(res, 500, { error: 'Erreur lors de la récupération des périodes de test' });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/testing-periods
    if (method === 'POST' && !parts[5]) {
      if (accessLevel.level !== 'admin') {
        json(res, 403, { error: 'Seuls les administrateurs peuvent créer une période de test' });
        return true;
      }
      try {
        const body = await readJsonBody<{
          staffUserId: string;
          mentorId?: string;
        }>(req);

        if (!body?.staffUserId) {
          json(res, 400, { error: 'staffUserId est obligatoire' });
          return true;
        }

        const period = await createTestingPeriod(guildId, body.staffUserId, body.mentorId);
        json(res, 201, { period });
      } catch (err) {
        logger.error('StaffAPI', 'Error creating testing period:', err);
        json(res, 500, { error: 'Erreur lors de la création de la période de test' });
      }
      return true;
    }

    // PATCH /api/dashboard/guilds/:guildId/testing-periods/:periodId
    if (method === 'PATCH' && parts[5]) {
      const periodId = parts[5];
      try {
        const body = await readJsonBody<{
          status: 'PASSED' | 'FAILED';
          notes?: string;
          force?: boolean;
        }>(req);

        if (!body?.status) {
          json(res, 400, { error: 'status est obligatoire' });
          return true;
        }

        if (body.status === 'PASSED') {
          const period = await prisma.testingPeriod.findUnique({
            where: { id: periodId },
            select: { startDate: true, guildId: true }
          });

          if (period) {
            const config = await tutoringService.getTutoringConfig(period.guildId);
            const minDays = config.minTestDays || 14;
            const diffMs = Date.now() - period.startDate.getTime();
            const diffDays = diffMs / (1000 * 60 * 60 * 24);

            if (diffDays < minDays && !body.force) {
              json(res, 403, {
                error: `La période de test est trop courte (${Math.floor(diffDays)}j / ${minDays}j).`,
                canForce: accessLevel.level === 'admin'
              });
              return true;
            }

            if (body.force && accessLevel.level !== 'admin') {
              json(res, 403, { error: 'Seuls les administrateurs peuvent forcer une validation précoce.' });
              return true;
            }
          }
        }

        const period = await endTestingPeriod(periodId, body.status, body.notes);

        await pushAudit(guildId, {
          user: user.username ?? `User${user.userId}`,
          action: `Fin période de test (${body.status})${body.force ? ' [FORCÉ]' : ''}`,
          context: getGuildName(client, guildId),
          module: 'Staff Management',
          eventType: 'Manuel',
          details: `Période de test: ${periodId} - ${body.status}${body.force ? ' (Bypass durée minimum)' : ''}`,
          channelId: null
        });

        json(res, 200, { period });
      } catch (err) {
        logger.error('StaffAPI', 'Error ending testing period:', err);
        json(res, 500, { error: 'Erreur lors de la fin de la période de test' });
      }
      return true;
    }
  }

  // 7. Mentor-reports routes
  if (parts[4] === 'mentor-reports') {
    const accessLevel = await resolveDashboardAccess(client, guildId, user.userId);
    if (accessLevel.level !== 'admin' && !accessLevel.canManageTutoring) {
      json(res, 403, { error: 'Accès tuteur ou admin requis' });
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/mentor-reports
    if (method === 'POST') {
      try {
        const body = await readJsonBody<{
          testingPeriodId: string;
          type: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
          content: string;
        }>(req);

        if (!body?.testingPeriodId || !body?.type || !body?.content) {
          json(res, 400, { error: 'testingPeriodId, type et content sont obligatoires' });
          return true;
        }

        const report = await addMentorReport(
          body.testingPeriodId,
          user.userId,
          body.type,
          body.content
        );

        await pushAudit(guildId, {
          user: user.username ?? `User${user.userId}`,
          action: 'Rapport tuteur',
          context: getGuildName(client, guildId),
          module: 'Staff Management',
          eventType: 'Manuel',
          details: `Rapport ${body.type}: ${body.testingPeriodId}`,
          channelId: null
        });

        json(res, 201, { report });
      } catch (err) {
        logger.error('StaffAPI', 'Error adding mentor report:', err);
        json(res, 500, { error: 'Erreur lors de l\'ajout du rapport tuteur' });
      }
      return true;
    }
  }

  // 8. Notifications routes
  if (parts[4] === 'notifications') {
    // GET /api/dashboard/guilds/:guildId/notifications
    if (method === 'GET' && !parts[5]) {
      try {
        const notifs = await getNotifications(guildId, user.userId);
        json(res, 200, { notifications: notifs });
      } catch (err) {
        logger.error('StaffAPI', 'Error getting notifications:', err);
        json(res, 500, { error: 'Erreur récupération notifications' });
      }
      return true;
    }

    // PATCH /api/dashboard/guilds/:guildId/notifications/:id/read
    if (method === 'PATCH' && parts[5] && parts[6] === 'read') {
      try {
        await markNotificationRead(parts[5], user.userId);
        json(res, 200, { ok: true });
      } catch (err) {
        logger.error('StaffAPI', 'Error marking notification as read:', err);
        json(res, 500, { error: 'Erreur update notification' });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/notifications/mark-all-read
    if (method === 'POST' && parts[5] === 'mark-all-read') {
      try {
        await markAllNotificationsRead(guildId, user.userId);
        json(res, 200, { ok: true });
      } catch (err) {
        logger.error('StaffAPI', 'Error marking all as read:', err);
        json(res, 500, { error: 'Erreur update notifications' });
      }
      return true;
    }
  }

  // 9. Tutoring routes
  if (parts[4] === 'tutoring') {
    // GET /api/dashboard/guilds/:guildId/tutoring/config
    if (method === 'GET' && parts[5] === 'config') {
      try {
        const config = await tutoringService.getTutoringConfig(guildId);
        json(res, 200, { config });
      } catch (err) {
        logger.error('TutoringAPI', 'Error getting config:', err);
        json(res, 500, { error: 'Erreur récupération config tutorat' });
      }
      return true;
    }

    // PATCH /api/dashboard/guilds/:guildId/tutoring/config
    if (method === 'PATCH' && parts[5] === 'config') {
      const accessLevel = await resolveDashboardAccess(client, guildId, user.userId);
      if (!accessLevel.canManageTutoring) {
        json(res, 403, { error: 'Accès tutorat requis' });
        return true;
      }

      try {
        const body = await readJsonBody<any>(req);
        const config = await tutoringService.updateTutoringConfig(guildId, body);

        await pushAudit(guildId, {
          user: user.username ?? `User${user.userId}`,
          action: 'Mise à jour config tutorat',
          context: getGuildName(client, guildId),
          module: 'Tutoring',
          eventType: 'Manuel',
          details: `Intervalle: ${body.reportIntervalDays}j, Rappels: ${body.reminderDaysBefore}j, Min Test: ${body.minTestDays}j`,
          channelId: null
        });

        json(res, 200, { config });
      } catch (err) {
        logger.error('TutoringAPI', 'Error updating config:', err);
        json(res, 500, { error: 'Erreur mise à jour config tutorat' });
      }
      return true;
    }

    // GET /api/dashboard/guilds/:guildId/tutoring/items
    if (method === 'GET' && parts[5] === 'items') {
      try {
        const items = await tutoringService.getTutoringItems(guildId);
        json(res, 200, { items });
      } catch (err) {
        logger.error('TutoringAPI', 'Error getting items:', err);
        json(res, 500, { error: 'Erreur récupération items tutorat' });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/tutoring/items
    if (method === 'POST' && parts[5] === 'items') {
      const accessLevel = await resolveDashboardAccess(client, guildId, user.userId);
      if (!accessLevel.canManageTutoring) {
        json(res, 403, { error: 'Accès tutorat requis' });
        return true;
      }

      try {
        const body = await readJsonBody<any>(req);
        const item = await tutoringService.upsertTutoringItem(guildId, body);

        await pushAudit(guildId, {
          user: user.username ?? `User${user.userId}`,
          action: body.id ? 'Mise à jour item tutorat' : 'Création item tutorat',
          context: getGuildName(client, guildId),
          module: 'Tutoring',
          eventType: 'Manuel',
          details: `Item: ${body.title}`,
          channelId: null
        });

        json(res, 201, { item });
      } catch (err) {
        logger.error('TutoringAPI', 'Error upserting item:', err);
        json(res, 500, { error: 'Erreur sauvegarde item tutorat' });
      }
      return true;
    }

    // DELETE /api/dashboard/guilds/:guildId/tutoring/items/:itemId
    if (method === 'DELETE' && parts[5] === 'items' && parts[6]) {
      const accessLevel = await resolveDashboardAccess(client, guildId, user.userId);
      if (!accessLevel.canManageTutoring) {
        json(res, 403, { error: 'Accès tutorat requis' });
        return true;
      }

      try {
        await tutoringService.deleteTutoringItem(parts[6]);
        json(res, 200, { ok: true });
      } catch (err) {
        logger.error('TutoringAPI', 'Error deleting item:', err);
        json(res, 500, { error: 'Erreur suppression item tutorat' });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/tutoring/periods
    if (method === 'POST' && parts[5] === 'periods' && !parts[6]) {
      const accessLevel = await resolveDashboardAccess(client, guildId, user.userId);
      if (accessLevel.level !== 'admin' && !accessLevel.canManageTutoring) {
        json(res, 403, { error: 'Accès admin ou tutorat requis' });
        return true;
      }

      try {
        const body = await readJsonBody<{
          staffUserId: string;
          mentorId?: string;
          plannedDurationDays?: number;
          targetGrade?: string;
        }>(req);

        if (!body?.staffUserId) {
          json(res, 400, { error: 'staffUserId est obligatoire' });
          return true;
        }

        const period = await createTestingPeriod(
          guildId,
          body.staffUserId,
          body.mentorId || undefined,
          body.plannedDurationDays ? Number(body.plannedDurationDays) : 14,
          body.targetGrade || undefined
        );

        await pushAudit(guildId, {
          user: user.username ?? `User${user.userId}`,
          action: 'Création tutorat',
          context: getGuildName(client, guildId),
          module: 'Tutoring',
          eventType: 'Manuel',
          details: `Période de test créée pour ${body.staffUserId} (Tuteur: ${body.mentorId || 'aucun'}, Grade cible: ${body.targetGrade || 'aucun'})`,
          channelId: null
        });

        json(res, 201, { period });
      } catch (err: any) {
        logger.error('TutoringAPI', 'Error creating period:', err);
        json(res, 500, { error: err.message || 'Erreur création tutorat' });
      }
      return true;
    }

    // DELETE /api/dashboard/guilds/:guildId/tutoring/periods/:periodId
    if (method === 'DELETE' && parts[5] === 'periods' && parts[6]) {
      const accessLevel = await resolveDashboardAccess(client, guildId, user.userId);
      if (accessLevel.level !== 'admin' && !accessLevel.canManageTutoring) {
        json(res, 403, { error: 'Accès admin ou tutorat requis' });
        return true;
      }

      try {
        await tutoringService.deleteTestingPeriod(parts[6]);

        await pushAudit(guildId, {
          user: user.username ?? `User${user.userId}`,
          action: 'Suppression tutorat',
          context: getGuildName(client, guildId),
          module: 'Tutoring',
          eventType: 'Manuel',
          details: `Période de test supprimée: ${parts[6]}`,
          channelId: null
        });

        json(res, 200, { ok: true });
      } catch (err) {
        logger.error('TutoringAPI', 'Error deleting period:', err);
        json(res, 500, { error: 'Erreur suppression tutorat' });
      }
      return true;
    }

    // GET /api/dashboard/guilds/:guildId/tutoring/tutor-dashboard
    if (method === 'GET' && parts[5] === 'tutor-dashboard') {
      try {
        const accessLevel = await resolveDashboardAccess(client, guildId, user.userId);
        const fetchAll = accessLevel.level === 'admin';
        const apprentices = await tutoringService.getTutorDashboard(guildId, user.userId, fetchAll);
        json(res, 200, { apprentices });
      } catch (err) {
        logger.error('TutoringAPI', 'Error getting tutor dashboard:', err);
        json(res, 500, { error: 'Erreur récupération dashboard tuteur' });
      }
      return true;
    }

    // GET /api/dashboard/guilds/:guildId/tutoring/apprentice-progress
    if (method === 'GET' && parts[5] === 'apprentice-progress') {
      try {
        const progress = await tutoringService.getApprenticeProgress(guildId, user.userId);
        json(res, 200, { progress });
      } catch (err) {
        logger.error('TutoringAPI', 'Error getting apprentice progress:', err);
        json(res, 500, { error: 'Erreur récupération progression apprenti' });
      }
      return true;
    }

    // PATCH /api/dashboard/guilds/:guildId/tutoring/checklist
    if (method === 'PATCH' && parts[5] === 'checklist') {
      try {
        const body = await readJsonBody<{
          testingPeriodId: string;
          itemId: string;
          state: TutoringItemState;
        }>(req);

        if (!body?.testingPeriodId || !body?.itemId || !body?.state) {
          json(res, 400, { error: 'Données manquantes' });
          return true;
        }

        const progress = await tutoringService.updateChecklistProgress(
          body.testingPeriodId,
          body.itemId,
          body.state,
          user.userId
        );
        json(res, 200, { progress });
      } catch (err) {
        logger.error('TutoringAPI', 'Error updating checklist:', err);
        json(res, 500, { error: 'Erreur mise à jour checklist' });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/tutoring/logs
    if (method === 'POST' && parts[5] === 'logs') {
      try {
        const body = await readJsonBody<{
          testingPeriodId: string;
          content: string;
        }>(req);

        if (!body?.testingPeriodId || !body?.content) {
          json(res, 400, { error: 'Données manquantes' });
          return true;
        }

        const log = await tutoringService.addApprenticeLog(body.testingPeriodId, body.content);
        json(res, 201, { log });
      } catch (err) {
        logger.error('TutoringAPI', 'Error adding log:', err);
        json(res, 500, { error: 'Erreur ajout carnet de bord' });
      }
      return true;
    }
  }

  return false;
}
