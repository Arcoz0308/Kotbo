import { IncomingMessage, ServerResponse } from 'node:http';
import { Client } from 'discord.js';
import cron from 'node-cron';
import prisma from '../../../utils/db.js';
import { logger } from '../../../utils/logger.js';
import { json, readJsonBody, resolveDashboardAccess, pushAudit, type AuthClaims } from '../../shared.js';
import { reloadSchedule, stopSchedule, executeSchedule } from '../../../services/system/scheduleService.js';

export async function handleScheduleRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  parts: string[],
  _url: URL,
  client: Client,
  user: AuthClaims
): Promise<boolean> {
  const method = req.method;

  if (parts[4] !== 'schedules') {
    return false;
  }

  const guildId = parts[3];

  const access = await resolveDashboardAccess(client, guildId, user.userId);
  if (!access.canManageSettings) {
    json(res, 403, { error: 'Accès refusé' });
    return true;
  }

  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    json(res, 404, { error: 'Serveur non trouvé' });
    return true;
  }

  // GET /api/dashboard/guilds/:guildId/schedules
  if (parts.length === 5 && method === 'GET') {
    try {
      const schedules = await prisma.scheduledTask.findMany({
        where: { guildId },
        orderBy: { createdAt: 'desc' },
      });
      json(res, 200, schedules);
    } catch (error) {
      logger.error('SchedulesAPI', 'Error fetching schedules:', error);
      json(res, 500, { error: 'Erreur lors de la récupération des planifications' });
    }
    return true;
  }

  // POST /api/dashboard/guilds/:guildId/schedules
  if (parts.length === 5 && method === 'POST') {
    try {
      const body = await readJsonBody<{
        name?: string;
        type?: string;
        cron?: string;
        targetId?: string | null;
        enabled?: boolean;
      }>(req);

      if (!body) {
        json(res, 400, { error: 'Corps de la requête invalide' });
        return true;
      }

      if (!body.name || !body.type || !body.cron) {
        json(res, 400, { error: 'Champs obligatoires manquants (name, type, cron)' });
        return true;
      }

      if (!['CHANNEL_RESET', 'DATA_EXPORT', 'SERVER_BACKUP'].includes(body.type)) {
        json(res, 400, { error: 'Type de tâche invalide' });
        return true;
      }

      if (!cron.validate(body.cron)) {
        json(res, 400, { error: 'Expression cron invalide' });
        return true;
      }

      const schedule = await prisma.scheduledTask.create({
        data: {
          guildId,
          name: body.name,
          type: body.type,
          cron: body.cron,
          targetId: body.targetId || null,
          enabled: body.enabled ?? true,
        },
      });

      await pushAudit(guildId, {
        channelId: null,
        user: user.username ?? `User${user.userId}`,
        action: 'Création planification',
        context: body.name,
        module: 'Planificateur',
        eventType: 'Settings',
        details: `Nom: ${body.name} | Type: ${body.type} | Cron: ${body.cron}${body.targetId ? ` | Cible: ${body.targetId}` : ''} | Actif: ${body.enabled ?? true}`,
      });

      // Register the cron job in scheduleService
      if (schedule.enabled) {
        await reloadSchedule(client, schedule.id);
      }

      json(res, 200, schedule);
    } catch (error) {
      logger.error('SchedulesAPI', 'Error creating schedule:', error);
      json(res, 500, { error: 'Erreur lors de la création de la planification' });
    }
    return true;
  }

  // PATCH /api/dashboard/guilds/:guildId/schedules/:scheduleId
  if (parts.length === 6 && method === 'PATCH') {
    try {
      const scheduleId = parts[5];
      const body = await readJsonBody<{
        name?: string;
        type?: string;
        cron?: string;
        targetId?: string | null;
        enabled?: boolean;
      }>(req);

      if (!body) {
        json(res, 400, { error: 'Corps de la requête invalide' });
        return true;
      }

      const existing = await prisma.scheduledTask.findUnique({
        where: { id: scheduleId },
      });

      if (!existing || existing.guildId !== guildId) {
        json(res, 404, { error: 'Planification non trouvée' });
        return true;
      }

      if (body.type && !['CHANNEL_RESET', 'DATA_EXPORT', 'SERVER_BACKUP'].includes(body.type)) {
        json(res, 400, { error: 'Type de tâche invalide' });
        return true;
      }

      if (body.cron && !cron.validate(body.cron)) {
        json(res, 400, { error: 'Expression cron invalide' });
        return true;
      }

      const updated = await prisma.scheduledTask.update({
        where: { id: scheduleId },
        data: {
          name: body.name ?? undefined,
          type: body.type ?? undefined,
          cron: body.cron ?? undefined,
          targetId: body.targetId !== undefined ? body.targetId : undefined,
          enabled: body.enabled ?? undefined,
        },
      });

      await pushAudit(guildId, {
        channelId: null,
        user: user.username ?? `User${user.userId}`,
        action: 'Modification planification',
        context: updated.name,
        module: 'Planificateur',
        eventType: 'Settings',
        details: `Nom: ${updated.name} | Type: ${updated.type} | Cron: ${updated.cron}${updated.targetId ? ` | Cible: ${updated.targetId}` : ''} | Actif: ${updated.enabled}`,
      });

      // Reload or stop the cron job
      if (updated.enabled) {
        await reloadSchedule(client, updated.id);
      } else {
        stopSchedule(updated.id);
      }

      json(res, 200, updated);
    } catch (error) {
      logger.error('SchedulesAPI', 'Error updating schedule:', error);
      json(res, 500, { error: 'Erreur lors de la mise à jour de la planification' });
    }
    return true;
  }

  // DELETE /api/dashboard/guilds/:guildId/schedules/:scheduleId
  if (parts.length === 6 && method === 'DELETE') {
    try {
      const scheduleId = parts[5];
      const existing = await prisma.scheduledTask.findUnique({
        where: { id: scheduleId },
      });

      if (!existing || existing.guildId !== guildId) {
        json(res, 404, { error: 'Planification non trouvée' });
        return true;
      }

      // Stop cron job
      stopSchedule(scheduleId);

      await prisma.scheduledTask.delete({
        where: { id: scheduleId },
      });

      await pushAudit(guildId, {
        channelId: null,
        user: user.username ?? `User${user.userId}`,
        action: 'Suppression planification',
        context: existing.name,
        module: 'Planificateur',
        eventType: 'Settings',
        details: `Nom: ${existing.name} | Type: ${existing.type} | Cron: ${existing.cron}`,
      });

      json(res, 200, { success: true });
    } catch (error) {
      logger.error('SchedulesAPI', 'Error deleting schedule:', error);
      json(res, 500, { error: 'Erreur lors de la suppression de la planification' });
    }
    return true;
  }

  // POST /api/dashboard/guilds/:guildId/schedules/:scheduleId/run
  if (parts.length === 7 && parts[6] === 'run' && method === 'POST') {
    try {
      const scheduleId = parts[5];
      const existing = await prisma.scheduledTask.findUnique({
        where: { id: scheduleId },
      });

      if (!existing || existing.guildId !== guildId) {
        json(res, 404, { error: 'Planification non trouvée' });
        return true;
      }

      // Execute asynchronously to not block API response
      executeSchedule(client, scheduleId).catch((err) => {
        logger.error('SchedulesAPI', `Error during manual execution of task ${scheduleId}:`, err);
      });

      await pushAudit(guildId, {
        channelId: null,
        user: user.username ?? `User${user.userId}`,
        action: 'Exécution planification',
        context: existing.name,
        module: 'Planificateur',
        eventType: 'Settings',
        details: `Nom: ${existing.name} | Type: ${existing.type} | Exécution manuelle déclenchée par le staff`,
      });

      json(res, 200, { success: true });
    } catch (error) {
      logger.error('SchedulesAPI', 'Error running schedule now:', error);
      json(res, 500, { error: 'Erreur lors du lancement de la planification' });
    }
    return true;
  }

  return false;
}
