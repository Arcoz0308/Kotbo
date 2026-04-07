import Parser from 'rss-parser';
import pLimit from 'p-limit';
import type { Client } from 'discord.js';
import prisma from '../utils/db';
import { fetchArticleMetadata } from '../utils/metadataParser';
import { logger } from '../utils/logger';
import { detectLanguage } from '../utils/language';
import { translate } from './translationService';
import { sendToValidationQueue } from './notificationService';
import {
  evaluateInterestDecision,
  extractInterestTopics,
  migrateLegacyKeywordPreferences,
} from './interestService.js';

async function safelyUpdateFeedUrl(feed: { id: string; guildId: string; name: string }, nextUrl: string): Promise<boolean> {
  const existing = await prisma.feed.findFirst({
    where: {
      guildId: feed.guildId,
      url: nextUrl,
      NOT: { id: feed.id },
    },
    select: { id: true, name: true },
  });

  if (existing) {
    logger.warn(
      'RSS',
      `URL résolue ignorée pour "${feed.name}": ${nextUrl} déjà utilisée par "${existing.name}" (${existing.id}).`,
    );
    return false;
  }

  await prisma.feed.update({
    where: { id: feed.id },
    data: { url: nextUrl },
  });
  return true;
}

const RSS_FAILURE_COOLDOWN_MS = 15 * 60 * 1000;
const BREAKING_AUTO_PUBLISH_ENABLED = process.env.KOTBO_BREAKING_AUTOPUBLISH === 'true';
const BREAKING_KEYWORDS = [
  'incident',
  'outage',
  'zero-day',
  'zero day',
  'breach',
  'faille critique',
  'urgence',
  'critical vulnerability',
  'rce',
  'cve-',
];
const FEED_REQUEST_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  Referer: 'https://www.google.com/',
};
const KNOWN_FEED_ALIASES: Record<string, string> = {
  'https://openai.com/news/rss': 'https://openai.com/blog/rss.xml',
};

const parser = new Parser({
  timeout: 10000,
  headers: FEED_REQUEST_HEADERS,
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

const TRANSLATION_TARGET_LANG = 'FR';

function normalizeLangCode(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) return null;
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

function formatRssError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? 'Erreur inconnue');
  const firstLine = raw.split('\n').map((line) => line.trim()).find(Boolean) ?? 'Erreur inconnue';
  return firstLine;
}

function looksLikeXmlFeed(raw: string): boolean {
  const snippet = raw.trimStart().slice(0, 3000).toLowerCase();
  return snippet.includes('<rss') || snippet.includes('<feed') || snippet.includes('<rdf:rdf');
}

function resolveKnownFeedAlias(url: string): string {
  return KNOWN_FEED_ALIASES[url] ?? url;
}

async function parseFeedFromUrl(url: string): Promise<Parser.Output<CustomItem>> {
  const response = await fetch(url, {
    headers: FEED_REQUEST_HEADERS,
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Status code ${response.status}`);
  }

  const body = await response.text();
  if (!looksLikeXmlFeed(body)) {
    throw new Error('Feed not recognized as RSS 1 or 2.');
  }

  return (await parser.parseString(body)) as Parser.Output<CustomItem>;
}

function buildFallbackFeedUrls(pageUrl: string): string[] {
  try {
    const base = new URL(pageUrl);
    const candidates = [
      '/feed',
      '/rss',
      '/rss.xml',
      '/feed.xml',
      '/atom.xml',
      '/index.xml',
      '/feeds/posts/default?alt=rss',
    ];
    return candidates.map((path) => new URL(path, `${base.protocol}//${base.host}`).toString());
  } catch {
    return [];
  }
}

async function tryParseCandidates(urls: string[]): Promise<{ parsed: Parser.Output<CustomItem>; usedUrl: string } | null> {
  for (const candidate of urls) {
    try {
      const parsed = await parseFeedFromUrl(candidate);
      return { parsed: parsed as Parser.Output<CustomItem>, usedUrl: candidate };
    } catch {
      continue;
    }
  }

  return null;
}

function shouldSkipFailedFeed(feed: { lastPollStatus: string | null; lastPolledAt: Date | null }, now: Date): boolean {
  if (feed.lastPollStatus !== 'ERROR' || !feed.lastPolledAt) return false;
  return now.getTime() - feed.lastPolledAt.getTime() < RSS_FAILURE_COOLDOWN_MS;
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

function isBreakingNews(title: string, description: string | null | undefined, category: string, publishedAt: Date): boolean {
  const text = `${title} ${description ?? ''}`.toLowerCase();
  const hasBreakingKeyword = BREAKING_KEYWORDS.some((keyword) => text.includes(keyword));
  const hasPriorityCategory = /cyber|sécurité|intelligence artificielle|ia/i.test(category);
  const isRecent = Date.now() - publishedAt.getTime() <= 3 * 60 * 60 * 1000;

  return hasBreakingKeyword && hasPriorityCategory && isRecent;
}

function computeEditorialPriority(args: {
  title: string;
  description: string | null | undefined;
  publishedAt: Date;
  category: string;
  feedLastPollStatus: string | null;
  predictedInterestScore: number;
}): number {
  const ageHours = Math.max(0, (Date.now() - args.publishedAt.getTime()) / (1000 * 60 * 60));
  const freshnessScore = Math.max(0, 45 - Math.min(45, ageHours * 6));
  const interestScore = Math.max(-10, Math.min(10, args.predictedInterestScore * 10));
  const reliabilityBoost = args.feedLastPollStatus === 'SUCCESS' ? 8 : 0;
  const categoryBoost = /cyber|sécurité|intelligence artificielle|ia/i.test(args.category) ? 12 : 0;
  const breakingBoost = isBreakingNews(args.title, args.description, args.category, args.publishedAt) ? 20 : 0;

  return Math.round(freshnessScore + interestScore + reliabilityBoost + categoryBoost + breakingBoost);
}

export async function pollFeed(
  client: Client,
  feedId: string,
  options?: { forceRefresh?: boolean },
): Promise<void> {
  const feed = await prisma.feed.findUnique({
    where: { id: feedId },
    include: { guild: true },
  });
  if (!feed || !feed.enabled) return;

  await migrateLegacyKeywordPreferences(feed.guildId);

  const effectiveFeedUrl = resolveKnownFeedAlias(feed.url);
  if (effectiveFeedUrl !== feed.url) {
    const updated = await safelyUpdateFeedUrl(feed, effectiveFeedUrl);
    if (updated) {
      logger.info('RSS', `Flux "${feed.name}" migré automatiquement vers ${effectiveFeedUrl}.`);
    }
  }

  if (!feed.autoPublish && !feed.guild.configChannelId) {
    logger.warn('RSS', `Poll ignorée pour "${feed.name}" : validation manuelle requise mais configChannelId non défini.`);
    await prisma.feed.update({
      where: { id: feed.id },
      data: { lastPolledAt: new Date(), lastPollStatus: 'ERROR', lastPollError: 'Channel de validation non configuré' },
    });
    return;
  }
  if (feed.autoPublish && !feed.guild.publicChannelId) {
    logger.warn('RSS', `Poll ignorée pour "${feed.name}" : auto-publication activée mais publicChannelId non défini.`);
    await prisma.feed.update({
      where: { id: feed.id },
      data: { lastPolledAt: new Date(), lastPollStatus: 'ERROR', lastPollError: 'Channel public non configuré' },
    });
    return;
  }

  const now = new Date();
  const shouldForceRefresh = options?.forceRefresh ?? false;
  if (!shouldForceRefresh && shouldSkipFailedFeed(feed, now)) {
    logger.debug('RSS', `Flux "${feed.name}" temporairement ignoré après un échec récent.`);
    return;
  }

  let parsed;
  try {
    parsed = await parseFeedFromUrl(effectiveFeedUrl);
  } catch (err) {
    const discovered = await fetchArticleMetadata(effectiveFeedUrl, { logErrors: false });
    const candidateUrls = Array.from(new Set([
      discovered.rssUrl,
      ...buildFallbackFeedUrls(effectiveFeedUrl),
      resolveKnownFeedAlias(effectiveFeedUrl),
    ].filter((u): u is string => Boolean(u && u !== effectiveFeedUrl))));

    const candidateResult = await tryParseCandidates(candidateUrls);
    if (candidateResult) {
      parsed = candidateResult.parsed;
      const updated = await safelyUpdateFeedUrl(feed, candidateResult.usedUrl);
      if (updated) {
        logger.info('RSS', `Flux "${feed.name}" résolu automatiquement vers ${candidateResult.usedUrl}.`);
      }
    } else {
      const errorMessage = formatRssError(err);
      logger.warn('RSS', `Échec du parsing de ${feed.name}: ${errorMessage}`);
      await prisma.feed.update({
        where: { id: feed.id },
        data: { lastPolledAt: now, lastPollStatus: 'ERROR', lastPollError: errorMessage }
      });
      return;
    }
  }

  if (!feed.lastPolledAt) {
    await prisma.feed.update({
      where: { id: feed.id },
      data: { lastPolledAt: now, lastPollStatus: 'SUCCESS', lastPollError: null },
    });
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

  const prioritizedItems = [...newItems].sort((a, b) => {
    const aTitle = a.title ?? 'Sans titre';
    const aDescription = a.contentSnippet ?? a.content?.replace(/<[^>]*>/g, '').slice(0, 500) ?? null;
    const aPublishedAt = a.pubDate ? new Date(a.pubDate) : now;
    const aTopics = extractInterestTopics(aTitle, aDescription);
    const aInterestSignal = Math.min(1, aTopics.length / 8);

    const bTitle = b.title ?? 'Sans titre';
    const bDescription = b.contentSnippet ?? b.content?.replace(/<[^>]*>/g, '').slice(0, 500) ?? null;
    const bPublishedAt = b.pubDate ? new Date(b.pubDate) : now;
    const bTopics = extractInterestTopics(bTitle, bDescription);
    const bInterestSignal = Math.min(1, bTopics.length / 8);

    const aPriority = computeEditorialPriority({
      title: aTitle,
      description: aDescription,
      publishedAt: aPublishedAt,
      category: feed.category,
      feedLastPollStatus: feed.lastPollStatus,
      predictedInterestScore: aInterestSignal,
    });

    const bPriority = computeEditorialPriority({
      title: bTitle,
      description: bDescription,
      publishedAt: bPublishedAt,
      category: feed.category,
      feedLastPollStatus: feed.lastPollStatus,
      predictedInterestScore: bInterestSignal,
    });

    return bPriority - aPriority;
  });

  // 3. Traitement parallèle des nouveaux items (traductions, etc.)
  const limit = pLimit(3); // Max 3 traductions simultanées par flux
  const tasks = prioritizedItems.map(item => limit(async () => {
    const guid = item.guid ?? item.link ?? item.title ?? '';
    const title = item.title ?? 'Sans titre';
    const url = item.link ?? '';
    const description = item.contentSnippet ?? item.content?.replace(/<[^>]*>/g, '').slice(0, 500) ?? null;
    const author = (item as CustomItem).creator ?? (item as CustomItem).author ?? null;
    const imageUrl = extractImageFromItem(item);
    const publishedAt = item.pubDate ? new Date(item.pubDate) : new Date();
    const breaking = isBreakingNews(title, description, feed.category, publishedAt);

    const topics = extractInterestTopics(title, description);
    const interest = await evaluateInterestDecision({
      guildId: feed.guildId,
      topics,
    });

    if (interest.decision === 'FILTERED_OUT') {
      await prisma.feedItem.create({
        data: {
          feedId: feed.id,
          guid,
          title,
          url,
          description,
          imageUrl,
          author,
          publishedAt,
          topics,
          interestDecision: 'FILTERED_OUT',
          interestScore: interest.score,
          interestReason: interest.reason,
          status: 'REJECTED',
        },
      });

      logger.info('RSS', `News filtrée par goûts: "${title}" (${interest.reason})`);
      return null;
    }

    const detectedLang = normalizeLangCode(detectLanguage(`${title} ${description ?? ''}`));
    const sourceLang = normalizeLangCode(feed.language) ?? detectedLang;
    const targetLang =
      normalizeLangCode(feed.translateTo) ??
      normalizeLangCode(feed.guild.defaultTranslateTo) ??
      TRANSLATION_TARGET_LANG;

    let titleTranslated: string | null = null;
    let descTranslated: string | null = null;
    const shouldTranslate = targetLang === TRANSLATION_TARGET_LANG && sourceLang !== TRANSLATION_TARGET_LANG;

    if (shouldTranslate) {
      // On lance les deux traductions en parallèle
      const [tTitle, tDesc] = await Promise.all([
        translate(title, targetLang, sourceLang ?? undefined),
        description ? translate(description.slice(0, 1000), targetLang, sourceLang ?? undefined) : Promise.resolve(null)
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
        topics,
        interestDecision: 'ALLOWED',
        interestScore: interest.score,
        interestReason: interest.reason,
        pinned: breaking,
      },
    });

    const shouldBreakingAutoPublish = breaking && BREAKING_AUTO_PUBLISH_ENABLED && Boolean(feed.guild.publicChannelId);

    if (feed.autoPublish || shouldBreakingAutoPublish) {
      logger.info('RSS', `Auto-publication de l'élément : "${title}" depuis ${feed.name}`);
      await publishItem(client, dbItem.id);
    } else {
      logger.info('RSS', `Élément mis en file de validation : "${title}" depuis ${feed.name}`);
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

export async function pollGuildFeeds(
  client: Client,
  guildId: string,
): Promise<{ totalFeeds: number; enabledFeeds: number; processedFeeds: number; failedFeeds: number }> {
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    include: { feeds: true },
  });

  if (!guild) {
    return { totalFeeds: 0, enabledFeeds: 0, processedFeeds: 0, failedFeeds: 0 };
  }

  const enabledFeeds = guild.feeds.filter((feed) => feed.enabled);
  if (enabledFeeds.length === 0) {
    return { totalFeeds: guild.feeds.length, enabledFeeds: 0, processedFeeds: 0, failedFeeds: 0 };
  }

  logger.info('RSS', `Mise à jour manuelle: ${enabledFeeds.length} flux sur la guilde ${guildId}.`);

  const limit = pLimit(5);
  let failedFeeds = 0;

  const tasks = enabledFeeds.map((feed) =>
    limit(async () => {
      try {
        await pollFeed(client, feed.id, { forceRefresh: true });
      } catch (error) {
        failedFeeds += 1;
        logger.error('RSS', `Erreur pendant la mise à jour manuelle de ${feed.name}:`, error);
      }
    }),
  );

  await Promise.all(tasks);

  return {
    totalFeeds: guild.feeds.length,
    enabledFeeds: enabledFeeds.length,
    processedFeeds: enabledFeeds.length,
    failedFeeds,
  };
}

export async function publishItem(client: Client, itemId: string): Promise<void> {
  const { sendApprovedItem } = await import('./notificationService');
  await sendApprovedItem(client, itemId);
}
