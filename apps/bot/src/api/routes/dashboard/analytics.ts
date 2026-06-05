import { IncomingMessage, ServerResponse } from 'node:http';
import { Client, Routes } from 'discord.js';
import prisma from '../../../utils/db.js';
import { logger } from '../../../utils/logger.js';
import { COMMAND_CATALOG } from '../../../utils/commandAccess.js';
import {
  json,
  getGuildName,
  getGuildMembers,
  type AuthClaims,
  type DashboardAccess,
} from '../../shared.js';
import {
  getHourlyHeatmapData,
  getWeekOverWeekComparison,
  getGrowthAndRetention,
  getDailyAlgoAnalytics,
  getGlobalInteractions,
  getDashboardAnalytics,
} from '../../../services/analytics/dashboardAnalyticsService.js';

export async function handleAnalyticsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  parts: string[],
  url: URL,
  client: Client,
  user: AuthClaims,
  guildId: string,
  access: DashboardAccess
): Promise<boolean> {
  const method = req.method;

  if (parts[4] !== 'analytics') {
    return false;
  }

  if (method !== 'GET') {
    return false;
  }

  // GET /api/dashboard/guilds/:guildId/analytics/members/:userId - Member detailed analytics
  if (parts.length === 6 && parts[5] === 'members') {
    const userId = url.searchParams.get('userId');
    if (!userId) {
      json(res, 400, { error: 'userId requis' });
      return true;
    }
    try {
      const periodDays = Math.min(90, Math.max(7, parseInt(url.searchParams.get('period') || '30', 10)));
      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - periodDays);
      const startDateKey = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;

      const dailyStats = await prisma.memberDailyStat.findMany({
        where: { guildId, userId, dateKey: { gte: startDateKey } },
        orderBy: { dateKey: 'asc' },
      });

      const totalMessages = dailyStats.reduce((s, d) => s + d.messagesCount, 0);
      const totalVoice = dailyStats.reduce((s, d) => s + d.voiceMinutes, 0);
      const activeDays = dailyStats.length;

      json(res, 200, {
        userId,
        period: periodDays,
        totalMessages,
        totalVoiceMinutes: totalVoice,
        activeDays,
        dailyTrend: dailyStats.map(d => ({
          dateKey: d.dateKey,
          messages: d.messagesCount,
          voiceMinutes: d.voiceMinutes,
        })),
      });
    } catch (err) {
      logger.error('AnalyticsAPI', 'Error computing member analytics:', err);
      json(res, 500, { error: 'Erreur analytics membre' });
    }
    return true;
  }

  // GET /api/dashboard/guilds/:guildId/analytics/correlation - Messages vs Voice correlation
  if (parts.length === 6 && parts[5] === 'correlation') {
    try {
      const periodDays = parseInt(url.searchParams.get('period') || '30', 10);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - periodDays);
      const startDateKey = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;

      const memberStats = await prisma.memberDailyStat.groupBy({
        by: ['userId'],
        where: { guildId, dateKey: { gte: startDateKey } },
        _sum: { messagesCount: true, voiceMinutes: true },
      });

      const scatterData = memberStats
        .filter(m => (m._sum.messagesCount ?? 0) > 0 || (m._sum.voiceMinutes ?? 0) > 0)
        .map(m => ({
          userId: m.userId,
          messages: m._sum.messagesCount ?? 0,
          voice: m._sum.voiceMinutes ?? 0,
        }));

      json(res, 200, { data: scatterData });
    } catch (err) {
      logger.error('AnalyticsAPI', 'Error computing correlation:', err);
      json(res, 500, { error: 'Erreur analytics correlation' });
    }
    return true;
  }

  // GET /api/dashboard/guilds/:guildId/analytics/invites - Active invitation codes
  if (parts.length === 6 && parts[5] === 'invites') {
    try {
      const discordGuild = client.guilds.cache.get(guildId);
      if (!discordGuild) {
        json(res, 404, { error: 'Serveur Discord introuvable' });
        return true;
      }

      const activeInvites = await discordGuild.invites.fetch().catch(() => new Map());
      const invitesArray = [...activeInvites.values()];

      const periodDays = parseInt(url.searchParams.get('days') || url.searchParams.get('period') || '30', 10);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - periodDays + 1);

      const memberJoins = await prisma.memberInvite.findMany({
        where: {
          guildId,
          joinedAt: { gte: startDate },
          inviteCode: { not: null }
        },
        select: { inviteCode: true, joinedAt: true }
      });

      const labels: string[] = [];
      for (let i = 0; i < periodDays; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        labels.push(key);
      }

      const joinMap = new Map<string, Map<string, number>>();
      for (const j of memberJoins) {
        const code = j.inviteCode ?? 'unknown';
        const d = new Date(j.joinedAt as any);
        const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (!joinMap.has(code)) joinMap.set(code, new Map());
        const dm = joinMap.get(code)!;
        dm.set(dateKey, (dm.get(dateKey) ?? 0) + 1);
      }

      const formattedInvites: any[] = [];
      for (const inv of invitesArray) {
        const inviterId = inv.inviter?.id ?? null;
        let createdBy = inv.inviter?.tag || 'Inconnu';
        if (inviterId) {
          const member = discordGuild.members.cache.get(inviterId) ?? await discordGuild.members.fetch(inviterId).catch(() => null);
          if (member) createdBy = member.displayName || member.user?.tag || createdBy;
        }

        const code = inv.code ?? 'unknown';
        const dm = joinMap.get(code) ?? new Map();
        const counts = labels.map(l => dm.get(l) ?? 0);
        const totalJoined = counts.reduce((s, v) => s + v, 0);

        formattedInvites.push({
          code: inv.code,
          inviterId,
          inviterTag: inv.inviter?.tag || 'Inconnu',
          inviterAvatarUrl: inv.inviter?.displayAvatarURL ? inv.inviter.displayAvatarURL({ size: 64 }) : null,
          createdBy,
          uses: inv.uses || 0,
          maxUses: inv.maxUses,
          expiresAt: inv.expiresAt ? inv.expiresAt.toISOString() : null,
          createdAt: inv.createdAt ? inv.createdAt.toISOString() : null,
          trend: {
            labels,
            counts,
            totalJoined,
          }
        });
      }

      for (const [code, dm] of joinMap.entries()) {
        if (formattedInvites.find(f => f.code === code)) continue;
        const counts = labels.map(l => dm.get(l) ?? 0);
        const totalJoined = counts.reduce((s, v) => s + v, 0);
        formattedInvites.push({
          code,
          inviterId: null,
          inviterTag: 'Inconnu',
          inviterAvatarUrl: null,
          createdBy: 'Inconnu',
          uses: 0,
          maxUses: null,
          expiresAt: null,
          createdAt: null,
          trend: { labels, counts, totalJoined }
        });
      }

      formattedInvites.sort((a, b) => (b.uses || 0) - (a.uses || 0));
      json(res, 200, formattedInvites);
    } catch (err) {
      logger.error('AnalyticsAPI', 'Error computing invites analytics:', err);
      json(res, 500, { error: 'Erreur analytics invites' });
    }
    return true;
  }

  // GET /api/dashboard/guilds/:guildId/analytics/heatmap - Hourly activity heatmap
  if (parts.length === 6 && parts[5] === 'heatmap') {
    try {
      const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get('days') || '30', 10)));
      const startDate = url.searchParams.get('startDate');
      const endDate = url.searchParams.get('endDate');
      const heatmapData = await getHourlyHeatmapData(guildId, { days, startDate, endDate });
      json(res, 200, heatmapData);
    } catch (err) {
      logger.error('AnalyticsAPI', 'Error computing heatmap:', err);
      json(res, 500, { error: 'Erreur heatmap analytics' });
    }
    return true;
  }

  // GET /api/dashboard/guilds/:guildId/analytics/weekly-comparison - Week over week comparison
  if (parts.length === 6 && parts[5] === 'weekly-comparison') {
    try {
      const offset = Math.min(12, Math.max(1, parseInt(url.searchParams.get('offset') || '1', 10)));
      const rawMode = url.searchParams.get('mode') || 'week';
      const mode = (rawMode === 'month' ? 'month' : 'week') as 'week' | 'month';
      const comparisonData = await getWeekOverWeekComparison(guildId, { offset, mode });
      json(res, 200, comparisonData);
    } catch (err) {
      logger.error('AnalyticsAPI', 'Error computing weekly comparison:', err);
      json(res, 500, { error: 'Erreur comparaison semaine/semaine' });
    }
    return true;
  }

  // GET /api/dashboard/guilds/:guildId/analytics/growth-retention - Growth and retention metrics
  if (parts.length === 6 && parts[5] === 'growth-retention') {
    try {
      const days = Math.min(365, Math.max(7, parseInt(url.searchParams.get('days') || '90', 10)));
      const startDate = url.searchParams.get('startDate');
      const endDate = url.searchParams.get('endDate');
      const growthData = await getGrowthAndRetention(guildId, { days, startDate, endDate });
      json(res, 200, growthData);
    } catch (err) {
      logger.error('AnalyticsAPI', 'Error computing growth/retention:', err);
      json(res, 500, { error: 'Erreur growth/retention analytics' });
    }
    return true;
  }

  // GET /api/dashboard/guilds/:guildId/analytics/daily-algo - Daily Algo analytics
  if (parts.length === 6 && parts[5] === 'daily-algo') {
    try {
      const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get('days') || '30', 10)));
      const startDate = url.searchParams.get('startDate');
      const endDate = url.searchParams.get('endDate');
      const algoData = await getDailyAlgoAnalytics(guildId, { days, startDate, endDate });
      json(res, 200, algoData);
    } catch (err) {
      logger.error('AnalyticsAPI', 'Error computing daily algo analytics:', err);
      json(res, 500, { error: 'Erreur daily algo analytics' });
    }
    return true;
  }

  // GET /api/dashboard/guilds/:guildId/analytics/interactions
  if (parts.length === 6 && parts[5] === 'interactions') {
    try {
      const days = parseInt(url.searchParams.get('period') || '30', 10);
      const startDate = url.searchParams.get('startDate') || undefined;
      const endDate = url.searchParams.get('endDate') || undefined;
      const data = await getGlobalInteractions(guildId, { days, startDate, endDate });
      json(res, 200, data);
    } catch (err) {
      logger.error('AnalyticsAPI', 'Error getting global interactions:', err);
      json(res, 500, { error: 'Erreur récupération interactions' });
    }
    return true;
  }

  // GET /api/dashboard/guilds/:guildId/analytics - Full analytics data
  if (parts.length === 5) {
    try {
      const periodDays = Math.min(90, Math.max(1, parseInt(url.searchParams.get('period') || '30', 10)));
      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - periodDays);
      const startDateKey = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;

      let dailyStats: any[] = [];
      const granularity = url.searchParams.get('granularity');
      const use30Min = periodDays === 1 || granularity === '30';

      if (use30Min) {
        const hourlyStats = await prisma.guildHourlyStat.findMany({
          where: { guildId },
          orderBy: [
            { dateKey: 'desc' },
            { hour: 'desc' }
          ],
          take: 24
        });
        hourlyStats.reverse();
        
        for (const h of hourlyStats) {
          const hourStr = String(h.hour).padStart(2, '0');
          
          dailyStats.push({
            dateKey: `${h.dateKey} ${hourStr}h00`,
            messagesCount: Math.round(h.messagesCount / 2),
            voiceMinutes: Math.round(h.voiceMinutes / 2),
            voiceSessionsCount: 0,
            membersJoined: Math.round(h.joinsCount / 2),
            membersLeft: Math.round(h.leavesCount / 2),
            totalMembers: 0,
            onlineMembers: h.onlineMembers,
            peakOnline: h.onlineMembers,
            peakVoice: h.voiceMembers,
            sanctionsCount: 0,
          });
          
          dailyStats.push({
            dateKey: `${h.dateKey} ${hourStr}h30`,
            messagesCount: Math.floor(h.messagesCount / 2),
            voiceMinutes: Math.floor(h.voiceMinutes / 2),
            voiceSessionsCount: 0,
            membersJoined: Math.floor(h.joinsCount / 2),
            membersLeft: Math.floor(h.leavesCount / 2),
            totalMembers: 0,
            onlineMembers: h.onlineMembers,
            peakOnline: h.onlineMembers,
            peakVoice: h.voiceMembers,
            sanctionsCount: 0,
          });
        }
      } else {
        dailyStats = await prisma.guildDailyStat.findMany({
          where: { guildId, dateKey: { gte: startDateKey } },
          orderBy: { dateKey: 'asc' },
        });
      }

      const channelStats = await prisma.channelDailyStat.groupBy({
        by: ['channelId'],
        where: { guildId, dateKey: { gte: startDateKey } },
        _sum: { messagesCount: true },
        orderBy: { _sum: { messagesCount: 'desc' } },
        take: 15,
      });

      const discordGuild = client.guilds.cache.get(guildId);
      const topChannels = channelStats.map(ch => {
        const discordChannel = discordGuild?.channels.cache.get(ch.channelId);
        return {
          channelId: ch.channelId,
          channelName: discordChannel?.name ?? `canal-${ch.channelId.slice(-4)}`,
          messagesCount: ch._sum.messagesCount ?? 0,
        };
      });

      const topMessageMembers = await prisma.memberProfile.findMany({
        where: { guildId, isBot: false, messageCount: { gt: 0 } },
        orderBy: { messageCount: 'desc' },
        take: 15,
        select: {
          userId: true, displayName: true, username: true, globalName: true,
          avatarUrl: true, messageCount: true, lastMessageAt: true,
        },
      });

      const topVoiceMembers = await prisma.memberProfile.findMany({
        where: { guildId, isBot: false, voiceTimeSeconds: { gt: 0 } },
        orderBy: { voiceTimeSeconds: 'desc' },
        take: 15,
        select: {
          userId: true, displayName: true, username: true, globalName: true,
          avatarUrl: true, voiceTimeSeconds: true, voiceSessionCount: true,
        },
      });

      const totalMembers = discordGuild?.memberCount ?? 0;
      const onlineNow = discordGuild?.members.cache.filter(m => m.presence?.status === 'online').size ?? 0;
      const idleNow = discordGuild?.members.cache.filter(m => m.presence?.status === 'idle').size ?? 0;
      const dndNow = discordGuild?.members.cache.filter(m => m.presence?.status === 'dnd').size ?? 0;
      const voiceNow = discordGuild?.members.cache.filter(m => !!m.voice?.channelId).size ?? 0;
      const botsCount = discordGuild?.members.cache.filter(m => m.user.bot).size ?? 0;

      const sanctions = await prisma.sanction.findMany({
        where: { guildId, createdAt: { gte: startDate } },
        select: { type: true, status: true, moderatorUserId: true, moderatorTag: true, targetUserId: true, targetTag: true, createdAt: true },
      });

      const sanctionsByType = {
        WARN: sanctions.filter(s => s.type === 'WARN').length,
        KICK: sanctions.filter(s => s.type === 'KICK').length,
        TIMEOUT: sanctions.filter(s => s.type === 'TIMEOUT').length,
        TEMP_BAN: sanctions.filter(s => s.type === 'TEMP_BAN').length,
        BAN: sanctions.filter(s => s.type === 'BAN').length,
      };

      const modCounts = new Map<string, { count: number; tag: string }>();
      for (const s of sanctions) {
        const existing = modCounts.get(s.moderatorUserId) ?? { count: 0, tag: s.moderatorTag ?? 'Inconnu' };
        existing.count++;
        modCounts.set(s.moderatorUserId, existing);
      }
      const topModerators = await Promise.all(
        [...modCounts.entries()]
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 10)
          .map(async ([userId, data]) => {
            const profile = await prisma.memberProfile.findUnique({
              where: { guildId_userId: { guildId, userId } },
              select: { avatarUrl: true },
            });
            return { userId, moderatorTag: data.tag, count: data.count, avatarUrl: profile?.avatarUrl };
          })
      );

      const targetCounts = new Map<string, { count: number; tag: string }>();
      for (const s of sanctions) {
        const existing = targetCounts.get(s.targetUserId) ?? { count: 0, tag: s.targetTag ?? 'Inconnu' };
        existing.count++;
        targetCounts.set(s.targetUserId, existing);
      }
      const mostSanctioned = await Promise.all(
        [...targetCounts.entries()]
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 10)
          .map(async ([userId, data]) => {
            const profile = await prisma.memberProfile.findUnique({
              where: { guildId_userId: { guildId, userId } },
              select: { avatarUrl: true },
            });
            return { userId, tag: data.tag, count: data.count, avatarUrl: profile?.avatarUrl };
          })
      );

      const activeSanctions = await prisma.sanction.count({ where: { guildId, status: 'ACTIVE' } });

      const staffActivities = await prisma.staffActivity.findMany({
        where: { guildId, activityDate: { gte: startDate } },
        include: { staffMember: { select: { userId: true, displayName: true, username: true, avatarUrl: true, grade: true } } },
      });

      const staffAgg = new Map<string, { messages: number; voiceMinutes: number; name: string; grade: string; avatarUrl: string | null }>();
      for (const a of staffActivities) {
        const key = a.staffUserId;
        const existing = staffAgg.get(key) ?? { messages: 0, voiceMinutes: 0, name: a.staffMember.displayName ?? a.staffMember.username ?? 'Inconnu', grade: a.staffMember.grade, avatarUrl: a.staffMember.avatarUrl };
        existing.messages += a.messageCount;
        existing.voiceMinutes += a.voiceMinutes;
        staffAgg.set(key, existing);
      }
      const staffLeaderboard = [...staffAgg.entries()]
        .map(([id, data]) => ({ staffId: id, ...data, score: data.messages + data.voiceMinutes * 2 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 15);

      const activeAbsences = await prisma.staffAbsence.count({ where: { guildId, status: { in: ['PENDING', 'APPROVED', 'ACKNOWLEDGED'] } } });
      const totalStaff = await prisma.staffMember.count({ where: { guildId } });

      const meetings = await prisma.staffMeeting.findMany({
        where: { guildId, scheduledAt: { gte: startDate } },
        include: { _count: { select: { presences: true } }, presences: { where: { status: 'PRESENT' }, select: { id: true } } },
      });
      const avgMeetingAttendance = meetings.length > 0
        ? Math.round(meetings.reduce((sum, m) => sum + m.presences.length, 0) / meetings.length * 10) / 10
        : 0;

      const candidatures = await prisma.recruitmentCandidature.groupBy({
        by: ['status'],
        where: { guildId },
        _count: true,
      });
      const recruitmentPipeline = candidatures.map(c => ({ status: c.status, count: c._count }));

      const algoRuns = await prisma.dailyAlgoRun.findMany({
        where: { guildId, createdAt: { gte: startDate } },
        include: { _count: { select: { submissions: true } } },
      });
      const algoAvgParticipation = algoRuns.length > 0
        ? Math.round(algoRuns.reduce((sum, r) => sum + r._count.submissions, 0) / algoRuns.length * 10) / 10
        : 0;

      const DBInvites = await prisma.memberInvite.groupBy({
        by: ['inviterId'],
        where: { guildId, inviterId: { not: null }, joinedAt: { gte: startDate } },
        _count: true,
        orderBy: { _count: { inviterId: 'desc' } },
        take: 10,
      });
      const topInviters = await Promise.all(DBInvites.map(async inv => {
        const invProfile = inv.inviterId ? await prisma.memberProfile.findUnique({
          where: { guildId_userId: { guildId, userId: inv.inviterId } },
          select: { displayName: true, username: true },
        }) : null;
        return {
          inviterId: inv.inviterId,
          tag: invProfile?.displayName ?? invProfile?.username ?? 'Inconnu',
          count: inv._count,
        };
      }));

      const memberProfiles = await prisma.memberProfile.findMany({
        where: { guildId, isBot: false, guildLeftAt: null },
        select: { rolesSnapshot: true },
      });
      const roleCounts = new Map<string, number>();
      for (const mp of memberProfiles) {
        for (const roleId of mp.rolesSnapshot) {
          roleCounts.set(roleId, (roleCounts.get(roleId) ?? 0) + 1);
        }
      }
      const roleDistribution = [...roleCounts.entries()]
        .map(([roleId, count]) => {
          const discordRole = discordGuild?.roles.cache.get(roleId);
          return {
            roleId,
            roleName: discordRole?.name ?? `Rôle ${roleId.slice(-4)}`,
            color: discordRole?.hexColor ?? '#99AAB5',
            count,
          };
        })
        .filter(r => r.roleName !== '@everyone')
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const inactiveMembers = await prisma.memberProfile.count({
        where: {
          guildId,
          isBot: false,
          guildLeftAt: null,
          OR: [
            { lastMessageAt: null },
            { lastMessageAt: { lt: thirtyDaysAgo } },
          ],
        },
      });

      const memberWithJoinDates = await prisma.memberProfile.findMany({
        where: { guildId, isBot: false, guildLeftAt: null, guildJoinedAt: { not: null } },
        select: { guildJoinedAt: true },
      });
      const avgTenureDays = memberWithJoinDates.length > 0
        ? Math.round(memberWithJoinDates.reduce((sum, m) => {
            return sum + (now.getTime() - (m.guildJoinedAt?.getTime() ?? now.getTime())) / 86400000;
          }, 0) / memberWithJoinDates.length)
        : 0;

      const recentSanctionsList = await prisma.sanction.findMany({
        where: { guildId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      const recentSanctions = await Promise.all(recentSanctionsList.map(async s => {
        const [targetProfile, modProfile] = await Promise.all([
          prisma.memberProfile.findUnique({
            where: { guildId_userId: { guildId, userId: s.targetUserId } },
            select: { avatarUrl: true }
          }),
          prisma.memberProfile.findUnique({
            where: { guildId_userId: { guildId, userId: s.moderatorUserId } },
            select: { avatarUrl: true }
          })
        ]);
        return {
          id: s.id,
          type: s.type,
          targetUserId: s.targetUserId,
          targetTag: s.targetTag ?? 'Inconnu',
          targetAvatarUrl: targetProfile?.avatarUrl,
          moderatorUserId: s.moderatorUserId,
          moderatorTag: s.moderatorTag ?? 'Inconnu',
          moderatorAvatarUrl: modProfile?.avatarUrl,
          reason: s.reason,
          createdAt: s.createdAt.toISOString(),
        };
      }));

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const joinedInRange = await prisma.memberProfile.count({
        where: {
          guildId,
          isBot: false,
          guildJoinedAt: { gte: startDate, lte: sevenDaysAgo }
        }
      });
      const stayedInRange = await prisma.memberProfile.count({
        where: {
          guildId,
          isBot: false,
          guildJoinedAt: { gte: startDate, lte: sevenDaysAgo },
          guildLeftAt: null
        }
      });
      const retentionRate = joinedInRange > 0 ? Math.round((stayedInRange / joinedInRange) * 100) : 0;

      // Fetch member join/leave timestamps for each day in the daily trend
      const dailyJoinsLeaves = await Promise.all(
        dailyStats.map(async (d) => {
          const datePart = d.dateKey.split(' ')[0];
          const dayStart = new Date(datePart + 'T00:00:00.000Z');
          const dayEnd = new Date(datePart + 'T23:59:59.999Z');
          
          const [joins, leaves, inviteJoins] = await Promise.all([
            prisma.memberProfile.findMany({
              where: {
                guildId,
                isBot: false,
                guildJoinedAt: { gte: dayStart, lte: dayEnd }
              },
              select: {
                userId: true,
                displayName: true,
                username: true,
                globalName: true,
                avatarUrl: true,
                guildJoinedAt: true
              },
              take: 50
            }),
            prisma.memberProfile.findMany({
              where: {
                guildId,
                isBot: false,
                guildLeftAt: { gte: dayStart, lte: dayEnd }
              },
              select: {
                userId: true,
                displayName: true,
                username: true,
                globalName: true,
                avatarUrl: true,
                guildLeftAt: true
              },
              take: 50
            }),
            prisma.memberInvite.findMany({
              where: {
                guildId,
                joinedAt: { gte: dayStart, lte: dayEnd }
              },
              select: {
                userId: true,
                inviteCode: true,
                inviterId: true,
                inviterTag: true,
                joinedAt: true,
                leftAt: true
              },
              take: 50
            })
          ]);
          
          return {
            dateKey: d.dateKey,
            joins: joins.map(j => ({
              userId: j.userId,
              name: j.displayName ?? j.globalName ?? j.username ?? 'Inconnu',
              avatarUrl: j.avatarUrl,
              joinedAt: j.guildJoinedAt?.toISOString()
            })),
            leaves: leaves.map(l => ({
              userId: l.userId,
              name: l.displayName ?? l.globalName ?? l.username ?? 'Inconnu',
              avatarUrl: l.avatarUrl,
              leftAt: l.guildLeftAt?.toISOString()
            })),
            invites: inviteJoins.map(i => ({
              userId: i.userId,
              inviteCode: i.inviteCode,
              inviterId: i.inviterId,
              inviterTag: i.inviterTag,
              joinedAt: i.joinedAt?.toISOString(),
              leftAt: i.leftAt?.toISOString()
            }))
          };
        })
      );

      const totalMessages = dailyStats.reduce((sum, d) => sum + d.messagesCount, 0);
      const totalVoiceMinutes = dailyStats.reduce((sum, d) => sum + d.voiceMinutes, 0);
      const totalJoins = dailyStats.reduce((sum, d) => sum + d.membersJoined, 0);
      const totalLeaves = dailyStats.reduce((sum, d) => sum + d.membersLeft, 0);

      const halfPeriod = Math.floor(periodDays / 2);
      const midDate = new Date(now);
      midDate.setDate(midDate.getDate() - halfPeriod);
      const midDateKey = `${midDate.getFullYear()}-${String(midDate.getMonth() + 1).padStart(2, '0')}-${String(midDate.getDate()).padStart(2, '0')}`;
      const recentStats = dailyStats.filter(d => d.dateKey >= midDateKey);
      const olderStats = dailyStats.filter(d => d.dateKey < midDateKey);
      const recentMessages = recentStats.reduce((s, d) => s + d.messagesCount, 0);
      const olderMessages = olderStats.reduce((s, d) => s + d.messagesCount, 0);
      const messagesTrend = olderMessages > 0 ? Math.round((recentMessages - olderMessages) / olderMessages * 100) : 0;

      let clanTag: string | null = null;
      let clanTaggedMembersCount = 0;
      let taggedMembersList: any[] = [];
      if (discordGuild) {
        try {
          const rawGuild = await client.rest.get(Routes.guild(guildId)) as any;
          if (rawGuild.clan && rawGuild.clan.tag) {
            clanTag = rawGuild.clan.tag;
          }
        } catch (err) {
          logger.debug('AnalyticsAPI', 'Error fetching raw guild clan info (non-critical): ' + String(err));
        }

        if (!clanTag) {
          clanTag = (discordGuild as any).clan?.tag || (discordGuild as any).clanTag;
        }

        try {
          const allMembers = await getGuildMembers(discordGuild);
          
          if (!clanTag) {
            for (const [_, m] of allMembers) {
              const primaryGuild = (m.user as any).primaryGuild;
              if (primaryGuild && primaryGuild.identityGuildId === guildId && primaryGuild.tag) {
                clanTag = primaryGuild.tag;
                break;
              }
            }
          }

          if (clanTag) {
            const tagLower = clanTag.toLowerCase();
            const taggedMembers = allMembers.filter(m => {
              const hasNativeTag = (m.user as any).clan?.tag === clanTag || 
                                   (m.user as any).primaryGuild?.tag === clanTag;
              
              const hasNicknameTag = m.nickname?.toLowerCase().includes(`[${tagLower}]`) || 
                                     m.nickname?.toLowerCase().includes(`(${tagLower})`) ||
                                     m.nickname?.toLowerCase().startsWith(`${tagLower} `) ||
                                     m.nickname?.toLowerCase().startsWith(`${tagLower} |`) ||
                                     m.user.username.toLowerCase().includes(`[${tagLower}]`) || 
                                     m.user.username.toLowerCase().includes(`(${tagLower})`) ||
                                     m.user.displayName?.toLowerCase().includes(`[${tagLower}]`) || 
                                     m.user.displayName?.toLowerCase().includes(`(${tagLower})`);
                                     
              return hasNativeTag || hasNicknameTag;
            });

            clanTaggedMembersCount = taggedMembers.size;
            taggedMembersList = Array.from(taggedMembers.values());
          }
        } catch (fetchErr) {
          logger.error('AnalyticsAPI', 'Error fetching guild members for tag analytics:', fetchErr);
        }
      }

      const analyticsPayload = {
        period: periodDays,
        clanTag,
        clanTaggedMembersCount,
        live: {
          totalMembers,
          onlineMembers: onlineNow,
          idleMembers: idleNow,
          dndMembers: dndNow,
          offlineMembers: totalMembers - onlineNow - idleNow - dndNow - botsCount,
          voiceConnected: voiceNow,
          botsCount,
          humansCount: totalMembers - botsCount,
        },
        totals: {
          messages: totalMessages,
          voiceMinutes: totalVoiceMinutes,
          joins: totalJoins,
          leaves: totalLeaves,
          netGrowth: totalJoins - totalLeaves,
          activeDays: dailyStats.length,
          sanctions: sanctions.length,
          warns: sanctionsByType.WARN,
          kicks: sanctionsByType.KICK,
          bans: sanctionsByType.BAN + sanctionsByType.TEMP_BAN,
          timeouts: sanctionsByType.TIMEOUT,
          retentionRate,
          activeAbsences,
          totalStaff,
          inactiveMembers,
          avgTenureDays,
          algoAvgParticipation,
          avgMeetingAttendance,
          messagesTrend,
        },
        summary: {
          totalMessages,
          totalVoiceMinutes,
          totalJoins,
          totalLeaves,
          messagesTrend,
        },
        dailyTrend: dailyStats.map(d => {
          const datePart = d.dateKey.split(' ')[0];
          const trendDate = new Date(datePart + 'T23:59:59.999Z');
          const count = clanTag 
            ? taggedMembersList.filter(m => m.joinedAt && m.joinedAt <= trendDate).length 
            : 0;
          const dayData = dailyJoinsLeaves.find(jl => jl.dateKey === d.dateKey);
          return {
            dateKey: d.dateKey,
            messages: d.messagesCount,
            voiceMinutes: d.voiceMinutes,
            voiceSessions: d.voiceSessionsCount,
            membersJoined: d.membersJoined,
            membersLeft: d.membersLeft,
            totalMembers: d.totalMembers,
            onlineMembers: d.onlineMembers,
            peakOnline: d.peakOnline,
            peakVoice: d.peakVoice,
            sanctions: d.sanctionsCount,
            taggedMembersCount: count,
            memberJoins: dayData?.joins || [],
            memberLeaves: dayData?.leaves || [],
            invites: dayData?.invites || [],
          };
        }),
        topChannels,
        topMessageMembers: topMessageMembers.map(m => ({
          userId: m.userId,
          name: m.displayName ?? m.globalName ?? m.username ?? 'Inconnu',
          avatarUrl: m.avatarUrl,
          messageCount: m.messageCount,
          lastMessageAt: m.lastMessageAt?.toISOString() ?? null,
        })),
        topVoiceMembers: topVoiceMembers.map(m => ({
          userId: m.userId,
          name: m.displayName ?? m.globalName ?? m.username ?? 'Inconnu',
          avatarUrl: m.avatarUrl,
          voiceTimeSeconds: m.voiceTimeSeconds,
          voiceSessionCount: m.voiceSessionCount,
        })),
        topInviters,
        topModerators,
        topSanctionedMembers: mostSanctioned.map(s => ({
          userId: s.userId,
          targetUserId: s.userId,
          targetTag: s.tag,
          count: s.count,
        })),
        recentSanctions,
        moderation: {
          totals: {
            warns: sanctionsByType.WARN,
            kicks: sanctionsByType.KICK,
            bans: sanctionsByType.BAN + sanctionsByType.TEMP_BAN,
            timeouts: sanctionsByType.TIMEOUT,
          },
          topModerators: topModerators,
          topSanctionedMembers: mostSanctioned.map(s => ({
            userId: s.userId,
            targetUserId: s.userId,
            targetTag: s.tag,
            count: s.count,
            avatarUrl: s.avatarUrl,
          })),
          recentSanctions,
          activeSanctions,
        },
        staff: {
          leaderboard: staffLeaderboard,
          activeAbsences,
          totalStaff,
          meetings: meetings.length,
          avgMeetingAttendance,
        },
        recruitmentPipeline,
        roleDistribution,
        recentJoins: await prisma.memberProfile.findMany({
          where: { guildId, guildJoinedAt: { not: null } },
          orderBy: { guildJoinedAt: 'desc' },
          take: 20,
          select: {
            userId: true,
            displayName: true,
            username: true,
            globalName: true,
            avatarUrl: true,
            guildJoinedAt: true,
          }
        }).then(list => list.map(m => ({
          userId: m.userId,
          name: m.displayName ?? m.globalName ?? m.username ?? 'Inconnu',
          avatarUrl: m.avatarUrl,
          date: m.guildJoinedAt?.toISOString()
        }))),
        recentLeaves: await prisma.memberProfile.findMany({
          where: { guildId, guildLeftAt: { not: null } },
          orderBy: { guildLeftAt: 'desc' },
          take: 20,
          select: {
            userId: true,
            displayName: true,
            username: true,
            globalName: true,
            avatarUrl: true,
            guildLeftAt: true,
          }
        }).then(list => list.map(m => ({
          userId: m.userId,
          name: m.displayName ?? m.globalName ?? m.username ?? 'Inconnu',
          avatarUrl: m.avatarUrl,
          date: m.guildLeftAt?.toISOString()
        }))),
      };

      json(res, 200, analyticsPayload);
    } catch (err) {
      logger.error('AnalyticsAPI', 'Error computing analytics:', err);
      json(res, 500, { error: 'Erreur lors du calcul des analytics' });
    }
    return true;
  }

  return false;
}
