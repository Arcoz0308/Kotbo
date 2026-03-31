import Parser from 'rss-parser';
import type { Client } from 'discord.js';
import prisma from '../utils/db';
import { logger } from '../utils/logger';
import { detectLanguage } from '../utils/language';
import { translate } from './translationService';
import { sendToValidationQueue } from './notificationService';

const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: false }],
      ['media:thumbnail', 'mediaThumbnail', { keepArray: false }],
      ['enclosure', 'enclosure'],
    ],
  },
});

function extractImageFromItem(item: any): string | null {
  const mc = item['mediaContent'];
  if (mc?.['$']?.['url']) return String(mc['$']['url']);

  const mt = item['mediaThumbnail'];
  if (mt?.['$']?.['url']) return String(mt['$']['url']);

  const enc = item['enclosure'];
  if (enc?.url && String(enc.type ?? '').startsWith('image/')) return String(enc.url);

  const content = item.content ?? item.contentSnippet ?? '';
  const imgMatch = content.match(/<img[^>]+src="([^"]+)"/i);
  if (imgMatch?.[1]) return imgMatch[1];
  return null;
}

function matchesKeywordFilter(
  text: string,
  includeKeywords: string[],
  excludeKeywords: string[],
): boolean {
  const lower = text.toLowerCase();
  if (excludeKeywords.some((kw) => lower.includes(kw.toLowerCase()))) return false;
  if (includeKeywords.length > 0 && !includeKeywords.some((kw) => lower.includes(kw.toLowerCase()))) return false;
  return true;
}

export async function pollFeed(
  client: Client,
  feedId: string,
): Promise<void> {
  const feed = await prisma.feed.findUnique({
    where: { id: feedId },
    include: { guild: true },
  });
  if (!feed || !feed.enabled || !feed.guild.configChannelId) return;

  let parsed;
  try {
    parsed = await parser.parseURL(feed.url);
  } catch (err) {
    logger.warn('RSS', `Failed to parse ${feed.name}: ${err}`);
    return;
  }

  const now = new Date();

  if (!feed.lastPolledAt) {
    await prisma.feed.update({ where: { id: feed.id }, data: { lastPolledAt: now } });
    logger.info('RSS', `Premier poll de "${feed.name}" — baseline enregistrée, anciens articles ignorés.`);
    return;
  }

  const cutoff = feed.lastPolledAt;
  const items = (parsed.items ?? []).slice(0, 20);
  let newCount = 0;

  for (const item of items) {
    const guid = item.guid ?? item.link ?? item.title ?? '';
    if (!guid) continue;

    const publishedAt = item.pubDate ? new Date(item.pubDate) : new Date();
    if (publishedAt <= cutoff) continue;

    const exists = await prisma.feedItem.findFirst({ where: { feedId: feed.id, guid } });
    if (exists) continue;

    const title = item.title ?? 'Sans titre';
    const url = item.link ?? '';
    const description = item.contentSnippet ?? item.content?.replace(/<[^>]*>/g, '').slice(0, 500) ?? null;
    const author = (item as any).creator ?? (item as any).author ?? null;
    const imageUrl = extractImageFromItem(item);

    const textToFilter = `${title} ${description ?? ''}`;
    if (!matchesKeywordFilter(textToFilter, feed.includeKeywords, feed.excludeKeywords)) {
      logger.debug('RSS', `Filtered out: "${title}" (keyword filter)`);
      continue;
    }

    const detectedLang = detectLanguage(`${title} ${description ?? ''}`);

    let titleTranslated: string | null = null;
    let descTranslated: string | null = null;
    const shouldTranslate =
      feed.translateTo &&
      detectedLang &&
      detectedLang.toUpperCase() !== feed.translateTo.toUpperCase();

    if (shouldTranslate && feed.translateTo) {
      titleTranslated = await translate(title, feed.translateTo, detectedLang ?? undefined);
      if (description) {
        descTranslated = await translate(description.slice(0, 1000), feed.translateTo, detectedLang ?? undefined);
      }
    }

    const dbItem = await prisma.feedItem.create({
      data: {
        feedId: feed.id,
        guid,
        title,
        url,
        description,
        imageUrl,
        author,
        publishedAt,
        titleTranslated,
        descriptionTranslated: descTranslated,
      },
    });

    newCount++;
    logger.info('RSS', `New item: "${title}" from ${feed.name}`);

    if (feed.autoPublish) {
      await publishItem(client, dbItem.id);
    } else {
      await sendToValidationQueue(client, dbItem.id, 'rss');
    }
  }

  await prisma.feed.update({ where: { id: feed.id }, data: { lastPolledAt: now } });
  if (newCount > 0) logger.info('RSS', `${feed.name}: ${newCount} nouveaux articles`);
}

export async function pollAllFeeds(client: Client): Promise<void> {
  const guilds = await prisma.guild.findMany({
    include: { feeds: { where: { enabled: true } } },
  });
  for (const guild of guilds) {
    for (const feed of guild.feeds) {
      await pollFeed(client, feed.id).catch((e) =>
        logger.error('RSS', `Error polling ${feed.name}:`, e),
      );
    }
  }
}

export async function publishItem(client: Client, itemId: string): Promise<void> {
  const { sendApprovedItem } = await import('./notificationService');
  await sendApprovedItem(client, itemId);
}
