import prisma from '../utils/db.js';
import type { StaffMember, TestingPeriod, APIKey } from '@prisma/client';
import crypto from 'node:crypto';

/**
 * Service de gestion du personnel staff
 * Gère les membres du staff, les avertissements, la blacklist, les clés API, etc.
 */

export const hashAPIKey = (key: string): string => {
  return crypto.createHash('sha256').update(key).digest('hex');
};

export const generateAPIKey = (): { fullKey: string; displayKey: string } => {
  const fullKey = `kb_${crypto.randomBytes(32).toString('hex')}`;
  const displayKey = `${fullKey.slice(0, 8)}...${fullKey.slice(-4)}`;
  return { fullKey, displayKey };
};

export const getStaffMember = async (guildId: string, userId: string) => {
  return prisma.staffMember.findUnique({
    where: { guildId_userId: { guildId, userId } },
  });
};

const resolveStaffMemberId = async (guildId: string, staffIdentifier: string) => {
  const byId = await prisma.staffMember.findFirst({
    where: { id: staffIdentifier, guildId },
    select: { id: true },
  });

  if (byId) {
    return byId.id;
  }

  const byUserId = await prisma.staffMember.findUnique({
    where: { guildId_userId: { guildId, userId: staffIdentifier } },
    select: { id: true },
  });

  return byUserId?.id ?? null;
};

export const addStaffMember = async (
  guildId: string,
  userId: string,
  grade: string,
  userTag?: string,
  username?: string,
  displayName?: string,
  avatarUrl?: string
) => {
  return prisma.staffMember.upsert({
    where: { guildId_userId: { guildId, userId } },
    update: {
      grade,
      userTag,
      username,
      displayName,
      avatarUrl,
    },
    create: {
      guildId,
      userId,
      grade,
      userTag,
      username,
      displayName,
      avatarUrl,
    },
  });
};


export const updateStaffGrade = async (
  guildId: string,
  userId: string,
  newGrade: string
) => {
  return prisma.staffMember.update({
    where: { guildId_userId: { guildId, userId } },
    data: {
      grade: newGrade,
      currentRoleStartedAt: new Date(),
    },
  });
};

export const toggleTutorStatus = async (
  guildId: string,
  userId: string
) => {
  const member = await prisma.staffMember.findUnique({
    where: { guildId_userId: { guildId, userId } },
    select: { isTutor: true }
  });

  if (!member) throw new Error('Membre staff introuvable');

  return prisma.staffMember.update({
    where: { guildId_userId: { guildId, userId } },
    data: {
      isTutor: !member.isTutor
    }
  });
};

export const removeStaffMember = async (guildId: string, userId: string) => {
  return prisma.staffMember.delete({
    where: { guildId_userId: { guildId, userId } },
  });
};

export const getStaffMemberStats = async (guildId: string, userId: string) => {
  const resolvedStaffMemberId = await resolveStaffMemberId(guildId, userId);

  if (!resolvedStaffMemberId) {
    return {
      member: null,
      warnings: [],
      activities: [],
      testingPeriods: [],
      stats: {
        totalMessages: 0,
        totalVoiceMinutes: 0,
        activeWarnings: 0,
      },
    };
  }

  const [member, warnings, activities, testingPeriods] = await Promise.all([
    prisma.staffMember.findUnique({ where: { id: resolvedStaffMemberId } }),
    prisma.staffWarning.findMany({
      where: { guildId, staffUserId: resolvedStaffMemberId, isActive: true },
    }),
    prisma.staffActivity.findMany({
      where: { guildId, staffUserId: resolvedStaffMemberId },
      orderBy: { activityDate: 'desc' },
      take: 30,
    }),
    prisma.testingPeriod.findMany({
      where: { guildId, staffUserId: resolvedStaffMemberId },
      include: { 
        reports: { include: { author: true } },
        mentor: true,
        staffMember: true
      },
    }),
  ]);

  const totalMessages = activities.reduce((sum, a) => sum + a.messageCount, 0);
  const totalVoiceMinutes = activities.reduce((sum, a) => sum + a.voiceMinutes, 0);

  return {
    member,
    warnings,
    activities,
    testingPeriods,
    stats: {
      totalMessages,
      totalVoiceMinutes,
      activeWarnings: warnings.length,
    },
  };
};

export const issueStaffWarning = async (
  guildId: string,
  staffUserId: string,
  issuedByUserId: string,
  reason: string,
  expiresAt?: Date
) => {
  const resolvedStaffMemberId = await resolveStaffMemberId(guildId, staffUserId);
  if (!resolvedStaffMemberId) {
    throw new Error('Membre staff introuvable pour cet avertissement');
  }

  return prisma.staffWarning.create({
    data: {
      guildId,
      staffUserId: resolvedStaffMemberId,
      issuedByUserId,
      reason,
      expiresAt,
    },
  });
};

export const blacklistStaff = async (
  guildId: string,
  staffUserId: string,
  issuedByUserId: string,
  reason: string,
  endDate?: Date
) => {
  const resolvedStaffMemberId = await resolveStaffMemberId(guildId, staffUserId);
  if (!resolvedStaffMemberId) {
    throw new Error('Membre staff introuvable pour la blacklist');
  }

  return prisma.staffBlacklist.create({
    data: {
      guildId,
      staffUserId: resolvedStaffMemberId,
      issuedByUserId,
      reason,
      endDate,
    },
  });
};

export const getActiveBlacklist = async (guildId: string, staffUserId: string) => {
  const resolvedStaffMemberId = await resolveStaffMemberId(guildId, staffUserId);
  if (!resolvedStaffMemberId) {
    return null;
  }

  const now = new Date();
  return prisma.staffBlacklist.findFirst({
    where: {
      guildId,
      staffUserId: resolvedStaffMemberId,
      isActive: true,
      OR: [
        { endDate: { gt: now } },
        { endDate: null },
      ],
    },
  });
};

export const createTestingPeriod = async (
  guildId: string,
  staffUserId: string,
  mentorId?: string,
  plannedDurationDays: number = 14,
  targetGrade?: string
) => {
  const resolvedStaffMemberId = await resolveStaffMemberId(guildId, staffUserId);
  if (!resolvedStaffMemberId) {
    throw new Error('Membre staff introuvable pour la période de test');
  }

  const resolvedMentorId = mentorId ? await resolveStaffMemberId(guildId, mentorId) : null;

  return prisma.testingPeriod.create({
    data: {
      guildId,
      staffUserId: resolvedStaffMemberId,
      mentorId: resolvedMentorId,
      plannedDurationDays,
      targetGrade,
    },
  });
};

export const addMentorReport = async (
  testingPeriodId: string,
  authorId: string,
  type: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL',
  content: string
) => {
  return prisma.mentorReport.create({
    data: {
      testingPeriodId,
      authorId,
      type,
      content,
    },
  });
};

export const endTestingPeriod = async (
  testingPeriodId: string,
  status: 'PASSED' | 'FAILED',
  notes?: string
) => {
  return prisma.testingPeriod.update({
    where: { id: testingPeriodId },
    data: {
      status,
      endDate: new Date(),
      notes,
    },
    include: { reports: true, staffMember: true },
  });
};

export const getStaffRoles = async (guildId: string) => {
  return prisma.staffRole.findMany({
    where: { guildId, enabled: true },
    orderBy: [{ sortOrder: 'asc' }, { level: 'asc' }, { createdAt: 'asc' }],
  });
};

export const createStaffRole = async (
  guildId: string,
  name: string,
  level: number,
  discordRoleId?: string,
  color?: string
) => {
  const lastRole = await prisma.staffRole.findFirst({
    where: { guildId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  return prisma.staffRole.create({
    data: {
      guildId,
      name,
      level,
      discordRoleId,
      color,
      sortOrder: (lastRole?.sortOrder ?? -1) + 1,
    },
  });
};

export const reorderStaffRoles = async (guildId: string, orderedRoleIds: string[]) => {
  const visibleRoles = await prisma.staffRole.findMany({
    where: { guildId, enabled: true },
    select: { id: true },
  });

  const visibleRoleIds = new Set(visibleRoles.map((role) => role.id));
  const normalizedRoleIds = orderedRoleIds.filter((roleId, index, array) => {
    return visibleRoleIds.has(roleId) && array.indexOf(roleId) === index;
  });

  const remainingRoleIds = visibleRoles
    .map((role) => role.id)
    .filter((roleId) => !normalizedRoleIds.includes(roleId));

  const finalRoleIds = [...normalizedRoleIds, ...remainingRoleIds];

  return prisma.$transaction(
    finalRoleIds.map((roleId, index) =>
      prisma.staffRole.update({
        where: { id: roleId },
        data: { sortOrder: index },
      })
    )
  );
};

export const createAPIKey = async (
  guildId: string,
  createdByUserId: string,
  keyHash: string,
  displayKey: string,
  name: string = 'Mon clé API',
  permissions: string[] = ['daily_algo:create_exercise']
) => {
  const resolvedCreatorId = await resolveStaffMemberId(guildId, createdByUserId);
  if (!resolvedCreatorId) {
    throw new Error('Créateur introuvable dans le staff');
  }

  const [, created] = await prisma.$transaction([
    prisma.aPIKey.updateMany({
      where: {
        guildId,
        createdByUserId: resolvedCreatorId,
        isActive: true,
      },
      data: { isActive: false },
    }),
    prisma.aPIKey.create({
      data: {
        guildId,
        createdByUserId: resolvedCreatorId,
        keyHash,
        displayKey,
        name,
        permissions,
      },
    }),
  ]);

  return created;
};

export const getAPIKeys = async (guildId: string, createdByUserId?: string) => {
  let resolvedCreatorId: string | null = null;
  if (createdByUserId) {
    resolvedCreatorId = await resolveStaffMemberId(guildId, createdByUserId);
    if (!resolvedCreatorId) {
      return [];
    }
  }

  return prisma.aPIKey.findMany({
    where: {
      guildId,
      isActive: true,
      ...(resolvedCreatorId ? { createdByUserId: resolvedCreatorId } : {}),
    },
    select: {
      id: true,
      displayKey: true,
      name: true,
      permissions: true,
      isActive: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });
};

export const deleteAPIKey = async (id: string) => {
  return prisma.aPIKey.update({
    where: { id },
    data: { isActive: false },
  });
};

export const verifyAPIKey = async (keyHash: string, guildId: string) => {
  const key = await prisma.aPIKey.findUnique({
    where: { keyHash },
  });

  if (!key || key.guildId !== guildId || !key.isActive) {
    return null;
  }

  // Mettre à jour lastUsedAt
  await prisma.aPIKey.update({
    where: { id: key.id },
    data: { lastUsedAt: new Date() },
  });

  return key;
};

export const recordStaffActivity = async (
  guildId: string,
  staffUserId: string,
  activityDate: Date,
  messageCount: number = 0,
  voiceMinutes: number = 0
) => {
  const resolvedStaffMemberId = await resolveStaffMemberId(guildId, staffUserId);

  // Les activités de non-staff sont ignorées sans erreur.
  if (!resolvedStaffMemberId) {
    return null;
  }

  const dateKey = activityDate.toISOString().split('T')[0];
  const date = new Date(`${dateKey}T00:00:00Z`);

  return prisma.staffActivity.upsert({
    where: {
      guildId_staffUserId_activityDate: {
        guildId,
        staffUserId: resolvedStaffMemberId,
        activityDate: date,
      },
    },
    create: {
      guildId,
      staffUserId: resolvedStaffMemberId,
      activityDate: date,
      messageCount,
      voiceMinutes,
    },
    update: {
      messageCount: { increment: messageCount },
      voiceMinutes: { increment: voiceMinutes },
    },
  });
};
