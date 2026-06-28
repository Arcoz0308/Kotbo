import prisma, { prismaRead } from '../../utils/db.js';
import { logger } from '../../utils/logger.js';

function getDailyKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function getWeeklyKey(): string {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const weekNumber = Math.ceil(((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
}

function getDateKeyForFrequency(frequency: string): string {
  return frequency === 'WEEKLY' ? getWeeklyKey() : getDailyKey();
}

export async function getAvailableQuests(guildId: string, userId: string) {
  const quests = await prismaRead.questDefinition.findMany({
    where: { guildId, enabled: true },
    orderBy: { frequency: 'asc' },
  });

  const dateKeys = [getDailyKey(), getWeeklyKey()];
  const progress = await prismaRead.questProgress.findMany({
    where: { guildId, userId, dateKey: { in: dateKeys } },
  });

  const progressMap = new Map(progress.map((p) => [p.questId, p]));

  return quests.map((quest) => {
    const dateKey = getDateKeyForFrequency(quest.frequency);
    const prog = progressMap.get(quest.id);
    return {
      ...quest,
      progress: prog ? { current: prog.current, target: prog.target, status: prog.status } : { current: 0, target: quest.target, status: 'IN_PROGRESS' },
      dateKey,
    };
  });
}

export async function incrementQuestProgress(guildId: string, userId: string, type: string, amount = 1): Promise<void> {
  try {
    const quests = await prismaRead.questDefinition.findMany({
      where: { guildId, enabled: true, type: type as any },
    });

    for (const quest of quests) {
      const dateKey = getDateKeyForFrequency(quest.frequency);

      const existing = await prismaRead.questProgress.findUnique({
        where: { guildId_userId_questId_dateKey: { guildId, userId, questId: quest.id, dateKey } },
      });

      if (existing && (existing.status === 'COMPLETED' || existing.status === 'CLAIMED')) continue;

      const newCurrent = Math.min((existing?.current ?? 0) + amount, quest.target);
      const isCompleted = newCurrent >= quest.target;

      await prisma.questProgress.upsert({
        where: { guildId_userId_questId_dateKey: { guildId, userId, questId: quest.id, dateKey } },
        create: {
          guildId, userId, questId: quest.id, dateKey,
          current: newCurrent, target: quest.target,
          status: isCompleted ? 'COMPLETED' : 'IN_PROGRESS',
        },
        update: {
          current: newCurrent,
          status: isCompleted ? 'COMPLETED' : 'IN_PROGRESS',
        },
      });
    }
  } catch (error) {
    logger.error('Quest', `Erreur progression quête type=${type} pour ${userId}:`, error);
  }
}

export async function claimQuestReward(guildId: string, userId: string, questId: string): Promise<{ success: boolean; error?: string; coins?: number; xp?: number }> {
  const dateKey = getDailyKey();
  const weeklyKey = getWeeklyKey();

  const progress = await prismaRead.questProgress.findFirst({
    where: {
      guildId, userId, questId,
      dateKey: { in: [dateKey, weeklyKey] },
      status: 'COMPLETED',
    },
  });

  if (!progress) return { success: false, error: 'Quête non terminée ou déjà réclamée.' };

  const quest = await prismaRead.questDefinition.findUnique({ where: { id: questId } });
  if (!quest) return { success: false, error: 'Quête introuvable.' };

  const updates: any[] = [
    prisma.questProgress.update({
      where: { id: progress.id },
      data: { status: 'CLAIMED', claimedAt: new Date() },
    }),
  ];

  if (quest.rewardCoins > 0) {
    updates.push(
      prisma.rpgProfile.updateMany({
        where: { guildId, userId },
        data: { balance: { increment: quest.rewardCoins } },
      })
    );
  }

  if (quest.rewardXp > 0) {
    updates.push(
      prisma.memberLevel.updateMany({
        where: { guildId_userId: { guildId, userId } },
        data: { xp: { increment: quest.rewardXp } },
      })
    );
  }

  await prisma.$transaction(updates);

  return { success: true, coins: quest.rewardCoins, xp: quest.rewardXp };
}

export async function createQuestDefinition(guildId: string, data: {
  name: string;
  description: string;
  type: string;
  frequency: string;
  target: number;
  rewardCoins: number;
  rewardXp: number;
}) {
  return prisma.questDefinition.create({
    data: {
      guildId,
      name: data.name,
      description: data.description,
      type: data.type as any,
      frequency: data.frequency as any,
      target: data.target,
      rewardCoins: data.rewardCoins,
      rewardXp: data.rewardXp,
    },
  });
}

export async function updateQuestDefinition(questId: string, data: Record<string, any>) {
  const allowedFields = ['name', 'description', 'type', 'frequency', 'target', 'rewardCoins', 'rewardXp', 'enabled'];
  const sanitized: Record<string, any> = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) sanitized[key] = data[key];
  }
  return prisma.questDefinition.update({ where: { id: questId }, data: sanitized });
}

export async function deleteQuestDefinition(questId: string) {
  return prisma.questDefinition.delete({ where: { id: questId } });
}

export async function expireOldProgress(): Promise<void> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);

  await prisma.questProgress.updateMany({
    where: {
      status: { in: ['IN_PROGRESS', 'COMPLETED'] },
      dateKey: { lt: yesterdayKey },
      quest: { frequency: 'DAILY' },
    },
    data: { status: 'EXPIRED' },
  });
}

export async function getQuestsDashboardData(guildId: string) {
  const [definitions, recentClaims, totalClaimed] = await Promise.all([
    prismaRead.questDefinition.findMany({
      where: { guildId },
      orderBy: { frequency: 'asc' },
      include: { _count: { select: { progress: true } } },
    }),
    prismaRead.questProgress.findMany({
      where: { guildId, status: 'CLAIMED' },
      orderBy: { claimedAt: 'desc' },
      take: 30,
      select: { userId: true, questId: true, claimedAt: true },
    }),
    prismaRead.questProgress.count({ where: { guildId, status: 'CLAIMED' } }),
  ]);

  return { definitions, recentClaims, totalClaimed };
}
