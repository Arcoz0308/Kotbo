import prisma, { prismaRead } from '../../utils/db.js';
import { logger } from '../../utils/logger.js';
import type { Client } from 'discord.js';

function getDateKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export interface PulseData {
  current: {
    score: number;
    activityScore: number;
    moderationScore: number;
    growthScore: number;
    engagementScore: number;
    healthScore: number;
    trend: string;
    trendDelta: number;
    alerts: Array<{ type: string; message: string; severity: string }>;
  };
  history: Array<{
    dateKey: string;
    score: number;
    activityScore: number;
    moderationScore: number;
    growthScore: number;
    engagementScore: number;
    healthScore: number;
  }>;
  metrics: {
    totalMessages: number;
    totalVoiceMinutes: number;
    activeMembers: number;
    totalMembers: number;
    membersJoined: number;
    membersLeft: number;
    sanctionsCount: number;
    ticketsResolved: number;
    ticketsOpen: number;
    channelsHealthy: number;
    channelsUnhealthy: number;
  };
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function computeActivityScore(messages: number, voiceMinutes: number, activeMembers: number, totalMembers: number): number {
  if (totalMembers === 0) return 0;
  const activeRatio = activeMembers / totalMembers;
  const msgPerMember = messages / Math.max(totalMembers, 1);
  const voicePerMember = voiceMinutes / Math.max(totalMembers, 1);

  const ratioScore = Math.min(activeRatio * 200, 100);
  const msgScore = Math.min(msgPerMember * 10, 100);
  const voiceScore = Math.min(voicePerMember * 2, 100);

  return clamp(ratioScore * 0.4 + msgScore * 0.35 + voiceScore * 0.25);
}

function computeModerationScore(sanctionsCount: number, totalMembers: number): number {
  if (totalMembers === 0) return 100;
  const sanctionRate = sanctionsCount / totalMembers;
  if (sanctionRate === 0) return 95;
  if (sanctionRate < 0.01) return 85;
  if (sanctionRate < 0.05) return 65;
  if (sanctionRate < 0.1) return 40;
  return 20;
}

function computeGrowthScore(joined: number, left: number, totalMembers: number): number {
  if (totalMembers === 0) return 50;
  const netGrowth = joined - left;
  const growthRate = netGrowth / totalMembers;

  if (growthRate > 0.05) return 95;
  if (growthRate > 0.02) return 80;
  if (growthRate > 0) return 65;
  if (growthRate > -0.01) return 50;
  if (growthRate > -0.05) return 30;
  return 10;
}

function computeEngagementScore(messages: number, activeMembers: number, totalMembers: number): number {
  if (totalMembers === 0) return 0;
  const participationRate = activeMembers / totalMembers;
  const depth = activeMembers > 0 ? messages / activeMembers : 0;

  const participationScore = Math.min(participationRate * 200, 100);
  const depthScore = Math.min(depth * 5, 100);

  return clamp(participationScore * 0.6 + depthScore * 0.4);
}

function computeHealthScore(healthy: number, unhealthy: number, ticketsOpen: number, ticketsResolved: number): number {
  const totalChannels = healthy + unhealthy;
  const channelHealth = totalChannels > 0 ? (healthy / totalChannels) * 100 : 80;

  const totalTickets = ticketsOpen + ticketsResolved;
  const ticketHealth = totalTickets > 0 ? (ticketsResolved / totalTickets) * 100 : 80;

  return clamp(channelHealth * 0.6 + ticketHealth * 0.4);
}

function generateAlerts(scores: Record<string, number>, metrics: Record<string, number>): Array<{ type: string; message: string; severity: string }> {
  const alerts: Array<{ type: string; message: string; severity: string }> = [];

  if (scores.activityScore < 30) {
    alerts.push({ type: 'activity', message: 'Activité très faible — le serveur est en sommeil.', severity: 'danger' });
  } else if (scores.activityScore < 50) {
    alerts.push({ type: 'activity', message: 'Activité en dessous de la moyenne.', severity: 'warning' });
  }

  if (scores.moderationScore < 40) {
    alerts.push({ type: 'moderation', message: 'Taux de sanctions élevé — vérifiez les conflits en cours.', severity: 'danger' });
  }

  if (scores.growthScore < 30) {
    alerts.push({ type: 'growth', message: 'Le serveur perd des membres — analysez les départs.', severity: 'danger' });
  } else if (scores.growthScore < 50) {
    alerts.push({ type: 'growth', message: 'Croissance stagnante.', severity: 'warning' });
  }

  if (scores.engagementScore < 30) {
    alerts.push({ type: 'engagement', message: 'Faible engagement — peu de membres participent activement.', severity: 'warning' });
  }

  if (metrics.ticketsOpen > 10) {
    alerts.push({ type: 'tickets', message: `${metrics.ticketsOpen} tickets ouverts en attente.`, severity: 'warning' });
  }

  if (scores.healthScore < 40) {
    alerts.push({ type: 'health', message: 'Plusieurs salons en mauvaise santé détectés.', severity: 'warning' });
  }

  if (scores.activityScore > 80 && scores.engagementScore > 80 && scores.growthScore > 60) {
    alerts.push({ type: 'positive', message: 'Excellente dynamique — le serveur est en pleine forme !', severity: 'success' });
  }

  return alerts;
}

export async function computePulseSnapshot(client: Client, guildId: string): Promise<void> {
  try {
    const dateKey = getDateKey();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = getDateKey(yesterday);

    const [dailyStat, ticketsOpen, ticketsResolved, healthAlerts, previousPulse] = await Promise.all([
      prismaRead.guildDailyStat.findUnique({ where: { guildId_dateKey: { guildId, dateKey } } }),
      prismaRead.ticket.count({ where: { guildId, status: 'OPEN' } }),
      prismaRead.ticket.count({
        where: { guildId, status: 'CLOSED', updatedAt: { gte: new Date(Date.now() - 86400000) } },
      }),
      prismaRead.channelHealthAlert.findMany({
        where: { guildId, status: 'PENDING' },
        select: { type: true },
      }),
      prismaRead.pulseSnapshot.findUnique({ where: { guildId_dateKey: { guildId, dateKey: yesterdayKey } } }),
    ]);

    const totalMessages = dailyStat?.messagesCount ?? 0;
    const totalVoiceMinutes = dailyStat?.voiceMinutes ?? 0;
    const activeMembers = dailyStat?.activeMembers ?? 0;
    const totalMembers = dailyStat?.totalMembers ?? 0;
    const membersJoined = dailyStat?.membersJoined ?? 0;
    const membersLeft = dailyStat?.membersLeft ?? 0;
    const sanctionsCount = dailyStat?.sanctionsCount ?? 0;

    const unhealthyAlerts = healthAlerts.filter((a) => ['SPLIT_SUGGESTED', 'ARCHIVE_SUGGESTED', 'MERGE_SUGGESTED'].includes(a.type));
    const channelsUnhealthy = unhealthyAlerts.length;

    const guild = client.guilds.cache.get(guildId);
    const totalTextChannels = guild?.channels.cache.filter((c) => c.isTextBased() && !c.isThread()).size ?? 0;
    const channelsHealthy = Math.max(0, totalTextChannels - channelsUnhealthy);

    const activityScore = computeActivityScore(totalMessages, totalVoiceMinutes, activeMembers, totalMembers);
    const moderationScore = computeModerationScore(sanctionsCount, totalMembers);
    const growthScore = computeGrowthScore(membersJoined, membersLeft, totalMembers);
    const engagementScore = computeEngagementScore(totalMessages, activeMembers, totalMembers);
    const healthScore = computeHealthScore(channelsHealthy, channelsUnhealthy, ticketsOpen, ticketsResolved);

    const score = clamp(
      activityScore * 0.25 +
      moderationScore * 0.15 +
      growthScore * 0.2 +
      engagementScore * 0.25 +
      healthScore * 0.15
    );

    const previousScore = previousPulse?.score ?? score;
    const trendDelta = score - previousScore;
    const trend = trendDelta > 3 ? 'UP' : trendDelta < -3 ? 'DOWN' : 'STABLE';

    const scores = { activityScore, moderationScore, growthScore, engagementScore, healthScore };
    const metrics = { ticketsOpen, ticketsResolved, channelsHealthy, channelsUnhealthy };
    const alerts = generateAlerts(scores, metrics);

    await prisma.pulseSnapshot.upsert({
      where: { guildId_dateKey: { guildId, dateKey } },
      create: {
        guildId, dateKey, score,
        activityScore, moderationScore, growthScore, engagementScore, healthScore,
        totalMessages, totalVoiceMinutes, activeMembers, totalMembers,
        membersJoined, membersLeft, sanctionsCount,
        ticketsResolved, ticketsOpen, channelsHealthy, channelsUnhealthy,
        trend, trendDelta, alerts: alerts as any,
      },
      update: {
        score, activityScore, moderationScore, growthScore, engagementScore, healthScore,
        totalMessages, totalVoiceMinutes, activeMembers, totalMembers,
        membersJoined, membersLeft, sanctionsCount,
        ticketsResolved, ticketsOpen, channelsHealthy, channelsUnhealthy,
        trend, trendDelta, alerts: alerts as any,
      },
    });

    logger.debug('Pulse', `Snapshot sauvegardé pour ${guildId}: score=${score}`);
  } catch (error) {
    logger.error('Pulse', `Erreur lors du calcul du pulse pour ${guildId}:`, error);
  }
}

export async function getPulseDashboardData(guildId: string): Promise<PulseData> {
  const dateKey = getDateKey();

  const [current, history] = await Promise.all([
    prismaRead.pulseSnapshot.findUnique({ where: { guildId_dateKey: { guildId, dateKey } } }),
    prismaRead.pulseSnapshot.findMany({
      where: { guildId },
      orderBy: { dateKey: 'desc' },
      take: 30,
    }),
  ]);

  const snapshot = current ?? history[0];

  return {
    current: {
      score: snapshot?.score ?? 50,
      activityScore: snapshot?.activityScore ?? 50,
      moderationScore: snapshot?.moderationScore ?? 50,
      growthScore: snapshot?.growthScore ?? 50,
      engagementScore: snapshot?.engagementScore ?? 50,
      healthScore: snapshot?.healthScore ?? 50,
      trend: snapshot?.trend ?? 'STABLE',
      trendDelta: snapshot?.trendDelta ?? 0,
      alerts: (snapshot?.alerts as any[]) ?? [],
    },
    history: history.reverse().map((s) => ({
      dateKey: s.dateKey,
      score: s.score,
      activityScore: s.activityScore,
      moderationScore: s.moderationScore,
      growthScore: s.growthScore,
      engagementScore: s.engagementScore,
      healthScore: s.healthScore,
    })),
    metrics: {
      totalMessages: snapshot?.totalMessages ?? 0,
      totalVoiceMinutes: snapshot?.totalVoiceMinutes ?? 0,
      activeMembers: snapshot?.activeMembers ?? 0,
      totalMembers: snapshot?.totalMembers ?? 0,
      membersJoined: snapshot?.membersJoined ?? 0,
      membersLeft: snapshot?.membersLeft ?? 0,
      sanctionsCount: snapshot?.sanctionsCount ?? 0,
      ticketsResolved: snapshot?.ticketsResolved ?? 0,
      ticketsOpen: snapshot?.ticketsOpen ?? 0,
      channelsHealthy: snapshot?.channelsHealthy ?? 0,
      channelsUnhealthy: snapshot?.channelsUnhealthy ?? 0,
    },
  };
}

export async function runPulseForAllGuilds(client: Client): Promise<void> {
  const guilds = await prismaRead.guild.findMany({ select: { id: true } });

  for (const guild of guilds) {
    try {
      await computePulseSnapshot(client, guild.id);
    } catch (error) {
      logger.error('Pulse', `Erreur pulse pour guild ${guild.id}:`, error);
    }
  }
}
