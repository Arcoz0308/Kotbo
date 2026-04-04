import type { FeedbackSource, InterestDecision } from '@prisma/client';
import prisma from '../utils/db.js';
import { extractKeywords } from '../utils/keywords.js';

const GUILD_PROFILE_ID = '__guild__';
const TOPIC_LIMIT = 8;

const TOPIC_ALIASES: Record<string, string> = {
  chatgpt: 'openai',
  gpt: 'openai',
  gpt4: 'openai',
  gpt5: 'openai',
  claude: 'anthropic',
  gemini: 'google-ai',
  llm: 'ia-generative',
  ia: 'ia-generative',
  ai: 'ia-generative',
  javascript: 'js',
  typescript: 'ts',
  nodejs: 'node',
};

function normalizeTopic(topic: string): string {
  return topic
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '')
    .trim();
}

export function extractInterestTopics(title: string, description?: string | null): string[] {
  const keywords = extractKeywords(title, description);
  const normalized = keywords
    .map((topic) => normalizeTopic(topic))
    .filter((topic) => topic.length >= 3)
    .map((topic) => TOPIC_ALIASES[topic] ?? topic);

  return Array.from(new Set(normalized)).slice(0, TOPIC_LIMIT);
}

function clampScore(value: number): number {
  return Math.max(-4, Math.min(4, value));
}

export async function migrateLegacyKeywordPreferences(guildId: string): Promise<void> {
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    include: { feeds: true },
  });

  if (!guild || guild.preferencesMigrated) return;

  const scoreMap = new Map<string, number>();

  const applyBoost = (words: string[], delta: number) => {
    for (const word of words) {
      const topic = normalizeTopic(word);
      if (topic.length < 3) continue;
      const current = scoreMap.get(topic) ?? 0;
      scoreMap.set(topic, clampScore(current + delta));
    }
  };

  applyBoost(guild.globalIncludeKeywords, 1.5);
  applyBoost(guild.globalExcludeKeywords, -1.5);
  applyBoost(guild.globalIgnoredKeywords, -0.75);

  for (const feed of guild.feeds) {
    applyBoost(feed.includeKeywords, 1);
    applyBoost(feed.excludeKeywords, -1);
    applyBoost(feed.ignoredKeywords, -0.5);
  }

  const entries = Array.from(scoreMap.entries());

  await prisma.$transaction(async (tx) => {
    for (const [topic, score] of entries) {
      await tx.interestTopicScore.upsert({
        where: {
          guildId_userId_topic: {
            guildId,
            userId: GUILD_PROFILE_ID,
            topic,
          },
        },
        create: {
          guildId,
          userId: GUILD_PROFILE_ID,
          topic,
          score,
          positiveCount: score > 0 ? 1 : 0,
          negativeCount: score < 0 ? 1 : 0,
        },
        update: {
          score,
          positiveCount: score > 0 ? 1 : 0,
          negativeCount: score < 0 ? 1 : 0,
          lastInteractedAt: new Date(),
        },
      });
    }

    await tx.guild.update({
      where: { id: guildId },
      data: {
        preferencesMigrated: true,
        globalIncludeKeywords: [],
        globalExcludeKeywords: [],
        globalIgnoredKeywords: [],
      },
    });

    await tx.feed.updateMany({
      where: { guildId },
      data: {
        includeKeywords: [],
        excludeKeywords: [],
        ignoredKeywords: [],
      },
    });
  }, {
    maxWait: 10_000,
    timeout: 20_000,
  });
}

export async function evaluateInterestDecision(args: {
  guildId: string;
  userId?: string | null;
  topics: string[];
}): Promise<{ decision: InterestDecision; score: number; reason: string }> {
  const topics = args.topics.filter(Boolean);
  if (topics.length === 0) {
    return { decision: 'ALLOWED', score: 0, reason: 'Aucun sujet détecté' };
  }

  const [guildScores, userScores] = await Promise.all([
    prisma.interestTopicScore.findMany({
      where: {
        guildId: args.guildId,
        userId: GUILD_PROFILE_ID,
        topic: { in: topics },
      },
    }),
    args.userId
      ? prisma.interestTopicScore.findMany({
          where: {
            guildId: args.guildId,
            userId: args.userId,
            topic: { in: topics },
          },
        })
      : Promise.resolve([]),
  ]);

  const guildMap = new Map(guildScores.map((entry) => [entry.topic, entry.score]));
  const userMap = new Map(userScores.map((entry) => [entry.topic, entry.score]));

  let weightedScore = 0;
  let coveredTopics = 0;

  for (const topic of topics) {
    const g = guildMap.get(topic) ?? 0;
    const u = userMap.get(topic) ?? 0;
    const hasSignal = guildMap.has(topic) || userMap.has(topic);
    if (hasSignal) coveredTopics += 1;
    weightedScore += (u * 0.7) + (g * 0.3);
  }

  const avgScore = topics.length > 0 ? weightedScore / topics.length : 0;
  const confidence = coveredTopics / topics.length;

  if (confidence >= 0.35 && avgScore <= -0.45) {
    return {
      decision: 'FILTERED_OUT',
      score: avgScore,
      reason: `Score négatif (${avgScore.toFixed(2)}) avec confiance ${(confidence * 100).toFixed(0)}%`,
    };
  }

  return {
    decision: 'ALLOWED',
    score: avgScore,
    reason: `Score ${avgScore.toFixed(2)} avec confiance ${(confidence * 100).toFixed(0)}%`,
  };
}

export async function applyTopicFeedback(args: {
  guildId: string;
  userId: string;
  topics: string[];
  source: FeedbackSource;
  isPositive: boolean;
  feedItemId?: string | null;
  applyToGuildProfile?: boolean;
}): Promise<void> {
  const topics = Array.from(new Set(args.topics.map((topic) => normalizeTopic(topic)).filter((topic) => topic.length >= 3)));
  if (topics.length === 0) return;

  const delta = args.isPositive ? 0.6 : -0.6;

  await prisma.$transaction(async (tx) => {
    for (const topic of topics) {
      await tx.newsInterestFeedback.create({
        data: {
          guildId: args.guildId,
          userId: args.userId,
          feedItemId: args.feedItemId ?? null,
          topic,
          value: args.isPositive ? 1 : -1,
          source: args.source,
        },
      });

      await tx.interestTopicScore.upsert({
        where: {
          guildId_userId_topic: {
            guildId: args.guildId,
            userId: args.userId,
            topic,
          },
        },
        create: {
          guildId: args.guildId,
          userId: args.userId,
          topic,
          score: delta,
          positiveCount: args.isPositive ? 1 : 0,
          negativeCount: args.isPositive ? 0 : 1,
        },
        update: {
          score: { increment: delta },
          positiveCount: { increment: args.isPositive ? 1 : 0 },
          negativeCount: { increment: args.isPositive ? 0 : 1 },
          lastInteractedAt: new Date(),
        },
      });

      if (args.applyToGuildProfile) {
        await tx.interestTopicScore.upsert({
          where: {
            guildId_userId_topic: {
              guildId: args.guildId,
              userId: GUILD_PROFILE_ID,
              topic,
            },
          },
          create: {
            guildId: args.guildId,
            userId: GUILD_PROFILE_ID,
            topic,
            score: delta,
            positiveCount: args.isPositive ? 1 : 0,
            negativeCount: args.isPositive ? 0 : 1,
          },
          update: {
            score: { increment: delta },
            positiveCount: { increment: args.isPositive ? 1 : 0 },
            negativeCount: { increment: args.isPositive ? 0 : 1 },
            lastInteractedAt: new Date(),
          },
        });
      }
    }
  });
}

export function getParisDayRange(baseDate = new Date()): { start: Date; end: Date } {
  const localeDate = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(baseDate);

  const year = Number(localeDate.find((part) => part.type === 'year')?.value);
  const month = Number(localeDate.find((part) => part.type === 'month')?.value);
  const day = Number(localeDate.find((part) => part.type === 'day')?.value);

  const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));
  return { start, end };
}
