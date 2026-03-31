import { type Client, Events } from 'discord.js';
import cron from 'node-cron';
import { pollAllFeeds } from '../services/rssService.js';
import { pollAllYouTubeChannels } from '../services/youtubeService.js';
import { runDigestForAllGuilds } from '../services/digestService.js';
import { logger } from '../utils/logger.js';

export async function registerCrons(client: Client): Promise<void> {
  // RSS polling every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    logger.debug('Cron', 'Polling RSS feeds...');
    await pollAllFeeds(client).catch((e) => logger.error('Cron', 'RSS poll error:', e));
  });

  // YouTube polling every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    logger.debug('Cron', 'Polling YouTube channels...');
    await pollAllYouTubeChannels(client).catch((e) => logger.error('Cron', 'YouTube poll error:', e));
  });

  // Digest: check every minute (sends only at matching HH:MM)
  cron.schedule('* * * * *', async () => {
    await runDigestForAllGuilds(client).catch((e) => logger.error('Cron', 'Digest error:', e));
  });

  logger.success('Cron', 'All cron jobs registered');
}
