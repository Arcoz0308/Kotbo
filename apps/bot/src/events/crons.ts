import { type Client, Events } from 'discord.js';
import cron from 'node-cron';
import prisma from '../utils/db.js';
import { pollAllFeeds } from '../services/rssService.js';
import { pollAllYouTubeChannels } from '../services/youtubeService.js';
import { runDigestForAllGuilds, runDailyAlgoForAllGuilds } from '../services/digestService.js';
import { runDailyAlgoSummariesForAllGuilds } from '../services/dailyAlgoService.js';
import { runWeeklyRecapForAllGuilds } from '../services/recapService.js';
import { processScheduledSanctions, checkMissingReports } from '../services/sanctionService.js';
import { logger } from '../utils/logger.js';
import { runHourlyAnalyticsSnapshot } from './advancedLogs.js';
import { enqueueBackgroundJob, registerBackgroundJobHandlers, type BackgroundJobName } from '../infra/queues/backgroundQueue.js';

const runningJobs = new Set<string>();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCronJob(name: string, task: () => Promise<void>, jitterMs = 0): Promise<void> {
  const enqueued = await enqueueBackgroundJob(name as BackgroundJobName, { jitterMs }, { jobId: `cron:${name}` });
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

async function runAnalyticsSnapshot(client: Client): Promise<void> {
  logger.debug('Cron', 'Snapshot analytics serveur...');
  const guilds = await prisma.guild.findMany({ select: { id: true } });

  for (const guild of guilds) {
    const discordGuild = client.guilds.cache.get(guild.id);
    if (!discordGuild) continue;

    const now = new Date();
    const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const totalMembers = discordGuild.memberCount;
    const members = discordGuild.members.cache;
    const onlineMembers = members.filter(m => m.presence?.status && m.presence.status !== 'offline').size;
    const idleMembers = members.filter(m => m.presence?.status === 'idle').size;
    const dndMembers = members.filter(m => m.presence?.status === 'dnd').size;
    const offlineMembers = totalMembers - onlineMembers;
    const totalBots = members.filter(m => m.user.bot).size;
    const totalHumans = totalMembers - totalBots;

    const currentOnline = onlineMembers;
    const voiceConnected = members.filter(m => !!m.voice?.channelId).size;

    await prisma.guildDailyStat.upsert({
      where: { guildId_dateKey: { guildId: guild.id, dateKey } },
      create: {
        guildId: guild.id,
        dateKey,
        totalMembers,
        onlineMembers,
        idleMembers,
        dndMembers,
        offlineMembers,
        totalBots,
        totalHumans,
        peakOnline: currentOnline,
        peakVoice: voiceConnected,
      },
      update: {
        totalMembers,
        onlineMembers,
        idleMembers,
        dndMembers,
        offlineMembers,
        totalBots,
        totalHumans,
      },
    }).catch((error) => {
      logger.debug('Analytics', `Guild stats snapshot error: ${String(error)}`);
    });

    await prisma.$executeRawUnsafe(
      `UPDATE guild_daily_stats SET "peakOnline" = GREATEST("peakOnline", $1), "peakVoice" = GREATEST("peakVoice", $2) WHERE "guildId" = $3 AND "dateKey" = $4`,
      currentOnline, voiceConnected, guild.id, dateKey,
    ).catch((error) => {
      logger.debug('Analytics', `Guild peak update error: ${String(error)}`);
    });
  }
}

export async function registerCrons(client: Client): Promise<void> {
  registerBackgroundJobHandlers({
    rss: async () => {
      logger.debug('Cron', 'Polling RSS en cours...');
      await pollAllFeeds(client);
    },
    youtube: async () => {
      logger.debug('Cron', 'Polling YouTube en cours...');
      await pollAllYouTubeChannels(client);
    },
    digest: async () => {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      logger.debug('Cron', `Vérification du digest à ${currentTime}...`);
      await runDigestForAllGuilds(client);
    },
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
    'weekly-recap': async () => {
      logger.info('Cron', 'Démarrage du recap hebdomadaire pour toutes les guildes...');
      await runWeeklyRecapForAllGuilds(client);
    },
    sanctions: async () => {
      logger.debug('Cron', 'Traitement des sanctions planifiées...');
      await processScheduledSanctions(client);
    },
    'staff-warnings-expiration': expireStaffWarnings,
    'staff-blacklist-expiration': expireStaffBlacklist,
    'analytics-hourly-snapshot': async () => {
      logger.info('Cron', 'Exécution du snapshot analytique horaire...');
      await runHourlyAnalyticsSnapshot(client);
    },
    'analytics-snapshot': async () => {
      await runAnalyticsSnapshot(client);
    },
    'missing-reports-check': async () => {
      logger.info('Cron', 'Vérification des rapports de sanction manquants...');
      await checkMissingReports();
    },
  });

  // RSS polling every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    await runCronJob('rss', async () => {
      logger.debug('Cron', 'Polling RSS en cours...');
      await pollAllFeeds(client);
    }, 4000);
  });

  // YouTube polling every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    await runCronJob('youtube', async () => {
      logger.debug('Cron', 'Polling YouTube en cours...');
      await pollAllYouTubeChannels(client);
    }, 5000);
  });

  // Digest: check every minute (sends only at matching HH:MM)
  cron.schedule('* * * * *', async () => {
    await runCronJob('digest', async () => {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      logger.debug('Cron', `Vérification du digest à ${currentTime}...`);
      await runDigestForAllGuilds(client);
    }, 3000);
  });

  cron.schedule('* * * * *', async () => {
    await runCronJob('daily-algo', async () => {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      logger.debug('Cron', `Vérification du daily algo à ${currentTime}...`);
      await runDailyAlgoForAllGuilds(client);
    }, 3000);
  });

  cron.schedule('59 23 * * *', async () => {
    await runCronJob('daily-algo-summary', async () => {
      logger.debug('Cron', 'Génération du bilan quotidien Daily Algo...');
      await runDailyAlgoSummariesForAllGuilds(client);
    }, 2000);
  }, { timezone: 'UTC' });

  // 🌟 Recap Hebdomadaire: Chaque dimanche à 19:00 UTC
  cron.schedule('0 19 * * 0', async () => {
    await runCronJob('weekly-recap', async () => {
      logger.info('Cron', 'Démarrage du recap hebdomadaire pour toutes les guildes...');
      await runWeeklyRecapForAllGuilds(client);
    }, 5000);
  });

  cron.schedule('* * * * *', async () => {
    await runCronJob('sanctions', async () => {
      logger.debug('Cron', 'Traitement des sanctions planifiées...');
      await processScheduledSanctions(client);
    }, 1000);
  });

  // 📊 Staff Management: Expiration des avertissements à minuit
  cron.schedule('0 0 * * *', async () => {
    await runCronJob('staff-warnings-expiration', expireStaffWarnings, 1000);
  });

  // 📊 Staff Management: Expiration de la blacklist à 01:00 UTC
  cron.schedule('0 1 * * *', async () => {
    await runCronJob('staff-blacklist-expiration', expireStaffBlacklist, 1000);
  });

  // 📊 Analytics: Snapshot horaire à HH:00
  cron.schedule('0 * * * *', async () => {
    await runCronJob('analytics-hourly-snapshot', async () => {
      logger.info('Cron', 'Exécution du snapshot analytique horaire...');
      await runHourlyAnalyticsSnapshot(client);
    }, 2000);
  });

  // 📊 Analytics: Snapshot des stats serveur toutes les 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    await runCronJob('analytics-snapshot', async () => {
      await runAnalyticsSnapshot(client);
    }, 2000);
  });

  // 🛡️ Sanctions: Vérification des rapports manquants (toutes les heures)
  cron.schedule('30 * * * *', async () => {
    await runCronJob('missing-reports-check', async () => {
      logger.info('Cron', 'Vérification des rapports de sanction manquants...');
      await checkMissingReports();
    }, 2000);
  });

  logger.success('Cron', 'Tous les jobs cron sont enregistrés');
}
