import prisma from '../utils/db.js';

export const getDashboardAnalytics = async (guildId: string, days: number = 30) => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - days);

  const startKey = startDate.toISOString().split('T')[0];
  const endKey = endDate.toISOString().split('T')[0];

  const dailyStats = await prisma.guildDailyStat.findMany({
    where: {
      guildId,
      dateKey: {
        gte: startKey,
        lte: endKey
      }
    },
    orderBy: { dateKey: 'asc' }
  });

  const channelStats = await prisma.channelDailyStat.findMany({
    where: {
      guildId,
      dateKey: {
        gte: startKey,
        lte: endKey
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

  const popularChannels = Object.entries(channelTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([channelId, messagesCount]) => ({ channelId, messagesCount }));

  const startISO = startDate.toISOString();
  const endISO = endDate.toISOString();

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
    }
  };
};
