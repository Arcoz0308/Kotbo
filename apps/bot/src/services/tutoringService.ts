import prisma from '../utils/db.js';
import type { TutoringItem, TutoringConfig, TestingPeriod } from '@prisma/client';

/**
 * Service de gestion du tutorat
 */

export const getTutoringConfig = async (guildId: string) => {
  let config = await prisma.tutoringConfig.findUnique({
    where: { guildId }
  });

  if (!config) {
    config = await prisma.tutoringConfig.create({
      data: { guildId }
    });
  }

  return config;
};

export const updateTutoringConfig = async (guildId: string, data: Partial<TutoringConfig>) => {
  return prisma.tutoringConfig.upsert({
    where: { guildId },
    update: data,
    create: {
      guildId,
      ...data
    }
  });
};

export const getTutoringItems = async (guildId: string) => {
  return prisma.tutoringItem.findMany({
    where: { guildId },
    orderBy: { sortOrder: 'asc' }
  });
};

export const upsertTutoringItem = async (guildId: string, data: any) => {
  if (data.id) {
    return prisma.tutoringItem.update({
      where: { id: data.id },
      data: {
        category: data.category,
        title: data.title,
        description: data.description,
        sortOrder: data.sortOrder
      }
    });
  }

  return prisma.tutoringItem.create({
    data: {
      guildId,
      category: data.category,
      title: data.title,
      description: data.description,
      sortOrder: data.sortOrder
    }
  });
};

export const deleteTutoringItem = async (id: string) => {
  return prisma.tutoringItem.delete({
    where: { id }
  });
};

export const deleteTestingPeriod = async (id: string) => {
  return prisma.testingPeriod.delete({
    where: { id }
  });
};

export const getTutorDashboard = async (guildId: string, tutorUserId: string, fetchAll: boolean = false) => {
  const where: any = {
    guildId,
    status: 'ONGOING'
  };

  if (!fetchAll) {
    // Trouver le StaffMember ID du tuteur
    const tutor = await prisma.staffMember.findUnique({
      where: { guildId_userId: { guildId, userId: tutorUserId } }
    });

    if (!tutor) return [];
    where.mentorId = tutor.id;
  }

  const apprentices = await prisma.testingPeriod.findMany({
    where,
    include: {
      staffMember: true,
      mentor: true,
      checklistProgress: {
        include: { item: true }
      },
      reports: {
        orderBy: { createdAt: 'desc' },
        take: 1
      }
    }
  });

  // Enrich with stats and absences
  return Promise.all(apprentices.map(async (apprentice) => {
    const [vocalStats, absences] = await Promise.all([
      prisma.memberProfile.findUnique({
        where: { guildId_userId: { guildId, userId: apprentice.staffMember.userId } },
        select: { voiceTimeSeconds: true, voiceSessionCount: true }
      }),
      prisma.staffAbsence.findMany({
        where: { 
          guildId, 
          staffUserId: apprentice.staffMember.id,
          endDate: { gte: new Date() }
        },
        orderBy: { startDate: 'asc' },
        take: 3
      })
    ]);

    return {
      ...apprentice,
      vocalStats,
      absences
    };
  }));
};

export const getApprenticeProgress = async (guildId: string, userId: string) => {
  const apprentice = await prisma.staffMember.findUnique({
    where: { guildId_userId: { guildId, userId } }
  });

  if (!apprentice) return null;

  const period = await prisma.testingPeriod.findFirst({
    where: {
      guildId,
      staffUserId: apprentice.id,
      status: 'ONGOING'
    },
    include: {
      mentor: true,
      checklistProgress: {
        include: { item: true }
      },
      reports: {
        orderBy: { createdAt: 'desc' }
      },
      logs: {
        orderBy: { date: 'desc' }
      }
    }
  });

  if (!period) return null;

  const [vocalStats, absences] = await Promise.all([
    prisma.memberProfile.findUnique({
      where: { guildId_userId: { guildId, userId } },
      select: { voiceTimeSeconds: true, voiceSessionCount: true }
    }),
    prisma.staffAbsence.findMany({
      where: { 
        guildId, 
        staffUserId: apprentice.id,
        endDate: { gte: new Date() }
      },
      orderBy: { startDate: 'asc' },
      take: 5
    })
  ]);

  return {
    ...period,
    vocalStats,
    absences
  };
};

export const updateChecklistProgress = async (
  testingPeriodId: string,
  itemId: string,
  completed: boolean,
  userId: string
) => {
  return prisma.tutoringChecklistProgress.upsert({
    where: {
      testingPeriodId_itemId: {
        testingPeriodId,
        itemId
      }
    },
    update: {
      completed,
      completedAt: completed ? new Date() : null,
      completedByUserId: userId
    },
    create: {
      testingPeriodId,
      itemId,
      completed,
      completedAt: completed ? new Date() : null,
      completedByUserId: userId
    }
  });
};

export const addApprenticeLog = async (testingPeriodId: string, content: string) => {
  return prisma.tutoringLog.create({
    data: {
      testingPeriodId,
      content
    }
  });
};

export const checkReportReminders = async (guildId: string) => {
  const config = await getTutoringConfig(guildId);
  const now = new Date();
  
  const periods = await prisma.testingPeriod.findMany({
    where: {
      guildId,
      status: 'ONGOING',
      mentorId: { not: null }
    },
    include: {
      mentor: true,
      staffMember: true
    }
  });

  const reminders = [];

  for (const period of periods) {
    const lastDate = period.lastReportAt || period.startDate;
    const nextDue = new Date(lastDate);
    nextDue.setDate(nextDue.getDate() + config.reportIntervalDays);

    const reminderDate = new Date(nextDue);
    reminderDate.setDate(reminderDate.getDate() - config.reminderDaysBefore);

    if (now >= reminderDate && now < nextDue) {
      // Envoyer un rappel au mentor
      reminders.push({
        userId: period.mentor!.userId,
        apprenticeName: period.staffMember.username || period.staffMember.userId,
        dueDate: nextDue
      });
    }
  }

  return reminders;
};
