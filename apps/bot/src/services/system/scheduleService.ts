import { Client } from 'discord.js';
import cron from 'node-cron';
import { ScheduledTask } from '@prisma/client';
import prisma from '../../utils/db.js';
import { logger } from '../../utils/logger.js';

const activeCronJobs = new Map<string, cron.ScheduledTask>();

export async function initializeScheduler(client: Client): Promise<void> {
  logger.info('Scheduler', 'Initialisation du service de planification...');
  
  // Arrêter proprement les tâches existantes
  for (const job of activeCronJobs.values()) {
    job.stop();
  }
  activeCronJobs.clear();

  try {
    const activeTasks = await prisma.scheduledTask.findMany({
      where: { enabled: true }
    });

    logger.info('Scheduler', `${activeTasks.length} tâche(s) planifiée(s) active(s) trouvée(s).`);

    for (const task of activeTasks) {
      await startSchedule(client, task);
    }
  } catch (error) {
    logger.error('Scheduler', 'Erreur lors de l\'initialisation du planificateur:', error);
  }
}

export async function startSchedule(client: Client, task: ScheduledTask): Promise<void> {
  // Arrêter l'ancienne planification si elle existe déjà
  if (activeCronJobs.has(task.id)) {
    activeCronJobs.get(task.id)!.stop();
    activeCronJobs.delete(task.id);
  }

  if (!task.enabled) return;

  // Valider l'expression cron
  if (!cron.validate(task.cron)) {
    logger.error('Scheduler', `Expression cron invalide "${task.cron}" pour la tâche "${task.name}" (${task.id})`);
    return;
  }

  try {
    const job = cron.schedule(task.cron, async () => {
      try {
        await executeSchedule(client, task.id);
      } catch (err) {
        logger.error('Scheduler', `Erreur lors de l'exécution automatique de la tâche ${task.id}:`, err);
      }
    });

    activeCronJobs.set(task.id, job);
    logger.info('Scheduler', `Tâche "${task.name}" (${task.id}) planifiée avec le motif : "${task.cron}"`);
  } catch (error) {
    logger.error('Scheduler', `Impossible de planifier la tâche ${task.id}:`, error);
  }
}

export function stopSchedule(scheduleId: string): void {
  if (activeCronJobs.has(scheduleId)) {
    activeCronJobs.get(scheduleId)!.stop();
    activeCronJobs.delete(scheduleId);
    logger.info('Scheduler', `Tâche planifiée arrêtée et retirée de la mémoire : ${scheduleId}`);
  }
}

export async function reloadSchedule(client: Client, scheduleId: string): Promise<void> {
  stopSchedule(scheduleId);
  
  const task = await prisma.scheduledTask.findUnique({
    where: { id: scheduleId }
  });

  if (task && task.enabled) {
    await startSchedule(client, task);
  }
}

export async function executeSchedule(client: Client, scheduleId: string): Promise<void> {
  const schedule = await prisma.scheduledTask.findUnique({
    where: { id: scheduleId }
  });
  
  if (!schedule) return;

  const guild = client.guilds.cache.get(schedule.guildId) || await client.guilds.fetch(schedule.guildId).catch(() => null);
  if (!guild) {
    logger.warn('Scheduler', `Serveur ${schedule.guildId} introuvable pour la tâche planifiée ${schedule.id}`);
    return;
  }

  logger.info('Scheduler', `Début d'exécution de la tâche "${schedule.name}" (${schedule.type}) pour le serveur "${guild.name}"`);

  try {
    if (schedule.type === 'CHANNEL_RESET') {
      if (!schedule.targetId) throw new Error("ID du salon cible manquant pour la réinitialisation");
      const channel = await guild.channels.fetch(schedule.targetId).catch(() => null);
      if (!channel) throw new Error(`Salon cible ${schedule.targetId} non trouvé`);

      if (channel.isThread()) {
        throw new Error(`La réinitialisation de salons de type thread n'est pas supportée (salon ${channel.id})`);
      }
      
      const newChannel = await channel.clone({
        reason: `Réinitialisation planifiée : ${schedule.name}`
      });
      await channel.delete(`Réinitialisation planifiée : ${schedule.name}`);
      
      if (newChannel.isTextBased()) {
        await newChannel.send({
          content: `🔄 **Ce salon a été réinitialisé automatiquement par Kotbo.**\n*Nom de la tâche : ${schedule.name}*`
        }).catch(() => null);
      }
    } else if (schedule.type === 'SERVER_BACKUP') {
      const { createBackup } = await import('./backupService.js');
      const backupOptions = {
        name: schedule.name,
        description: `Sauvegarde planifiée automatique (${schedule.cron})`,
        includeMessages: false,
        includeMembers: true,
        includeRoles: true,
        includeChannels: true,
        includeEmojis: true,
        includeStickers: true,
        createdByUserId: client.user!.id,
        createdByUsername: client.user!.username,
        createdByTag: '0000',
      };
      await createBackup(guild, backupOptions);
    } else if (schedule.type === 'DATA_EXPORT') {
      if (!schedule.targetId) throw new Error("ID du salon cible manquant pour l'export");
      const channel = await guild.channels.fetch(schedule.targetId).catch(() => null);
      if (!channel) throw new Error(`Salon de destination ${schedule.targetId} non trouvé`);
      if (!channel.isTextBased()) throw new Error(`Le salon de destination ${schedule.targetId} doit être un salon textuel`);

      // Récupérer les données de la guilde depuis la DB
      const memberProfiles = await prisma.memberProfile.findMany({ where: { guildId: guild.id } });
      const sanctions = await prisma.sanction.findMany({ where: { guildId: guild.id } });
      const tickets = await prisma.ticket.findMany({ where: { guildId: guild.id } });
      const suggestions = await prisma.suggestion.findMany({ where: { guildId: guild.id } });
      const memberLevels = await prisma.memberLevel.findMany({ where: { guildId: guild.id } });

      const exportData = {
        exportDate: new Date().toISOString(),
        guildId: guild.id,
        guildName: guild.name,
        stats: {
          membersCount: memberProfiles.length,
          sanctionsCount: sanctions.length,
          ticketsCount: tickets.length,
          suggestionsCount: suggestions.length,
          levelsCount: memberLevels.length,
        },
        data: {
          memberProfiles,
          sanctions,
          tickets,
          suggestions,
          memberLevels,
        }
      };

      const buffer = Buffer.from(JSON.stringify(exportData, null, 2), 'utf-8');
      await channel.send({
        content: `📦 **Export automatique des données complété !**\n*Planification : ${schedule.name}*`,
        files: [{
          attachment: buffer,
          name: `kotbo_export_${guild.id}_${Date.now()}.json`
        }]
      });
    } else {
      throw new Error(`Type de tâche planifiée inconnu : ${schedule.type}`);
    }

    // Mettre à jour la date de dernière exécution
    await prisma.scheduledTask.update({
      where: { id: scheduleId },
      data: { lastRun: new Date() }
    });

    logger.info('Scheduler', `Tâche "${schedule.name}" exécutée avec succès`);
  } catch (error) {
    logger.error('Scheduler', `Erreur lors de l'exécution de la tâche planifiée ${schedule.id}:`, error);
    throw error;
  }
}
