import Parser from 'rss-parser';
import pLimit from 'p-limit';
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
    logger.warn('YouTube', `Guild ${guildId} has YouTube enabled but no configChannelId (validation channel) is set; auto-approval path will be used.`);
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
  const limit = pLimit(2); // Max 2 Shorts checks simultanés par guilde

  const tasks = items.map(item => limit(async () => {
    const videoId = extractVideoId(item.link ?? item.id ?? '');
    if (!videoId) return;

    const exists = await prisma.youTubeItem.findUnique({ where: { videoId } });
    if (exists) return;

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
  }));

  await Promise.all(tasks);
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
  const subs = await (prisma as any).youTubeSubscription?.findMany?.({ include: { guild: true } }) ?? [];

  if (subs.length === 0) {
    const guilds = await prisma.guild.findMany({
      where: { youtubeEnabled: true, nathanYtChannelId: { not: null } },
    });

    const limit = pLimit(3); // Traiter 3 guildes simultanément
    const tasks = guilds.map(guild => limit(async () => {
      try {
        await pollYouTubeChannel(client, guild.id, guild.nathanYtChannelId!);
      } catch (e) {
        logger.error('YouTube', `Error polling guild ${guild.id}:`, e);
      }
    }));

    await Promise.all(tasks);
    return;
  }

  const byGuild = new Map<string, { guild: any; channelIds: string[] }>();
  for (const s of subs) {
    if (!s.guild || !s.channelId) continue;
    if (!s.guild.youtubeEnabled) continue;
    const existing = byGuild.get(s.guildId) ?? { guild: s.guild, channelIds: [] };
    existing.channelIds.push(s.channelId);
    byGuild.set(s.guildId, existing);
  }

  const limit = pLimit(3);
  const tasks = Array.from(byGuild.entries()).map(([guildId, { guild, channelIds }]) => limit(async () => {
    for (const channelId of channelIds) {
      try {
        await pollYouTubeChannel(client, guildId, channelId);
      } catch (e) {
        logger.error('YouTube', `Error polling subscription ${channelId} for guild ${guildId}:`, e);
      }
    }
  }));

  await Promise.all(tasks);
}

function extractVideoId(url: string): string | null {
  const match =
    url.match(/[?&]v=([^&]+)/) ??
    url.match(/youtu\.be\/([^?]+)/) ??
    url.match(/\/watch\/([^?]+)/) ??
    url.match(/yt:video:([^<]+)/);
  return match?.[1] ?? null;
}
