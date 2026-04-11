import prisma from '../utils/db.js';
import type { 
  StaffAbsence, StaffMeeting, StaffMeetingPresence, 
  StaffManagerNote, StaffPoll, StaffPollOption, StaffPollVote,
  StaffProcedure, StaffProcedureRead
} from '@prisma/client';

export const getAbsences = async (guildId: string) => {
  return prisma.staffAbsence.findMany({
    where: { guildId },
    include: { staffMember: true },
    orderBy: { startDate: 'desc' },
  });
};

export const createAbsence = async (
  guildId: string,
  staffUserId: string,
  startDate: Date,
  endDate: Date,
  reason: string
) => {
  return prisma.staffAbsence.create({
    data: {
      guildId,
      staffUserId,
      startDate,
      endDate,
      reason,
      status: 'PENDING'
    }
  });
};

export const updateAbsenceStatus = async (
  id: string,
  status: 'APPROVED' | 'REJECTED',
  decisionByUserId: string,
  decisionNote?: string
) => {
  return prisma.staffAbsence.update({
    where: { id },
    data: {
      status,
      decisionByUserId,
      decisionNote
    }
  });
};

export const getMeetings = async (guildId: string) => {
  return prisma.staffMeeting.findMany({
    where: { guildId },
    include: { presences: { include: { staffMember: { select: { username: true, displayName: true } } } } },
    orderBy: { scheduledAt: 'desc' },
  });
};

export const createMeeting = async (
  guildId: string,
  createdByUserId: string,
  title: string,
  description: string,
  scheduledAt: Date
) => {
  return prisma.staffMeeting.create({
    data: {
      guildId,
      createdByUserId,
      title,
      description,
      scheduledAt
    }
  });
};

export const checkInMeeting = async (
  meetingId: string,
  staffUserId: string,
  status: 'PRESENT' | 'EXCUSED' | 'ABSENT',
  note?: string
) => {
  return prisma.staffMeetingPresence.upsert({
    where: { meetingId_staffUserId: { meetingId, staffUserId } },
    update: {
      status,
      checkInAt: status === 'PRESENT' ? new Date() : null,
      note
    },
    create: {
      meetingId,
      staffUserId,
      status,
      checkInAt: status === 'PRESENT' ? new Date() : null,
      note
    }
  });
};

export const getManagerNotes = async (guildId: string, staffUserId: string) => {
  return prisma.staffManagerNote.findMany({
    where: { guildId, staffUserId },
    include: { author: true },
    orderBy: { createdAt: 'desc' },
  });
};

export const createManagerNote = async (
  guildId: string,
  staffUserId: string,
  authorUserId: string,
  content: string
) => {
  return prisma.staffManagerNote.create({
    data: {
      guildId,
      staffUserId,
      authorUserId,
      content
    }
  });
};

export const deleteManagerNote = async (id: string) => {
  return prisma.staffManagerNote.delete({
    where: { id }
  });
};

export const getPolls = async (guildId: string) => {
  return prisma.staffPoll.findMany({
    where: { guildId },
    include: {
      options: { include: { _count: { select: { votes: true } } } },
      author: { select: { username: true, displayName: true } },
      votes: { select: { staffUserId: true, weight: true } } // needed to compute results visually if access logic permits
    },
    orderBy: { createdAt: 'desc' },
  });
};

export const createPoll = async (
  guildId: string,
  authorUserId: string,
  title: string,
  description: string,
  options: string[],
  isAnonymous: boolean = true,
  closesAt?: Date
) => {
  const poll = await prisma.staffPoll.create({
    data: {
      guildId,
      authorUserId,
      title,
      description,
      isAnonymous,
      closesAt,
    }
  });

  if (options.length > 0) {
    await prisma.staffPollOption.createMany({
      data: options.map((opt, index) => ({
        pollId: poll.id,
        text: opt,
        sortOrder: index
      }))
    });
  }
  return poll;
};

export const castPollVote = async (
  pollId: string,
  staffUserId: string,
  optionId: string,
  weight: number = 1.0
) => {
  return prisma.staffPollVote.upsert({
    where: { pollId_staffUserId: { pollId, staffUserId } },
    update: {
      optionId,
      weight
    },
    create: {
      pollId,
      optionId,
      staffUserId,
      weight
    }
  });
};

export const getProcedures = async (guildId: string) => {
  return prisma.staffProcedure.findMany({
    where: { guildId },
    include: { reads: { select: { staffUserId: true, readAt: true } } },
    orderBy: { sortOrder: 'asc' },
  });
};

export const upsertProcedure = async (
  guildId: string,
  id: string | null,
  title: string,
  content: string,
  sortOrder: number
) => {
  if (id) {
    return prisma.staffProcedure.update({
      where: { id },
      data: { title, content, sortOrder }
    });
  } else {
    return prisma.staffProcedure.create({
      data: { guildId, title, content, sortOrder }
    });
  }
};

export const deleteProcedure = async (id: string) => {
  return prisma.staffProcedure.delete({
    where: { id }
  });
};

export const markProcedureAsRead = async (
  procedureId: string,
  staffUserId: string
) => {
  return prisma.staffProcedureRead.upsert({
    where: { procedureId_staffUserId: { procedureId, staffUserId } },
    update: { readAt: new Date() },
    create: { procedureId, staffUserId }
  });
};

export const getStaffAlertsAndProgression = async (guildId: string) => {
  const staff = await prisma.staffMember.findMany({
    where: { guildId },
    include: {
      activities: {
        where: {
          activityDate: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        }
      },
      warnings: {
        where: { isActive: true }
      },
      mentorReports: true
    }
  });

  return staff.map(member => {
    let progressionScore = 100;
    
    progressionScore -= member.warnings.length * 20;

    const positiveReports = member.mentorReports.filter(r => r.type === 'POSITIVE').length;
    const negativeReports = member.mentorReports.filter(r => r.type === 'NEGATIVE').length;
    progressionScore += positiveReports * 10;
    progressionScore -= negativeReports * 15;

    let hasInactivityAlert = false;
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const messages30d = member.activities.reduce((sum, a) => sum + a.messageCount, 0);
    const messages7d = member.activities.filter(a => a.activityDate >= sevenDaysAgo).reduce((sum, a) => sum + a.messageCount, 0);
    
    const avg30d = messages30d / 30;
    const avg7d = messages7d / 7;

    if (avg30d > 2 && avg7d < avg30d * 0.5) {
      hasInactivityAlert = true;
    }

    return {
      staffUserId: member.userId,
      progressionScore: Math.max(0, progressionScore),
      hasInactivityAlert,
      avg30d: Math.round(avg30d * 10) / 10,
      avg7d: Math.round(avg7d * 10) / 10
    };
  });
};
