import { type Client, Events } from 'discord.js';
import cron from 'node-cron';
import prisma from '../utils/db.js';
import { runDailyAlgoForAllGuilds, runDailyAlgoSummariesForAllGuilds } from '../services/dailyAlgoService.js';
import { scanGuildMembersForYoungAccounts, JOIN_TO_ACCOUNT_CREATION_PROXIMITY_MS } from '../services/dcDetectionService.js';
import { processScheduledSanctions, checkMissingReports } from '../services/sanctionService.js';
import { processMeetingNotifications } from '../services/staffLeadershipService.js';
import { logger } from '../utils/logger.js';
import { runActivitySnapshot } from './advancedLogs.js';
import { enqueueBackgroundJob, registerBackgroundJobHandlers, type BackgroundJobName } from '../infra/queues/backgroundQueue.js';
import { checkYoutubeFollows } from '../services/youtubeService.js';
import { checkTwitchFollows } from '../services/twitchService.js';

const runningJobs = new Set<string>();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCronJob(name: string, task: () => Promise<void>, jitterMs = 0): Promise<void> {
  const minuteTimestamp = Math.floor(Date.now() / 60000);
  const enqueued = await enqueueBackgroundJob(name as BackgroundJobName, { jitterMs }, { jobId: `cron-${name}-${minuteTimestamp}` });
  if (enqueued) {
    logger.debug('Cron', `Job mis en file: ${name}`);
    return;
  }

  if (runningJobs.has(name)) {
    logger.warn('Cron', `Job ignoré (déjà en cours): ${name}`);
    return;
  }

  runningJobs.add(name);
  const startedAt = Date.now();

  try {
    if (jitterMs > 0) {
      const jitter = Math.floor(Math.random() * jitterMs);
      await delay(jitter);
    }

    await task();
    logger.debug('Cron', `Job terminé: ${name} (${Date.now() - startedAt}ms)`);
  } catch (error) {
    logger.error('Cron', `Erreur job ${name}:`, error);
  } finally {
    runningJobs.delete(name);
  }
}

async function expireStaffWarnings(): Promise<void> {
  logger.debug('Cron', 'Vérification de l\'expiration des avertissements staff...');
  const now = new Date();

  const expiredWarnings = await prisma.staffWarning.findMany({
    where: {
      isActive: true,
      expiresAt: { lte: now },
    },
    select: { id: true, staffUserId: true },
  });

  if (expiredWarnings.length > 0) {
    await prisma.staffWarning.updateMany({
      where: {
        id: { in: expiredWarnings.map((w) => w.id) },
      },
      data: { isActive: false },
    });
    logger.info('Cron', `✅ ${expiredWarnings.length} avertissement(s) staff expiré(s)`);
  }
}

async function expireStaffBlacklist(): Promise<void> {
  logger.debug('Cron', 'Vérification de l\'expiration de la blacklist staff...');
  const now = new Date();

  const expiredBlacklists = await prisma.staffBlacklist.findMany({
    where: {
      isActive: true,
      endDate: { lte: now },
    },
    select: { id: true, staffUserId: true },
  });

  if (expiredBlacklists.length > 0) {
    await prisma.staffBlacklist.updateMany({
      where: {
        id: { in: expiredBlacklists.map((b) => b.id) },
      },
      data: { isActive: false },
    });
    logger.info('Cron', `✅ ${expiredBlacklists.length} blacklist(s) staff expiré(e)s`);
  }
}

export async function registerCrons(client: Client): Promise<void> {
  registerBackgroundJobHandlers({
    'daily-algo': async () => {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      logger.debug('Cron', `Vérification du daily algo à ${currentTime}...`);
      await runDailyAlgoForAllGuilds(client);
    },
    'daily-algo-summary': async () => {
      logger.debug('Cron', 'Génération du bilan quotidien Daily Algo...');
      await runDailyAlgoSummariesForAllGuilds(client);
    },
    sanctions: async () => {
      logger.debug('Cron', 'Traitement des sanctions planifiées...');
      await processScheduledSanctions(client);
    },
    youtube: async () => {
      logger.debug('Cron', 'Vérification YouTube...');
      await checkYoutubeFollows(client);
    },
    twitch: async () => {
      logger.debug('Cron', 'Vérification Twitch...');
      await checkTwitchFollows(client);
    },
    'staff-warnings-expiration': expireStaffWarnings,
    'staff-blacklist-expiration': expireStaffBlacklist,
    'activity-10min-snapshot': async () => {
      await runActivitySnapshot(client);
    },
    'missing-reports-check': async () => {
      logger.info('Cron', 'Vérification des rapports de sanction manquants...');
      await checkMissingReports();
    },
    'meeting-notifications': async () => {
      await processMeetingNotifications();
    },
    'dc-scan': async () => {
      // Parcours des guildes et lancement du scan si la feature double_accounts active l'auto-détection
      const featureConfigs = await prisma.dashboardFeatureConfig.findMany({
        where: { featureKey: 'double_accounts', enabled: true },
        select: { guildId: true, metadata: true }
      });

      for (const cfg of featureConfigs) {
        try {
          const meta = cfg.metadata as any;
          const autoEnabled = meta?.workflowDraft?.autoDetectionEnabled ?? meta?.autoDetectionEnabled ?? false;
          if (!autoEnabled) continue;

          const guild = await client.guilds.fetch(cfg.guildId).catch(() => null);
          if (!guild) continue;

          const res = await scanGuildMembersForYoungAccounts(guild, JOIN_TO_ACCOUNT_CREATION_PROXIMITY_MS).catch((e) => {
            logger.error('Cron', `Erreur pendant dc-scan pour guild ${cfg.guildId}:`, e);
            return null;
          });

          if (res && res.flaggedCount > 0) {
            logger.info('Cron', `dc-scan: ${res.flaggedCount} détection(s) sur la guilde ${cfg.guildId}`);
          }
        } catch (e) {
          logger.error('Cron', 'Erreur dc-scan boucle:', e);
        }
      }
    },
  });


  // 📊 Daily Algo: Toutes les minutes (vérification de l'heure configurée)
  cron.schedule('* * * * *', async () => {
    await runCronJob('daily-algo', async () => {
      await runDailyAlgoForAllGuilds(client);
    }, 3000);
  });

  // 📊 Daily Algo: Bilan à 23:59 UTC
  cron.schedule('59 23 * * *', async () => {
    await runCronJob('daily-algo-summary', async () => {
      await runDailyAlgoSummariesForAllGuilds(client);
    }, 2000);
  }, { timezone: 'UTC' });

  // 🛡️ Sanctions: Toutes les minutes (expiration des mutes/bans)
  cron.schedule('* * * * *', async () => {
    await runCronJob('sanctions', async () => {
      await processScheduledSanctions(client);
    }, 1000);
  });

  // 📊 Activity & Heatmap: Toutes les 10 minutes (Snapshot présences lissé)
  cron.schedule('*/10 * * * *', async () => {
    await runCronJob('activity-10min-snapshot', async () => {
      await runActivitySnapshot(client);
    }, 1000);
  });

  // 🛡️ Staff Management: Expirations à minuit
  cron.schedule('0 0 * * *', async () => {
    await runCronJob('staff-warnings-expiration', expireStaffWarnings, 1000);
  });

  cron.schedule('0 1 * * *', async () => {
    await runCronJob('staff-blacklist-expiration', expireStaffBlacklist, 1000);
  });

  // 🛡️ Sanctions: Rapports manquants (toutes les heures)
  cron.schedule('30 * * * *', async () => {
    await runCronJob('missing-reports-check', async () => {
      await checkMissingReports();
    }, 2000);
  });

  // 📅 Réunions: Notifications (toutes les minutes)
  cron.schedule('* * * * *', async () => {
    await runCronJob('meeting-notifications', async () => {
      await processMeetingNotifications();
    }, 3000);

  });

  // 🔍 DC Scan: Toutes les heures (vérifie les guildes qui ont activé l'auto-détection)
  cron.schedule('0 * * * *', async () => {
    await runCronJob('dc-scan', async () => {
      const featureConfigs = await prisma.dashboardFeatureConfig.findMany({
        where: { featureKey: 'double_accounts', enabled: true },
        select: { guildId: true, metadata: true }
      });

      for (const cfg of featureConfigs) {
        try {
          const meta = cfg.metadata as any;
          const autoEnabled = meta?.workflowDraft?.autoDetectionEnabled ?? meta?.autoDetectionEnabled ?? false;
          if (!autoEnabled) continue;

          const guild = await client.guilds.fetch(cfg.guildId).catch(() => null);
          if (!guild) continue;

          await scanGuildMembersForYoungAccounts(guild, JOIN_TO_ACCOUNT_CREATION_PROXIMITY_MS).catch((e) => {
            logger.error('Cron', `Erreur pendant dc-scan pour guild ${cfg.guildId}:`, e);
            return null;
          });
        } catch (e) {
          logger.error('Cron', 'Erreur dc-scan cron:', e);
        }
      }
    }, 5000);
  });

  // 📺 YouTube & Twitch checks: toutes les 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    await runCronJob('youtube', async () => {
      await checkYoutubeFollows(client);
    }, 5000);
    await runCronJob('twitch', async () => {
      await checkTwitchFollows(client);
    }, 5000);
  });

  logger.success('Cron', 'Tous les jobs cron sont enregistrés (Suivi d\'activité minute activé)');
}
