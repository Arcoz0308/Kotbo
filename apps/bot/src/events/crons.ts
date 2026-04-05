import { type Client, Events } from 'discord.js';
import cron from 'node-cron';
import { pollAllFeeds } from '../services/rssService.js';
import { pollAllYouTubeChannels } from '../services/youtubeService.js';
import { runDigestForAllGuilds, runDailyAlgoForAllGuilds } from '../services/digestService.js';
import { runDailyAlgoSummariesForAllGuilds } from '../services/dailyAlgoService.js';
import { logger } from '../utils/logger.js';

const runningJobs = new Set<string>();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCronJob(name: string, task: () => Promise<void>, jitterMs = 0): Promise<void> {
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

export async function registerCrons(client: Client): Promise<void> {
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
  });

  logger.success('Cron', 'Tous les jobs cron sont enregistrés');
}
