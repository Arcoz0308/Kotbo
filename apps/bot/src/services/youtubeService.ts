import Parser from 'rss-parser';
import type { Client } from 'discord.js';
import prisma from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { sendToValidationQueue } from './notificationService.js';

const parser = new Parser({ timeout: 10000 });

export async function pollYouTubeChannel(
  client: Client,
  guildId: string,
  channelId: string,
): Promise<void> {
  const guild = await prisma.guild.findUnique({ where: { id: guildId } });
  if (!guild || !guild.youtubeEnabled) return;

  if (!guild.configChannelId) {
    logger.warn('YouTube', `Skipping poll for guild ${guildId}: youtubeEnabled is true but configChannelId (validation channel) is not set.`);
    return;
  }

  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

  let parsed;
  try {
    parsed = await parser.parseURL(feedUrl);
  } catch (err) {
    logger.warn('YouTube', `Failed to fetch channel ${channelId}: ${err}`);
    return;
  }

  const items = (parsed.items ?? []).slice(0, 5);

  for (const item of items) {
    const videoId = extractVideoId(item.link ?? item.id ?? '');
    if (!videoId) continue;

    const exists = await prisma.youTubeItem.findUnique({ where: { videoId } });
    if (exists) continue;

    const title = item.title ?? 'Nouvelle vidéo';
    const description = item.contentSnippet ?? null;
    const channelName = item.author ?? parsed.title ?? 'Chaîne inconnue';
    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    const publishedAt = item.pubDate ? new Date(item.pubDate) : new Date();

    const isShort = await isYouTubeShort(videoId);

    const dbItem = await prisma.youTubeItem.create({
      data: {
        guildId,
        videoId,
        title,
        description,
        channelName,
        channelId,
        thumbnailUrl,
        isShort,
        publishedAt,
      },
    });

    logger.info('YouTube', `New ${isShort ? 'Short' : 'video'}: "${title}" by ${channelName}`);
    await sendToValidationQueue(client, dbItem.id, 'youtube');
  }
}

async function isYouTubeShort(videoId: string): Promise<boolean> {
  try {
    const res = await fetch(`https://www.youtube.com/shorts/${videoId}`, {
      method: 'HEAD',
      redirect: 'manual',
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

export async function pollAllYouTubeChannels(client: Client): Promise<void> {
  const guilds = await prisma.guild.findMany({
    where: { youtubeEnabled: true, nathanYtChannelId: { not: null } },
  });
  for (const guild of guilds) {
    if (guild.nathanYtChannelId) {
      await pollYouTubeChannel(client, guild.id, guild.nathanYtChannelId).catch((e) =>
        logger.error('YouTube', 'Poll error:', e),
      );
    }
  }
}

function extractVideoId(url: string): string | null {
  const match =
    url.match(/[?&]v=([^&]+)/) ??
    url.match(/youtu\.be\/([^?]+)/) ??
    url.match(/\/watch\/([^?]+)/) ??
    url.match(/yt:video:([^<]+)/);
  return match?.[1] ?? null;
}
