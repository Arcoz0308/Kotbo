import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Client } from 'discord.js';
import type { AuthClaims, DashboardAccess } from '../../../shared.js';
import { errorMessage, errorStack } from '../../../../utils/errors.js';
import { logger } from '../../../../utils/logger.js';
import {
  json,
  readJsonBody,
  getGuildName,
  
  pushAudit,
  
  
  
  
} from '../../../shared.js';
import {
  
  
  
  
  
  getMeetings,
  createMeeting,
  updateMeeting,
  deleteMeeting,
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
} from '../../../../services/staff/staffLeadershipService.js';

export async function handleMeetingRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  parts: string[],
  url: URL,
  client: Client,
  user: AuthClaims,
  guildId: string,
  _access: DashboardAccess
): Promise<boolean> {
  const method = req.method;
  const auditUser = user.username ?? `User${user.userId}`;

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
        } catch (err: unknown) {
          const isValidationError = err instanceof Error && err.message.includes('Configurez');
          if (isValidationError) {
            logger.warn('StaffAPI', `Error creating meeting: ${err.message}`);
          } else {
            logger.error('StaffAPI', 'Error creating meeting:', err);
          }
          json(res, isValidationError ? 400 : 500, { error: errorMessage(err) || 'Erreur lors de la création de la réunion' });
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

          const data: Record<string, unknown> = {};
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
        } catch (err: unknown) {
          logger.error('StaffAPI', `Error updating meeting ${meetingId}: ${errorMessage(err)}`, errorStack(err));
          json(res, 500, { error: 'Erreur lors de la mise à jour de la réunion', details: errorMessage(err) });
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

  return false;
}
