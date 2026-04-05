import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type User } from 'discord.js';
import prisma from '../utils/db.js';
import { buildNewsEmbed } from '../utils/embeds.js';
import { extractInterestTopics } from './interestService.js';

const GUILD_PROFILE_ID = '__guild__';

export type RecommendationWeights = {
  topic: number;
  freshness: number;
  historical: number;
};

const DEFAULT_RECOMMENDATION_WEIGHTS: RecommendationWeights = {
  topic: 1,
  freshness: 1,
  historical: 0.25,
};

const guildWeightOverrides = new Map<string, RecommendationWeights>();

function clampWeight(value: number): number {
  return Math.max(0, Math.min(3, value));
}

export function getGuildRecommendationWeights(guildId: string): RecommendationWeights {
  return guildWeightOverrides.get(guildId) ?? DEFAULT_RECOMMENDATION_WEIGHTS;
}

export function setGuildRecommendationWeights(guildId: string, weights: Partial<RecommendationWeights>): RecommendationWeights {
  const current = getGuildRecommendationWeights(guildId);
  const next: RecommendationWeights = {
    topic: clampWeight(weights.topic ?? current.topic),
    freshness: clampWeight(weights.freshness ?? current.freshness),
    historical: clampWeight(weights.historical ?? current.historical),
  };
  guildWeightOverrides.set(guildId, next);
  return next;
}

export function resetGuildRecommendationWeights(guildId: string): RecommendationWeights {
  guildWeightOverrides.delete(guildId);
  return DEFAULT_RECOMMENDATION_WEIGHTS;
}

export type PersonalizedNewsResult = {
  sentCount: number;
  totalCandidates: number;
  topTopics: string[];
  weights: RecommendationWeights;
  items: Array<{
    id: string;
    title: string;
    url: string;
    feedName: string;
    category: string;
    score: number;
    topics: string[];
    publishedAt: Date;
  }>;
};

function computeFreshnessBoost(publishedAt: Date): number {
  const ageHours = Math.max(0, (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60));
  if (ageHours <= 6) return 0.5;
  if (ageHours <= 24) return 0.3;
  if (ageHours <= 48) return 0.15;
  return 0;
}

function computeTopicScore(args: {
  topics: string[];
  userMap: Map<string, number>;
  guildMap: Map<string, number>;
}): number {
  if (args.topics.length === 0) return 0;

  let sum = 0;
  for (const topic of args.topics) {
    const userScore = args.userMap.get(topic) ?? 0;
    const guildScore = args.guildMap.get(topic) ?? 0;
    sum += (userScore * 0.7) + (guildScore * 0.3);
  }

  return sum / args.topics.length;
}

function getTopTopics(items: Array<{ topics: string[] }>): string[] {
  const map = new Map<string, number>();
  for (const item of items) {
    for (const topic of item.topics) {
      map.set(topic, (map.get(topic) ?? 0) + 1);
    }
  }

  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([topic]) => topic);
}

type RankedPersonalizedItem = {
  id: string;
  title: string;
  url: string;
  description: string | null;
  feedName: string;
  category: string;
  score: number;
  topics: string[];
  publishedAt: Date;
  imageUrl: string | null;
  author: string | null;
};

async function rankPersonalizedItems(guildId: string, userId: string, limit: number): Promise<{
  selected: RankedPersonalizedItem[];
  totalCandidates: number;
  topTopics: string[];
  weights: RecommendationWeights;
}> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const weights = getGuildRecommendationWeights(guildId);

  const candidates = await prisma.feedItem.findMany({
    where: {
      feed: { guildId },
      status: 'APPROVED',
      createdAt: { gte: since },
    },
    include: { feed: true },
    orderBy: { publishedAt: 'desc' },
    take: 250,
  });

  if (candidates.length === 0) {
    return {
      selected: [],
      totalCandidates: 0,
      topTopics: [],
      weights,
    };
  }

  const candidatesWithTopics = candidates.map((item) => ({
    item,
    topics: item.topics.length > 0
      ? item.topics
      : extractInterestTopics(item.titleTranslated ?? item.title, item.descriptionTranslated ?? item.description),
  }));

  const uniqueTopics = Array.from(new Set(candidatesWithTopics.flatMap((entry) => entry.topics)));

  const [guildScores, userScores] = await Promise.all([
    prisma.interestTopicScore.findMany({
      where: {
        guildId,
        userId: GUILD_PROFILE_ID,
        topic: { in: uniqueTopics },
      },
      select: { topic: true, score: true },
    }),
    prisma.interestTopicScore.findMany({
      where: {
        guildId,
        userId,
        topic: { in: uniqueTopics },
      },
      select: { topic: true, score: true },
    }),
  ]);

  const guildMap = new Map(guildScores.map((entry) => [entry.topic, entry.score]));
  const userMap = new Map(userScores.map((entry) => [entry.topic, entry.score]));

  const ranked = candidatesWithTopics.map(({ item, topics }) => {
    const topicScore = computeTopicScore({ topics, userMap, guildMap });
    const freshnessBoost = computeFreshnessBoost(item.publishedAt);
    const historicalScore = item.interestScore ?? 0;
    const finalScore =
      (topicScore * weights.topic) +
      (freshnessBoost * weights.freshness) +
      (historicalScore * weights.historical);

    return {
      id: item.id,
      title: item.titleTranslated ?? item.title,
      url: item.url,
      description: item.descriptionTranslated ?? item.description,
      feedName: item.feed.name,
      category: item.feed.category,
      score: finalScore,
      topics,
      publishedAt: item.publishedAt,
      imageUrl: item.imageUrl,
      author: item.author,
    };
  });

  ranked.sort((a, b) => b.score - a.score);
  const selected = ranked.slice(0, Math.max(1, Math.min(limit, 10)));

  return {
    selected,
    totalCandidates: candidates.length,
    topTopics: getTopTopics(selected),
    weights,
  };
}

function formatRecommendationReason(score: number, topics: string[]): string {
  const topTopics = topics.slice(0, 3);
  const topicPart = topTopics.length > 0 ? topTopics.map((topic) => `\`${topic}\``).join(', ') : 'signal thématique faible';
  return `Score: **${score.toFixed(2)}**\nCorrespondances: ${topicPart}`;
}

export async function buildPersonalizedNews(guildId: string, userId: string, limit: number): Promise<PersonalizedNewsResult> {
  const { selected, totalCandidates, topTopics, weights } = await rankPersonalizedItems(guildId, userId, limit);

  return {
    sentCount: 0,
    totalCandidates,
    topTopics,
    weights,
    items: selected.map((item) => ({
      id: item.id,
      title: item.title,
      url: item.url,
      feedName: item.feedName,
      category: item.category,
      score: item.score,
      topics: item.topics,
      publishedAt: item.publishedAt,
    })),
  };
}

export async function sendPersonalizedNewsDM(args: {
  user: User;
  guildId: string;
  limit: number;
}): Promise<PersonalizedNewsResult> {
  const { selected, totalCandidates, topTopics, weights } = await rankPersonalizedItems(args.guildId, args.user.id, args.limit);
  if (selected.length === 0) {
    return { sentCount: 0, totalCandidates: 0, topTopics: [], weights, items: [] };
  }

  const intro = topTopics.length > 0
    ? `🧠 Fil personnalisé basé sur tes signaux d’intérêt\n🏷️ Thèmes dominants: ${topTopics.map((topic) => `\`${topic}\``).join(', ')}\n⚙️ Poids actifs: topic=${weights.topic.toFixed(2)} • fraîcheur=${weights.freshness.toFixed(2)} • historique=${weights.historical.toFixed(2)}`
    : '🧠 Fil personnalisé basé sur tes signaux d’intérêt';

  await args.user.send({ content: intro });

  for (const item of selected) {
    const embed = buildNewsEmbed({
      title: item.title,
      url: item.url,
      description: item.description,
      feedName: item.feedName,
      category: item.category,
      publishedAt: item.publishedAt,
      imageUrl: item.imageUrl,
      author: item.author,
    });

    embed.addFields({
      name: '🧭 Pourquoi recommandé',
      value: formatRecommendationReason(item.score, item.topics),
    });

    const feedbackRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`interest:rss:${item.id}:up`)
        .setLabel('Intéressant')
        .setEmoji('👍')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`interest:rss:${item.id}:down`)
        .setLabel('Pas intéressant')
        .setEmoji('👎')
        .setStyle(ButtonStyle.Danger),
    );

    await args.user.send({ embeds: [embed], components: [feedbackRow] });
  }

  return {
    sentCount: selected.length,
    totalCandidates,
    topTopics,
    weights,
    items: selected.map((item) => ({
      id: item.id,
      title: item.title,
      url: item.url,
      feedName: item.feedName,
      category: item.category,
      score: item.score,
      topics: item.topics,
      publishedAt: item.publishedAt,
    })),
  };
}
