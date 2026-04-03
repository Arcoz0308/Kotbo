import { type Client, Events } from 'discord.js';
import cron from 'node-cron';
import { pollAllFeeds } from '../services/rssService.js';
import { pollAllYouTubeChannels } from '../services/youtubeService.js';
import { runDigestForAllGuilds, runDailyAlgoForAllGuilds } from '../services/digestService.js';
import { logger } from '../utils/logger.js';

export async function registerCrons(client: Client): Promise<void> {
  // RSS polling every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    logger.debug('Cron', 'Polling RSS en cours...');
    await pollAllFeeds(client).catch((e) => logger.error('Cron', 'Erreur de polling RSS :', e));
  });

  // YouTube polling every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    logger.debug('Cron', 'Polling YouTube en cours...');
    await pollAllYouTubeChannels(client).catch((e) => logger.error('Cron', 'Erreur de polling YouTube :', e));
  });

  // Digest: check every minute (sends only at matching HH:MM)
  cron.schedule('* * * * *', async () => {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    logger.debug('Cron', `Vérification du digest à ${currentTime}...`);
    await runDigestForAllGuilds(client).catch((e) => logger.error('Cron', 'Erreur Digest :', e));
  });

  cron.schedule('* * * * *', async () => {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    logger.debug('Cron', `Vérification du daily algo à ${currentTime}...`);
    await runDailyAlgoForAllGuilds(client).catch((e) => logger.error('Cron', 'Erreur Daily Algo :', e));
  });

  logger.success('Cron', 'Tous les jobs cron sont enregistrés');
}
