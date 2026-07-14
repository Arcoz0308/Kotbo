import prisma from '../../utils/db.js';

export type StaffScorecard = {
  messageCount: number;
  voiceMinutes: number;
  sanctionsCount: number;
  ticketsClosed: number;
  meetingsAttended: number;

  previousMessageCount: number;
  previousVoiceMinutes: number;
  previousSanctionsCount: number;
  previousTicketsClosed: number;
  previousMeetingsAttended: number;

  scores: {
    messages: number;
    voice: number;
    moderation: number;
    support: number;
    overall: number;
  };
  burnoutRisk: boolean;
  activityDropPercent: number;
};

export async function getStaffWeeklyScorecard(
  guildId: string,
  userId: string
): Promise<StaffScorecard | null> {
  // 1. Fetch Staff Member
  const staffMember = await prisma.staffMember.findUnique({
    where: { guildId_userId: { guildId, userId } },
    select: { id: true, userId: true }
  });

  if (!staffMember) return null;

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // ─── Current Week Metrics ───

  // A. Messages & Voice Minutes
  const currentActivity = await prisma.staffActivity.aggregate({
    where: {
      guildId,
      staffUserId: staffMember.id,
      activityDate: { gte: sevenDaysAgo }
    },
    _sum: {
      messageCount: true,
      voiceMinutes: true
    }
  });

  // B. Sanctions Applied
  const currentSanctions = await prisma.sanction.count({
    where: {
      guildId,
      moderatorUserId: staffMember.userId,
      createdAt: { gte: sevenDaysAgo }
    }
  });

  // C. Tickets Closed
  const currentTickets = await prisma.ticket.count({
    where: {
      guildId,
      closedById: staffMember.userId,
      closedAt: { gte: sevenDaysAgo }
    }
  });

  // D. Meetings Attended
  const currentMeetings = await prisma.staffMeetingPresence.count({
    where: {
      staffUserId: staffMember.id,
      status: 'PRESENT',
      meeting: {
        endedAt: { gte: sevenDaysAgo }
      }
    }
  });

  // ─── Previous Week Metrics (7 to 14 days ago) ───

  const previousActivity = await prisma.staffActivity.aggregate({
    where: {
      guildId,
      staffUserId: staffMember.id,
      activityDate: { gte: fourteenDaysAgo, lt: sevenDaysAgo }
    },
    _sum: {
      messageCount: true,
      voiceMinutes: true
    }
  });

  const previousSanctions = await prisma.sanction.count({
    where: {
      guildId,
      moderatorUserId: staffMember.userId,
      createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo }
    }
  });

  const previousTickets = await prisma.ticket.count({
    where: {
      guildId,
      closedById: staffMember.userId,
      closedAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo }
    }
  });

  const previousMeetings = await prisma.staffMeetingPresence.count({
    where: {
      staffUserId: staffMember.id,
      status: 'PRESENT',
      meeting: {
        endedAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo }
      }
    }
  });

  // ─── Extracted Values ───
  const msgCount = currentActivity._sum.messageCount ?? 0;
  const voiceMins = currentActivity._sum.voiceMinutes ?? 0;
  
  const prevMsgCount = previousActivity._sum.messageCount ?? 0;
  const prevVoiceMins = previousActivity._sum.voiceMinutes ?? 0;

  // ─── Score calculations ───
  // Benchmarks: 300 messages/week = 100%, 120 voice mins/week = 100%, 5 sanctions/week = 100%, 5 tickets/week = 100%
  const msgScore = Math.min(100, Math.round((msgCount / 300) * 100));
  const voiceScore = Math.min(100, Math.round((voiceMins / 120) * 100));
  const modScore = Math.min(100, Math.round((currentSanctions / 5) * 100));
  const supportScore = Math.min(100, Math.round((currentTickets / 5) * 100));
  const overallScore = Math.round((msgScore + voiceScore + modScore + supportScore) / 4);

  // Previous overall score for comparison
  const prevMsgScore = Math.min(100, Math.round((prevMsgCount / 300) * 100));
  const prevVoiceScore = Math.min(100, Math.round((prevVoiceMins / 120) * 100));
  const prevModScore = Math.min(100, Math.round((previousSanctions / 5) * 100));
  const prevSupportScore = Math.min(100, Math.round((previousTickets / 5) * 100));
  const prevOverallScore = (prevMsgScore + prevVoiceScore + prevModScore + prevSupportScore) / 4;

  // Burnout Detection
  // If the user was active last week (prevOverall >= 30) and active scores drop by >= 60%
  let burnoutRisk = false;
  let activityDropPercent = 0;
  
  if (prevOverallScore >= 30) {
    activityDropPercent = Math.round(((prevOverallScore - overallScore) / prevOverallScore) * 100);
    if (activityDropPercent >= 60) {
      burnoutRisk = true;
    }
  }

  return {
    messageCount: msgCount,
    voiceMinutes: voiceMins,
    sanctionsCount: currentSanctions,
    ticketsClosed: currentTickets,
    meetingsAttended: currentMeetings,

    previousMessageCount: prevMsgCount,
    previousVoiceMinutes: prevVoiceMins,
    previousSanctionsCount: previousSanctions,
    previousTicketsClosed: previousTickets,
    previousMeetingsAttended: previousMeetings,

    scores: {
      messages: msgScore,
      voice: voiceScore,
      moderation: modScore,
      support: supportScore,
      overall: overallScore
    },
    burnoutRisk,
    activityDropPercent: Math.max(0, activityDropPercent)
  };
}
