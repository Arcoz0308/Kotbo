import prisma from '../utils/db.js';

export const getDashboardAnalytics = async (guildId: string, options: { days?: number, startDate?: string, endDate?: string } = {}) => {
  const days = options.days || 30;
  const endKey = options.endDate || new Date().toISOString().split('T')[0];
  let startKey = options.startDate;

  if (!startKey) {
    const startDate = new Date(endKey);
    startDate.setDate(startDate.getDate() - days);
    startKey = startDate.toISOString().split('T')[0];
  }

  const finalEndKey = endKey.split('T')[0];
  const finalStartKey = startKey.split('T')[0];

  let dailyStats: any[] = [];
  
  // Check if we should use hourly resolution (days=1 OR custom range < 72h)
  let useHourly = days === 1 && !options.startDate;
  if (options.startDate && options.endDate) {
    const start = new Date(options.startDate);
    const end = new Date(options.endDate);
    const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    if (diffHours > 0 && diffHours <= 72) {
      useHourly = true;
    }
  }

  if (useHourly) {
    // Hourly resolution
    const hourlyWhere: any = { guildId };
    
    if (options.startDate && options.endDate) {
      const sDate = options.startDate.split('T')[0];
      const eDate = options.endDate.split('T')[0];
      hourlyWhere.dateKey = { gte: sDate, lte: eDate };
    }

    const hourlyStats = await prisma.guildHourlyStat.findMany({
      where: hourlyWhere,
      orderBy: [
        { dateKey: 'asc' },
        { hour: 'asc' }
      ],
      take: options.startDate ? 200 : 24 
    });
    
    dailyStats = hourlyStats.map(h => ({
      dateKey: `${h.dateKey} ${h.hour}h`,
      messagesCount: h.messagesCount,
      voiceMinutes: h.voiceMinutes,
      membersJoined: h.joinsCount,
      membersLeft: h.leavesCount,
      activeMembers: h.activeMembers,
      totalMembers: 0, 
      onlineMembers: h.onlineMembers,
    }));
  } else {
    // Daily resolution
    dailyStats = await prisma.guildDailyStat.findMany({
      where: {
        guildId,
        dateKey: {
          gte: finalStartKey,
          lte: finalEndKey
        }
      },
      orderBy: { dateKey: 'asc' }
    });
  }

  const channelStats = await prisma.channelDailyStat.findMany({
    where: {
      guildId,
      dateKey: {
        gte: finalStartKey,
        lte: finalEndKey
      }
    }
  });

  // Group channel stats to find popular channels
  const channelTotals = channelStats.reduce((acc, curr) => {
    if (!acc[curr.channelId]) {
      acc[curr.channelId] = 0;
    }
    acc[curr.channelId] += curr.messagesCount;
    return acc;
  }, {} as Record<string, number>);

  const popularChannels = Object.entries(channelTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([channelId, messagesCount]) => ({ channelId, messagesCount }));

  const memberStats = await prisma.memberDailyStat.findMany({
    where: {
      guildId,
      dateKey: {
        gte: startKey,
        lte: endKey
      }
    },
    include: {
      memberProfile: {
        select: {
          userTag: true,
          username: true,
          displayName: true,
          avatarUrl: true
        }
      }
    }
  });

  const memberTotals = memberStats.reduce((acc, curr) => {
    if (!acc[curr.userId]) {
      acc[curr.userId] = {
        userId: curr.userId,
        name: curr.memberProfile?.displayName || curr.memberProfile?.username || curr.memberProfile?.userTag || 'Inconnu',
        username: curr.memberProfile?.username || curr.memberProfile?.userTag || 'Inconnu',
        avatarUrl: curr.memberProfile?.avatarUrl,
        messageCount: 0,
        voiceTimeSeconds: 0
      };
    }
    acc[curr.userId].messageCount += curr.messagesCount;
    acc[curr.userId].voiceTimeSeconds += curr.voiceMinutes * 60;
    return acc;
  }, {} as Record<string, any>);

  const memberTotalsArray = Object.values(memberTotals);
  
  const topMessageMembers = [...memberTotalsArray]
    .sort((a, b) => b.messageCount - a.messageCount);
    
  const topVoiceMembers = [...memberTotalsArray]
    .sort((a, b) => b.voiceTimeSeconds - a.voiceTimeSeconds);

  const startISO = new Date(startKey).toISOString();
  const endISO = new Date(endKey + 'T23:59:59.999Z').toISOString();

  const sanctions = await prisma.sanction.findMany({
    where: {
      guildId,
      createdAt: {
        gte: startISO,
        lte: endISO
      }
    },
    orderBy: { createdAt: 'desc' },
    take: 100
  });

  const recentSanctions = sanctions;

  const modTotals = sanctions.reduce((acc, curr) => {
    if (!acc[curr.moderatorUserId]) {
      acc[curr.moderatorUserId] = { userId: curr.moderatorUserId, moderatorTag: curr.moderatorTag, avatarUrl: null, count: 0 };
    }
    acc[curr.moderatorUserId].count++;
    return acc;
  }, {} as Record<string, { userId: string; moderatorTag: string | null; avatarUrl: string | null; count: number }>);
  
  const topModerators = Object.values(modTotals).sort((a, b) => b.count - a.count);

  const targetTotals = sanctions.reduce((acc, curr) => {
    if (!acc[curr.targetUserId]) {
      acc[curr.targetUserId] = { targetUserId: curr.targetUserId, targetTag: curr.targetTag, avatarUrl: null, count: 0 };
    }
    acc[curr.targetUserId].count++;
    return acc;
  }, {} as Record<string, { targetUserId: string; targetTag: string | null; avatarUrl: string | null; count: number }>);
  
  const topSanctionedMembers = Object.values(targetTotals).sort((a, b) => b.count - a.count);

  const staffMembers = await prisma.staffMember.findMany({
    where: { guildId }
  });

  const activeAbsences = await prisma.absence.count({
    where: { guildId, status: 'APPROVED', endDate: { gte: new Date() } }
  });

  const recentMeetings = await prisma.meeting.findMany({
    where: { guildId, scheduledAt: { gte: startISO, lte: endISO } },
    include: { presences: true }
  });

  let totalPresences = 0;
  let possiblePresences = 0;
  for (const m of recentMeetings) {
    totalPresences += m.presences.filter(p => p.isPresent).length;
    possiblePresences += staffMembers.length;
  }
  const avgMeetingAttendance = possiblePresences > 0 ? Math.round((totalPresences / possiblePresences) * 100) : 0;

  // Enrichir les tags avec les noms actuels si possible
  const allUserIds = new Set([
    ...topModerators.map(m => m.userId),
    ...topSanctionedMembers.map(m => m.targetUserId),
    ...sanctions.map(s => s.targetUserId),
    ...sanctions.map(s => s.moderatorUserId)
  ]);

  const profiles = await prisma.memberProfile.findMany({
    where: { userId: { in: Array.from(allUserIds) }, guildId },
    select: { userId: true, displayName: true, username: true, globalName: true, avatarUrl: true }
  });

  const profileMap = new Map(profiles.map(p => [p.userId, p]));

  const enrichedTopModerators = topModerators.map(m => {
    const p = profileMap.get(m.userId);
    return {
      ...m,
      moderatorTag: p?.displayName || p?.globalName || p?.username || m.moderatorTag || 'Inconnu',
      avatarUrl: p?.avatarUrl || m.avatarUrl
    };
  });

  const enrichedTopSanctioned = topSanctionedMembers.map(m => {
    const p = profileMap.get(m.targetUserId);
    return {
      ...m,
      targetTag: p?.displayName || p?.globalName || p?.username || m.targetTag || 'Inconnu',
      avatarUrl: p?.avatarUrl || m.avatarUrl
    };
  });

  const staffLeaderboard = staffMembers.map(staff => {
    const memData = memberTotals[staff.userId] || { messageCount: 0, voiceTimeSeconds: 0 };
    const score = memData.messageCount + Math.round(memData.voiceTimeSeconds / 60);
    const p = profileMap.get(staff.userId);
    return {
      userId: staff.userId,
      name: staff.displayName || p?.displayName || staff.username || p?.username || staff.userTag || p?.globalName || 'Inconnu',
      avatarUrl: staff.avatarUrl || p?.avatarUrl,
      grade: staff.grade,
      messages: memData.messageCount,
      voiceMinutes: Math.round(memData.voiceTimeSeconds / 60),
      score
    };
  }).sort((a, b) => b.score - a.score);

  return {
    dailyTrend: dailyStats.map(stat => ({
      dateKey: stat.dateKey,
      messages: stat.messagesCount,
      voiceMinutes: stat.voiceMinutes,
      membersJoined: stat.membersJoined,
      membersLeft: stat.membersLeft,
      sanctions: stat.sanctionsCount || 0,
      onlineMembers: stat.onlineMembers || 0,
      peakOnline: stat.peakOnline || 0
    })),
    topChannels: popularChannels,
    topMessageMembers,
    topVoiceMembers,
    recentSanctions: recentSanctions.map(s => {
       const targetP = profileMap.get(s.targetUserId);
       const modP = profileMap.get(s.moderatorUserId);
       return {
         ...s,
         targetTag: targetP?.displayName || targetP?.globalName || s.targetTag,
         targetAvatarUrl: targetP?.avatarUrl || null,
         moderatorTag: modP?.displayName || modP?.globalName || s.moderatorTag,
         moderatorAvatarUrl: modP?.avatarUrl || null
       };
    }),
    topModerators: enrichedTopModerators,
    topSanctionedMembers: enrichedTopSanctioned,
    staff: {
      totalStaff: staffMembers.length,
      activeAbsences,
      meetings: recentMeetings.length,
      avgMeetingAttendance,
      leaderboard: staffLeaderboard
    },
    totals: {
      totalMessages: dailyStats.reduce((sum, stat) => sum + stat.messagesCount, 0),
      totalVoiceMinutes: dailyStats.reduce((sum, stat) => sum + stat.voiceMinutes, 0),
      totalJoins: dailyStats.reduce((sum, stat) => sum + stat.membersJoined, 0),
      totalLeaves: dailyStats.reduce((sum, stat) => sum + stat.membersLeft, 0),
      warns: sanctions.filter(s => s.type === 'WARN').length,
      kicks: sanctions.filter(s => s.type === 'KICK').length,
      bans: sanctions.filter(s => s.type === 'BAN' || s.type === 'TEMP_BAN').length,
      timeouts: sanctions.filter(s => s.type === 'TIMEOUT').length,
    },
    commandUsage: await getCommandUsageAnalytics(guildId, { startDate: startISO, endDate: endISO }),
    staffPerformance: await getStaffPerformanceAnalytics(guildId, { startDate: startISO, endDate: endISO }),
    channelCategoryActivity: await getChannelCategoryActivity(guildId, { startDate: finalStartKey, endDate: finalEndKey })
  };
};

/**
 * Get command usage analytics
 */
export const getCommandUsageAnalytics = async (guildId: string, options: { startDate?: string, endDate?: string } = {}) => {
  const usages = await prisma.dashboardCommandUsage.findMany({
    where: {
      guildId,
      lastUsedAt: {
        gte: options.startDate,
        lte: options.endDate
      }
    },
    orderBy: { count: 'desc' }
  });

  // Aggregate by command name
  const totals: Record<string, number> = {};
  usages.forEach(u => {
    totals[u.commandName] = (totals[u.commandName] || 0) + u.count;
  });

  return Object.entries(totals)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
};

/**
 * Get detailed staff performance metrics
 */
export const getStaffPerformanceAnalytics = async (guildId: string, options: { startDate?: string, endDate?: string } = {}) => {
  const staffMembers = await prisma.staffMember.findMany({
    where: { guildId }
  });

  const sanctions = await prisma.sanction.findMany({
    where: {
      guildId,
      createdAt: {
        gte: options.startDate,
        lte: options.endDate
      }
    }
  });

  const reports = await prisma.sanctionReport.findMany({
    where: {
      guildId,
      createdAt: {
        gte: options.startDate,
        lte: options.endDate
      }
    }
  });

  const performance = staffMembers.map(staff => {
    const staffSanctions = sanctions.filter(s => s.moderatorUserId === staff.userId);
    const staffReports = reports.filter(r => r.createdByUserId === staff.userId);
    
    return {
      userId: staff.userId,
      username: staff.username,
      displayName: staff.displayName,
      avatarUrl: staff.avatarUrl,
      sanctionsCount: staffSanctions.length,
      reportsCount: staffReports.length,
      reportRate: staffSanctions.length > 0 ? Math.round((staffReports.length / staffSanctions.length) * 100) : 0,
      warns: staffSanctions.filter(s => s.type === 'WARN').length,
      bans: staffSanctions.filter(s => s.type === 'BAN' || s.type === 'TEMP_BAN').length
    };
  }).sort((a, b) => (b.sanctionsCount + b.reportsCount) - (a.sanctionsCount + a.reportsCount));

  return performance;
};

/**
 * Get activity grouped by channel categories
 */
export const getChannelCategoryActivity = async (guildId: string, options: { startDate?: string, endDate?: string } = {}) => {
  const channelStats = await prisma.channelDailyStat.findMany({
    where: {
      guildId,
      dateKey: {
        gte: options.startDate,
        lte: options.endDate
      }
    }
  });

  // This would ideally require category information from Discord or a mapping
  // For now, we aggregate by channel and the caller can enrich with categories if they have the guild object
  const channelTotals: Record<string, number> = {};
  channelStats.forEach(s => {
    channelTotals[s.channelId] = (channelTotals[s.channelId] || 0) + s.messagesCount;
  });

  return Object.entries(channelTotals).map(([channelId, messages]) => ({ channelId, messages }));
};

/**
 * Get hourly heatmap data (for visualization)
 */
export const getHourlyHeatmapData = async (guildId: string, options: { days?: number, startDate?: string, endDate?: string } = {}) => {
  const days = options.days || 30;
  const endKey = options.endDate || new Date().toISOString().split('T')[0];
  let startKey = options.startDate;

  if (!startKey) {
    const startDate = new Date(endKey);
    startDate.setDate(startDate.getDate() - days);
    startKey = startDate.toISOString().split('T')[0];
  }

  const hourlyStats = await prisma.guildHourlyStat.findMany({
    where: {
      guildId,
      dateKey: {
        gte: startKey,
        lte: endKey
      }
    },
    orderBy: [{ dateKey: 'asc' }, { hour: 'asc' }]
  });

  // Group by day of week and hour to create heatmap
  const heatmapData: Record<number, Record<number, { messages: number; voice: number; active: number }>> = {};

  for (let dow = 0; dow < 7; dow++) {
    heatmapData[dow] = {};
    for (let hour = 0; hour < 24; hour++) {
      heatmapData[dow][hour] = { messages: 0, voice: 0, active: 0 };
    }
  }

  const dayOfWeekCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

  hourlyStats.forEach(stat => {
    const date = new Date(stat.dateKey + 'T00:00:00Z');
    const dow = date.getUTCDay();
    dayOfWeekCounts[dow]++;

    heatmapData[dow][stat.hour].messages += stat.messagesCount;
    heatmapData[dow][stat.hour].voice += stat.voiceMinutes;
    heatmapData[dow][stat.hour].active += stat.activeMembers;
  });

  // Normalize by number of days in period
  const normalized: Record<number, Record<number, { messages: number; voice: number; active: number }>> = {};
  for (let dow = 0; dow < 7; dow++) {
    normalized[dow] = {};
    const count = dayOfWeekCounts[dow] || 1;
    for (let hour = 0; hour < 24; hour++) {
      normalized[dow][hour] = {
        messages: Math.round(heatmapData[dow][hour].messages / count),
        voice: Math.round(heatmapData[dow][hour].voice / count),
        active: Math.round(heatmapData[dow][hour].active / count)
      };
    }
  }

  return normalized;
};

/**
 * Get week-over-week comparison
 */
export const getWeekOverWeekComparison = async (guildId: string) => {
  const now = new Date();
  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(now.getDate() - now.getUTCDay());
  thisWeekStart.setHours(0, 0, 0, 0);

  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(thisWeekStart.getDate() - 7);

  const thisWeekEnd = new Date(thisWeekStart);
  thisWeekEnd.setDate(thisWeekStart.getDate() + 6);

  const thisWeekKey = thisWeekStart.toISOString().split('T')[0];
  const lastWeekKey = lastWeekStart.toISOString().split('T')[0];
  const thisWeekEndKey = thisWeekEnd.toISOString().split('T')[0];

  const thisWeekStats = await prisma.guildDailyStat.findMany({
    where: {
      guildId,
      dateKey: { gte: thisWeekKey, lte: thisWeekEndKey }
    }
  });

  const lastWeekEndKey = new Date(lastWeekStart);
  lastWeekEndKey.setDate(lastWeekStart.getDate() + 6);
  const lastWeekEndKeyStr = lastWeekEndKey.toISOString().split('T')[0];

  const lastWeekStats = await prisma.guildDailyStat.findMany({
    where: {
      guildId,
      dateKey: { gte: lastWeekKey, lte: lastWeekEndKeyStr }
    }
  });

  const sumStats = (stats: typeof thisWeekStats) => ({
    messages: stats.reduce((sum, s) => sum + s.messagesCount, 0),
    voiceMinutes: stats.reduce((sum, s) => sum + s.voiceMinutes, 0),
    joins: stats.reduce((sum, s) => sum + s.membersJoined, 0),
    leaves: stats.reduce((sum, s) => sum + s.membersLeft, 0),
    sanctions: stats.reduce((sum, s) => sum + (s.sanctionsCount || 0), 0)
  });

  const thisWeek = sumStats(thisWeekStats);
  const lastWeek = sumStats(lastWeekStats);

  const getChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  return {
    thisWeek,
    lastWeek,
    changes: {
      messagesChange: getChange(thisWeek.messages, lastWeek.messages),
      voiceChange: getChange(thisWeek.voiceMinutes, lastWeek.voiceMinutes),
      joinsChange: getChange(thisWeek.joins, lastWeek.joins),
      leavesChange: getChange(thisWeek.leaves, lastWeek.leaves),
      sanctionsChange: getChange(thisWeek.sanctions, lastWeek.sanctions)
    }
  };
};

/**
 * Get growth and retention metrics
 */
export const getGrowthAndRetention = async (guildId: string, options: { days?: number, startDate?: string, endDate?: string } = {}) => {
  const days = options.days || 90;
  const endKey = options.endDate || new Date().toISOString().split('T')[0];
  let startKey = options.startDate;

  if (!startKey) {
    const startDate = new Date(endKey);
    startDate.setDate(startDate.getDate() - days);
    startKey = startDate.toISOString().split('T')[0];
  }

  const dailyStats = await prisma.guildDailyStat.findMany({
    where: {
      guildId,
      dateKey: { gte: startKey, lte: endKey }
    },
    orderBy: { dateKey: 'asc' }
  });

  // Calculate cumulative net growth (joins - leaves)
  let cumulativeMembers = 0;
  const growthTrend = dailyStats.map(stat => {
    cumulativeMembers += stat.membersJoined - stat.membersLeft;
    return {
      dateKey: stat.dateKey,
      netGrowth: stat.membersJoined - stat.membersLeft,
      cumulativeGrowth: cumulativeMembers,
      activeMembers: stat.activeMembers,
      totalMembers: stat.totalMembers,
      retentionRate: stat.totalMembers > 0 ? Math.round((stat.activeMembers / stat.totalMembers) * 100) : 0
    };
  });

  // Get overall metrics
  const totalJoins = dailyStats.reduce((sum, s) => sum + s.membersJoined, 0);
  const totalLeaves = dailyStats.reduce((sum, s) => sum + s.membersLeft, 0);
  const avgActiveMembers = Math.round(
    dailyStats.reduce((sum, s) => sum + s.activeMembers, 0) / (dailyStats.length || 1)
  );
  const lastDayStats = dailyStats[dailyStats.length - 1];
  const currentRetention = lastDayStats 
    ? Math.round((lastDayStats.activeMembers / (lastDayStats.totalMembers || 1)) * 100)
    : 0;

  return {
    growthTrend,
    metrics: {
      totalJoins,
      totalLeaves,
      netGrowth: totalJoins - totalLeaves,
      avgActiveMembers,
      currentRetention
    }
  };
};

/**
 * Get Daily Algo analytics
 */
export const getDailyAlgoAnalytics = async (guildId: string, options: { days?: number, startDate?: string, endDate?: string } = {}) => {
  const days = options.days || 30;
  const endKey = options.endDate || new Date().toISOString().split('T')[0];
  let startKey = options.startDate;

  if (!startKey) {
    const startDate = new Date(endKey);
    startDate.setDate(startDate.getDate() - days);
    startKey = startDate.toISOString().split('T')[0];
  }

  const startISO = new Date(startKey).toISOString();
  const endISO = new Date(endKey + 'T23:59:59.999Z').toISOString();

  // Get recent daily algo runs
  const runs = await prisma.dailyAlgoRun.findMany({
    where: {
      guildId,
      createdAt: { gte: startISO, lte: endISO }
    },
    include: {
      problem: true,
      submissions: true
    },
    orderBy: { createdAt: 'desc' }
  });

  // Get submission data
  const submissions = await prisma.dailyAlgoSubmission.findMany({
    where: {
      run: {
        guildId,
        createdAt: { gte: startISO, lte: endISO }
      }
    },
    include: {
      run: true
    }
  });

  // Calculate metrics
  const totalRuns = runs.length;
  const totalSubmissions = submissions.length;
  const completedSubmissions = submissions.filter(s => s.status === 'VALIDATED').length;
  const avgSubmissionsPerRun = totalRuns > 0 ? Math.round(totalSubmissions / totalRuns) : 0;
  const completionRate = totalSubmissions > 0 ? Math.round((completedSubmissions / totalSubmissions) * 100) : 0;

  // Get top performers
  const performerMap: Record<string, any> = {};
  submissions.forEach(sub => {
    if (!performerMap[sub.authorId]) {
      performerMap[sub.authorId] = {
        userId: sub.authorId,
        name: sub.authorName,
        submissions: 0,
        validated: 0,
        avgScore: 0,
        scores: []
      };
    }
    performerMap[sub.authorId].submissions++;
    if (sub.status === 'VALIDATED') {
      performerMap[sub.authorId].validated++;
      if (sub.scoreFinal !== null) {
        performerMap[sub.authorId].scores.push(sub.scoreFinal);
      }
    }
  });

  const topPerformers = Object.values(performerMap)
    .map(p => ({
      ...p,
      avgScore: p.scores.length > 0 ? Math.round((p.scores.reduce((a, b) => a + b, 0) / p.scores.length) * 100) / 100 : 0
    }))
    .sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0))
    .slice(0, 10);

  // Get difficulty distribution
  const difficultyMap: Record<string, number> = {};
  runs.forEach(run => {
    const diff = run.problem?.difficulty || 'inconnu';
    difficultyMap[diff] = (difficultyMap[diff] || 0) + 1;
  });

  // Get trend (runs per day)
  const trendMap: Record<string, number> = {};
  runs.forEach(run => {
    const dateKey = run.createdAt.toISOString().split('T')[0];
    trendMap[dateKey] = (trendMap[dateKey] || 0) + 1;
  });

  const trend = Object.entries(trendMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dateKey, count]) => ({ dateKey, count }));

  return {
    metrics: {
      totalRuns,
      totalSubmissions,
      completedSubmissions,
      avgSubmissionsPerRun,
      completionRate
    },
    topPerformers,
    difficultyDistribution: Object.entries(difficultyMap).map(([difficulty, count]) => ({ difficulty, count })),
    trend
  };
};
