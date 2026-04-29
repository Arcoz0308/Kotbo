import prisma from '../utils/db.js';
import type { 
  StaffAbsence, StaffMeeting, StaffMeetingPresence, 
  StaffManagerNote, StaffPoll, StaffPollOption, StaffPollVote,
  StaffProcedure, StaffProcedureRead
} from '@prisma/client';

type AbsenceMutableStatus = 'PENDING' | 'ACKNOWLEDGED' | 'APPROVED' | 'REJECTED' | 'CANCELED' | 'ENDED';

export const getAbsences = async (guildId: string) => {
  const absences = await prisma.staffAbsence.findMany({
    where: { guildId },
    include: { staffMember: true },
    orderBy: { startDate: 'desc' },
  });

  // Fetch unique superior IDs (Discord IDs)
  const superiorUserIds = [...new Set(absences.map(a => a.superiorUserId).filter(Boolean))] as string[];

  if (superiorUserIds.length === 0) return absences;

  // Fetch superior staff members
  const superiors = await prisma.staffMember.findMany({
    where: {
      guildId,
      userId: { in: superiorUserIds }
    }
  });

  // Attach superior info and resolve display names
  return absences.map((absence) => {
    const staff = absence.staffMember;
    const superior = absence.superiorUserId ? superiors.find(s => s.userId === absence.superiorUserId) : null;

    // Helper to resolve display name: Pseudo > Tag > Username > Discord ID
    const resolveName = (m: any, defaultId: string) => {
      if (!m) return defaultId;
      return m.displayName || m.userTag || m.username || m.userId || defaultId;
    };

    return {
      ...absence,
      staffMember: {
        ...staff,
        displayName: resolveName(staff, absence.staffUserId),
      },
      superior: superior
        ? {
            ...superior,
            displayName: resolveName(superior, absence.superiorUserId!),
          }
        : null,
    };
  });
};



export const createAbsence = async (
  params: {
    guildId: string;
    staffMemberId: string;
    startDate: Date;
    endDate?: Date;
    reason: string;
    type: string;
    message?: string;
    superiorUserId: string;
  }
) => {
  const isIndefinite = !params.endDate;

  const absence = await prisma.staffAbsence.create({
    data: {
      guildId: params.guildId,
      staffUserId: params.staffMemberId,
      startDate: params.startDate,
      endDate: params.endDate,
      reason: params.reason,
      type: params.type,
      message: params.message,
      isIndefinite,
      superiorUserId: params.superiorUserId,
      superiorNotifiedAt: new Date(),
      status: 'ACKNOWLEDGED'
    }
  });

  // Notifier le responsable (superiorUserId)
  if (params.superiorUserId) {
    await createNotification(
      params.guildId,
      params.superiorUserId,
      'Validation d\'absence en attente',
      `Une absence a été soumise par un de vos subordonnés pour le motif: ${params.reason}.`,
      'WARNING',
      '/absences'
    ).catch(() => null);
  }

  // Notifier tous les managers/admins
  const managers = await prisma.staffMember.findMany({
    where: {
      guildId: params.guildId,
      grade: { in: ['Manager', 'Admin', 'Administrateur', 'Fondateur', 'Direction'] }
    }
  });
  
  const notifsData = managers
    .filter(m => m.userId !== params.superiorUserId) // Éviter les doublons si le manager est aussi le supérieur
    .map(m => ({
      guildId: params.guildId,
      userId: m.userId,
      title: 'Nouvelle absence demandée',
      message: `Une absence a été soumise pour le motif: ${params.reason}.`,
      type: 'INFO',
      link: '/absences',
      isRead: false
    }));

  if (notifsData.length > 0) {
    await prisma.notification.createMany({ data: notifsData });
  }

  return absence;
};

export const getAbsenceById = async (guildId: string, absenceId: string) => {
  return prisma.staffAbsence.findFirst({
    where: { id: absenceId, guildId },
    include: { staffMember: true },
  });
};

export const getLatestOpenAbsenceForMember = async (guildId: string, staffMemberId: string) => {
  return prisma.staffAbsence.findFirst({
    where: {
      guildId,
      staffUserId: staffMemberId,
      status: {
        in: ['PENDING', 'ACKNOWLEDGED', 'APPROVED'],
      },
      endedAt: null,
    },
    include: { staffMember: true },
    orderBy: { startDate: 'desc' },
  });
};

export const updateAbsenceStatus = async (
  id: string,
  status: AbsenceMutableStatus,
  decisionByUserId: string,
  decisionNote?: string
) => {
  const now = new Date();
  const result = await prisma.staffAbsence.update({
    where: { id },
    data: {
      status,
      decisionByUserId,
      decisionNote,
      decidedAt: now,
      endedByUserId: status === 'ENDED' || status === 'CANCELED' ? decisionByUserId : null,
      endedAt: status === 'ENDED' || status === 'CANCELED' ? now : null,
    }
  });

  // Notifier le demandeur
  const absence = await prisma.staffAbsence.findUnique({ where: { id } });
  if (absence && absence.staffUserId !== decisionByUserId) {
    await prisma.notification.create({
      data: {
        guildId: absence.guildId,
        userId: absence.staffUserId,
        title: 'Mise à jour de votre absence',
        message: `Votre absence a été marquée comme: ${status}.`,
        type: status === 'APPROVED' ? 'SUCCESS' : (status === 'REJECTED' ? 'ERROR' : 'INFO'),
        link: '/absences',
        isRead: false
      }
    });
  }

  return result;
};

export const closeAbsence = async (
  absenceId: string,
  endedByUserId: string,
  closeNote?: string
) => {
  return prisma.staffAbsence.update({
    where: { id: absenceId },
    data: {
      status: 'ENDED',
      endedByUserId,
      endedAt: new Date(),
      decisionByUserId: endedByUserId,
      decisionNote: closeNote,
      decidedAt: new Date(),
    },
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
  scheduledAt: Date,
  discordMessageId?: string,
  discordEventId?: string
) => {
  const meeting = await prisma.staffMeeting.create({
    data: {
      guildId,
      createdByUserId,
      title,
      description,
      scheduledAt,
      discordMessageId,
      discordEventId,
      status: 'SCHEDULED'
    }
  });

  // Notifier tout le staff
  const staff = await prisma.staffMember.findMany({
    where: { guildId }
  });
  
  const notifsData = staff.map(m => ({
    guildId,
    userId: m.userId,
    title: 'Nouvelle réunion planifiée',
    message: `La réunion "${title}" a été planifiée pour le ${scheduledAt.toLocaleString('fr-FR')}.`,
    type: 'INFO',
    link: '/meetings',
    isRead: false
  }));

  if (notifsData.length > 0) {
    await prisma.notification.createMany({ data: notifsData });
  }

  return meeting;
};

export const updateMeetingStatus = async (id: string, status: 'SCHEDULED' | 'COMPLETED' | 'CANCELED') => {
  return prisma.staffMeeting.update({
    where: { id },
    data: { status }
  });
};

export const updateMeeting = async (
  id: string,
  data: {
    title?: string;
    description?: string;
    scheduledAt?: Date;
    status?: 'SCHEDULED' | 'COMPLETED' | 'CANCELED';
    discordMessageId?: string;
    discordEventId?: string;
  }
) => {
  return prisma.staffMeeting.update({
    where: { id },
    data,
  });
};

export const deleteMeeting = async (id: string) => {
  return prisma.staffMeeting.delete({
    where: { id }
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

export const syncMeetingPresencesWithAbsences = async (meetingId: string) => {
  const meeting = await prisma.staffMeeting.findUnique({
    where: { id: meetingId },
    select: { guildId: true, scheduledAt: true }
  });
  if (!meeting) return;

  const absences = await prisma.staffAbsence.findMany({
    where: {
      guildId: meeting.guildId,
      status: { in: ['APPROVED', 'ACKNOWLEDGED'] },
      startDate: { lte: meeting.scheduledAt },
      OR: [
        { endDate: { gte: meeting.scheduledAt } },
        { isIndefinite: true }
      ]
    }
  });

  for (const absence of absences) {
    await prisma.staffMeetingPresence.upsert({
      where: { meetingId_staffUserId: { meetingId, staffUserId: absence.staffUserId } },
      update: { status: 'EXCUSED', note: `Absence automatique (Staff Panel): ${absence.type} - ${absence.reason}` },
      create: { meetingId, staffUserId: absence.staffUserId, status: 'EXCUSED', note: `Absence automatique (Staff Panel): ${absence.type} - ${absence.reason}` }
    });
  }
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
  const note = await prisma.staffManagerNote.create({
    data: {
      guildId,
      staffUserId,
      authorUserId,
      content
    }
  });

  // Notifier le staff concerné
  const author = await prisma.staffMember.findUnique({ where: { id: authorUserId } });
  const target = await prisma.staffMember.findUnique({ where: { id: staffUserId } });
  
  if (target) {
    await createNotification(
      guildId,
      target.userId,
      'Nouvelle note de management',
      `Une nouvelle note a été ajoutée à votre dossier par ${author?.displayName || 'un manager'}.`,
      'INFO',
      `/profile/${target.userId}`
    ).catch(() => null);
  }

  return note;
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
    const procedure = await prisma.staffProcedure.create({
      data: { guildId, title, content, sortOrder }
    });

    // Notifier tout le staff
    const staff = await prisma.staffMember.findMany({ where: { guildId } });
    const notifsData = staff.map(m => ({
      guildId,
      userId: m.userId,
      title: 'Nouvelle procédure disponible',
      message: `Une nouvelle procédure intitulée "${title}" a été ajoutée. Veuillez en prendre connaissance.`,
      type: 'INFO',
      link: '/procedures',
      isRead: false
    }));

    if (notifsData.length > 0) {
      await prisma.notification.createMany({ data: notifsData });
    }

    return procedure;
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

export const getNotifications = async (guildId: string, userId: string) => {
  return prisma.notification.findMany({
    where: { guildId, userId },
    orderBy: { createdAt: 'desc' },
    take: 50
  });
};

export const markNotificationRead = async (id: string, userId: string) => {
  return prisma.notification.update({
    where: { id, userId },
    data: { isRead: true }
  });
};

export const markAllNotificationsRead = async (guildId: string, userId: string) => {
  return prisma.notification.updateMany({
    where: { guildId, userId, isRead: false },
    data: { isRead: true }
  });
};

export const createNotification = async (
  guildId: string,
  userId: string,
  title: string,
  message: string,
  type: string = 'INFO',
  link?: string
) => {
  return prisma.notification.create({
    data: {
      guildId,
      userId,
      title,
      message,
      type,
      link,
      isRead: false
    }
  });
};
