import Parser from 'rss-parser';
import pLimit from 'p-limit';
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

type CustomItem = Parser.Item & {
  creator?: string;
  author?: string;
  mediaContent?: { '$'?: { url?: string } };
  mediaThumbnail?: { '$'?: { url?: string } };
  enclosure?: { url?: string; type?: string };
};

function formatRssError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? 'Erreur inconnue');
  const firstLine = raw.split('\n').map((line) => line.trim()).find(Boolean) ?? 'Erreur inconnue';
  return firstLine;
}

function extractImageFromItem(item: CustomItem): string | null {
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
  if (!feed || !feed.enabled) return;

  if (!feed.autoPublish && !feed.guild.configChannelId) {
    logger.warn('RSS', `Skipping poll for "${feed.name}": manual validation required but configChannelId is not set.`);
    await prisma.feed.update({ where: { id: feed.id }, data: { lastPollStatus: 'ERROR', lastPollError: 'Channel de validation non configuré' } });
    return;
  }
  if (feed.autoPublish && !feed.guild.publicChannelId) {
    logger.warn('RSS', `Poll ignorée pour "${feed.name}" : auto-publication activée mais publicChannelId non défini.`);
    await prisma.feed.update({ where: { id: feed.id }, data: { lastPollStatus: 'ERROR', lastPollError: 'Channel public non configuré' } });
    return;
  }

  let parsed;
  try {
    parsed = await parser.parseURL(feed.url);
  } catch (err) {
    const errorMessage = formatRssError(err);
    logger.warn('RSS', `Échec du parsing de ${feed.name}: ${errorMessage}`);
    await prisma.feed.update({
      where: { id: feed.id },
      data: { lastPollStatus: 'ERROR', lastPollError: errorMessage }
    });
    return;
  }

  const now = new Date();

  if (!feed.lastPolledAt) {
    await prisma.feed.update({ where: { id: feed.id }, data: { lastPolledAt: now } });
    logger.info('RSS', `Premier poll de "${feed.name}" — baseline enregistrée, anciens articles ignorés.`);
    return;
  }

  const cutoff = feed.lastPolledAt;
  const rawItems = (parsed.items ?? []).slice(0, 20);
  
  // 1. Filtrer par date avant de toucher à la DB
  const candidateItems = rawItems.filter(item => {
    const publishedAt = item.pubDate ? new Date(item.pubDate) : new Date();
    return publishedAt > cutoff;
  });

  if (candidateItems.length === 0) {
    await prisma.feed.update({ where: { id: feed.id }, data: { lastPolledAt: now, lastPollStatus: 'SUCCESS', lastPollError: null } });
    return;
  }

  // 2. Vérifier l'existence en batch
  const guids = candidateItems.map(item => item.guid ?? item.link ?? item.title ?? '').filter(Boolean);
  const existingItems = await prisma.feedItem.findMany({
    where: { feedId: feed.id, guid: { in: guids } },
    select: { guid: true }
  });
  const existingGuids = new Set(existingItems.map(i => i.guid));

  const newItems = candidateItems.filter(item => {
    const guid = item.guid ?? item.link ?? item.title ?? '';
    return guid && !existingGuids.has(guid);
  });

  if (newItems.length === 0) {
    await prisma.feed.update({ where: { id: feed.id }, data: { lastPolledAt: now, lastPollStatus: 'SUCCESS', lastPollError: null } });
    return;
  }

  // 3. Traitement parallèle des nouveaux items (traductions, etc.)
  const limit = pLimit(3); // Max 3 traductions simultanées par flux
  const tasks = newItems.map(item => limit(async () => {
    const guid = item.guid ?? item.link ?? item.title ?? '';
    const title = item.title ?? 'Sans titre';
    const url = item.link ?? '';
    const description = item.contentSnippet ?? item.content?.replace(/<[^>]*>/g, '').slice(0, 500) ?? null;
    const author = (item as CustomItem).creator ?? (item as CustomItem).author ?? null;
    const imageUrl = extractImageFromItem(item);
    const publishedAt = item.pubDate ? new Date(item.pubDate) : new Date();

    const combinedInclude = Array.from(new Set([...feed.guild.globalIncludeKeywords, ...feed.includeKeywords]));
    const combinedExclude = Array.from(new Set([...feed.guild.globalExcludeKeywords, ...feed.excludeKeywords]));

    const textToFilter = `${title} ${description ?? ''}`;
    if (!matchesKeywordFilter(textToFilter, combinedInclude, combinedExclude)) {
      logger.debug('RSS', `Filtered out: "${title}" (keyword filter)`);
      return null;
    }

    const detectedLang = detectLanguage(`${title} ${description ?? ''}`);

    let titleTranslated: string | null = null;
    let descTranslated: string | null = null;
    const shouldTranslate =
      feed.translateTo &&
      detectedLang &&
      detectedLang.toUpperCase() !== feed.translateTo.toUpperCase();

    if (shouldTranslate && feed.translateTo) {
      // On lance les deux traductions en parallèle
      const [tTitle, tDesc] = await Promise.all([
        translate(title, feed.translateTo!, detectedLang ?? undefined),
        description ? translate(description.slice(0, 1000), feed.translateTo!, detectedLang ?? undefined) : Promise.resolve(null)
      ]);
      titleTranslated = tTitle;
      descTranslated = tDesc;
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

    if (feed.autoPublish) {
      logger.info('RSS', `Auto-publication de l'élément : "${title}" depuis ${feed.name}`);
      await publishItem(client, dbItem.id);
    } else {
      logger.info('RSS', `Queueing item for validation: "${title}" from ${feed.name}`);
      await sendToValidationQueue(client, dbItem.id, 'rss');
    }

    return dbItem;
  }));

  const results = await Promise.all(tasks);
  const createdCount = results.filter(Boolean).length;

  await prisma.feed.update({ where: { id: feed.id }, data: { lastPolledAt: now, lastPollStatus: 'SUCCESS', lastPollError: null } });
  if (createdCount > 0) logger.info('RSS', `${feed.name} : ${createdCount} nouveaux articles`);
}

export async function pollAllFeeds(client: Client): Promise<void> {
  const guilds = await prisma.guild.findMany({
    include: { feeds: { where: { enabled: true } } },
  });

  const allFeeds = guilds.flatMap(g => g.feeds);
  if (allFeeds.length === 0) return;

  logger.info('RSS', `Démarrage du polling de ${allFeeds.length} flux sur ${guilds.length} serveur(s)...`);
  
  const limit = pLimit(5); // Traiter 5 flux simultanément
  const tasks = allFeeds.map(feed => limit(async () => {
    try {
      await pollFeed(client, feed.id);
    } catch (e) {
      logger.error('RSS', `Erreur pendant le polling de ${feed.name}:`, e);
    }
  }));

  await Promise.all(tasks);
  logger.info('RSS', 'Polling terminé pour tous les flux.');
}

export async function publishItem(client: Client, itemId: string): Promise<void> {
  const { sendApprovedItem } = await import('./notificationService');
  await sendApprovedItem(client, itemId);
}
