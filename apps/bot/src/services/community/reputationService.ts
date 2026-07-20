import prisma, { prismaRead } from '../../utils/db.js';
import { logger } from '../../utils/logger.js';

export const REP_DAILY_VOTE_LIMIT = 3;

export interface ReputationProfile {
  userId: string;
  totalRep: number;
  rank: number;
  votesGivenToday: number;
  canVote: boolean;
}

export interface ReputationLeaderboard {
  entries: Array<{ userId: string; totalRep: number; rank: number }>;
  totalVoters: number;
}

export async function getVotesGivenToday(guildId: string, userId: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  return prismaRead.reputationVote.count({
    where: { guildId, giverId: userId, createdAt: { gte: startOfDay } },
  });
}

export async function giveRep(guildId: string, giverId: string, receiverId: string, reason?: string): Promise<{ success: boolean; error?: string; newTotal?: number }> {
  if (giverId === receiverId) {
    return { success: false, error: 'Vous ne pouvez pas vous donner de la réputation.' };
  }

  const votesToday = await getVotesGivenToday(guildId, giverId);
  if (votesToday >= REP_DAILY_VOTE_LIMIT) {
    return { success: false, error: `Vous avez atteint la limite de ${REP_DAILY_VOTE_LIMIT} votes par jour.` };
  }

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const alreadyVoted = await prismaRead.reputationVote.findFirst({
    where: { guildId, giverId, receiverId, createdAt: { gte: startOfDay } },
  });

  if (alreadyVoted) {
    return { success: false, error: 'Vous avez déjà donné un +rep à cette personne aujourd\'hui.' };
  }

  await prisma.reputationVote.create({
    data: { guildId, giverId, receiverId, value: 1, reason },
  });

  const newTotal = await prismaRead.reputationVote.aggregate({
    where: { guildId, receiverId },
    _sum: { value: true },
  });

  logger.debug('Reputation', `${giverId} → +rep → ${receiverId} (guild: ${guildId})`);

  return { success: true, newTotal: newTotal._sum.value ?? 0 };
}

export async function getReputation(guildId: string, userId: string): Promise<ReputationProfile> {
  const [totalAgg, votesToday, allReps] = await Promise.all([
    prismaRead.reputationVote.aggregate({
      where: { guildId, receiverId: userId },
      _sum: { value: true },
    }),
    getVotesGivenToday(guildId, userId),
    prismaRead.reputationVote.groupBy({
      by: ['receiverId'],
      where: { guildId },
      _sum: { value: true },
      orderBy: { _sum: { value: 'desc' } },
    }),
  ]);

  const totalRep = totalAgg._sum.value ?? 0;
  const rankIndex = allReps.findIndex((r) => r.receiverId === userId);
  const rank = rankIndex >= 0 ? rankIndex + 1 : allReps.length + 1;

  return {
    userId,
    totalRep,
    rank,
    votesGivenToday: votesToday,
    canVote: votesToday < REP_DAILY_VOTE_LIMIT,
  };
}

export async function getReputationLeaderboard(guildId: string, limit = 15): Promise<ReputationLeaderboard> {
  const reps = await prismaRead.reputationVote.groupBy({
    by: ['receiverId'],
    where: { guildId },
    _sum: { value: true },
    orderBy: { _sum: { value: 'desc' } },
    take: limit,
  });

  const totalVoters = await prismaRead.reputationVote.groupBy({
    by: ['giverId'],
    where: { guildId },
  });

  return {
    entries: reps.map((r, i) => ({
      userId: r.receiverId,
      totalRep: r._sum.value ?? 0,
      rank: i + 1,
    })),
    totalVoters: totalVoters.length,
  };
}

export async function getReputationDashboardData(guildId: string) {
  const [leaderboard, recentVotes, totalVotes] = await Promise.all([
    getReputationLeaderboard(guildId, 20),
    prismaRead.reputationVote.findMany({
      where: { guildId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { giverId: true, receiverId: true, reason: true, createdAt: true },
    }),
    prismaRead.reputationVote.count({ where: { guildId } }),
  ]);

  return { leaderboard, recentVotes, totalVotes };
}
