import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  type Client,
  type TextChannel,
} from 'discord.js';
import { SanctionType } from '@prisma/client';
import jwt from 'jsonwebtoken';
import WebSocket, { WebSocketServer } from 'ws';
import prisma from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { translate } from '../services/translationService.js';
import { sendApprovedItem } from '../services/notificationService.js';
import { applyTopicFeedback, extractInterestTopics } from '../services/interestService.js';
import { publishOrUpdateRegulationMessage } from '../services/regulationService.js';
import {
  registerBanSanction,
  registerKickSanction,
  registerTimeoutSanction,
  registerWarnSanction,
  runGuildBan,
} from '../services/sanctionService.js';
import {
  COMMAND_CATALOG,
  normalizeCommandRestrictions,
  type CommandRestrictionRule,
} from '../utils/commandAccess.js';
import { getDailyAlgoUserProfile, getDailyAlgoUserParticipations, getLocalDateKey, reviewDailyAlgoSubmission } from '../services/dailyAlgoService.js';
import {
  hashAPIKey,
  generateAPIKey,
  getStaffMember,
  addStaffMember,
  toggleTutorStatus,
  updateStaffGrade,
  removeStaffMember,
  getStaffMemberStats,
  issueStaffWarning,
  blacklistStaff,
  getActiveBlacklist,
  createTestingPeriod,
  addMentorReport,
  endTestingPeriod,
  getStaffRoles,
  createStaffRole,
  reorderStaffRoles,
  createAPIKey,
  getAPIKeys,
  deleteAPIKey,
  verifyAPIKey,
  recordStaffActivity,
} from '../services/staffManagementService.js';
import {
  getPolls,
  createPoll,
  castPollVote,
  getAbsences,
  createAbsence,
  getMeetings,
  updateAbsenceStatus,
  getManagerNotes,
  createManagerNote,
  deleteManagerNote,
  getStaffAlertsAndProgression,
  createMeeting,
  updateMeeting,
  deleteMeeting,
  syncMeetingPresencesWithAbsences,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  createNotification
} from '../services/staffLeadershipService.js';
import {
  getCandidatures,
  createCandidature,
  getEligibleTutors,
  updateCandidatureStatus,
  deleteCandidature as deleteRecruitmentCandidature,
  approveCandidature,
  rejectCandidature,
  completeOral,
  assignTutor,
} from '../services/recruitmentService.js';

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'kotbo-secret-key-123';
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:5173';
const DEFAULT_TRANSLATION_TARGET_LANG = 'FR';


type ModuleStatus = 'active' | 'inactive' | 'error';
type FeedStatus = 'ok' | 'warning' | 'error';
type ContentStatus = 'planifie' | 'envoye' | 'erreur';
type SeverityLevel = 'off' | 'info' | 'attention' | 'critique';

type ModuleItem = {
  id: string;
  name: string;
  description: string;
  status: ModuleStatus;
  uptime: number;
  interactions: number;
  lastSync: string;
  errorMessage?: string;
};

type FeedItem = {
  id: string;
  name: string;
  url: string;
  category: string;
  targetChannel: string;
  scanMinutes: number;
  enabled: boolean;
  includeKeywords: string[];
  excludeKeywords: string[];
  lastCheck: string;
  lastStatus: FeedStatus;
};

type ContentItem = {
  id: string;
  source: string;
  url: string;
  titleOriginal: string;
  title: string;
  excerptOriginal: string;
  excerpt: string;
  author: string;
  targetChannel: string;
  status: ContentStatus;
  filteredOut: boolean;
  scheduleAt: string;
  createdAt: string;
  filterReason?: string;
  errorMessage?: string;
};

type NotificationSettings = {
  discordChannel: string;
  email: string;
  emailEnabled: boolean;
  cloudBackup: boolean;
  debugLog: boolean;
  killSwitchEnabled: boolean;
  severityByModule: Array<{ module: string; level: SeverityLevel }>;
};

type AuditEntry = {
  id: string;
  user: string;
  action: string;
  context: string;
  module: string;
  eventType: string;
  source: 'dashboard' | 'discord';
  details: string;
  dateIso: string;
  channelId: string | null;
};

type DashboardSanctionType = 'WARN' | 'KICK' | 'TIMEOUT' | 'TEMP_BAN' | 'BAN';
type DashboardSanctionStatus = 'ACTIVE' | 'RESOLVED' | 'FAILED';

type SanctionItem = {
  id: string;
  type: DashboardSanctionType;
  status: DashboardSanctionStatus;
  targetUserId: string;
  targetTag: string;
  moderatorUserId: string;
  moderatorTag: string;
  reason: string;
  durationSeconds: number | null;
  expiresAt: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
};

type SanctionReportItem = {
  id: string;
  sanctionId: string | null;
  staffPseudo: string;
  incidentAt: string;
  memberPseudo: string;
  memberReference: string;
  sanctionType: DashboardSanctionType;
  sanctionDurationLabel: string | null;
  brokenRules: string;
  detailedReason: string;
  evidenceLinks: string[];
  additionalNotes: string | null;
  createdByUserId: string;
  createdByTag: string | null;
  createdAt: string;
};

type RegulationRuleItem = {
  id: string;
  title: string;
  description: string;
  emoji: string | null;
  sortOrder: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type AnalyticsData = {
  activityTrend: number[];
  totalAutomations: number;
  contentStatusDistribution: { label: string; value: number }[];
  translationCount: number;
  healthStatus: number;
};

type DashboardChannel = {
  id: string;
  name: string;
  mention: string;
};

type DashboardRole = {
  id: string;
  name: string;
  mention: string;
  permissions: string[];
};

type MemberCaseQuickAction = 'WARN' | 'KICK' | 'TIMEOUT' | 'BAN';

type MemberCaseLogEntry = {
  id: string;
  user: string;
  action: string;
  context: string;
  module: string;
  eventType: string;
  source: 'dashboard' | 'discord';
  details: string;
  dateIso: string;
  channelId: string | null;
};

type MemberCaseChannelMessage = {
  id: string;
  channelId: string;
  channelName: string;
  content: string;
  dateIso: string;
};

type MemberCaseChannelSummary = {
  channelId: string;
  channelName: string;
  count: number;
  lastMessageAt: string | null;
  recentMessages: MemberCaseChannelMessage[];
};

type MemberCaseInviteInfo = {
  code: string | null;
  inviterId: string | null;
  inviterTag: string | null;
  joinedAt: string | null;
};

type MemberCaseProfile = {
  id: string;
  userId: string;
  userTag: string | null;
  username: string | null;
  globalName: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  accentColor: number | null;
  locale: string | null;
  isBot: boolean;
  accountCreatedAt: string | null;
  guildJoinedAt: string | null;
  guildLeftAt: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  lastMessageAt: string | null;
  lastMessageChannelId: string | null;
  messageCount: number;
  voiceSessionCount: number;
  voiceTimeSeconds: number;
  voiceLastChannelId: string | null;
  voiceLastJoinedAt: string | null;
  voiceLastLeftAt: string | null;
  rolesSnapshot: string[];
  presenceStatus: string | null;
  pronouns: string | null;
};

type MemberCaseResponse = {
  profile: MemberCaseProfile | null;
  invite: MemberCaseInviteInfo | null;
  roles: DashboardRole[];
  effectivePermissions: string[];
  sanctions: SanctionItem[];
  logs: MemberCaseLogEntry[];
  messagesByChannel: MemberCaseChannelSummary[];
  recentMessageCount: number;
  recentLogCount: number;
  connections: Array<{ name: string; type: string; visible: boolean }>;
  connectionsNote: string;
};

type CommandRestrictionState = CommandRestrictionRule;

type CommandCatalogEntry = {
  name: string;
  label: string;
  description: string;
  defaultAccess: 'tout_le_monde' | 'modération' | 'administration';
};

type DashboardAccessLevel = 'none' | 'moderator' | 'admin';

type DashboardAccess = {
  level: DashboardAccessLevel;
  canViewDashboard: boolean;
  canModerateContent: boolean;
  canManageSettings: boolean;
};

function resolveDailyAlgoFinalScore(submission: {
  scoreFinal: number | null;
  scoreCorrectness: number | null;
  scoreComments: number | null;
  scoreCompactness: number | null;
  scoreOptimization: number | null;
  scoreReadability: number | null;
}): number | null {
  if (submission.scoreFinal !== null) {
    return submission.scoreFinal;
  }

  const components = [
    submission.scoreCorrectness,
    submission.scoreComments,
    submission.scoreCompactness,
    submission.scoreOptimization,
    submission.scoreReadability,
  ];

  if (components.some((value) => value === null)) {
    return null;
  }

  const sum = (components as number[]).reduce((acc, value) => acc + value, 0);
  return Math.round((sum / 5) * 10) / 10;
}

type DashboardState = {
  guildName: string;
  configChannelId: string;
  logChannelId: string;
  regulationChannelId: string;
  regulationMessageId: string | null;
  recruitmentCategoryId: string;
  recruitmentLogChannelId: string;
  recruitmentAutoRejectEnabled: boolean;
  modules: ModuleItem[];
  feeds: FeedItem[];
  contentItems: ContentItem[];
  discordChannels: DashboardChannel[];
  discordVoiceChannels: DashboardChannel[];
  discordRoles: DashboardRole[];
  moderatorRoleId: string;
  commandRestrictions: CommandRestrictionState[];
  commandCatalog: CommandCatalogEntry[];
  access: {
    level: Exclude<DashboardAccessLevel, 'none'>;
    canModerateContent: boolean;
    canManageSettings: boolean;
  };
  youtubeReferenceChannelId: string;
  notifications: NotificationSettings;
  auditTrail: AuditEntry[];
  sanctions: SanctionItem[];
  sanctionReports: SanctionReportItem[];
  regulationRules: RegulationRuleItem[];
  messageTemplate: string;
  analytics: AnalyticsData;
};

type RuntimeState = {
  email: string;
  emailEnabled: boolean;
  cloudBackup: boolean;
  debugLog: boolean;
  killSwitchEnabled: boolean;
  severityByModule: Array<{ module: string; level: SeverityLevel }>;
  commandRestrictions: CommandRestrictionState[];
  messageTemplate: string;
};

const MODULE_DESCRIPTIONS: Record<string, string> = {
  rss: 'Synchronisation automatique des articles depuis vos sources externes.',
  youtube: 'Surveillance des chaînes et publication automatique.',
  codepolice: 'Vérification de la syntaxe et bonnes pratiques sur les snippets.',
  dailyalgo: "Génération quotidienne d'un défi d'algorithmique.",
  traduction: 'Traduction instantanée vers la langue configurée.',
  personnalise: 'Agrégateur multi-sources avec filtrage par mots-clés.'
};

const DEFAULT_SEVERITY_BY_MODULE: Array<{ module: string; level: SeverityLevel }> = [
  { module: 'Auto-Modération', level: 'attention' },
  { module: 'Flux RSS / Contenu', level: 'critique' },
  { module: 'YouTube', level: 'attention' },
  { module: 'Daily Algo', level: 'info' }
];

const DEFAULT_MESSAGE_TEMPLATE =
  '🔔 {titre}\n\n{resume}\n\nSource: {source}\nAuteur: {auteur}\n\nPublié automatiquement par Kotbo.';

const recruitmentAutoRejectEnabledByGuild = new Map<string, boolean>();

const isRecruitmentAutoRejectEnabled = (guildId: string) => {
  return recruitmentAutoRejectEnabledByGuild.get(guildId) ?? true;
};

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const nowIso = () => new Date().toISOString();

function getDailyAlgoDateKeyWithOffset(offsetDays: number, baseDate = new Date()): string {
  const anchor = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), baseDate.getUTCDate()));
  anchor.setUTCDate(anchor.getUTCDate() + offsetDays);

  const year = anchor.getUTCFullYear();
  const month = String(anchor.getUTCMonth() + 1).padStart(2, '0');
  const day = String(anchor.getUTCDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

async function getDailyAlgoScheduleRuns(guildId: string, daysBack: number, daysForward: number) {
  const safeDaysBack = Math.max(0, Math.trunc(daysBack));
  const safeDaysForward = Math.max(0, Math.trunc(daysForward));
  const startDateKey = getDailyAlgoDateKeyWithOffset(-safeDaysBack);
  const endDateKey = getDailyAlgoDateKeyWithOffset(safeDaysForward);

  const runs = await prisma.dailyAlgoRun.findMany({
    where: {
      guildId,
      dateKey: {
        gte: startDateKey,
        lte: endDateKey,
      },
    },
    include: {
      problem: true,
      _count: {
        select: {
          submissions: true,
        },
      },
    },
    orderBy: {
      dateKey: 'asc',
    },
  });

  return runs.map((run) => ({
    id: run.id,
    guildId: run.guildId,
    dateKey: run.dateKey,
    problemId: run.problemId,
    challengeChannelId: run.challengeChannelId,
    validationChannelId: run.validationChannelId,
    challengeMessageId: run.challengeMessageId,
    leaderboardMessageId: run.leaderboardMessageId,
    summarySentAt: run.summarySentAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    submissionsCount: run._count.submissions,
    problem: {
      id: run.problem.id,
      title: run.problem.title,
      description: run.problem.description,
      solution: run.problem.solution,
      difficulty: run.problem.difficulty,
      language: run.problem.language,
      functionName: run.problem.functionName,
      functionArgs: run.problem.functionArgs,
      unitTests: run.problem.unitTests,
      allowedLanguages: run.problem.allowedLanguages,
      usedAt: run.problem.usedAt?.toISOString() ?? null,
      createdAt: run.problem.createdAt.toISOString(),
      updatedAt: run.problem.updatedAt.toISOString(),
    },
  }));
}

async function ensureDailyAlgoScheduleRuns(guildId: string, daysForward: number) {
  const safeDaysForward = Math.max(1, Math.trunc(daysForward));
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: {
      id: true,
      dailyAlgoChannelId: true,
      dailyAlgoValidationChannelId: true,
    },
  });

  if (!guild) {
    throw new Error('Guilde introuvable.');
  }

  if (!guild.dailyAlgoChannelId) {
    throw new Error('Le salon Daily Algo doit être configuré avant de générer le planning.');
  }

  const createdDateKeys: string[] = [];

  for (let offsetDays = 0; offsetDays <= safeDaysForward; offsetDays += 1) {
    const dateKey = getDailyAlgoDateKeyWithOffset(offsetDays);
    const existingRun = await prisma.dailyAlgoRun.findUnique({
      where: {
        guildId_dateKey: {
          guildId,
          dateKey,
        },
      },
      select: {
        id: true,
      },
    });

    if (existingRun) {
      continue;
    }

    const problemCandidate = await prisma.dailyAlgoProblem.findFirst({
      where: {
        language: 'fr',
        usedAt: null,
      },
      orderBy: [
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
      select: {
        id: true,
      },
    });

    if (!problemCandidate) {
      break;
    }

    await prisma.$transaction(async (tx) => {
      await tx.dailyAlgoRun.create({
        data: {
          guildId,
          dateKey,
          problemId: problemCandidate.id,
          challengeChannelId: guild.dailyAlgoChannelId!,
          validationChannelId: guild.dailyAlgoValidationChannelId ?? null,
        },
        select: {
          id: true,
        },
      });

      const reservedProblem = await tx.dailyAlgoProblem.updateMany({
        where: {
          id: problemCandidate.id,
          usedAt: null,
        },
        data: {
          usedAt: new Date(),
        },
      });

      if (reservedProblem.count === 0) {
        throw new Error('Le problème Daily Algo a déjà été réservé.');
      }

      createdDateKeys.push(dateKey);
    });
  }

  return {
    createdDateKeys,
    createdCount: createdDateKeys.length,
  };
}

function normalizeLangCode(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) return null;
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

function isDashboardSanctionType(value: string): value is DashboardSanctionType {
  return value === 'WARN' || value === 'KICK' || value === 'TIMEOUT' || value === 'TEMP_BAN' || value === 'BAN';
}

function toSanctionType(value: DashboardSanctionType): SanctionType {
  return value as SanctionType;
}

function parseEvidenceLinks(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => /^https?:\/\//i.test(entry));
}

function formatSanctionDurationLabel(seconds: number | null): string | null {
  if (!seconds) return null;

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];

  if (days) parts.push(`${days}j`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);

  return parts.length > 0 ? parts.join(' ') : `${seconds}s`;
}

function normalizeBrokenRulesPayload(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      return trimmed;
    }

    const normalized = parsed
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;

        const snapshot = entry as Record<string, unknown>;
        const id = typeof snapshot.id === 'string' ? snapshot.id.trim() : '';
        if (!id) return null;

        const title = typeof snapshot.title === 'string'
          ? snapshot.title.trim()
          : typeof snapshot.label === 'string'
            ? snapshot.label.trim()
            : '';

        const description = typeof snapshot.description === 'string'
          ? snapshot.description.trim()
          : typeof snapshot.details === 'string'
            ? snapshot.details.trim()
            : '';

        if (!title || !description) return null;

        const emoji = typeof snapshot.emoji === 'string' && snapshot.emoji.trim() ? snapshot.emoji.trim() : null;
        const sortOrder = typeof snapshot.sortOrder === 'number' && Number.isFinite(snapshot.sortOrder) ? snapshot.sortOrder : 0;

        return {
          id,
          title,
          description,
          emoji,
          sortOrder,
        };
      })
      .filter((entry): entry is { id: string; title: string; description: string; emoji: string | null; sortOrder: number } => !!entry);

    return normalized.length > 0 ? JSON.stringify(normalized) : trimmed;
  } catch {
    return trimmed;
  }
}

const toRuntimeState = (settings: {
  email: string;
  emailEnabled: boolean;
  cloudBackup: boolean;
  debugLog: boolean;
  killSwitchEnabled: boolean;
  severityByModule: unknown;
  commandRestrictions: unknown;
  messageTemplate: string;
}): RuntimeState => {
  const rawSeverity = Array.isArray(settings.severityByModule)
    ? settings.severityByModule
    : DEFAULT_SEVERITY_BY_MODULE;

  const severityByModule = rawSeverity
    .map((item) => {
      if (!item || typeof item !== 'object') return null;

      const module = (item as Record<string, unknown>).module;
      const level = (item as Record<string, unknown>).level;
      const allowedLevels: SeverityLevel[] = ['off', 'info', 'attention', 'critique'];

      if (typeof module !== 'string' || typeof level !== 'string' || !allowedLevels.includes(level as SeverityLevel)) {
        return null;
      }

      return { module, level: level as SeverityLevel };
    })
    .filter((entry): entry is { module: string; level: SeverityLevel } => !!entry);

  return {
    email: settings.email,
    emailEnabled: settings.emailEnabled,
    cloudBackup: settings.cloudBackup,
    debugLog: settings.debugLog,
    killSwitchEnabled: settings.killSwitchEnabled,
    severityByModule: severityByModule.length > 0 ? severityByModule : DEFAULT_SEVERITY_BY_MODULE,
    commandRestrictions: normalizeCommandRestrictions(settings.commandRestrictions),
    messageTemplate: settings.messageTemplate || DEFAULT_MESSAGE_TEMPLATE
  };
};

const json = (res: ServerResponse, statusCode: number, data: unknown) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
    'Access-Control-Max-Age': '86400'
  });
  res.end(JSON.stringify(data));
};

type AuthClaims = {
  userId: string;
  username?: string;
  avatar?: string;
  discordToken?: string;
};

const verifyAuth = (req: IncomingMessage): AuthClaims | null => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  try {
    return jwt.verify(token, JWT_SECRET) as AuthClaims;
  } catch {
    return null;
  }
};

type RecruitmentWebhookAuthResult = {
  auth: AuthClaims | null;
  reason: 'ok_jwt' | 'ok_api_key' | 'missing_credentials' | 'invalid_jwt' | 'invalid_api_key';
};

const verifyRecruitmentWebhookAuth = async (req: IncomingMessage, guildId: string): Promise<RecruitmentWebhookAuthResult> => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      return {
        auth: jwt.verify(token, JWT_SECRET) as AuthClaims,
        reason: 'ok_jwt',
      };
    } catch {
      // ignore and try API key below
    }
  }

  const apiKey = req.headers['x-kotbo-api-key'] ?? req.headers['x-api-key'];
  const apiKeyValue = Array.isArray(apiKey) ? apiKey[0] : apiKey;
  if (!apiKeyValue || typeof apiKeyValue !== 'string') {
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return { auth: null, reason: 'invalid_jwt' };
    }
    return { auth: null, reason: 'missing_credentials' };
  }

  const key = await verifyAPIKey(hashAPIKey(apiKeyValue.trim()), guildId);
  if (!key) return { auth: null, reason: 'invalid_api_key' };

  return {
    auth: {
      userId: key.createdByUserId,
      username: key.name,
    },
    reason: 'ok_api_key',
  };
};

const getAuditActor = (auth: AuthClaims) => {
  const username = auth.username?.trim();
  if (username) return username;
  return `Utilisateur ${auth.userId.slice(0, 8)}`;
};

const DISCORD_PERMISSION_ADMINISTRATOR = BigInt(0x8);
const DISCORD_PERMISSION_MANAGE_GUILD = BigInt(0x20);

const hasDashboardAdminPermission = (permissions: bigint) => {
  return (permissions & DISCORD_PERMISSION_ADMINISTRATOR) === DISCORD_PERMISSION_ADMINISTRATOR
    || (permissions & DISCORD_PERMISSION_MANAGE_GUILD) === DISCORD_PERMISSION_MANAGE_GUILD;
};

const DASHBOARD_ACCESS_NONE: DashboardAccess = {
  level: 'none',
  canViewDashboard: false,
  canModerateContent: false,
  canManageSettings: false,
};

const DASHBOARD_ACCESS_MODERATOR: DashboardAccess = {
  level: 'moderator',
  canViewDashboard: true,
  canModerateContent: true,
  canManageSettings: false,
};

const DASHBOARD_ACCESS_ADMIN: DashboardAccess = {
  level: 'admin',
  canViewDashboard: true,
  canModerateContent: true,
  canManageSettings: true,
};

const resolveDashboardAccess = async (
  client: Client,
  guildId: string,
  userId: string,
  knownPermissions?: bigint | null,
): Promise<DashboardAccess> => {
  const guildConfig = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { moderatorRoleId: true }
  });

  if (!guildConfig) return DASHBOARD_ACCESS_NONE;

  if (knownPermissions !== null && knownPermissions !== undefined && hasDashboardAdminPermission(knownPermissions)) {
    return DASHBOARD_ACCESS_ADMIN;
  }

  const discordGuild = client.guilds.cache.get(guildId);
  if (!discordGuild) return DASHBOARD_ACCESS_NONE;

  const member = await discordGuild.members.fetch(userId).catch(() => null);
  if (!member) return DASHBOARD_ACCESS_NONE;

  if (member.permissions.has('Administrator') || member.permissions.has('ManageGuild')) {
    return DASHBOARD_ACCESS_ADMIN;
  }

  const staffProfile = await prisma.staffMember.findUnique({
    where: { guildId_userId: { guildId, userId } },
    select: { id: true },
  });

  if (!staffProfile) {
    return DASHBOARD_ACCESS_NONE;
  }

  if (guildConfig.moderatorRoleId && member.roles.cache.has(guildConfig.moderatorRoleId)) {
    return DASHBOARD_ACCESS_MODERATOR;
  }

  return DASHBOARD_ACCESS_NONE;
};



const readJsonBody = async <T>(req: IncomingMessage): Promise<T | null> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  if (chunks.length === 0) return null;
  const raw = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(raw) as T;
};

const truncate = (value?: string | null, length = 160) => {
  if (!value) return '';
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
};

const DASHBOARD_CONTENT_EXCERPT_LENGTH = 160;

const prepareDescriptionForTranslation = (value?: string | null) => {
  if (!value) return '';
  return truncate(value.trim(), DASHBOARD_CONTENT_EXCERPT_LENGTH);
};

const mapFeedStatus = (value?: string | null, hasError = false): FeedStatus => {
  if (hasError) return 'error';
  if (!value) return 'ok';
  if (value.toLowerCase().includes('error')) return 'error';
  if (value.toLowerCase().includes('warn')) return 'warning';
  return 'ok';
};

const mapContentStatus = (value: 'PENDING' | 'APPROVED' | 'REJECTED'): ContentStatus => {
  if (value === 'APPROVED') return 'envoye';
  if (value === 'REJECTED') return 'erreur';
  return 'planifie';
};

const deleteValidationQueueMessage = async (client: Client, guildId: string, queueMessageId: string | null) => {
  if (!queueMessageId) return;

  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { configChannelId: true }
  });

  if (!guild?.configChannelId) return;

  const channel = await client.channels.fetch(guild.configChannelId).catch(() => null) as TextChannel | null;
  if (!channel) return;

  await channel.messages.delete(queueMessageId).catch(() => null);
};

const approveContentFromDashboard = async (client: Client, guildId: string, contentId: string, userId: string) => {
  const item = await prisma.feedItem.findUnique({
    where: { id: contentId },
    include: { feed: true }
  });

  if (!item || item.feed.guildId !== guildId) {
    throw new Error('Contenu introuvable pour ce serveur.');
  }

  await sendApprovedItem(client, item.id, 'rss');
  await deleteValidationQueueMessage(client, guildId, item.queueMessageId);

  await prisma.feedItem.update({
    where: { id: item.id },
    data: { queueMessageId: null }
  });

  const topics = item.topics.length > 0 ? item.topics : extractInterestTopics(item.title, item.description);
  await applyTopicFeedback({
    guildId,
    userId,
    topics,
    source: 'STAFF_APPROVE',
    isPositive: true,
    feedItemId: item.id,
    applyToGuildProfile: true,
  });
};

const rejectContentFromDashboard = async (client: Client, guildId: string, contentId: string, userId: string) => {
  const item = await prisma.feedItem.findUnique({
    where: { id: contentId },
    include: { feed: true }
  });

  if (!item || item.feed.guildId !== guildId) {
    throw new Error('Contenu introuvable pour ce serveur.');
  }

  await prisma.feedItem.update({
    where: { id: item.id },
    data: {
      status: 'REJECTED',
      queueMessageId: null,
    }
  });

  await deleteValidationQueueMessage(client, guildId, item.queueMessageId);

  const topics = item.topics.length > 0 ? item.topics : extractInterestTopics(item.title, item.description);
  await applyTopicFeedback({
    guildId,
    userId,
    topics,
    source: 'STAFF_REJECT',
    isPositive: false,
    feedItemId: item.id,
    applyToGuildProfile: true,
  });
};

const getOrCreateRuntime = async (guildId: string): Promise<RuntimeState> => {
  const settings = await prisma.dashboardSettings.upsert({
    where: { guildId },
    update: {},
    create: {
      guildId,
      email: '',
      emailEnabled: false,
      cloudBackup: true,
      debugLog: false,
      killSwitchEnabled: false,
      severityByModule: DEFAULT_SEVERITY_BY_MODULE,
      commandRestrictions: [],
      messageTemplate: DEFAULT_MESSAGE_TEMPLATE
    }
  });

  return toRuntimeState(settings);
};

const pushAudit = async (guildId: string, entry: Omit<AuditEntry, 'id' | 'dateIso' | 'source'>) => {
  await prisma.dashboardAuditLog.create({
    data: {
      guildId,
      channelId: entry.channelId,
      user: entry.user,
      action: entry.action,
      context: entry.context,
      module: entry.module,
      eventType: entry.eventType,
      details: entry.details,
      dateIso: new Date()
    }
  });
};

function formatChannelName(guild: { channels: { cache: Map<string, { id: string; name?: string }> } } | null, channelId: string | null): string {
  if (!channelId) return 'Aucun';
  const channel = guild?.channels.cache.get(channelId);
  return channel?.name ? `#${channel.name}` : `Salon ${channelId}`;
}

function extractDiscordSnowflake(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/[^0-9]/g, '');
  return normalized.length > 0 ? normalized : null;
}

function parseCaseField(details: string, label: string): string | null {
  const match = details.match(new RegExp(`${label}:\\s*([^\\n|]+)`, 'i'));
  const value = match?.[1]?.trim();
  return value && value.length > 0 ? value : null;
}

function parseInviteFromDetails(details: string): MemberCaseInviteInfo | null {
  const inviteCode = parseCaseField(details, 'Invite utilisée') ?? parseCaseField(details, 'Invite d\'arrivée');
  const inviter = parseCaseField(details, 'Créateur de l\'invite');
  const inviterId = parseCaseField(details, 'ID créateur');

  if (!inviteCode && !inviter && !inviterId) return null;

  const inviterMentionMatch = inviter?.match(/<@!?([0-9]+)>/);
  const normalizedInviter = inviter?.replace(/\s*\(<@!?[0-9]+>\)\s*$/, '').trim() || null;

  return {
    code: inviteCode,
    inviterId: inviterId ?? inviterMentionMatch?.[1] ?? null,
    inviterTag: normalizedInviter,
    joinedAt: null,
  };
}

function extractMessagePreview(details: string): string | null {
  const content = parseCaseField(details, 'Contenu');
  if (!content) return null;
  return content === '_vide_' ? '' : content;
}

function mapGuildRolePermissions(role: { id: string; name: string; permissions?: { toArray: () => string[] } | string[] }, mention: string): DashboardRole {
  const permissions = Array.isArray(role.permissions)
    ? role.permissions
    : typeof role.permissions?.toArray === 'function'
      ? role.permissions.toArray()
      : [];

  return {
    id: role.id,
    name: role.name,
    mention,
    permissions,
  };
}

async function fetchMemberConnections(discordToken?: string | null): Promise<{ connections: Array<{ name: string; type: string; visible: boolean }>; note: string }> {
  if (!discordToken) {
    return {
      connections: [],
      note: 'Connexions indisponibles sans jeton OAuth.',
    };
  }

  try {
    const response = await fetch('https://discord.com/api/users/@me/connections', {
      headers: { Authorization: `Bearer ${discordToken}` },
    });

    if (!response.ok) {
      return {
        connections: [],
        note: 'Connexions non exposées par le jeton OAuth actuel.',
      };
    }

    const payload = await response.json() as Array<{ name?: string; type?: string; visibility?: number }>;
    return {
      connections: Array.isArray(payload)
        ? payload.map((connection) => ({
            name: connection.name ?? 'Inconnue',
            type: connection.type ?? 'inconnue',
            visible: connection.visibility === 1,
          }))
        : [],
      note: 'Connexions récupérées via le scope OAuth connections.',
    };
  } catch {
    return {
      connections: [],
      note: 'Impossible de récupérer les connexions depuis Discord.',
    };
  }
}

async function buildMemberCaseData(client: Client, guildId: string, userId: string, auth: AuthClaims): Promise<MemberCaseResponse | null> {
  const discordGuild = client.guilds.cache.get(guildId);
  if (!discordGuild) return null;

  const [user, member, profile, sanctions, auditLogs, inviteConnections] = await Promise.all([
    client.users.fetch(userId).catch(() => null),
    discordGuild.members.fetch(userId).catch(() => null),
    prisma.memberProfile.findUnique({
      where: {
        guildId_userId: {
          guildId,
          userId,
        },
      },
    }),
    prisma.sanction.findMany({
      where: { guildId, targetUserId: userId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.dashboardAuditLog.findMany({
      where: { guildId },
      orderBy: { dateIso: 'desc' },
      take: 500,
    }),
    fetchMemberConnections(auth.userId === userId ? auth.discordToken : null),
  ]);

  const effectivePermissions = member?.permissions.toArray() ?? [];
  const roles = member
    ? [...member.roles.cache.values()]
        .filter((role) => role.id !== discordGuild.id)
        .map((role) => mapGuildRolePermissions(role, `<@&${role.id}>`))
        .sort((left, right) => {
          const positionLeft = discordGuild.roles.cache.get(left.id)?.position ?? 0;
          const positionRight = discordGuild.roles.cache.get(right.id)?.position ?? 0;
          return positionRight - positionLeft || left.name.localeCompare(right.name, 'fr');
        })
    : [];

  const tagCandidates = new Set<string>([user?.tag, profile?.userTag, member?.user.tag].filter((entry): entry is string => !!entry));

  const relevantLogs = auditLogs.filter((entry) => {
    const haystack = `${entry.user} ${entry.details}`;
    if (haystack.includes(`<@${userId}>`) || haystack.includes(`<@!${userId}>`)) return true;
    if ([...tagCandidates].some((candidate) => candidate && haystack.includes(candidate))) return true;
    if (entry.channelId && entry.module === 'Messages' && entry.user.includes(userId)) return true;
    return false;
  });

  const mappedLogs: MemberCaseLogEntry[] = relevantLogs.slice(0, 120).map((entry) => ({
    id: entry.id,
    user: entry.user,
    action: entry.action,
    context: entry.context,
    module: entry.module,
    eventType: entry.eventType,
    source: entry.eventType === 'Discord' ? 'discord' : 'dashboard',
    details: entry.details,
    dateIso: entry.dateIso.toISOString(),
    channelId: entry.channelId,
  }));

  const invite = mappedLogs
    .map((entry) => parseInviteFromDetails(entry.details))
    .find((entry): entry is MemberCaseInviteInfo => !!entry) ?? null;

  const messages = relevantLogs
    .filter((entry) => entry.module === 'Messages' && entry.action === 'Message envoyé')
    .slice(0, 250)
    .map((entry) => ({
      id: entry.id,
      channelId: entry.channelId ?? 'unknown',
      channelName: formatChannelName(discordGuild, entry.channelId),
      content: extractMessagePreview(entry.details) ?? entry.details,
      dateIso: entry.dateIso.toISOString(),
    }));

  const messagesByChannelMap = new Map<string, MemberCaseChannelSummary>();
  for (const message of messages) {
    const current = messagesByChannelMap.get(message.channelId) ?? {
      channelId: message.channelId,
      channelName: message.channelName,
      count: 0,
      lastMessageAt: null,
      recentMessages: [],
    };

    current.count += 1;
    current.lastMessageAt = message.dateIso;
    if (current.recentMessages.length < 5) {
      current.recentMessages.push(message);
    }
    messagesByChannelMap.set(message.channelId, current);
  }

  return {
    profile: {
      id: profile?.id ?? `${guildId}:${userId}`,
      userId,
      userTag: user?.tag ?? profile?.userTag ?? null,
      username: user?.username ?? profile?.username ?? null,
      globalName: user?.globalName ?? profile?.globalName ?? null,
      displayName: member?.displayName ?? profile?.displayName ?? user?.globalName ?? user?.username ?? null,
      avatarUrl: profile?.avatarUrl ?? user?.displayAvatarURL({ size: 256 }) ?? null,
      bannerUrl: profile?.bannerUrl ?? null,
      accentColor: profile?.accentColor ?? user?.accentColor ?? null,
      locale: profile?.locale ?? null,
      isBot: profile?.isBot ?? user?.bot ?? false,
      accountCreatedAt: profile?.accountCreatedAt?.toISOString() ?? user?.createdAt?.toISOString() ?? null,
      guildJoinedAt: profile?.guildJoinedAt?.toISOString() ?? member?.joinedAt?.toISOString() ?? null,
      guildLeftAt: profile?.guildLeftAt?.toISOString() ?? null,
      firstSeenAt: profile?.firstSeenAt?.toISOString() ?? null,
      lastSeenAt: profile?.lastSeenAt?.toISOString() ?? null,
      lastMessageAt: profile?.lastMessageAt?.toISOString() ?? null,
      lastMessageChannelId: profile?.lastMessageChannelId ?? null,
      messageCount: profile?.messageCount ?? 0,
      voiceSessionCount: profile?.voiceSessionCount ?? 0,
      voiceTimeSeconds: profile?.voiceTimeSeconds ?? 0,
      voiceLastChannelId: profile?.voiceLastChannelId ?? null,
      voiceLastJoinedAt: profile?.voiceLastJoinedAt?.toISOString() ?? null,
      voiceLastLeftAt: profile?.voiceLastLeftAt?.toISOString() ?? null,
      rolesSnapshot: profile?.rolesSnapshot ?? [],
      presenceStatus: member?.presence?.status ?? null,
      pronouns: null,
    },
    invite: invite
      ? {
          ...invite,
          joinedAt: invite.joinedAt ?? member?.joinedAt?.toISOString() ?? profile?.guildJoinedAt?.toISOString() ?? null,
        }
      : null,
    roles,
    effectivePermissions,
    sanctions: sanctions.map((entry) => ({
      id: entry.id,
      type: entry.type as DashboardSanctionType,
      status: entry.status as DashboardSanctionStatus,
      targetUserId: entry.targetUserId,
      targetTag: entry.targetTag ?? `Utilisateur ${entry.targetUserId}`,
      moderatorUserId: entry.moderatorUserId,
      moderatorTag: entry.moderatorTag ?? `Modérateur ${entry.moderatorUserId}`,
      reason: entry.reason,
      durationSeconds: entry.durationSeconds,
      expiresAt: entry.expiresAt?.toISOString() ?? null,
      createdAt: entry.createdAt.toISOString(),
      resolvedAt: entry.resolvedAt?.toISOString() ?? null,
      resolutionNote: entry.resolutionNote ?? null,
    })),
    logs: mappedLogs,
    messagesByChannel: [...messagesByChannelMap.values()].sort((left, right) => (right.lastMessageAt ?? '').localeCompare(left.lastMessageAt ?? '')),
    recentMessageCount: messages.length,
    recentLogCount: mappedLogs.length,
    connections: inviteConnections.connections,
    connectionsNote: inviteConnections.note,
  };
}

const getGuildName = (client: Client, guildId: string) => client.guilds.cache.get(guildId)?.name ?? `Serveur ${guildId}`;

const getGuildState = async (client: Client, guildId: string, access: DashboardAccess, userId?: string): Promise<DashboardState | null> => {
  const guild = await prisma.guild.findUnique({ where: { id: guildId } });
  if (!guild) return null;

  const [
    feeds,
    feedItems,
    youtubeItemsCount,
    youtubeApprovedCount,
    youtubePendingCount,
    codePoliceRulesCount,
    dailyAlgoSubmissionCount,
    translatedCount,
    userFeedSubCount,
    lastWeekItems,
    lastWeekYt,
    lastWeekAlgos,
    runtime,
    persistedAudit,
    sanctions,
    sanctionReports,
    regulationRules,
  ] = await Promise.all([
    prisma.feed.findMany({ where: { guildId }, orderBy: { createdAt: 'desc' } }),
    prisma.feedItem.findMany({
      where: { feed: { guildId } },
      include: { feed: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 80
    }),
    prisma.youTubeItem.count({ where: { guildId } }),
    prisma.youTubeItem.count({ where: { guildId, status: 'APPROVED' } }),
    prisma.youTubeItem.count({ where: { guildId, status: 'PENDING' } }),
    prisma.codePoliceRule.count({ where: { OR: [{ guildId }, { guildId: null }], enabled: true } }),
    prisma.dailyAlgoSubmission.count({ where: { run: { guildId } } }),
    prisma.feedItem.count({ where: { feed: { guildId }, OR: [{ titleTranslated: { not: null } }, { descriptionTranslated: { not: null } }] } }),
    prisma.userFeedSub.count({ where: { feed: { guildId } } }),
    prisma.feedItem.findMany({
      where: { feed: { guildId }, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      select: { createdAt: true }
    }),
    prisma.youTubeItem.findMany({
      where: { guildId, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      select: { createdAt: true }
    }),
    prisma.dailyAlgoSubmission.findMany({
      where: { run: { guildId }, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      select: { createdAt: true }
    }),
    getOrCreateRuntime(guildId),
    prisma.dashboardAuditLog.findMany({
      where: { guildId },
      orderBy: { dateIso: 'desc' },
      take: 160
    }),
    prisma.sanction.findMany({
      where: { guildId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.sanctionReport.findMany({
      where: { guildId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.guildRegulationArticle.findMany({
      where: { guildId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
  ]);

  const auditTrailFromDb: AuditEntry[] = persistedAudit.map((entry) => ({
    id: entry.id,
    user: entry.user,
    action: entry.action,
    context: entry.context,
    module: entry.module,
    eventType: entry.eventType,
    source: entry.eventType === 'Discord' ? 'discord' : 'dashboard',
    details: entry.details,
    dateIso: entry.dateIso.toISOString(),
    channelId: entry.channelId
  }));

  const mappedSanctions: SanctionItem[] = sanctions.map((entry) => ({
    id: entry.id,
    type: entry.type as DashboardSanctionType,
    status: entry.status as DashboardSanctionStatus,
    targetUserId: entry.targetUserId,
    targetTag: entry.targetTag ?? `Utilisateur ${entry.targetUserId}`,
    moderatorUserId: entry.moderatorUserId,
    moderatorTag: entry.moderatorTag ?? `Modérateur ${entry.moderatorUserId}`,
    reason: entry.reason,
    durationSeconds: entry.durationSeconds,
    expiresAt: entry.expiresAt?.toISOString() ?? null,
    createdAt: entry.createdAt.toISOString(),
    resolvedAt: entry.resolvedAt?.toISOString() ?? null,
    resolutionNote: entry.resolutionNote ?? null,
  }));

  const mappedSanctionReports: SanctionReportItem[] = sanctionReports.map((entry) => ({
    id: entry.id,
    sanctionId: entry.sanctionId ?? null,
    staffPseudo: entry.staffPseudo,
    incidentAt: entry.incidentAt.toISOString(),
    memberPseudo: entry.memberPseudo,
    memberReference: entry.memberReference,
    sanctionType: entry.sanctionType as DashboardSanctionType,
    sanctionDurationLabel: entry.sanctionDurationLabel ?? null,
    brokenRules: entry.brokenRules,
    detailedReason: entry.detailedReason,
    evidenceLinks: entry.evidenceLinks,
    additionalNotes: entry.additionalNotes ?? null,
    createdByUserId: entry.createdByUserId,
    createdByTag: entry.createdByTag ?? null,
    createdAt: entry.createdAt.toISOString(),
  }));

  const mappedRegulationRules: RegulationRuleItem[] = regulationRules.map((entry) => ({
    id: entry.id,
    title: entry.title,
    description: entry.description,
    emoji: entry.emoji ?? null,
    sortOrder: entry.sortOrder,
    enabled: entry.enabled,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  }));

  const feedMapped: FeedItem[] = feeds.map((feed) => ({
    id: feed.id,
    name: feed.name,
    url: feed.url,
    category: feed.category,
    targetChannel: guild.publicChannelId ? `<#${guild.publicChannelId}>` : '#actualites-generales',
    scanMinutes: 10,
    enabled: feed.enabled,
    includeKeywords: feed.includeKeywords,
    excludeKeywords: feed.excludeKeywords,
    lastCheck: (feed.lastPolledAt ?? feed.updatedAt).toISOString(),
    lastStatus: mapFeedStatus(feed.lastPollStatus, !!feed.lastPollError)
  }));

  const contentItems: ContentItem[] = feedItems.map((item) => ({
    id: item.id,
    source: item.feed.name,
    url: item.url,
    titleOriginal: item.title,
    title: item.titleTranslated ?? item.title,
    excerptOriginal: truncate(item.description),
    excerpt: truncate(item.descriptionTranslated ?? item.description),
    author: item.author ?? 'Inconnu',
    targetChannel: guild.publicChannelId ? `<#${guild.publicChannelId}>` : '#actualites-generales',
    status: mapContentStatus(item.status),
    filteredOut: item.interestDecision === 'FILTERED_OUT',
    scheduleAt: (item.publishedAt ?? item.updatedAt).toISOString(),
    createdAt: item.createdAt.toISOString(),
    filterReason: item.interestDecision === 'FILTERED_OUT' ? item.interestReason ?? 'Filtrée par préférences' : undefined,
    errorMessage: item.status === 'REJECTED' ? 'Contenu rejeté en modération.' : undefined
  }));

  const feedErrorCount = feedMapped.filter((feed) => feed.lastStatus === 'error').length;
  const feedWarningCount = feedMapped.filter((feed) => feed.lastStatus === 'warning').length;

  const modules: ModuleItem[] = [
    {
      id: 'rss',
      name: 'Flux RSS',
      description: MODULE_DESCRIPTIONS.rss,
      status: feedErrorCount > 0 ? 'error' : feedMapped.some((feed) => feed.enabled) ? 'active' : 'inactive',
      uptime: feedErrorCount > 0 ? 92.4 : 99.3,
      interactions: contentItems.length,
      lastSync: guild.updatedAt.toISOString(),
      errorMessage: feedErrorCount > 0 ? `${feedErrorCount} flux en erreur` : feedWarningCount > 0 ? `${feedWarningCount} flux en avertissement` : undefined
    },
    {
      id: 'youtube',
      name: 'YouTube Monitor',
      description: MODULE_DESCRIPTIONS.youtube,
      status: guild.youtubeEnabled ? (guild.nathanYtChannelId ? 'active' : 'error') : 'inactive',
      uptime: guild.youtubeEnabled ? (guild.nathanYtChannelId ? 98.1 : 87.3) : 100,
      interactions: youtubeItemsCount,
      lastSync: guild.updatedAt.toISOString(),
      errorMessage: guild.youtubeEnabled && !guild.nathanYtChannelId ? 'Canal YouTube de référence non configuré.' : undefined
    },
    {
      id: 'codepolice',
      name: 'Code Police',
      description: MODULE_DESCRIPTIONS.codepolice,
      status: guild.codePoliceEnabled ? 'active' : 'inactive',
      uptime: 99.9,
      interactions: codePoliceRulesCount * 8,
      lastSync: guild.updatedAt.toISOString()
    },
    {
      id: 'dailyalgo',
      name: 'Daily Algo',
      description: MODULE_DESCRIPTIONS.dailyalgo,
      status: guild.dailyAlgoEnabled ? 'active' : 'inactive',
      uptime: guild.dailyAlgoEnabled ? 98.8 : 100,
      interactions: dailyAlgoSubmissionCount,
      lastSync: guild.updatedAt.toISOString()
    },
    {
      id: 'traduction',
      name: 'Traduction Automatique',
      description: MODULE_DESCRIPTIONS.traduction,
      status: guild.translationEnabled ? 'active' : 'inactive',
      uptime: guild.translationEnabled ? 97.1 : 100,
      interactions: translatedCount,
      lastSync: guild.updatedAt.toISOString()
    },
    {
      id: 'personnalise',
      name: 'Feed Personnalisé',
      description: MODULE_DESCRIPTIONS.personnalise,
      status: userFeedSubCount > 0 ? 'active' : 'inactive',
      uptime: 99.5,
      interactions: userFeedSubCount,
      lastSync: guild.updatedAt.toISOString()
    }
  ];

  const inferredAudit: AuditEntry[] = [
    {
      id: makeId(),
      user: 'Système',
      action: 'Analyse de configuration',
      context: getGuildName(client, guildId),
      module: 'Dashboard',
      eventType: 'Automatique',
      source: 'dashboard',
      details: `${feedMapped.length} flux, ${contentItems.length} contenus suivis.`,
      dateIso: nowIso(),
      channelId: null,
    },
    {
      id: makeId(),
      user: 'Système',
      action: 'État YouTube synchronisé',
      context: getGuildName(client, guildId),
      module: 'YouTube',
      eventType: 'Automatique',
      source: 'dashboard',
      details: `${youtubeApprovedCount} approuvés, ${youtubePendingCount} en attente.`,
      dateIso: guild.updatedAt.toISOString(),
      channelId: null,
    }
  ];

  const discordGuild = client.guilds.cache.get(guildId);
  const currentMember = userId && discordGuild ? await discordGuild.members.fetch(userId).catch(() => null) : null;
  const discordChannels: DashboardChannel[] = discordGuild
    ? discordGuild.channels.cache
        .filter((channel) => channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)
        .map((channel) => ({
          id: channel.id,
          name: channel.name,
          mention: `<#${channel.id}>`,
          position: channel.rawPosition ?? 0
        }))
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'fr'))
        .map(({ id, name, mention }) => ({ id, name, mention }))
    : [];

  const discordVoiceChannels: DashboardChannel[] = discordGuild
    ? discordGuild.channels.cache
        .filter((channel) => channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice)
        .map((channel) => ({
          id: channel.id,
          name: channel.name,
          mention: `<#${channel.id}>`,
          position: channel.rawPosition ?? 0
        }))
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'fr'))
        .map(({ id, name, mention }) => ({ id, name, mention }))
    : [];

  const discordRoles: DashboardRole[] = discordGuild
    ? discordGuild.roles.cache
        .filter((role) => role.name !== '@everyone' && !role.managed)
        .map((role) => ({
          id: role.id,
          name: role.name,
          mention: `<@&${role.id}>`,
          permissions: role.permissions.toArray(),
          position: role.position
        }))
        .sort((a, b) => b.position - a.position || a.name.localeCompare(b.name, 'fr'))
        .map(({ id, name, mention, permissions }) => ({ id, name, mention, permissions }))
    : [];

  return {
    guildName: getGuildName(client, guildId),
    configChannelId: guild.configChannelId ?? '',
    logChannelId: guild.logChannelId ?? '',
    regulationChannelId: guild.regulationChannelId ?? '',
    regulationMessageId: guild.regulationMessageId ?? null,
    recruitmentCategoryId: guild.recruitmentCategoryId ?? '',
    recruitmentLogChannelId: guild.recruitmentLogChannelId ?? '',
    recruitmentAutoRejectEnabled: isRecruitmentAutoRejectEnabled(guildId),
    modules,
    feeds: feedMapped,
    contentItems,
    discordChannels,
    discordVoiceChannels,
    discordRoles,
    moderatorRoleId: guild.moderatorRoleId ?? '',
    commandRestrictions: runtime.commandRestrictions,
    commandCatalog: COMMAND_CATALOG,
    access: {
      level: access.level === 'admin' ? 'admin' : 'moderator',
      canModerateContent: access.canModerateContent,
      canManageSettings: access.canManageSettings,
    },
    youtubeReferenceChannelId: guild.nathanYtChannelId ?? '',
    notifications: {
      discordChannel: guild.statusCheckChannelId ? `<#${guild.statusCheckChannelId}>` : '#alertes-redaction',
      email: runtime.email,
      emailEnabled: runtime.emailEnabled,
      cloudBackup: runtime.cloudBackup,
      debugLog: runtime.debugLog,
      killSwitchEnabled: runtime.killSwitchEnabled,
      severityByModule: runtime.severityByModule
    },
    auditTrail: [...auditTrailFromDb, ...inferredAudit].slice(0, 180),
    sanctions: mappedSanctions,
    sanctionReports: mappedSanctionReports,
    regulationRules: mappedRegulationRules,
    messageTemplate: runtime.messageTemplate,
    analytics: {
      activityTrend: Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        d.setHours(0, 0, 0, 0);
        const nextD = new Date(d);
        nextD.setDate(d.getDate() + 1);

        const countItems = lastWeekItems.filter((it) => it.createdAt >= d && it.createdAt < nextD).length;
        const countYt = lastWeekYt.filter((it) => it.createdAt >= d && it.createdAt < nextD).length;
        const countAlgos = lastWeekAlgos.filter((it) => it.createdAt >= d && it.createdAt < nextD).length;
        return countItems + countYt + countAlgos;
      }),
      totalAutomations: modules.reduce((acc, m) => acc + m.interactions, 0),
      contentStatusDistribution: [
        { label: 'Flux RSS OK', value: feeds.length > 0 ? (feeds.filter(f => !f.lastPollError).length / feeds.length) * 100 : 100 },
        { label: 'Auto-Publi', value: feeds.filter(f => f.autoPublish).length > 0 ? (feeds.filter(f => f.autoPublish && !f.lastPollError).length / feeds.filter(f => f.autoPublish && !f.lastPollError).length) * 100 : 85 },
        { label: 'Surcharge', value: 5 }, // Inferred logic for surcharge
        { label: 'Santé API', value: 100 }
      ],
      translationCount: translatedCount,
      healthStatus: Math.max(0, 100 - (feedErrorCount * 10))
    },
    member: currentMember ? {
      id: currentMember.id,
      nickname: currentMember.nickname,
      roles: currentMember.roles.cache.map(role => ({
        id: role.id,
        name: role.name,
        position: role.position,
        managed: role.managed
      }))
    } : null,
  };
};

const splitPath = (pathname: string) => pathname.split('/').filter(Boolean);

let dashboardStateBroadcaster: ((guildId: string, reason: string) => void) | null = null;

export async function notifyDashboardSanctionReportRequired(params: {
  guildId: string;
  sanctionId: string;
  sanctionType: DashboardSanctionType;
  targetTag: string;
  moderatorTag: string;
}) {
  const details = [
    `Sanction ${params.sanctionType} appliquée à ${params.targetTag}.`,
    `Rapport à compléter pour ${params.moderatorTag}.`,
    `ID sanction: ${params.sanctionId}.`,
  ].join(' ');

  await prisma.dashboardAuditLog.create({
    data: {
      guildId: params.guildId,
      user: params.moderatorTag,
      action: 'Rapport de sanction requis',
      context: `Sanction ${params.sanctionType}`,
      module: 'Sanctions',
      eventType: 'Action requise',
      details,
      dateIso: new Date(),
    },
  });

  dashboardStateBroadcaster?.(params.guildId, 'sanction_report_required');
}

export const startDashboardApi = (client: Client) => {
  const port = Number(process.env.DASHBOARD_API_PORT ?? '8787');
  const wsServer = new WebSocketServer({ noServer: true });
  const strictOAuthConfig = process.env.DASHBOARD_OAUTH_STRICT === 'true';

  const getMissingOAuthConfig = ({ includeSecret = false }: { includeSecret?: boolean } = {}) => {
    const missing: string[] = [];
    if (!DISCORD_CLIENT_ID?.trim()) missing.push('DISCORD_CLIENT_ID');
    if (!DISCORD_REDIRECT_URI?.trim()) missing.push('DISCORD_REDIRECT_URI');
    if (includeSecret && !DISCORD_CLIENT_SECRET?.trim()) missing.push('DISCORD_CLIENT_SECRET');
    return missing;
  };

  const missingOAuthAtStartup = getMissingOAuthConfig({ includeSecret: true });
  if (missingOAuthAtStartup.length > 0) {
    const message = `Configuration OAuth invalide: variables manquantes (${missingOAuthAtStartup.join(', ')})`;
    if (strictOAuthConfig) {
      logger.error('DashboardAPI', message);
      throw new Error(message);
    }

    logger.warn('DashboardAPI', `${message}. Les routes OAuth renverront une erreur tant que ces variables ne sont pas définies.`);
  }

  const broadcastDashboardStateChange = (guildId: string, reason: string) => {
    const payload = JSON.stringify({
      type: 'dashboard_state_changed',
      guildId,
      reason,
      at: new Date().toISOString(),
    });

    wsServer.clients.forEach((socket) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
      }
    });
  };

  dashboardStateBroadcaster = broadcastDashboardStateChange;

  const server = createServer(async (req, res) => {
    try {
      if (!req.url) {
        json(res, 400, { error: 'Requête invalide' });
        return;
      }

      if (req.method === 'OPTIONS') {
        json(res, 204, {});
        return;
      }

      const url = new URL(req.url, `http://${req.headers.host ?? `localhost:${port}`}`);
      const parts = splitPath(url.pathname);

      if (parts[0] === 'api' && parts[1] === 'public' && parts[2] === 'profile' && parts[3] && req.method === 'GET') {
        const userId = parts[3];
        try {
          const profile = await prisma.memberProfile.findFirst({
            where: { userId },
            orderBy: { updatedAt: 'desc' }
          });

          if (!profile) {
            json(res, 404, { error: 'Profil introuvable' });
            return;
          }

          const guildId = profile.guildId;
          const algoProfile = await getDailyAlgoUserProfile(guildId, userId);
          const participations = await getDailyAlgoUserParticipations(guildId, userId, 10);

          const roles = profile.rolesSnapshot.map((roleName) => ({ name: roleName }));

          const response = {
            username: profile.username,
            displayName: profile.displayName || profile.globalName || profile.username,
            avatar: profile.avatarUrl,
            banner: profile.bannerUrl,
            roles: roles,
            points: algoProfile?.totalPoints || 0,
            tier: algoProfile?.tier || 'Débutant',
            streak: algoProfile?.currentStreak || 0,
            rank: algoProfile ? algoProfile.rank - 1 : 0, // 0-indexed for frontend
            recentAlgos: participations.map((p) => ({
              title: p.problemTitle,
              date: p.submittedAt.toISOString()
            }))
          };

          json(res, 200, response);
        } catch (err) {
          logger.error('PublicAPI', `Error fetching public profile for ${userId}:`, err);
          json(res, 500, { error: 'Erreur interne du serveur' });
        }
        return;
      }

      if (url.pathname === '/health') {
        json(res, 200, { ok: true, service: 'kotbo-dashboard-api' });
        return;
      }

      if (url.pathname === '/api/config' && req.method === 'GET') {
        const missingOAuth = getMissingOAuthConfig();
        if (missingOAuth.length > 0) {
          json(res, 500, {
            error: 'Configuration OAuth invalide côté serveur.',
            missing: missingOAuth,
          });
          return;
        }

        json(res, 200, { discordClientId: DISCORD_CLIENT_ID });
        return;
      }


      // --- AUTH ROUTES ---
      if (parts.length >= 2 && parts[0] === 'api' && parts[1] === 'auth') {
        if (parts[2] === 'discord') {
          if (parts[3] === 'login') {
            const missingOAuth = getMissingOAuthConfig();
            if (missingOAuth.length > 0) {
              json(res, 500, {
                error: 'Configuration OAuth invalide côté serveur.',
                missing: missingOAuth,
              });
              return;
            }

            const discordUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI!)}&response_type=code&scope=identify%20guilds`;
            res.writeHead(302, { Location: discordUrl });
            res.end();
            return;
          }

          if (parts[3] === 'callback') {
            const missingOAuth = getMissingOAuthConfig({ includeSecret: true });
            if (missingOAuth.length > 0) {
              json(res, 500, {
                error: 'Configuration OAuth invalide côté serveur.',
                missing: missingOAuth,
              });
              return;
            }

            const code = url.searchParams.get('code');
            if (!code) {
              res.writeHead(302, { Location: `${DASHBOARD_URL}/login?error=no_code` });
              res.end();
              return;
            }

            try {
              // Exchange code for token
              const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
                method: 'POST',
                body: new URLSearchParams({
                  client_id: DISCORD_CLIENT_ID!,
                  client_secret: DISCORD_CLIENT_SECRET!,
                  grant_type: 'authorization_code',
                  code,
                  redirect_uri: DISCORD_REDIRECT_URI!,
                }),
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              });

              const tokenData = await tokenResponse.json() as any;
              if (tokenData.error) throw new Error(tokenData.error_description);

              // Get user info
              const userResponse = await fetch('https://discord.com/api/users/@me', {
                headers: { Authorization: `Bearer ${tokenData.access_token}` },
              });
              const userData = await userResponse.json() as any;

              // Create JWT
              const token = jwt.sign({
                userId: userData.id,
                username: userData.username,
                avatar: userData.avatar,
                discordToken: tokenData.access_token
              }, JWT_SECRET, { expiresIn: '7d' });

              res.writeHead(302, { Location: `${DASHBOARD_URL}?token=${token}` });
              res.end();
            } catch (err) {
              logger.error('Auth', 'Discord callback error:', err);
              // Log the error response if available
              if (err instanceof Error) {
                logger.error('Auth', `Message: ${err.message}`);
              }
              res.writeHead(302, { Location: `${DASHBOARD_URL}/login?error=auth_failed` });
              res.end();
            }
            return;
          }
        }
      }

      if (parts.length >= 2 && parts[0] === 'api' && parts[1] === 'user') {
        const user = verifyAuth(req);
        if (!user) {
          json(res, 401, { error: 'Non authentifié' });
          return;
        }

        if (parts[2] === 'me') {
          const authHeader = req.headers.authorization;
          const token = authHeader!.split(' ')[1];
          const decoded = jwt.decode(token) as any;
          json(res, 200, { id: decoded.userId, username: decoded.username, avatar: decoded.avatar });
          return;
        }

        if (parts[2] === 'guilds') {
          try {
            const authHeader = req.headers.authorization;
            const token = authHeader?.split(' ')[1];
            if (!token) {
              json(res, 401, { error: 'Token manquant' });
              return;
            }

            const decoded = jwt.decode(token) as any;
            if (!decoded?.discordToken) {
              json(res, 400, { error: 'Token Discord manquant dans le JWT' });
              return;
            }

            // Fetch user guilds from Discord
            const guildsResponse = await fetch('https://discord.com/api/users/@me/guilds', {
              headers: { Authorization: `Bearer ${decoded.discordToken}` },
            });

            if (!guildsResponse.ok) {
              const status = guildsResponse.status;
              const errorText = await guildsResponse.text();
              logger.error('API', `Discord API error (${status}): ${errorText}`);
              json(res, status === 401 ? 401 : 500, { error: 'Erreur lors de la récupération des serveurs depuis Discord' });
              return;
            }

            const userGuilds = await guildsResponse.json() as any[];
            if (!Array.isArray(userGuilds)) {
              logger.error('API', 'Discord did not return an array of guilds', userGuilds);
              json(res, 500, { error: 'Réponse Discord invalide' });
              return;
            }

            const userGuildPermissions = new Map<string, bigint>();
            const userGuildsById = new Map<string, any>();

            for (const guild of userGuilds) {
              userGuildsById.set(guild.id, guild);
              if (guild.permissions === undefined || guild.permissions === null) continue;
              try {
                userGuildPermissions.set(guild.id, BigInt(guild.permissions));
              } catch {
                // Ignore malformed permission values coming from Discord API.
              }
            }

            const accessibleGuilds = new Map<string, {
              id: string;
              name: string;
              icon: string | null;
              owner: boolean;
              botPresent: boolean;
              accessLevel: Exclude<DashboardAccessLevel, 'none'>;
            }>();

            for (const guild of userGuilds) {
              const perms = userGuildPermissions.get(guild.id);
              if (!perms || !hasDashboardAdminPermission(perms)) continue;

              accessibleGuilds.set(guild.id, {
                id: guild.id,
                name: guild.name,
                icon: guild.icon ?? null,
                owner: !!guild.owner,
                botPresent: client.guilds.cache.has(guild.id),
                accessLevel: 'admin'
              });
            }

            const botGuildIds = client.guilds.cache.map((guild) => guild.id);
            for (const guildId of botGuildIds) {
              if (accessibleGuilds.has(guildId)) continue;
              if (!userGuildsById.has(guildId)) continue;

              const access = await resolveDashboardAccess(
                client,
                guildId,
                user.userId,
                userGuildPermissions.get(guildId) ?? null,
              );

              if (!access.canViewDashboard) continue;

              const sourceGuild = userGuildsById.get(guildId);
              accessibleGuilds.set(guildId, {
                id: guildId,
                name: sourceGuild.name,
                icon: sourceGuild.icon ?? null,
                owner: !!sourceGuild.owner,
                botPresent: true,
                accessLevel: access.level === 'admin' ? 'admin' : 'moderator'
              });
            }

            const payload = Array.from(accessibleGuilds.values()).sort((a, b) => a.name.localeCompare(b.name, 'fr'));

            json(res, 200, { guilds: payload });
          } catch (err) {
            logger.error('API', 'Unexpected error in /api/user/guilds:', err);
            json(res, 500, { error: 'Une erreur interne est survenue' });
          }
          return;
        }
      }


      if (parts.length >= 2 && parts[0] === 'api' && parts[1] === 'dashboard') {
        if (parts.length === 6 && parts[2] === 'guilds' && parts[4] === 'recruitment' && parts[5] === 'candidatures' && req.method === 'POST') {
          const guildId = parts[3];
          const webhookAuth = await verifyRecruitmentWebhookAuth(req, guildId);
          const webhookUser = webhookAuth.auth;
          if (!webhookUser) {
            logger.warn('RecruitmentAPI', `Webhook auth failed for guild ${guildId}: ${webhookAuth.reason}`);
            json(res, 401, { error: 'Non authentifié', reason: webhookAuth.reason });
            return;
          }

          try {
            const body = await readJsonBody<Record<string, unknown>>(req);
            const payload = body && typeof body === 'object' && 'data' in body
              ? ((body.data as Record<string, unknown>) ?? body)
              : (body ?? {});

            const result = await createCandidature(guildId, payload, {
              autoRejectEnabled: isRecruitmentAutoRejectEnabled(guildId),
            });
            json(res, 201, result);
          } catch (err) {
            logger.error('RecruitmentAPI', 'Error creating candidature:', err);
            json(res, 500, { error: 'Erreur lors de la création de la candidature' });
          }
          return;
        }

        const user = verifyAuth(req);
        if (!user) {
          json(res, 401, { error: 'Non authentifié' });
          return;
        }
        const auditUser = getAuditActor(user);

        if (parts[2] === 'translate' && req.method === 'POST') {
          const body = await readJsonBody<{ text: string; targetLang?: string }>(req);
          if (!body?.text) {
            json(res, 400, { error: 'Texte à traduire requis' });
            return;
          }
          const translatedText = await translate(body.text, body.targetLang || 'fr');
          json(res, 200, { translatedText });
          return;
        }

        if (parts.length === 3 && parts[2] === 'guilds' && req.method === 'GET') {
          const guilds = await prisma.guild.findMany({
            orderBy: { updatedAt: 'desc' },
            select: { id: true, updatedAt: true }
          });

          const payload: Array<{
            id: string;
            name: string;
            updatedAt: string;
            accessLevel: Exclude<DashboardAccessLevel, 'none'>;
          }> = [];

          for (const guild of guilds) {
            const access = await resolveDashboardAccess(client, guild.id, user.userId);
            if (!access.canViewDashboard) continue;

            payload.push({
              id: guild.id,
              name: getGuildName(client, guild.id),
              updatedAt: guild.updatedAt.toISOString(),
              accessLevel: access.level === 'admin' ? 'admin' : 'moderator'
            });
          }

          json(res, 200, { guilds: payload });
          return;
        }

        if (parts.length >= 4 && parts[2] === 'guilds') {
          const guildId = parts[3];
          const access = await resolveDashboardAccess(client, guildId, user.userId);

          if (!access.canViewDashboard) {
            json(res, 403, { error: 'Accès refusé au dashboard pour ce serveur.' });
            return;
          }

          const isContentAction = parts.length === 7
            && parts[4] === 'content'
            && req.method === 'POST'
            && ['force-send', 'mark-error', 'translate', 'translate-title', 'translate-description'].includes(parts[6]);

          const isSanctionAction = parts.length === 6
            && parts[4] === 'sanctions'
            && parts[5] === 'reports'
            && req.method === 'POST';

          const isDailyAlgoReviewAction = parts.length === 6
            && parts[4] === 'daily-algo-submissions'
            && req.method === 'PATCH';

          const isStaffAbsenceAction = parts.length === 5
            && parts[4] === 'absences'
            && req.method === 'POST';

          if (!access.canManageSettings && req.method !== 'GET' && !isContentAction && !isSanctionAction && !isDailyAlgoReviewAction && !isStaffAbsenceAction) {
            json(res, 403, { error: 'Action réservée aux administrateurs du dashboard.' });
            return;
          }

          if (isContentAction && !access.canModerateContent) {
            json(res, 403, { error: 'Action de modération non autorisée.' });
            return;
          }

          if (isSanctionAction && !access.canModerateContent) {
            json(res, 403, { error: 'Action de rapport de sanction non autorisée.' });
            return;
          }

          if (isDailyAlgoReviewAction && !access.canModerateContent) {
            json(res, 403, { error: 'Action de modération Daily Algo non autorisée.' });
            return;
          }

          if (parts.length === 4 && req.method === 'GET') {
            const state = await getGuildState(client, guildId, access, user.userId);
            if (!state) {
              json(res, 404, { error: 'Guilde introuvable' });
              return;
            }
            json(res, 200, state);
            return;
          }

          // GET /api/dashboard/guilds/:guildId/state - Get guild state (alias for parts.length === 4)
          if (parts.length === 5 && parts[4] === 'state' && req.method === 'GET') {
            const state = await getGuildState(client, guildId, access, user.userId);
            if (!state) {
              json(res, 404, { error: 'Guilde introuvable' });
              return;
            }
            json(res, 200, state);
            return;
          }

          // GET /api/dashboard/guilds/:guildId/analytics - Full analytics data
          if (parts.length === 5 && parts[4] === 'analytics' && req.method === 'GET') {
            try {
              const periodDays = Math.min(90, Math.max(7, parseInt(url.searchParams.get('period') || '30', 10)));
              const now = new Date();
              const startDate = new Date(now);
              startDate.setDate(startDate.getDate() - periodDays);
              const startDateKey = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;

              // 1. Guild daily stats (trend data)
              const dailyStats = await prisma.guildDailyStat.findMany({
                where: { guildId, dateKey: { gte: startDateKey } },
                orderBy: { dateKey: 'asc' },
              });

              // 2. Channel daily stats (top channels)
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

              // 3. Top members by messages
              const topMessageMembers = await prisma.memberProfile.findMany({
                where: { guildId, isBot: false, messageCount: { gt: 0 } },
                orderBy: { messageCount: 'desc' },
                take: 15,
                select: {
                  userId: true, displayName: true, username: true, globalName: true,
                  avatarUrl: true, messageCount: true, lastMessageAt: true,
                },
              });

              // 4. Top members by voice time
              const topVoiceMembers = await prisma.memberProfile.findMany({
                where: { guildId, isBot: false, voiceTimeSeconds: { gt: 0 } },
                orderBy: { voiceTimeSeconds: 'desc' },
                take: 15,
                select: {
                  userId: true, displayName: true, username: true, globalName: true,
                  avatarUrl: true, voiceTimeSeconds: true, voiceSessionCount: true,
                },
              });

              // 5. Member growth stats
              const totalMembers = discordGuild?.memberCount ?? 0;
              const onlineNow = discordGuild?.members.cache.filter(m => m.presence?.status === 'online').size ?? 0;
              const idleNow = discordGuild?.members.cache.filter(m => m.presence?.status === 'idle').size ?? 0;
              const dndNow = discordGuild?.members.cache.filter(m => m.presence?.status === 'dnd').size ?? 0;
              const voiceNow = discordGuild?.members.cache.filter(m => !!m.voice?.channelId).size ?? 0;
              const botsCount = discordGuild?.members.cache.filter(m => m.user.bot).size ?? 0;

              // 6. Sanctions stats
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

              // Top moderators with avatars
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

              // Most sanctioned members with avatars
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

              // 7. Staff activity
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

              // 8. Staff absences
              const activeAbsences = await prisma.staffAbsence.count({ where: { guildId, status: { in: ['PENDING', 'APPROVED', 'ACKNOWLEDGED'] } } });
              const totalStaff = await prisma.staffMember.count({ where: { guildId } });

              // 9. Meetings
              const meetings = await prisma.staffMeeting.findMany({
                where: { guildId, scheduledAt: { gte: startDate } },
                include: { _count: { select: { presences: true } }, presences: { where: { status: 'PRESENT' }, select: { id: true } } },
              });
              const avgMeetingAttendance = meetings.length > 0
                ? Math.round(meetings.reduce((sum, m) => sum + m.presences.length, 0) / meetings.length * 10) / 10
                : 0;

              // 10. Recruitment pipeline
              const candidatures = await prisma.recruitmentCandidature.groupBy({
                by: ['status'],
                where: { guildId },
                _count: true,
              });
              const recruitmentPipeline = candidatures.map(c => ({ status: c.status, count: c._count }));

              // 11. Daily Algo participation
              const algoRuns = await prisma.dailyAlgoRun.findMany({
                where: { guildId, createdAt: { gte: startDate } },
                include: { _count: { select: { submissions: true } } },
              });
              const algoAvgParticipation = algoRuns.length > 0
                ? Math.round(algoRuns.reduce((sum, r) => sum + r._count.submissions, 0) / algoRuns.length * 10) / 10
                : 0;

              // 12. Invitations (top inviters)
              const invites = await prisma.memberInvite.groupBy({
                by: ['inviterId'],
                where: { guildId, inviterId: { not: null }, joinedAt: { gte: startDate } },
                _count: true,
                orderBy: { _count: { inviterId: 'desc' } },
                take: 10,
              });
              const topInviters = await Promise.all(invites.map(async inv => {
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

              // 13. Role distribution
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

              // 14. Inactive members (>30d no message)
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

              // 15. Average member age
              const memberWithJoinDates = await prisma.memberProfile.findMany({
                where: { guildId, isBot: false, guildLeftAt: null, guildJoinedAt: { not: null } },
                select: { guildJoinedAt: true },
              });
              const avgTenureDays = memberWithJoinDates.length > 0
                ? Math.round(memberWithJoinDates.reduce((sum, m) => {
                    return sum + (now.getTime() - (m.guildJoinedAt?.getTime() ?? now.getTime())) / 86400000;
                  }, 0) / memberWithJoinDates.length)
                : 0;

              // 16. Feed item stats
              const feedItemsPublished = await prisma.feedItem.count({
                where: { feed: { guildId }, status: 'APPROVED', createdAt: { gte: startDate } },
              });
              const feedItemsRejected = await prisma.feedItem.count({
                where: { feed: { guildId }, status: 'REJECTED', createdAt: { gte: startDate } },
              });
              const feedItemsPending = await prisma.feedItem.count({
                where: { feed: { guildId }, status: 'PENDING', createdAt: { gte: startDate } },
              });

              // 17. Translations count
              const translatedCount = await prisma.feedItem.count({
                where: {
                  feed: { guildId },
                  titleTranslated: { not: null },
                  createdAt: { gte: startDate },
                },
              });

              // 18. Recent sanctions with avatars
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

              // 19. Retention rate calculation
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


              // Aggregate totals from daily stats
              const totalMessages = dailyStats.reduce((sum, d) => sum + d.messagesCount, 0);
              const totalVoiceMinutes = dailyStats.reduce((sum, d) => sum + d.voiceMinutes, 0);
              const totalJoins = dailyStats.reduce((sum, d) => sum + d.membersJoined, 0);
              const totalLeaves = dailyStats.reduce((sum, d) => sum + d.membersLeft, 0);

              // Compute week-over-week comparison
              const halfPeriod = Math.floor(periodDays / 2);
              const midDate = new Date(now);
              midDate.setDate(midDate.getDate() - halfPeriod);
              const midDateKey = `${midDate.getFullYear()}-${String(midDate.getMonth() + 1).padStart(2, '0')}-${String(midDate.getDate()).padStart(2, '0')}`;
              const recentStats = dailyStats.filter(d => d.dateKey >= midDateKey);
              const olderStats = dailyStats.filter(d => d.dateKey < midDateKey);
              const recentMessages = recentStats.reduce((s, d) => s + d.messagesCount, 0);
              const olderMessages = olderStats.reduce((s, d) => s + d.messagesCount, 0);
              const messagesTrend = olderMessages > 0 ? Math.round((recentMessages - olderMessages) / olderMessages * 100) : 0;

              const analyticsPayload = {
                period: periodDays,
                // Live stats
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
                // Summary KPIs (renamed to totals for frontend)
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
                  feedItemsPublished,
                  feedItemsRejected,
                  feedItemsPending,
                  translatedCount,
                  messagesTrend,
                },
                // Legacy support for summary
                summary: {
                  totalMessages,
                  totalVoiceMinutes,
                  totalJoins,
                  totalLeaves,
                  messagesTrend,
                },
                // Daily trend data
                dailyTrend: dailyStats.map(d => ({
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
                })),
                // Rankings
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
                // Flattened Moderation for frontend
                topModerators,
                topSanctionedMembers: mostSanctioned.map(s => ({
                  userId: s.userId,
                  targetUserId: s.userId, // Duplicate for compatibility
                  targetTag: s.tag,
                  count: s.count,
                })),
                recentSanctions,
                // Moderation object for deeper components
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
                // Staff
                staff: {
                  leaderboard: staffLeaderboard,
                  activeAbsences,
                  totalStaff,
                  meetings: meetings.length,
                  avgMeetingAttendance,
                },
                // Recruitment
                recruitmentPipeline,
                // Roles
                roleDistribution,
                // Recent Joins \u0026 Leaves
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
            return;
          }

          // GET /api/dashboard/guilds/:guildId/analytics/members/:userId - Member detailed analytics
          if (parts.length === 6 && parts[4] === 'analytics' && parts[5] === 'members' && req.method === 'GET') {
            const userId = url.searchParams.get('userId');
            if (!userId) {
              json(res, 400, { error: 'userId requis' });
              return;
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
            return;
          }

          // GET /api/dashboard/guilds/:guildId/analytics/correlation - Messages vs Voice correlation
          if (parts.length === 6 && parts[4] === 'analytics' && parts[5] === 'correlation' && req.method === 'GET') {
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
            return;
          }

          // GET /api/dashboard/guilds/:guildId/analytics/invites - Invite retention and stats
          if (parts.length === 6 && parts[4] === 'analytics' && parts[5] === 'invites' && req.method === 'GET') {
            try {
              const invites = await prisma.memberInvite.findMany({
                where: { guildId, inviterId: { not: null } },
              });

              const discordGuild = client.guilds.cache.get(guildId);
              
              const inviterStats = new Map<string, { total: number; active: number }>();

              for (const inv of invites) {
                if (!inv.inviterId) continue;
                
                const stats = inviterStats.get(inv.inviterId) ?? { total: 0, active: 0 };
                stats.total++;
                
                const stillHere = discordGuild?.members.cache.has(inv.userId);
                if (stillHere) stats.active++;

                inviterStats.set(inv.inviterId, stats);
              }

              const retentionData = [...inviterStats.entries()]
                .map(([inviterId, stats]) => {
                  const inviterMember = discordGuild?.members.cache.get(inviterId);
                  return {
                    inviterId,
                    name: inviterMember?.displayName ?? `Utilisateur ${inviterId}`,
                    total: stats.total,
                    active: stats.active,
                    retentionRate: stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0,
                  };
                })
                .sort((a, b) => b.total - a.total);

              json(res, 200, { topInviters: retentionData });
            } catch (err) {
              logger.error('AnalyticsAPI', 'Error computing invites analytics:', err);
              json(res, 500, { error: 'Erreur analytics invites' });
            }
            return;
          }

          // GET /api/dashboard/guilds/:guildId/recruitment/candidatures - Get recruitment candidatures
          if (parts.length === 6 && parts[4] === 'recruitment' && parts[5] === 'candidatures' && req.method === 'GET') {
            try {
              const candidatures = await getCandidatures(guildId);
              json(res, 200, { candidatures });
              return;
            } catch (err) {
              logger.error('RecruitmentAPI', 'Error getting candidatures:', err);
              json(res, 500, { error: 'Erreur lors de la récupération des candidatures' });
            }
            return;
          }

          // PATCH /api/dashboard/guilds/:guildId/recruitment/config - Update recruitment configuration
          if (parts.length === 6 && parts[4] === 'recruitment' && parts[5] === 'config' && req.method === 'PATCH') {
            const body = await readJsonBody<{
              recruitmentCategoryId?: string | null;
              recruitmentLogChannelId?: string | null;
              recruitmentAutoRejectEnabled?: boolean;
            }>(req);

            const recruitmentCategoryId = body?.recruitmentCategoryId?.trim() || null;
            const recruitmentLogChannelId = body?.recruitmentLogChannelId?.trim() || null;

            await prisma.guild.update({
              where: { id: guildId },
              data: {
                recruitmentCategoryId,
                recruitmentLogChannelId,
              }
            });

            if (typeof body?.recruitmentAutoRejectEnabled === 'boolean') {
              recruitmentAutoRejectEnabledByGuild.set(guildId, body.recruitmentAutoRejectEnabled);
            }

            json(res, 200, {
              ok: true,
              recruitmentCategoryId,
              recruitmentLogChannelId,
              recruitmentAutoRejectEnabled: isRecruitmentAutoRejectEnabled(guildId),
            });
            return;
          }

          // PATCH /api/dashboard/guilds/:guildId/recruitment/candidatures/:id - Update candidature workflow
          if (parts.length === 7 && parts[4] === 'recruitment' && parts[5] === 'candidatures' && req.method === 'PATCH') {
            const candidatureId = parts[6];

            const candidature = await prisma.recruitmentCandidature.findFirst({
              where: { id: candidatureId, guildId },
              select: { id: true }
            });

            if (!candidature) {
              json(res, 404, { error: 'Candidature introuvable pour ce serveur.' });
              return;
            }

            const body = await readJsonBody<{
              action?: string;
              status?: string;
              notes?: string;
              reason?: string;
              discordUserId?: string;
              tutorUserId?: string;
            }>(req);

            const action = body?.action;

            try {
              if (action === 'status_update') {
                const nextStatus = body?.status;
                if (!nextStatus || !['PENDING', 'ORAL', 'APPROVED', 'REJECTED', 'AUTO_REJECTED'].includes(nextStatus)) {
                  json(res, 400, { error: 'Statut candidature invalide.' });
                  return;
                }

                await updateCandidatureStatus(candidatureId, nextStatus as any, body?.notes);
                json(res, 200, { ok: true });
                return;
              }

              if (action === 'approve') {
                const discordUserId = body?.discordUserId?.trim();
                if (!discordUserId) {
                  json(res, 400, { error: 'discordUserId est requis pour valider une candidature.' });
                  return;
                }

                await approveCandidature(client, guildId, candidatureId, discordUserId, user.userId);
                json(res, 200, { ok: true });
                return;
              }

              if (action === 'reject') {
                await rejectCandidature(client, guildId, candidatureId, body?.reason?.trim(), user.userId);
                json(res, 200, { ok: true });
                return;
              }

              if (action === 'oral_pass') {
                await completeOral(client, guildId, candidatureId, 'PASSED', body?.reason?.trim(), user.userId);
                json(res, 200, { ok: true });
                return;
              }

              if (action === 'oral_fail') {
                await completeOral(client, guildId, candidatureId, 'FAILED', body?.reason?.trim(), user.userId);
                json(res, 200, { ok: true });
                return;
              }

              if (action === 'assign_tutor') {
                const tutorUserId = body?.tutorUserId?.trim();
                if (!tutorUserId) {
                  json(res, 400, { error: 'tutorUserId est requis pour assigner un tuteur.' });
                  return;
                }

                await assignTutor(candidatureId, tutorUserId);
                json(res, 200, { ok: true });
                return;
              }

              json(res, 400, { error: 'Action de candidature non reconnue.' });
            } catch (err) {
              logger.error('RecruitmentAPI', 'Error updating candidature:', err);
              json(res, 500, { error: err instanceof Error ? err.message : 'Erreur lors de la mise à jour de la candidature' });
            }
            return;
          }

          // DELETE /api/dashboard/guilds/:guildId/recruitment/candidatures/:id - Delete candidature
          if (parts.length === 7 && parts[4] === 'recruitment' && parts[5] === 'candidatures' && req.method === 'DELETE') {
            const candidatureId = parts[6];

            const candidature = await prisma.recruitmentCandidature.findFirst({
              where: { id: candidatureId, guildId },
              select: { id: true }
            });

            if (!candidature) {
              json(res, 404, { error: 'Candidature introuvable pour ce serveur.' });
              return;
            }

            try {
              await deleteRecruitmentCandidature(candidatureId);
              json(res, 200, { ok: true });
            } catch (err) {
              logger.error('RecruitmentAPI', 'Error deleting candidature:', err);
              json(res, 500, { error: 'Erreur lors de la suppression de la candidature' });
            }
            return;
          }

          // GET /api/dashboard/guilds/:guildId/recruitment/tutors - Get eligible tutors
          if (parts.length === 6 && parts[4] === 'recruitment' && parts[5] === 'tutors' && req.method === 'GET') {
            try {
              const tutors = await getEligibleTutors(guildId);
              json(res, 200, { tutors });
              return;
            } catch (err) {
              logger.error('RecruitmentAPI', 'Error getting eligible tutors:', err);
              json(res, 500, { error: 'Erreur lors de la récupération des tuteurs éligibles' });
            }
            return;
          }

          // GET /api/dashboard/guilds/:guildId/members/search - Search members from Discord + database
          if (parts.length === 6 && parts[4] === 'members' && parts[5] === 'search' && req.method === 'GET') {
            try {
              const searchQuery = (url.searchParams.get('q') ?? '').trim().toLowerCase();
              const limit = Math.min(Number(url.searchParams.get('limit') ?? '24'), 100);
              const page = Math.max(Number(url.searchParams.get('page') ?? '1'), 1);
              const sortBy = url.searchParams.get('sortBy') ?? 'lastSeenAt';
              const sortOrder = url.searchParams.get('sortOrder') ?? 'desc';
              const serverStatus = url.searchParams.get('serverStatus') ?? 'on_server';
              const botFilter = url.searchParams.get('botFilter') ?? 'human';

              // Validate sortBy to prevent injection
              const validSortFields = ['lastSeenAt', 'messageCount', 'guildJoinedAt'];
              const finalSortBy = validSortFields.includes(sortBy) ? sortBy : 'lastSeenAt';

              // Fetch all server members from Discord
              const discordGuild = client.guilds.cache.get(guildId);
              let discordMembers: Map<string, any> = new Map();

              if (discordGuild) {
                try {
                  const allServerMembers = await discordGuild.members.fetch({ limit: 1000 }).catch(() => null);
                  if (allServerMembers) {
                    for (const member of allServerMembers.values()) {
                      discordMembers.set(member.id, member);
                    }
                  }
                } catch (err) {
                  logger.debug('MembersAPI', 'Could not fetch Discord members:', String(err));
                }
              }

              // Fetch all members from database for enrichment
              const allDbMembers = await prisma.memberProfile.findMany({
                where: { guildId },
                select: {
                  userId: true,
                  username: true,
                  displayName: true,
                  globalName: true,
                  userTag: true,
                  avatarUrl: true,
                  isBot: true,
                  lastSeenAt: true,
                  guildJoinedAt: true,
                  messageCount: true,
                  guildLeftAt: true,
                },
              });

              // Create map for quick lookup
              const dbMemberMap = new Map(allDbMembers.map(m => [m.userId, m]));

              // Build FULL list of members (both on server and left)
              let allMembers: any[] = [];

              // Add Discord members
              for (const [userId, discordMember] of discordMembers.entries()) {
                const dbMember = dbMemberMap.get(userId);
                allMembers.push({
                  id: userId,
                  username: dbMember?.username || discordMember.user.username,
                  displayName: dbMember?.displayName || discordMember.displayName || discordMember.user.globalName || discordMember.user.username,
                  avatarUrl: dbMember?.avatarUrl || discordMember.user.displayAvatarURL({ size: 256 }),
                  isBot: discordMember.user.bot,
                  lastSeenAt: dbMember?.lastSeenAt?.toISOString() ?? null,
                  messageCount: dbMember?.messageCount || 0,
                  guildJoinedAt: discordMember.joinedAt?.toISOString() ?? dbMember?.guildJoinedAt?.toISOString() ?? null,
                  guildLeftAt: null,
                  isOnServer: true,
                });
              }

              // Add Left members (from DB but not on Discord)
              for (const dbMember of allDbMembers) {
                if (!discordMembers.has(dbMember.userId)) {
                  allMembers.push({
                    id: dbMember.userId,
                    username: dbMember.username || 'Utilisateur inconnu',
                    displayName: dbMember.displayName || dbMember.globalName || dbMember.userTag || dbMember.username || 'Utilisateur inconnu',
                    avatarUrl: dbMember.avatarUrl,
                    isBot: dbMember.isBot || false,
                    lastSeenAt: dbMember.lastSeenAt?.toISOString() ?? null,
                    messageCount: dbMember.messageCount || 0,
                    guildJoinedAt: dbMember.guildJoinedAt?.toISOString() ?? null,
                    guildLeftAt: dbMember.guildLeftAt?.toISOString() ?? null,
                    isOnServer: false,
                  });
                }
              }

              // Calculate Global Stats (before filtering, but after building full list)
              const onServerCount = allMembers.filter(m => m.isOnServer).length;
              const leftCount = allMembers.filter(m => !m.isOnServer).length;
              const botCount = allMembers.filter(m => m.isBot).length;

              // Apply Filters
              // 1. Filter by server status
              if (serverStatus === 'on_server') {
                allMembers = allMembers.filter(m => m.isOnServer);
              } else if (serverStatus === 'left') {
                allMembers = allMembers.filter(m => !m.isOnServer);
              }

              // 2. Filter by search query
              if (searchQuery) {
                allMembers = allMembers.filter(member =>
                  member.username?.toLowerCase().includes(searchQuery) ||
                  member.displayName?.toLowerCase().includes(searchQuery) ||
                  member.id.includes(searchQuery)
                );
              }

              // 3. Filter by bot status
              if (botFilter === 'human') {
                allMembers = allMembers.filter(m => !m.isBot);
              } else if (botFilter === 'bot') {
                allMembers = allMembers.filter(m => m.isBot);
              }

              // Sort members
              const finalSortOrder = sortOrder === 'asc' ? 1 : -1;
              if (sortBy === 'messageCount') {
                allMembers.sort((a, b) => (a.messageCount - b.messageCount) * finalSortOrder);
              } else if (sortBy === 'guildJoinedAt') {
                allMembers.sort((a, b) => {
                  const dateA = a.guildJoinedAt ? new Date(a.guildJoinedAt).getTime() : 0;
                  const dateB = b.guildJoinedAt ? new Date(b.guildJoinedAt).getTime() : 0;
                  return (dateA - dateB) * finalSortOrder;
                });
              } else {
                // lastSeenAt (default)
                allMembers.sort((a, b) => {
                  const dateA = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
                  const dateB = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
                  return (dateA - dateB) * finalSortOrder;
                });
              }
              
              // Paginate
              const totalFound = allMembers.length;
              const totalPages = Math.ceil(totalFound / limit);
              const skip = (page - 1) * limit;
              const paginatedMembers = allMembers.slice(skip, skip + limit);

              // Clean up response
              const members = paginatedMembers.map(m => {
                const { _sortKey, ...member } = m;
                return member;
              });

              json(res, 200, {
                members,
                totalFound,
                totalPages,
                onServerCount,
                leftCount,
                botCount,
              });
            } catch (err) {
              logger.error('MembersAPI', 'Error searching members:', err);
              json(res, 500, { error: 'Erreur lors de la recherche de membres', details: String(err) });
            }
            return;
          }

          if (parts.length === 6 && parts[4] === 'members' && req.method === 'GET') {
            const memberCase = await buildMemberCaseData(client, guildId, parts[5], user);
            if (!memberCase) {
              json(res, 404, { error: 'Membre introuvable sur ce serveur.' });
              return;
            }

            json(res, 200, memberCase);
            return;
          }

          if (parts.length === 7 && parts[4] === 'members' && parts[6] === 'actions' && req.method === 'POST') {
            if (!access.canModerateContent) {
              json(res, 403, { error: 'Action de modération non autorisée.' });
              return;
            }

            const userId = parts[5];
            const body = await readJsonBody<{
              type?: MemberCaseQuickAction;
              reason?: string;
              durationMs?: number | null;
            }>(req);

            const action = body?.type;
            const reason = body?.reason?.trim() || 'Action lancée depuis le profil membre.';
            const discordGuild = client.guilds.cache.get(guildId);
            if (!discordGuild) {
              json(res, 404, { error: 'Serveur Discord introuvable.' });
              return;
            }

            const targetUser = await client.users.fetch(userId).catch(() => null);
            const targetMember = await discordGuild.members.fetch(userId).catch(() => null);
            const moderator = { id: user.userId, tag: user.username ?? `Utilisateur ${user.userId}` };
            const target = {
              id: userId,
              tag: targetUser?.tag ?? targetMember?.user.tag ?? `Utilisateur ${userId}`,
            };

            if (!action || !['WARN', 'KICK', 'TIMEOUT', 'BAN'].includes(action)) {
              json(res, 400, { error: 'Type d’action invalide.' });
              return;
            }

            if (action === 'WARN') {
              const sanction = await registerWarnSanction({ guildId, target, moderator, reason });

              await pushAudit(guildId, {
                user: auditUser,
                action: 'Warn depuis le profil membre',
                context: getGuildName(client, guildId),
                module: 'Sanctions',
                eventType: 'Manuel',
                details: `Warn appliqué à ${target.tag} (${target.id}). Raison: ${reason}`,
                channelId: null,
              });

              broadcastDashboardStateChange(guildId, 'member_warned');
              json(res, 200, { ok: true, sanctionId: sanction.id });
              return;
            }

            if (action === 'KICK') {
              if (!targetMember) {
                json(res, 404, { error: 'Le membre doit être présent sur le serveur pour être expulsé.' });
                return;
              }
              if (!targetMember.kickable) {
                json(res, 400, { error: 'Le bot ne peut pas exclure ce membre.' });
                return;
              }

              await targetMember.kick(`${reason} | Modération: ${user.username ?? user.userId}`);
              const sanction = await registerKickSanction({ guildId, target, moderator, reason });

              await pushAudit(guildId, {
                user: auditUser,
                action: 'Kick depuis le profil membre',
                context: getGuildName(client, guildId),
                module: 'Sanctions',
                eventType: 'Manuel',
                details: `Kick appliqué à ${target.tag} (${target.id}). Raison: ${reason}`,
                channelId: null,
              });

              broadcastDashboardStateChange(guildId, 'member_kicked');
              json(res, 200, { ok: true, sanctionId: sanction.id });
              return;
            }

            if (action === 'TIMEOUT') {
              if (!targetMember) {
                json(res, 404, { error: 'Le membre doit être présent sur le serveur pour un timeout.' });
                return;
              }
              if (!targetMember.moderatable) {
                json(res, 400, { error: 'Le bot ne peut pas appliquer de timeout à ce membre.' });
                return;
              }

              const durationMs = Number(body?.durationMs ?? 0);
              if (!Number.isFinite(durationMs) || durationMs <= 0) {
                json(res, 400, { error: 'Une durée valide en millisecondes est requise pour le timeout.' });
                return;
              }

              const sanction = await registerTimeoutSanction({
                guildId,
                target,
                moderator,
                reason,
                durationMs,
                member: targetMember,
              });

              await pushAudit(guildId, {
                user: auditUser,
                action: 'Timeout depuis le profil membre',
                context: getGuildName(client, guildId),
                module: 'Sanctions',
                eventType: 'Manuel',
                details: `Timeout appliqué à ${target.tag} (${target.id}) pour ${Math.floor(durationMs / 1000)}s. Raison: ${reason}`,
                channelId: null,
              });

              broadcastDashboardStateChange(guildId, 'member_timeout');
              json(res, 200, { ok: true, sanctionId: sanction.id });
              return;
            }

            if (action === 'BAN') {
              if (targetMember && !targetMember.bannable) {
                json(res, 400, { error: 'Le bot ne peut pas bannir ce membre.' });
                return;
              }

              await runGuildBan(discordGuild, userId, `${reason} | Modération: ${user.username ?? user.userId}`);
              const sanction = await registerBanSanction({ guildId, target, moderator, reason });

              await pushAudit(guildId, {
                user: auditUser,
                action: 'Ban depuis le profil membre',
                context: getGuildName(client, guildId),
                module: 'Sanctions',
                eventType: 'Manuel',
                details: `Ban appliqué à ${target.tag} (${target.id}). Raison: ${reason}`,
                channelId: null,
              });

              broadcastDashboardStateChange(guildId, 'member_banned');
              json(res, 200, { ok: true, sanctionId: sanction.id });
              return;
            }
          }

          if (parts.length === 5 && parts[4] === 'leadership' && req.method === 'GET') {
            try {
              const metrics = await getStaffAlertsAndProgression(guildId);
              json(res, 200, { metrics });
            } catch (err) {
              logger.error('StaffAPI', 'Error getting leadership metrics:', err);
              json(res, 500, { error: 'Erreur lors de la récupération des métriques leadership' });
            }
            return;
          }

          if (parts.length === 5 && parts[4] === 'absences' && req.method === 'GET') {
            try {
              const absences = await getAbsences(guildId);
              json(res, 200, { absences });
            } catch (err) {
              logger.error('StaffAPI', 'Error getting absences:', err);
              json(res, 500, { error: 'Erreur lors de la récupération des absences' });
            }
            return;
          }

          if (parts.length === 5 && parts[4] === 'absences' && req.method === 'POST') {
            const body = await readJsonBody<{
              staffUserId: string;
              type: string;
              startDate: string;
              endDate?: string;
              reason: string;
              superiorUserId: string;
              message?: string;
              confirmIndefinite?: boolean;
            }>(req);

            if (!body?.staffUserId || !body?.type || !body?.startDate || !body?.reason || !body?.superiorUserId) {
              json(res, 400, { error: 'staffUserId, type, startDate, reason et superiorUserId sont obligatoires' });
              return;
            }

            // Permettre aux staff de créer une absence pour eux-mêmes même s'ils ne sont pas admin
            if (!access.canManageSettings && body.staffUserId !== user.userId) {
              json(res, 403, { error: 'Vous ne pouvez créer des absences que pour vous-même.' });
              return;
            }

            const staffMember = await getStaffMember(guildId, body.staffUserId);
            if (!staffMember) {
              json(res, 404, { error: 'Le staff ciblé est introuvable' });
              return;
            }

            const superiorStaff = await getStaffMember(guildId, body.superiorUserId);
            if (!superiorStaff) {
              json(res, 400, { error: 'Le supérieur indiqué ne fait pas partie du staff' });
              return;
            }

            const startDate = new Date(body.startDate);
            const endDate = body.endDate ? new Date(body.endDate) : undefined;

            if (Number.isNaN(startDate.getTime()) || (endDate && Number.isNaN(endDate.getTime()))) {
              json(res, 400, { error: 'Date invalide' });
              return;
            }

            if (endDate && endDate < startDate) {
              json(res, 400, { error: 'La date de fin doit être postérieure ou égale à la date de début' });
              return;
            }

            if (!endDate && !body.confirmIndefinite) {
              json(res, 400, { error: 'Confirmez explicitement l\'absence indéterminée' });
              return;
            }

            try {
              const absence = await createAbsence({
                guildId,
                staffMemberId: staffMember.id,
                startDate,
                endDate,
                reason: body.reason,
                type: body.type,
                message: body.message,
                superiorUserId: body.superiorUserId,
              });

              await pushAudit(guildId, {
                user: auditUser,
                action: 'Création absence',
                context: getGuildName(client, guildId),
                module: 'Staff Management',
                eventType: 'Manuel',
                details: `Absence ${absence.id} créée pour ${body.staffUserId} (${body.type})`,
                channelId: null,
              });

              json(res, 201, { absence });
            } catch (err) {
              logger.error('StaffAPI', 'Error creating absence:', err);
              json(res, 500, { error: 'Erreur lors de la création de l\'absence' });
            }
            return;
          }

          if (parts.length === 6 && parts[4] === 'absences' && req.method === 'PATCH') {
            const absenceId = parts[5];
            const body = await readJsonBody<{
              status: 'ACKNOWLEDGED' | 'APPROVED' | 'REJECTED' | 'CANCELED' | 'ENDED';
              note?: string;
            }>(req);

            if (!body?.status) {
              json(res, 400, { error: 'status est obligatoire' });
              return;
            }

            const allowedStatuses = new Set(['ACKNOWLEDGED', 'APPROVED', 'REJECTED', 'CANCELED', 'ENDED']);
            if (!allowedStatuses.has(body.status)) {
              json(res, 400, { error: 'Status absence invalide' });
              return;
            }

            try {
              const absence = await updateAbsenceStatus(absenceId, body.status, user.userId, body.note);

              await pushAudit(guildId, {
                user: auditUser,
                action: `Décision absence (${body.status})`,
                context: getGuildName(client, guildId),
                module: 'Staff Management',
                eventType: 'Manuel',
                details: `Absence ${absenceId} mise au statut ${body.status}`,
                channelId: null,
              });

              json(res, 200, { absence });
            } catch (err) {
              logger.error('StaffAPI', 'Error updating absence status:', err);
              json(res, 500, { error: 'Erreur lors de la mise à jour de l\'absence' });
            }
            return;
          }

          if (parts.length === 5 && parts[4] === 'meetings' && req.method === 'GET') {
            try {
              const meetings = await getMeetings(guildId);
              json(res, 200, { meetings });
            } catch (err) {
              logger.error('StaffAPI', 'Error getting meetings:', err);
              json(res, 500, { error: 'Erreur lors de la récupération des réunions' });
            }
            return;
          }

          if (parts.length === 5 && parts[4] === 'meetings' && req.method === 'POST') {
            const body = await readJsonBody<{
              title: string;
              description?: string;
              scheduledAt: string;
            }>(req);

            if (!body?.title || !body?.scheduledAt) {
              json(res, 400, { error: 'title et scheduledAt sont obligatoires' });
              return;
            }

            try {
              const guildConfig = await prisma.guild.findUnique({
                where: { id: guildId },
                select: {
                  meetingAnnouncementChannelId: true,
                  meetingVoiceChannelId: true,
                },
              });

              const announcementChannelId = guildConfig?.meetingAnnouncementChannelId;
              const voiceChannelId = guildConfig?.meetingVoiceChannelId;

              if (!announcementChannelId || !voiceChannelId) {
                json(res, 400, {
                  error: 'Configurez les salons de réunion (annonce + vocal/conférence) dans la configuration staff avant de créer une réunion.',
                });
                return;
              }

              const scheduledAt = new Date(body.scheduledAt);
              if (Number.isNaN(scheduledAt.getTime())) {
                json(res, 400, { error: 'Date de réunion invalide' });
                return;
              }

              const discordGuild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);
              if (!discordGuild) {
                json(res, 500, { error: 'Impossible d’accéder au serveur Discord pour créer la réunion.' });
                return;
              }

              const announcementChannel = await client.channels.fetch(announcementChannelId).catch(() => null);
              if (!announcementChannel || (announcementChannel.type !== ChannelType.GuildText && announcementChannel.type !== ChannelType.GuildAnnouncement)) {
                json(res, 400, { error: 'Le salon d’annonce configuré est introuvable ou n’est pas un salon texte/annonces.' });
                return;
              }

              const voiceChannel = await client.channels.fetch(voiceChannelId).catch(() => null);
              if (!voiceChannel || (voiceChannel.type !== ChannelType.GuildVoice && voiceChannel.type !== ChannelType.GuildStageVoice)) {
                json(res, 400, { error: 'Le salon vocal/conférence configuré est introuvable ou invalide.' });
                return;
              }

              const scheduledEvent = await discordGuild.scheduledEvents.create({
                name: body.title.trim().slice(0, 100),
                description: (body.description?.trim() || 'Réunion staff Kotbo').slice(0, 1000),
                scheduledStartTime: scheduledAt,
                scheduledEndTime: new Date(scheduledAt.getTime() + 60 * 60 * 1000),
                privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
                entityType: GuildScheduledEventEntityType.Voice,
                channel: voiceChannel.id,
                reason: `Création via dashboard par ${user.username ?? user.userId}`,
              });

              const timestamp = Math.floor(scheduledAt.getTime() / 1000);
              const announceTextChannel = announcementChannel as TextChannel;

              const meeting = await createMeeting(
                guildId,
                user.userId,
                body.title.trim(),
                body.description?.trim() || '',
                scheduledAt,
                undefined, // messageId sera mis à jour juste après
                scheduledEvent.id
              );

              // RSVP Buttons
              const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                  new ButtonBuilder()
                    .setCustomId(`meeting_rsvp_present_${meeting.id}`)
                    .setLabel('Présent')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('✅'),
                  new ButtonBuilder()
                    .setCustomId(`meeting_rsvp_excused_${meeting.id}`)
                    .setLabel('S\'excuser')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📝'),
                  new ButtonBuilder()
                    .setCustomId(`meeting_rsvp_absent_${meeting.id}`)
                    .setLabel('Absent')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('❌')
                );

              try {
                const announcementMessage = await announceTextChannel.send({
                  content: [
                    '## 📣 Nouvelle réunion staff',
                    `**${body.title.trim()}**`,
                    body.description?.trim() ? `${body.description.trim()}` : null,
                    '',
                    `🗓️ Date: <t:${timestamp}:F>`,
                    `🔊 Salon conférence: <#${voiceChannel.id}>`,
                    `🎫 Événement Discord: ${scheduledEvent.url}`,
                    '',
                    'Merci d\'indiquer votre présence via les boutons ci-dessous.',
                  ].filter(Boolean).join('\n'),
                  components: [row],
                });

                // On met à jour la réunion avec l'ID du message d'annonce
                await updateMeeting(meeting.id, { discordMessageId: announcementMessage.id });
                meeting.discordMessageId = announcementMessage.id;
              } catch (announcementError) {
                // On garde l'event et la réunion même si l'annonce échoue, mais on log
                logger.error('StaffAPI', 'Failed to send meeting announcement:', announcementError);
              }

              // Auto-sync absences
              await syncMeetingPresencesWithAbsences(meeting.id);

              await pushAudit(guildId, {
                user: auditUser,
                action: 'Création réunion',
                context: getGuildName(client, guildId),
                module: 'Staff Management',
                eventType: 'Manuel',
                details: `Réunion créée: ${meeting.title} | Event: ${scheduledEvent.id} | Annonce: <#${announcementChannel.id}> | Conférence: <#${voiceChannel.id}>`,
                channelId: null,
              });

              json(res, 201, {
                meeting,
                event: {
                  id: scheduledEvent.id,
                  url: scheduledEvent.url,
                  channelId: voiceChannel.id,
                },
              });
            } catch (err) {
              logger.error('StaffAPI', 'Error creating meeting:', err);
              json(res, 500, { error: 'Erreur lors de la création de la réunion' });
            }
            return;
          }

          if (parts.length === 6 && parts[4] === 'meetings' && req.method === 'PATCH') {
            const meetingId = parts[5];
            const body = await readJsonBody<{
              title?: string;
              description?: string;
              scheduledAt?: string;
              status?: 'SCHEDULED' | 'COMPLETED' | 'CANCELED';
            }>(req);

            try {
              const data: any = {};
              if (body?.title) data.title = body.title;
              if (body?.description !== undefined) data.description = body.description;
              if (body?.scheduledAt) data.scheduledAt = new Date(body.scheduledAt);
              if (body?.status) data.status = body.status;

              const meeting = await updateMeeting(meetingId, data);

              await pushAudit(guildId, {
                user: auditUser,
                action: 'Mise à jour réunion',
                context: getGuildName(client, guildId),
                module: 'Staff Management',
                eventType: 'Manuel',
                details: `Réunion ${meetingId} mise à jour. Statut: ${meeting.status}`,
                channelId: null,
              });

              json(res, 200, { meeting });
            } catch (err) {
              logger.error('StaffAPI', 'Error updating meeting:', err);
              json(res, 500, { error: 'Erreur lors de la mise à jour de la réunion' });
            }
            return;
          }

          if (parts.length === 6 && parts[4] === 'meetings' && req.method === 'DELETE') {
            const meetingId = parts[5];
            try {
              const meeting = await prisma.staffMeeting.findUnique({
                where: { id: meetingId },
              });

              if (meeting) {
                const discordGuild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);

                if (discordGuild) {
                  // Suppression du message d'annonce
                  if (meeting.discordMessageId) {
                    try {
                      const guildConfig = await prisma.guild.findUnique({
                        where: { id: guildId },
                        select: { meetingAnnouncementChannelId: true },
                      });
                      if (guildConfig?.meetingAnnouncementChannelId) {
                        const channel = await client.channels.fetch(guildConfig.meetingAnnouncementChannelId).catch(() => null);
                        if (channel?.isTextBased()) {
                          const msg = await (channel as TextChannel).messages.fetch(meeting.discordMessageId).catch(() => null);
                          if (msg) await msg.delete().catch(() => null);
                        }
                      }
                    } catch (e) {
                      logger.error('StaffAPI', `Failed to delete meeting message ${meeting.discordMessageId}:`, e);
                    }
                  }

                  // Suppression de l'événement Discord
                  if (meeting.discordEventId) {
                    try {
                      const event = await discordGuild.scheduledEvents.fetch(meeting.discordEventId).catch(() => null);
                      if (event) await event.delete().catch(() => null);
                    } catch (e) {
                      logger.error('StaffAPI', `Failed to delete meeting event ${meeting.discordEventId}:`, e);
                    }
                  }
                }
              }

              await deleteMeeting(meetingId);
              json(res, 200, { ok: true });
            } catch (err) {
              logger.error('StaffAPI', 'Error deleting meeting:', err);
              json(res, 500, { error: 'Erreur lors de la suppression de la réunion' });
            }
            return;
          }

          if (parts.length === 6 && parts[4] === 'modules' && req.method === 'PUT') {
            const moduleId = parts[5];
            const body = (await readJsonBody<{ status: ModuleStatus }> (req)) ?? { status: 'inactive' };

            const updates: Record<string, unknown> = {};
            if (moduleId === 'youtube') updates.youtubeEnabled = body.status === 'active';
            if (moduleId === 'codepolice') updates.codePoliceEnabled = body.status === 'active';
            if (moduleId === 'dailyalgo') updates.dailyAlgoEnabled = body.status === 'active';
            if (moduleId === 'traduction') updates.translationEnabled = body.status === 'active';
            if (moduleId === 'rss' && body.status !== 'active') {
              await prisma.feed.updateMany({ where: { guildId }, data: { enabled: false } });
            }

            if (Object.keys(updates).length > 0) {
              await prisma.guild.update({ where: { id: guildId }, data: updates });
            }

            await pushAudit(guildId, {
              user: auditUser,
              action: 'Mise à jour module',
              context: getGuildName(client, guildId),
              module: moduleId,
              eventType: 'Manuel',
              details: `Statut changé vers ${body.status}.`,
              channelId: null
            });

            json(res, 200, { ok: true });
            return;
          }

          if (parts.length === 5 && parts[4] === 'feeds' && req.method === 'POST') {
            const body = await readJsonBody<{
              name: string;
              url: string;
              category: string;
              targetChannel: string;
              scanMinutes: number;
              enabled: boolean;
              includeKeywords: string[];
              excludeKeywords: string[];
            }>(req);

            if (!body?.name || !body.url) {
              json(res, 400, { error: 'Nom et URL requis' });
              return;
            }

            await prisma.feed.create({
              data: {
                guildId,
                name: body.name,
                url: body.url,
                category: body.category || 'Général',
                enabled: body.enabled,
                includeKeywords: body.includeKeywords ?? [],
                excludeKeywords: body.excludeKeywords ?? []
              }
            });

            await pushAudit(guildId, {
              user: auditUser,
              action: 'Création flux RSS',
              context: getGuildName(client, guildId),
              module: 'RSS',
              eventType: 'Manuel',
              details: `Flux ${body.name} ajouté.`,
              channelId: body.targetChannel?.replace(/[^0-9]/g, '') || null
            });

            json(res, 201, { ok: true });
            return;
          }

          if (parts.length === 6 && parts[4] === 'feeds' && req.method === 'PUT') {
            const feedId = parts[5];
            const body = await readJsonBody<{
              name: string;
              url: string;
              category: string;
              scanMinutes: number;
              enabled: boolean;
              includeKeywords: string[];
              excludeKeywords: string[];
            }>(req);

            if (!body?.name || !body.url) {
              json(res, 400, { error: 'Nom et URL requis' });
              return;
            }

            await prisma.feed.update({
              where: { id: feedId },
              data: {
                name: body.name,
                url: body.url,
                category: body.category || 'Général',
                enabled: body.enabled,
                includeKeywords: body.includeKeywords ?? [],
                excludeKeywords: body.excludeKeywords ?? []
              }
            });

            await pushAudit(guildId, {
              user: auditUser,
              action: 'Modification flux RSS',
              context: getGuildName(client, guildId),
              module: 'RSS',
              eventType: 'Manuel',
              details: `Flux ${body.name} mis à jour.`,
              channelId: null
            });

            json(res, 200, { ok: true });
            return;
          }

          if (parts.length === 6 && parts[4] === 'feeds' && req.method === 'DELETE') {
            const feedId = parts[5];
            await prisma.feed.delete({ where: { id: feedId } });

            await pushAudit(guildId, {
              user: auditUser,
              action: 'Suppression flux RSS',
              context: getGuildName(client, guildId),
              module: 'RSS',
              eventType: 'Manuel',
              details: `Flux ${feedId} supprimé.`,
              channelId: null
            });

            json(res, 200, { ok: true });
            return;
          }

          if (parts.length === 5 && parts[4] === 'youtube' && req.method === 'PUT') {
            const body = await readJsonBody<{ youtubeReferenceChannelId?: string }>(req);
            const youtubeReferenceChannelId = body?.youtubeReferenceChannelId?.trim() || null;

            await prisma.guild.update({
              where: { id: guildId },
              data: {
                nathanYtChannelId: youtubeReferenceChannelId
              }
            });

            await pushAudit(guildId, {
              user: auditUser,
              action: 'Mise à jour YouTube',
              context: getGuildName(client, guildId),
              module: 'YouTube',
              eventType: 'Manuel',
              details: youtubeReferenceChannelId
                ? `Canal de référence défini: ${youtubeReferenceChannelId}.`
                : 'Canal de référence YouTube vidé.',
              channelId: null
            });

            json(res, 200, { ok: true });
            return;
          }

          if (parts.length === 7 && parts[4] === 'content' && req.method === 'POST') {
            const contentId = parts[5];
            const operation = parts[6];

            if (operation === 'translate' || operation === 'translate-title' || operation === 'translate-description') {
              const guild = await prisma.guild.findUnique({
                where: { id: guildId },
                select: { defaultTranslateTo: true }
              });

              const item = await prisma.feedItem.findFirst({
                where: { id: contentId, feed: { guildId } },
                include: {
                  feed: {
                    select: {
                      name: true,
                      translateTo: true
                    }
                  }
                }
              });

              if (!guild || !item) {
                json(res, 404, { error: 'Contenu introuvable' });
                return;
              }

              const targetLang =
                normalizeLangCode(item.feed.translateTo) ??
                normalizeLangCode(guild.defaultTranslateTo) ??
                DEFAULT_TRANSLATION_TARGET_LANG;

              const shouldTranslateTitle = operation !== 'translate-description';
              const descriptionForTranslation = prepareDescriptionForTranslation(item.description);
              const shouldTranslateDescription = operation !== 'translate-title' && Boolean(descriptionForTranslation);

              let translatedTitle: string | null = null;
              let translatedDescription: string | null = null;

              if (shouldTranslateTitle) {
                translatedTitle = await translate(item.title, targetLang);
                if (translatedTitle) {
                  await prisma.feedItem.update({
                    where: { id: contentId },
                    data: { titleTranslated: translatedTitle }
                  });
                }
              }

              if (shouldTranslateDescription) {
                translatedDescription = await translate(descriptionForTranslation, targetLang);
                if (translatedDescription) {
                  await prisma.feedItem.update({
                    where: { id: contentId },
                    data: { descriptionTranslated: translatedDescription }
                  });
                }
              }

              if (!translatedTitle && !translatedDescription) {
                json(res, 502, { error: 'Traduction indisponible' });
                return;
              }

              await pushAudit(guildId, {
                user: auditUser,
                action: 'Traduction contenu',
                context: getGuildName(client, guildId),
                module: 'Contenu',
                eventType: 'Manuel',
                details: `Contenu ${contentId} traduit en ${targetLang} via le dashboard.`,
                channelId: null
              });

              json(res, 200, {
                ok: true,
                targetLang,
                translatedTitle: Boolean(translatedTitle),
                translatedDescription: Boolean(translatedDescription)
              });
              return;
            }

            if (operation === 'translate') {
              const guild = await prisma.guild.findUnique({
                where: { id: guildId },
                select: { defaultTranslateTo: true }
              });

              const item = await prisma.feedItem.findFirst({
                where: { id: contentId, feed: { guildId } },
                include: {
                  feed: {
                    select: {
                      name: true,
                      translateTo: true
                    }
                  }
                }
              });

              if (!guild || !item) {
                json(res, 404, { error: 'Contenu introuvable' });
                return;
              }

              const targetLang =
                normalizeLangCode(item.feed.translateTo) ??
                normalizeLangCode(guild.defaultTranslateTo) ??
                DEFAULT_TRANSLATION_TARGET_LANG;

              const translatedTitle = await translate(item.title, targetLang);
              if (translatedTitle) {
                await prisma.feedItem.update({
                  where: { id: contentId },
                  data: { titleTranslated: translatedTitle }
                });
              }

              let translatedDescription: string | null = null;
              const descriptionForTranslation = prepareDescriptionForTranslation(item.description);
              if (descriptionForTranslation) {
                translatedDescription = await translate(descriptionForTranslation, targetLang);
                if (translatedDescription) {
                  await prisma.feedItem.update({
                    where: { id: contentId },
                    data: { descriptionTranslated: translatedDescription }
                  });
                }
              }

              if (!translatedTitle && !translatedDescription) {
                json(res, 502, { error: 'Traduction indisponible' });
                return;
              }
            }

            if (operation === 'force-send') {
              try {
                await approveContentFromDashboard(client, guildId, contentId, user.userId);
                await pushAudit(guildId, {
                  user: auditUser,
                  action: 'Validation contenu',
                  context: getGuildName(client, guildId),
                  module: 'Contenu',
                  eventType: 'Manuel',
                  details: `Contenu ${contentId} validé, publié et retiré de la file de validation.`,
                  channelId: null
                });
                broadcastDashboardStateChange(guildId, 'content_force_send');
                json(res, 200, { ok: true });
                return;
              } catch (error) {
                await pushAudit(guildId, {
                  user: auditUser,
                  action: 'Échec validation contenu',
                  context: getGuildName(client, guildId),
                  module: 'Contenu',
                  eventType: 'Manuel',
                  details: `Impossible de valider le contenu ${contentId}: ${error instanceof Error ? error.message : 'erreur inconnue'}.`,
                  channelId: null
                });
                throw error;
              }
            }

            if (operation === 'mark-error') {
              try {
                await rejectContentFromDashboard(client, guildId, contentId, user.userId);
                await pushAudit(guildId, {
                  user: auditUser,
                  action: 'Rejet contenu',
                  context: getGuildName(client, guildId),
                  module: 'Contenu',
                  eventType: 'Manuel',
                  details: `Contenu ${contentId} rejeté et retiré de la file de validation.`,
                  channelId: null
                });
                broadcastDashboardStateChange(guildId, 'content_mark_error');
                json(res, 200, { ok: true });
                return;
              } catch (error) {
                await pushAudit(guildId, {
                  user: auditUser,
                  action: 'Échec rejet contenu',
                  context: getGuildName(client, guildId),
                  module: 'Contenu',
                  eventType: 'Manuel',
                  details: `Impossible de rejeter le contenu ${contentId}: ${error instanceof Error ? error.message : 'erreur inconnue'}.`,
                  channelId: null
                });
                throw error;
              }
            }
          }

          if (parts.length === 5 && parts[4] === 'content' && req.method === 'POST') {
            const body = await readJsonBody<{ title?: string }>(req);
            const firstFeed = await prisma.feed.findFirst({ where: { guildId }, orderBy: { createdAt: 'asc' } });
            if (!firstFeed) {
              json(res, 400, { error: 'Aucun flux disponible pour créer un brouillon.' });
              return;
            }

            const draftTitle = body?.title?.trim() || 'Brouillon: nouvelle publication';
            await prisma.feedItem.create({
              data: {
                feedId: firstFeed.id,
                guid: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                title: draftTitle,
                url: `${firstFeed.url}#draft-${Date.now()}`,
                description: 'Brouillon créé depuis le dashboard.',
                author: 'Dashboard',
                publishedAt: new Date(),
                status: 'PENDING'
              }
            });

            await pushAudit(guildId, {
              user: auditUser,
              action: 'Création brouillon',
              context: getGuildName(client, guildId),
              module: 'Contenu',
              eventType: 'Manuel',
              details: `Brouillon créé sur le flux ${firstFeed.name}.`,
              channelId: null
            });

            json(res, 201, { ok: true });
            return;
          }

          if (parts.length === 6 && parts[4] === 'sanctions' && req.method === 'DELETE' && parts[5] !== 'reports') {
            if (access.level !== 'admin') {
              json(res, 403, { error: 'Seuls les administrateurs peuvent supprimer une infraction.' });
              return;
            }

            const sanctionId = parts[5];
            const sanction = await prisma.sanction.findFirst({
              where: { id: sanctionId, guildId },
              select: {
                id: true,
                type: true,
                targetTag: true,
                targetUserId: true,
              }
            });

            if (!sanction) {
              json(res, 404, { error: 'Infraction introuvable sur ce serveur.' });
              return;
            }

            await prisma.sanction.delete({ where: { id: sanction.id } });

            await pushAudit(guildId, {
              user: auditUser,
              action: 'Suppression infraction',
              context: getGuildName(client, guildId),
              module: 'Sanctions',
              eventType: 'Manuel',
              details: `Infraction ${sanction.id} supprimée (${sanction.type}) pour ${sanction.targetTag ?? sanction.targetUserId}.`,
              channelId: null
            });

            broadcastDashboardStateChange(guildId, 'sanction_deleted');
            json(res, 200, { ok: true });
            return;
          }

          if (parts.length === 6 && parts[4] === 'sanctions' && parts[5] === 'reports' && req.method === 'POST') {
            const body = await readJsonBody<{
              sanctionId?: string | null;
              staffPseudo?: string;
              incidentAt?: string;
              memberPseudo?: string;
              memberReference?: string;
              sanctionType?: string;
              sanctionDurationLabel?: string | null;
              brokenRules?: string;
              detailedReason?: string;
              evidenceLinks?: unknown;
              additionalNotes?: string | null;
            }>(req);

            const sanctionId = body?.sanctionId?.trim() ?? '';
            const brokenRules = normalizeBrokenRulesPayload(body?.brokenRules?.trim() ?? '');
            const detailedReason = body?.detailedReason?.trim() ?? '';
            const evidenceLinks = parseEvidenceLinks(body?.evidenceLinks);
            const incidentAt = body?.incidentAt ? new Date(body.incidentAt) : null;

            if (!sanctionId) {
              json(res, 400, { error: 'La sanction liée est obligatoire pour créer un rapport.' });
              return;
            }

            if (!incidentAt || Number.isNaN(incidentAt.getTime())) {
              json(res, 400, { error: 'Date/heure de l\'incident invalide.' });
              return;
            }

            if (evidenceLinks.length === 0) {
              json(res, 400, { error: 'Au moins un lien de preuve valide est obligatoire.' });
              return;
            }

            const sanction = await prisma.sanction.findFirst({ where: { id: sanctionId, guildId } });
            if (!sanction) {
              json(res, 404, { error: 'Sanction liée introuvable sur ce serveur.' });
              return;
            }

            if (sanction.moderatorUserId !== user.userId) {
              json(res, 403, { error: 'Seule la personne qui a appliqué la sanction peut créer ce rapport.' });
              return;
            }

            const existingReport = await prisma.sanctionReport.findFirst({ where: { guildId, sanctionId } });
            if (existingReport) {
              json(res, 409, { error: 'Un rapport existe déjà pour cette sanction.' });
              return;
            }

            const staffPseudo = sanction.moderatorTag?.trim() || body?.staffPseudo?.trim() || getAuditActor(user);
            const memberPseudo = sanction.targetTag?.trim() || body?.memberPseudo?.trim() || `Utilisateur ${sanction.targetUserId}`;
            const memberReference = sanction.targetUserId?.trim() || body?.memberReference?.trim() || sanction.targetUserId;
            const sanctionTypeRaw = sanction.type as DashboardSanctionType;
            const sanctionDurationLabel = body?.sanctionDurationLabel?.trim() || formatSanctionDurationLabel(sanction.durationSeconds);
            const finalIncidentAt = Number.isNaN(incidentAt.getTime()) ? sanction.createdAt : incidentAt;
            const finalBrokenRules = brokenRules || sanction.reason;
            const finalDetailedReason = detailedReason || sanction.reason;

            if (!finalBrokenRules || !finalDetailedReason) {
              json(res, 400, { error: 'Les champs de contenu du rapport sont obligatoires.' });
              return;
            }

            const report = await prisma.sanctionReport.create({
              data: {
                guildId,
                sanctionId,
                staffPseudo,
                incidentAt: finalIncidentAt,
                memberPseudo,
                memberReference,
                sanctionType: toSanctionType(sanctionTypeRaw),
                sanctionDurationLabel,
                brokenRules: finalBrokenRules,
                detailedReason: finalDetailedReason,
                evidenceLinks,
                additionalNotes: body?.additionalNotes?.trim() || null,
                createdByUserId: user.userId,
                createdByTag: user.username ?? null,
              }
            });

            await pushAudit(guildId, {
              user: auditUser,
              action: 'Création rapport sanction',
              context: getGuildName(client, guildId),
              module: 'Sanctions',
              eventType: 'Manuel',
              details: `Rapport ${report.id} créé pour ${memberPseudo} (${sanctionTypeRaw}).`,
              channelId: null
            });

            json(res, 201, { ok: true, reportId: report.id });
            return;
          }

          if (parts.length === 5 && parts[4] === 'notifications' && req.method === 'PUT') {
            const body = await readJsonBody<NotificationSettings>(req);
            if (!body) {
              json(res, 400, { error: 'Payload notifications invalide' });
              return;
            }

            const runtime = await getOrCreateRuntime(guildId);

            await prisma.guild.update({
              where: { id: guildId },
              data: {
                statusCheckChannelId: body.discordChannel?.replace(/[^0-9]/g, '') || null
              }
            });

            await prisma.dashboardSettings.update({
              where: { guildId },
              data: {
                email: body.email ?? '',
                emailEnabled: !!body.emailEnabled,
                cloudBackup: !!body.cloudBackup,
                debugLog: !!body.debugLog,
                killSwitchEnabled: !!body.killSwitchEnabled,
                severityByModule: body.severityByModule ?? runtime.severityByModule
              }
            });

            await pushAudit(guildId, {
              user: auditUser,
              action: 'Sauvegarde notifications',
              context: getGuildName(client, guildId),
              module: 'Notifications',
              eventType: 'Manuel',
              details: 'Paramètres globaux mis à jour.',
              channelId: body.discordChannel?.replace(/[^0-9]/g, '') || null
            });

            json(res, 200, { ok: true });
            return;
          }

          if (parts.length === 5 && parts[4] === 'settings' && (req.method === 'PATCH' || req.method === 'PUT')) {
            const body = await readJsonBody<{
              discordChannel?: string;
              logChannelId?: string | null;
              moderatorRoleId?: string | null;
              regulationChannelId?: string | null;
              messageTemplate?: string;
            }>(req);

            if (!body) {
              json(res, 400, { error: 'Payload settings invalide' });
              return;
            }

            const data: {
              statusCheckChannelId?: string | null;
              logChannelId?: string | null;
              moderatorRoleId?: string | null;
              regulationChannelId?: string | null;
            } = {};
            if (Object.prototype.hasOwnProperty.call(body, 'discordChannel')) {
              data.statusCheckChannelId = body.discordChannel?.replace(/[^0-9]/g, '') || null;
            }

            if (Object.prototype.hasOwnProperty.call(body, 'logChannelId')) {
              const rawLogChannelId = body.logChannelId;
              if (typeof rawLogChannelId === 'string' || rawLogChannelId === null) {
                data.logChannelId = rawLogChannelId?.replace(/[^0-9]/g, '') || null;
              }
            }

            if (Object.prototype.hasOwnProperty.call(body, 'moderatorRoleId')) {
              const rawModeratorRoleId = body.moderatorRoleId;
              if (typeof rawModeratorRoleId === 'string' || rawModeratorRoleId === null) {
                data.moderatorRoleId = rawModeratorRoleId?.replace(/[^0-9]/g, '') || null;
              }
            }

            if (Object.prototype.hasOwnProperty.call(body, 'regulationChannelId')) {
              const rawRegulationChannelId = body.regulationChannelId;
              if (typeof rawRegulationChannelId === 'string' || rawRegulationChannelId === null) {
                data.regulationChannelId = rawRegulationChannelId?.replace(/[^0-9]/g, '') || null;
              }
            }

            if (Object.keys(data).length > 0) {
              await prisma.guild.update({ where: { id: guildId }, data });
            }

            const runtime = await getOrCreateRuntime(guildId);
            if (typeof body.messageTemplate === 'string') {
              await prisma.dashboardSettings.update({
                where: { guildId },
                data: { messageTemplate: body.messageTemplate }
              });
            }

            await pushAudit(guildId, {
              user: auditUser,
              action: 'Sauvegarde paramètres globaux',
              context: getGuildName(client, guildId),
              module: 'Dashboard',
              eventType: 'Manuel',
              details: 'Paramètres globaux mis à jour.',
              channelId: null
            });

            json(res, 200, { ok: true });
            return;
          }

          if (parts.length === 6 && parts[4] === 'regulation' && parts[5] === 'articles' && req.method === 'POST') {
            const body = await readJsonBody<{
              title?: string;
              description?: string;
              emoji?: string | null;
              sortOrder?: number | string | null;
              enabled?: boolean;
            }>(req);

            const title = body?.title?.trim() ?? '';
            const description = body?.description?.trim() ?? '';
            const emoji = body?.emoji?.trim() ?? null;
            const providedSortOrder = body?.sortOrder !== undefined ? Number(body.sortOrder) : null;
            const highestSortOrder = await prisma.guildRegulationArticle.findFirst({
              where: { guildId },
              orderBy: { sortOrder: 'desc' },
              select: { sortOrder: true },
            });
            const sortOrder = Number.isFinite(providedSortOrder)
              ? (providedSortOrder as number)
              : (highestSortOrder?.sortOrder ?? -1) + 1;

            if (!title || !description) {
              json(res, 400, { error: 'Le titre et la description sont obligatoires.' });
              return;
            }

            const article = await prisma.guildRegulationArticle.create({
              data: {
                guildId,
                title,
                description,
                emoji: emoji || null,
                sortOrder,
                enabled: body?.enabled ?? true,
              },
            });

            const orderedArticles = await prisma.guildRegulationArticle.findMany({
              where: { guildId },
              select: { id: true },
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            });

            await prisma.$transaction(
              orderedArticles.map((entry, index) =>
                prisma.guildRegulationArticle.update({
                  where: { id: entry.id },
                  data: { sortOrder: index },
                })
              )
            );

            await pushAudit(guildId, {
              user: auditUser,
              action: 'Création article règlement',
              context: getGuildName(client, guildId),
              module: 'Règlement',
              eventType: 'Manuel',
              details: `Article "${article.title}" ajouté au règlement.`,
              channelId: null
            });

            broadcastDashboardStateChange(guildId, 'regulation_article_created');
            json(res, 201, { ok: true, articleId: article.id });
            return;
          }

          if (parts.length === 7 && parts[4] === 'regulation' && parts[5] === 'articles' && parts[6] === 'reorder' && req.method === 'PATCH') {
            const body = await readJsonBody<{ articleIds?: unknown }>(req);
            const requestedIds = Array.isArray(body?.articleIds)
              ? body.articleIds.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
              : [];

            if (requestedIds.length === 0) {
              json(res, 400, { error: 'La liste des articles à réordonner est invalide.' });
              return;
            }

            const existingArticles = await prisma.guildRegulationArticle.findMany({
              where: { guildId },
              select: { id: true },
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            });
            const existingById = new Set(existingArticles.map((article) => article.id));
            const orderedIds: string[] = [];
            const seenIds = new Set<string>();

            for (const articleId of requestedIds) {
              if (!existingById.has(articleId) || seenIds.has(articleId)) {
                continue;
              }

              orderedIds.push(articleId);
              seenIds.add(articleId);
            }

            for (const article of existingArticles) {
              if (seenIds.has(article.id)) {
                continue;
              }

              orderedIds.push(article.id);
              seenIds.add(article.id);
            }

            await prisma.$transaction(
              orderedIds.map((articleId, index) =>
                prisma.guildRegulationArticle.update({
                  where: { id: articleId },
                  data: { sortOrder: index },
                })
              )
            );

            await pushAudit(guildId, {
              user: auditUser,
              action: 'Réordonnancement articles règlement',
              context: getGuildName(client, guildId),
              module: 'Règlement',
              eventType: 'Manuel',
              details: `${orderedIds.length} article(s) réorganisé(s).`,
              channelId: null
            });

            broadcastDashboardStateChange(guildId, 'regulation_articles_reordered');
            json(res, 200, { ok: true });
            return;
          }

          if (parts.length === 7 && parts[4] === 'regulation' && parts[5] === 'articles' && req.method === 'PATCH') {
            const articleId = parts[6];
            const existingArticle = await prisma.guildRegulationArticle.findFirst({
              where: { id: articleId, guildId },
            });

            if (!existingArticle) {
              json(res, 404, { error: 'Article de règlement introuvable.' });
              return;
            }

            const body = await readJsonBody<{
              title?: string;
              description?: string;
              emoji?: string | null;
              sortOrder?: number | string | null;
              enabled?: boolean;
            }>(req);

            const title = typeof body?.title === 'string' ? body.title.trim() : existingArticle.title;
            const description = typeof body?.description === 'string' ? body.description.trim() : existingArticle.description;
            const emoji = typeof body?.emoji === 'string' ? body.emoji.trim() : existingArticle.emoji;
            const sortOrderValue = body?.sortOrder !== undefined ? Number(body.sortOrder) : existingArticle.sortOrder;

            if (!title || !description) {
              json(res, 400, { error: 'Le titre et la description sont obligatoires.' });
              return;
            }

            const article = await prisma.guildRegulationArticle.update({
              where: { id: existingArticle.id },
              data: {
                title,
                description,
                emoji: emoji || null,
                sortOrder: Number.isFinite(sortOrderValue) ? sortOrderValue : existingArticle.sortOrder,
                enabled: typeof body?.enabled === 'boolean' ? body.enabled : existingArticle.enabled,
              },
            });

            await pushAudit(guildId, {
              user: auditUser,
              action: 'Modification article règlement',
              context: getGuildName(client, guildId),
              module: 'Règlement',
              eventType: 'Manuel',
              details: `Article "${article.title}" mis à jour.`,
              channelId: null
            });

            broadcastDashboardStateChange(guildId, 'regulation_article_updated');
            json(res, 200, { ok: true });
            return;
          }

          if (parts.length === 7 && parts[4] === 'regulation' && parts[5] === 'articles' && req.method === 'DELETE') {
            const articleId = parts[6];
            const article = await prisma.guildRegulationArticle.findFirst({ where: { id: articleId, guildId } });

            if (!article) {
              json(res, 404, { error: 'Article de règlement introuvable.' });
              return;
            }

            await prisma.guildRegulationArticle.delete({ where: { id: article.id } });

            const remainingArticles = await prisma.guildRegulationArticle.findMany({
              where: { guildId },
              select: { id: true },
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            });

            if (remainingArticles.length > 0) {
              await prisma.$transaction(
                remainingArticles.map((entry, index) =>
                  prisma.guildRegulationArticle.update({
                    where: { id: entry.id },
                    data: { sortOrder: index },
                  })
                )
              );
            }

            await pushAudit(guildId, {
              user: auditUser,
              action: 'Suppression article règlement',
              context: getGuildName(client, guildId),
              module: 'Règlement',
              eventType: 'Manuel',
              details: `Article "${article.title}" supprimé du règlement.`,
              channelId: null
            });

            broadcastDashboardStateChange(guildId, 'regulation_article_deleted');
            json(res, 200, { ok: true });
            return;
          }

          if (parts.length === 6 && parts[4] === 'regulation' && parts[5] === 'publish' && req.method === 'POST') {
            try {
              const result = await publishOrUpdateRegulationMessage(client, guildId);

              await pushAudit(guildId, {
                user: auditUser,
                action: result.mode === 'updated' ? 'Actualisation règlement' : 'Publication règlement',
                context: getGuildName(client, guildId),
                module: 'Règlement',
                eventType: 'Manuel',
                details: result.mode === 'updated'
                    ? 'Message de règlement mis à jour dans le salon de publication du règlement.'
                    : 'Message de règlement publié dans le salon de publication du règlement.',
                channelId: null
              });

              broadcastDashboardStateChange(guildId, 'regulation_published');
              json(res, 200, { ok: true, mode: result.mode, messageId: result.messageId });
              return;
            } catch (error) {
              json(res, 400, {
                error: error instanceof Error ? error.message : 'Impossible de publier le règlement.',
              });
              return;
            }
          }

          if (parts.length === 5 && parts[4] === 'command-access' && req.method === 'PUT') {
            const body = await readJsonBody<{ commandRestrictions?: unknown }>(req);
            if (!body) {
              json(res, 400, { error: 'Payload de restrictions invalide' });
              return;
            }

            const commandRestrictions = normalizeCommandRestrictions(body.commandRestrictions);

            await prisma.dashboardSettings.update({
              where: { guildId },
              data: { commandRestrictions }
            });

            await pushAudit(guildId, {
              user: auditUser,
              action: 'Sauvegarde restrictions commandes',
              context: getGuildName(client, guildId),
              module: 'Dashboard',
              eventType: 'Manuel',
              details: `${commandRestrictions.length} règle(s) de commande enregistrée(s).`,
              channelId: null
            });

            json(res, 200, { ok: true });
            return;
          }

          if (parts.length === 5 && parts[4] === 'template' && req.method === 'PUT') {
            const body = await readJsonBody<{ messageTemplate: string }>(req);
            const runtime = await getOrCreateRuntime(guildId);
            await prisma.dashboardSettings.update({
              where: { guildId },
              data: { messageTemplate: body?.messageTemplate || runtime.messageTemplate }
            });
            await pushAudit(guildId, {
              user: auditUser,
              action: 'Mise à jour template',
              context: getGuildName(client, guildId),
              module: 'Contenu',
              eventType: 'Manuel',
              details: 'Template de message éditorial mis à jour.',
              channelId: null
            });
            json(res, 200, { ok: true });
            return;
          }

          if (parts.length === 5 && parts[4] === 'daily-algo-problems' && req.method === 'GET') {
            const problems = await prisma.dailyAlgoProblem.findMany({
              orderBy: [
                { usedAt: { sort: 'asc', nulls: 'first' } },
                { createdAt: 'desc' },
              ]
            });
            json(res, 200, problems);
            return;
          }

          if (parts.length === 6 && parts[4] === 'daily-algo-submissions' && parts[5] === 'today' && req.method === 'GET') {
            const dateKey = getLocalDateKey();
            const run = await prisma.dailyAlgoRun.findUnique({
              where: {
                guildId_dateKey: {
                  guildId,
                  dateKey,
                },
              },
              include: {
                problem: {
                  select: {
                    id: true,
                    title: true,
                    description: true,
                    difficulty: true,
                  },
                },
                submissions: {
                  orderBy: {
                    submittedAt: 'asc',
                  },
                },
              },
            });

            if (!run) {
              json(res, 200, {
                dateKey,
                run: null,
                submissions: [],
              });
              return;
            }

            const validatedByIds = [...new Set(run.submissions.map((submission) => submission.validatedById).filter((value): value is string => Boolean(value)))];
            const validatedByLabelEntries = await Promise.all(
              validatedByIds.map(async (moderatorId) => {
                const discordUser = await client.users.fetch(moderatorId).catch(() => null);
                return [moderatorId, discordUser?.globalName ?? discordUser?.username ?? `Utilisateur ${moderatorId}`] as const;
              }),
            );
            const validatedByMap = new Map<string, string>(validatedByLabelEntries);

            const submissions = run.submissions.map((submission) => {
              const finalScore = resolveDailyAlgoFinalScore(submission);
              const totalPoints = finalScore !== null
                ? Math.round((finalScore + (submission.speedBonusPoints ?? 0)) * 10) / 10
                : null;

              return {
                id: submission.id,
                authorId: submission.authorId,
                authorName: submission.authorName,
                solution: submission.solution,
                status: submission.status,
                submittedAt: submission.submittedAt.toISOString(),
                speedRank: submission.speedRank,
                speedBonusPoints: submission.speedBonusPoints,
                scoreCorrectness: submission.scoreCorrectness,
                scoreComments: submission.scoreComments,
                scoreCompactness: submission.scoreCompactness,
                scoreOptimization: submission.scoreOptimization,
                scoreReadability: submission.scoreReadability,
                scoreFinal: finalScore,
                totalPoints,
                reviewFeedback: submission.reviewFeedback,
                validatedById: submission.validatedById,
                validatedByName: submission.validatedById ? validatedByMap.get(submission.validatedById) ?? `Utilisateur ${submission.validatedById}` : null,
                validatedAt: submission.validatedAt?.toISOString() ?? null,
              };
            });

            json(res, 200, {
              dateKey,
              run: {
                id: run.id,
                challengeChannelId: run.challengeChannelId,
                validationChannelId: run.validationChannelId,
                problem: {
                  id: run.problem.id,
                  title: run.problem.title,
                  description: run.problem.description,
                  difficulty: run.problem.difficulty,
                },
                createdAt: run.createdAt.toISOString(),
              },
              submissions,
            });
            return;
          }

          if (parts.length === 6 && parts[4] === 'daily-algo-submissions' && parts[5] === 'history' && req.method === 'GET') {
            const todayKey = getLocalDateKey();
            const limitParam = Number(url.searchParams.get('limit') ?? 7);
            const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(30, Math.trunc(limitParam))) : 7;

            const runs = await prisma.dailyAlgoRun.findMany({
              where: {
                guildId,
                dateKey: {
                  lt: todayKey,
                },
              },
              orderBy: {
                dateKey: 'desc',
              },
              take: limit,
              include: {
                problem: {
                  select: {
                    id: true,
                    title: true,
                    difficulty: true,
                  },
                },
                submissions: {
                  orderBy: {
                    submittedAt: 'asc',
                  },
                },
              },
            });

            const history = runs.map((run) => {
              const approved = run.submissions.filter((submission) => submission.status === 'APPROVED');
              const rejected = run.submissions.filter((submission) => submission.status === 'REJECTED');
              const pending = run.submissions.filter((submission) => submission.status === 'PENDING');

              const topEntries = approved
                .map((submission) => ({
                  finalScore: resolveDailyAlgoFinalScore(submission),
                  id: submission.id,
                  authorName: submission.authorName,
                  totalPoints: 0,
                  scoreFinal: null,
                  speedBonusPoints: submission.speedBonusPoints,
                  speedRank: submission.speedRank,
                }))
                .map((entry) => ({
                  ...entry,
                  totalPoints: entry.finalScore !== null
                    ? Math.round(((entry.finalScore + (entry.speedBonusPoints ?? 0)) * 10)) / 10
                    : null,
                  scoreFinal: entry.finalScore,
                }))
                .filter((entry) => entry.totalPoints !== null)
                .sort((left, right) => {
                  if ((right.totalPoints ?? 0) !== (left.totalPoints ?? 0)) return (right.totalPoints ?? 0) - (left.totalPoints ?? 0);
                  return (left.speedRank ?? 999) - (right.speedRank ?? 999);
                })
                .slice(0, 3);

              return {
                id: run.id,
                dateKey: run.dateKey,
                createdAt: run.createdAt.toISOString(),
                problem: {
                  id: run.problem.id,
                  title: run.problem.title,
                  difficulty: run.problem.difficulty,
                },
                stats: {
                  total: run.submissions.length,
                  approved: approved.length,
                  rejected: rejected.length,
                  pending: pending.length,
                },
                topEntries,
              };
            });

            json(res, 200, {
              todayKey,
              history,
            });
            return;
          }

          if (parts.length === 6 && parts[4] === 'daily-algo-submissions' && req.method === 'PATCH') {
            const submissionId = parts[5];
            const body = await readJsonBody<{
              action?: 'approve' | 'reject';
              feedback?: string;
              scores?: {
                correctness?: number;
                comments?: number;
                compactness?: number;
                optimization?: number;
                readability?: number;
              };
            }>(req);

            if (!body?.action || !['approve', 'reject'].includes(body.action)) {
              json(res, 400, { error: 'Action Daily Algo invalide.' });
              return;
            }

            let scores:
              | {
                  correctness: number;
                  comments: number;
                  compactness: number;
                  optimization: number;
                  readability: number;
                }
              | undefined;

            if (body.action === 'approve') {
              const rawScores = body.scores;
              if (!rawScores) {
                json(res, 400, { error: 'Les notes sont requises pour valider une soumission.' });
                return;
              }

              const parsed = {
                correctness: Number(rawScores.correctness),
                comments: Number(rawScores.comments),
                compactness: Number(rawScores.compactness),
                optimization: Number(rawScores.optimization),
                readability: Number(rawScores.readability),
              };

              const hasInvalidScore = Object.values(parsed).some((value) => !Number.isFinite(value) || value < 1 || value > 5);
              if (hasInvalidScore) {
                json(res, 400, { error: 'Chaque note doit être comprise entre 1 et 5.' });
                return;
              }

              scores = parsed;
            }

            const success = await reviewDailyAlgoSubmission({
              client,
              submissionId,
              action: body.action,
              moderatorId: user.userId,
              scores,
              feedback: body.feedback,
              allowReviewedUpdate: true,
            });

            if (!success) {
              json(res, 404, { error: 'Soumission Daily Algo introuvable ou déjà traitée.' });
              return;
            }

            await pushAudit(guildId, {
              user: auditUser,
              action: body.action === 'approve' ? 'Validation soumission Daily Algo' : 'Rejet soumission Daily Algo',
              context: getGuildName(client, guildId),
              module: 'Daily Algo',
              eventType: 'Manuel',
              details: body.action === 'approve'
                ? `Soumission ${submissionId} validée avec notation.`
                : `Soumission ${submissionId} rejetée.`,
              channelId: null,
            });

            broadcastDashboardStateChange(guildId, 'daily_algo_submission_reviewed');
            json(res, 200, { ok: true });
            return;
          }

          if (parts.length === 5 && parts[4] === 'daily-algo-problems' && req.method === 'POST') {
            const body = await readJsonBody<{ title: string; description: string; solution: string; difficulty: string; language: string }>(req);
            if (!body || !body.title || !body.description || !body.solution) {
              json(res, 400, { error: 'Payload invalide : champs manquants' });
              return;
            }

            const problem = await prisma.dailyAlgoProblem.create({
              data: {
                title: body.title,
                description: body.description,
                solution: body.solution,
                difficulty: body.difficulty || 'moyen',
                language: body.language || 'fr',
              }
            });

            await pushAudit(guildId, {
              user: auditUser,
              action: 'Ajout Exercice',
              context: getGuildName(client, guildId),
              module: 'Daily Algo',
              eventType: 'Manuel',
              details: `Ajout d'un nouvel exercice : ${problem.title}`,
              channelId: null
            });

            json(res, 201, problem);
            return;
          }

          if (parts.length === 6 && parts[4] === 'daily-algo-runs' && parts[5] === 'schedule' && req.method === 'GET') {
            try {
              const daysBack = Number(url.searchParams.get('daysBack') ?? '7');
              const daysForward = Number(url.searchParams.get('daysForward') ?? '21');
              const runs = await getDailyAlgoScheduleRuns(guildId, daysBack, daysForward);
              json(res, 200, { runs });
            } catch (err) {
              logger.error('DashboardAPI', 'Erreur lors de la récupération du planning Daily Algo:', err);
              json(res, 500, { error: 'Erreur lors de la récupération du planning Daily Algo' });
            }
            return;
          }

          if (parts.length === 7 && parts[4] === 'daily-algo-runs' && parts[5] === 'schedule' && parts[6] === 'ensure' && req.method === 'POST') {
            try {
              const body = await readJsonBody<{ daysForward?: unknown }>(req);
              const parsedDaysForward = Number(body?.daysForward ?? url.searchParams.get('daysForward') ?? '21');
              const daysForward = Number.isFinite(parsedDaysForward) ? parsedDaysForward : 21;
              const result = await ensureDailyAlgoScheduleRuns(guildId, daysForward);
              json(res, 200, { ok: true, ...result });
            } catch (err) {
              logger.error('DashboardAPI', 'Erreur lors de la génération du planning Daily Algo:', err);
              json(res, 500, { error: err instanceof Error ? err.message : 'Erreur lors de la génération du planning Daily Algo' });
            }
            return;
          }

          if (parts.length === 5 && parts[4] === 'import' && req.method === 'POST') {
            const body = await readJsonBody<DashboardState>(req);
            if (!body) {
              json(res, 400, { error: 'Payload import invalide' });
              return;
            }

            const runtime = await getOrCreateRuntime(guildId);
            await prisma.dashboardSettings.update({
              where: { guildId },
              data: {
                email: body.notifications?.email ?? runtime.email,
                emailEnabled: !!body.notifications?.emailEnabled,
                cloudBackup: !!body.notifications?.cloudBackup,
                debugLog: !!body.notifications?.debugLog,
                killSwitchEnabled: !!body.notifications?.killSwitchEnabled,
                severityByModule: body.notifications?.severityByModule ?? runtime.severityByModule,
                messageTemplate: body.messageTemplate ?? runtime.messageTemplate
              }
            });

            await pushAudit(guildId, {
              user: auditUser,
              action: 'Import dashboard',
              context: getGuildName(client, guildId),
              module: 'Dashboard',
              eventType: 'Manuel',
              details: 'Configuration importée depuis un fichier JSON.',
              channelId: null
            });

            json(res, 200, { ok: true });
            return;
          }
        }
      }

      // --- STAFF MANAGEMENT ROUTES ---
      if (parts.length >= 3 && parts[0] === 'api' && parts[1] === 'dashboard') {
        const user = verifyAuth(req);
        if (!user) {
          json(res, 401, { error: 'Non authentifié' });
          return;
        }

        // GET /api/dashboard/.../users/:userId/profile - User profile
        const usersIdx = parts.indexOf('users');
        if (usersIdx !== -1 && parts[usersIdx + 2] === 'profile' && req.method === 'GET') {
          const userId = parts[usersIdx + 1];
          if (!userId) {
            json(res, 400, { error: 'userId manquant' });
            return;
          }

          try {
            const staffMember = await getStaffMember('any', userId); // Get profile without guildId restriction
            const apiKeys = staffMember ? await getAPIKeys(staffMember.guildId) : [];
            const blacklist = staffMember ? await getActiveBlacklist(staffMember.guildId, userId) : null;

            json(res, 200, {
              staffMember,
              apiKeys: apiKeys.map(k => ({
                id: k.id,
                displayKey: k.displayKey,
                name: k.name,
                permissions: k.permissions,
                lastUsedAt: k.lastUsedAt,
              })),
              isBlacklisted: !!blacklist,
              blacklistReason: blacklist?.reason,
              blacklistEndDate: blacklist?.endDate,
            });
          } catch (err) {
            logger.error('StaffAPI', 'Error getting user profile:', err);
            json(res, 500, { error: 'Erreur lors de la récupération du profil' });
          }
          return;
        }

        // GET /api/dashboard/.../users/:userId/staff-stats - Staff statistics
        if (usersIdx !== -1 && parts[usersIdx + 2] === 'staff-stats' && req.method === 'GET') {
          const userId = parts[usersIdx + 1];
          if (!userId) {
            json(res, 400, { error: 'userId manquant' });
            return;
          }

          try {
            const staffMember = await prisma.staffMember.findFirst({
              where: { userId },
              include: {
                warnings: { where: { isActive: true } },
                activities: { orderBy: { activityDate: 'desc' }, take: 30 },
              },
            });

            if (!staffMember) {
              json(res, 404, { error: 'Membre du staff introuvable' });
              return;
            }

            const stats = {
              totalMessages: staffMember.activities.reduce((sum, a) => sum + a.messageCount, 0),
              totalVoiceMinutes: staffMember.activities.reduce((sum, a) => sum + a.voiceMinutes, 0),
              activeWarnings: staffMember.warnings.length,
              joinedStaffAt: staffMember.joinedStaffAt,
              currentRoleStartedAt: staffMember.currentRoleStartedAt,
              activities: staffMember.activities,
            };

            json(res, 200, { stats });
          } catch (err) {
            logger.error('StaffAPI', 'Error getting staff stats:', err);
            json(res, 500, { error: 'Erreur lors de la récupération des statistiques' });
          }
          return;
        }

        // POST/GET API Keys routes
        if (parts[4] === 'api-keys') {
          const guildId = parts[3] ?? null;
          if (!guildId) {
            json(res, 400, { error: 'guildId manquant' });
            return;
          }

          const accessLevel = await resolveDashboardAccess(client, guildId, user.userId);
          if (accessLevel.level === 'none') {
            json(res, 403, { error: 'Accès refusé' });
            return;
          }

          // POST /api/dashboard/guilds/:guildId/api-keys - Create API key
          if (req.method === 'POST') {
            const body = await readJsonBody<{
              name?: string;
              permissions?: string[];
            }>(req);

            try {
              const { fullKey, displayKey } = generateAPIKey();
              const keyHash = hashAPIKey(fullKey);

              const apiKey = await createAPIKey(
                guildId,
                user.userId,
                keyHash,
                displayKey,
                body?.name || 'Mon clé API',
                body?.permissions || ['daily_algo:create_exercise']
              );

              await pushAudit(guildId, {
                user: user.username ?? `User${user.userId}`,
                action: 'Création clé API',
                context: getGuildName(client, guildId),
                module: 'Staff Management',
                eventType: 'Manuel',
                details: `Clé API créée: ${displayKey}`,
                channelId: null
              });

              json(res, 201, {
                id: apiKey.id,
                fullKey, // Important: retourner la clé complète une seule fois
                displayKey: apiKey.displayKey,
                name: apiKey.name,
                permissions: apiKey.permissions,
              });
            } catch (err) {
              logger.error('StaffAPI', 'Error creating API key:', err);
              json(res, 500, { error: 'Erreur lors de la création de la clé API' });
            }
            return;
          }

          // GET /api/dashboard/guilds/:guildId/api-keys - List API keys
          if (req.method === 'GET') {
            try {
              const keys = await getAPIKeys(guildId);
              json(res, 200, { keys });
            } catch (err) {
              logger.error('StaffAPI', 'Error getting API keys:', err);
              json(res, 500, { error: 'Erreur lors de la récupération des clés API' });
            }
            return;
          }

          // DELETE /api/dashboard/guilds/:guildId/api-keys/:keyId - Delete API key
          if (parts[5] && req.method === 'DELETE') {
            const keyId = parts[5];
            try {
              await deleteAPIKey(keyId);

              await pushAudit(guildId, {
                user: user.username ?? `User${user.userId}`,
                action: 'Suppression clé API',
                context: getGuildName(client, guildId),
                module: 'Staff Management',
                eventType: 'Manuel',
                details: `Clé API supprimée: ${keyId}`,
                channelId: null
              });

              json(res, 200, { ok: true });
            } catch (err) {
              logger.error('StaffAPI', 'Error deleting API key:', err);
              json(res, 500, { error: 'Erreur lors de la suppression de la clé API' });
            }
            return;
          }
        }

        // ADMIN+ STAFF MANAGEMENT ROUTES
        if (parts[4] === 'staff') {
          const guildId = parts[3] ?? null;
          if (!guildId) {
            json(res, 400, { error: 'guildId manquant' });
            return;
          }

          const accessLevel = await resolveDashboardAccess(client, guildId, user.userId);
          if (accessLevel.level !== 'admin') {
            json(res, 403, { error: 'Accès admin requis' });
            return;
          }

          // GET /api/dashboard/guilds/:guildId/staff/algo-schedule - Get daily algo schedule
          if (parts[5] === 'algo-schedule' && req.method === 'GET' && !parts[6]) {
            try {
              const rangeDays = Number(url.searchParams.get('range') || '14');
              const runs = await prisma.dailyAlgoRun.findMany({
                where: { guildId },
                include: { problem: true },
                orderBy: { createdAt: 'desc' }, // Use createdAt or find a better way to sort by date
                take: rangeDays
              });
              json(res, 200, { runs });
            } catch (err) {
              logger.error('StaffAPI', 'Error getting algo schedule:', err);
              json(res, 500, { error: 'Erreur lors de la récupération du planning Daily Algo' });
            }
            return;
          }

          // POST /api/dashboard/guilds/:guildId/staff/algo-ensure - Trigger schedule generation
          if (parts[5] === 'algo-ensure' && req.method === 'POST') {
             try {
                // Here we would normally trigger the generation service
                // For now, we return success to allow the UI to proceed
                json(res, 200, { ok: true, message: 'Génération de planning demandée' });
             } catch (err) {
                logger.error('StaffAPI', 'Error triggering algo ensure:', err);
                json(res, 500, { error: 'Erreur lors de la génération du planning' });
             }
             return;
          }

          // GET /api/dashboard/guilds/:guildId/staff/alerts - Get leadership metrics and alerts
          if (parts[5] === 'alerts' && req.method === 'GET' && !parts[6]) {
            try {
              const metrics = await getStaffAlertsAndProgression(guildId);
              json(res, 200, { metrics });
            } catch (err) {
              logger.error('StaffAPI', 'Error getting staff alerts:', err);
              json(res, 500, { error: 'Erreur lors de la récupération des alertes' });
            }
            return;
          }

          // GET /api/dashboard/guilds/:guildId/staff/discord-members - Search Discord members
          if (parts[5] === 'discord-members' && req.method === 'GET' && !parts[6]) {
            try {
              const rawQuery = (url.searchParams.get('q') ?? url.searchParams.get('query') ?? '').trim();
              const parsedLimit = Number(url.searchParams.get('limit') ?? '12');
              const limit = Number.isFinite(parsedLimit)
                ? Math.min(25, Math.max(1, Math.trunc(parsedLimit)))
                : 12;

              const discordGuild = client.guilds.cache.get(guildId)
                ?? await client.guilds.fetch(guildId).catch(() => null);

              if (!discordGuild) {
                json(res, 404, { error: 'Serveur Discord introuvable' });
                return;
              }

              const mentionMatch = rawQuery.match(/<@!?(\d{15,25})>/);
              const directId = mentionMatch?.[1] ?? (/^\d{15,25}$/.test(rawQuery) ? rawQuery : null);

              let candidates = [] as Array<{
                id: string;
                username: string;
                displayName: string | null;
                userTag: string | null;
                avatarUrl: string | null;
              }>;

              if (directId) {
                const member = await discordGuild.members.fetch(directId).catch(() => null);
                if (member && !member.user.bot) {
                  candidates = [{
                    id: member.user.id,
                    username: member.user.username,
                    displayName: member.displayName ?? null,
                    userTag: member.user.tag ?? null,
                    avatarUrl: member.displayAvatarURL() || null,
                  }];
                }
              } else if (rawQuery) {
                const query = rawQuery.replace(/^@+/, '').trim();
                const members = await discordGuild.members.search({ query, limit }).catch(() => null);

                candidates = members
                  ? members
                    .filter((member) => !member.user.bot)
                    .map((member) => ({
                      id: member.user.id,
                      username: member.user.username,
                      displayName: member.displayName ?? null,
                      userTag: member.user.tag ?? null,
                      avatarUrl: member.displayAvatarURL() || null,
                    }))
                  : [];
              }

              const members = candidates
                .sort((a, b) => (a.displayName || a.username).localeCompare((b.displayName || b.username), 'fr'))
                .slice(0, limit);

              json(res, 200, { members });
            } catch (err) {
              logger.error('StaffAPI', 'Error searching Discord members:', err);
              json(res, 500, { error: 'Erreur lors de la recherche des membres Discord' });
            }
            return;
          }

          // GET /api/dashboard/guilds/:guildId/staff/members - List staff members
          if (parts[5] === 'members' && req.method === 'GET' && !parts[6]) {
            try {
              const members = await prisma.staffMember.findMany({
                where: { guildId },
                include: {
                  warnings: { where: { isActive: true } },
                  blacklistEntries: { where: { isActive: true } },
                  testingPeriods: { where: { status: 'ONGOING' } },
                },
                orderBy: { grade: 'asc' },
              });

              json(res, 200, { members });
            } catch (err) {
              logger.error('StaffAPI', 'Error listing staff members:', err);
              json(res, 500, { error: 'Erreur lors de la récupération des membres staff' });
            }
            return;
          }

          // POST /api/dashboard/guilds/:guildId/staff/members - Add staff member
          if (parts[5] === 'members' && req.method === 'POST' && !parts[6]) {
            const body = await readJsonBody<{
              userId: string;
              grade: string;
              userTag?: string;
              username?: string;
              displayName?: string;
              avatarUrl?: string;
            }>(req);

            if (!body?.userId || !body?.grade) {
              json(res, 400, { error: 'userId et grade sont obligatoires' });
              return;
            }

            try {
              const member = await addStaffMember(
                guildId,
                body.userId,
                body.grade as any,
                body.userTag,
                body.username,
                body.displayName,
                body.avatarUrl
              );

              // Créer une période de test initiale
              await createTestingPeriod(guildId, body.userId);

              await pushAudit(guildId, {
                user: user.username ?? `User${user.userId}`,
                action: 'Ajout membre staff',
                context: getGuildName(client, guildId),
                module: 'Staff Management',
                eventType: 'Manuel',
                details: `Nouveau membre staff: ${body.username || body.userId} (${body.grade})`,
                channelId: null
              });

              json(res, 201, { member });
            } catch (err) {
              logger.error('StaffAPI', 'Error adding staff member:', err);
              json(res, 500, { error: 'Erreur lors de l\'ajout du membre staff' });
            }
            return;
          }

          // GET /api/dashboard/guilds/:guildId/staff/members/:userId - Get staff member details
          if (parts[5] === 'members' && parts[6] && req.method === 'GET') {
            const staffUserId = parts[6];
            try {
              const stats = await getStaffMemberStats(guildId, staffUserId);
              json(res, 200, stats);
            } catch (err) {
              logger.error('StaffAPI', 'Error getting staff member details:', err);
              json(res, 500, { error: 'Erreur lors de la récupération des détails' });
            }
            return;
          }

          // PATCH /api/dashboard/guilds/:guildId/staff/members/:userId - Update staff member
          if (parts[5] === 'members' && parts[6] && req.method === 'PATCH') {
            const staffUserId = parts[6];
            const body = await readJsonBody<{
              grade?: string;
              action?: string; // promote, demote, remove
            }>(req);

            try {
              if (body?.grade) {
                await updateStaffGrade(guildId, staffUserId, body.grade as any);

                await pushAudit(guildId, {
                  user: user.username ?? `User${user.userId}`,
                  action: 'Changement de grade staff',
                  context: getGuildName(client, guildId),
                  module: 'Staff Management',
                  eventType: 'Manuel',
                  details: `Grade changé pour ${staffUserId}: ${body.grade}`,
                  channelId: null
                });
              }

              if (body?.action === 'remove') {
                await removeStaffMember(guildId, staffUserId);

                await pushAudit(guildId, {
                  user: user.username ?? `User${user.userId}`,
                  action: 'Retrait member staff',
                  context: getGuildName(client, guildId),
                  module: 'Staff Management',
                  eventType: 'Manuel',
                  details: `Membre staff retiré: ${staffUserId}`,
                  channelId: null
                });
              }

              json(res, 200, { ok: true });
            } catch (err) {
              logger.error('StaffAPI', 'Error updating staff member:', err);
              json(res, 500, { error: 'Erreur lors de la mise à jour du membre staff' });
            }
            return;
          }

          // POST /api/dashboard/guilds/:guildId/staff/members/:userId/tutor - Toggle tutor status
          if (parts[5] === 'members' && parts[6] && parts[7] === 'tutor' && req.method === 'POST') {
            const staffUserId = parts[6];

            try {
              const member = await toggleTutorStatus(guildId, staffUserId);

              await pushAudit(guildId, {
                user: user.username ?? `User${user.userId}`,
                action: member.isTutor ? 'Activation tuteur' : 'Désactivation tuteur',
                context: getGuildName(client, guildId),
                module: 'Staff Management',
                eventType: 'Manuel',
                details: `Statut tuteur modifié pour ${staffUserId}: ${member.isTutor ? 'ON' : 'OFF'}`,
                channelId: null
              });

              json(res, 200, { member });
            } catch (err) {
              logger.error('StaffAPI', 'Error toggling tutor status:', err);
              json(res, 500, { error: 'Erreur lors de la modification du statut tuteur' });
            }
            return;
          }

          // GET /api/dashboard/guilds/:guildId/staff/:staffUserId/notes - Get manager notes
          if (/^\d+$/.test(parts[5]) && parts[6] === 'notes' && req.method === 'GET') {
            const staffUserId = parts[5];
            try {
              const notes = await getManagerNotes(guildId, staffUserId);
              json(res, 200, { notes });
            } catch (err) {
              logger.error('StaffAPI', 'Error getting manager notes:', err);
              json(res, 500, { error: 'Erreur lors de la récupération des notes' });
            }
            return;
          }

          // POST /api/dashboard/guilds/:guildId/staff/:staffUserId/notes - Create manager note
          if (/^\d+$/.test(parts[5]) && parts[6] === 'notes' && req.method === 'POST') {
            const staffUserId = parts[5];
            const body = await readJsonBody<{ content: string }>(req);

            if (!body?.content) {
              json(res, 400, { error: 'Le contenu de la note est requis' });
              return;
            }

            try {
              const note = await createManagerNote(guildId, staffUserId, user.userId, body.content);

              await pushAudit(guildId, {
                user: user.username ?? `User${user.userId}`,
                action: 'Ajout note manager',
                context: getGuildName(client, guildId),
                module: 'Staff Management',
                eventType: 'Manuel',
                details: `Note ajoutée pour le membre ${staffUserId}`,
                channelId: null
              });

              json(res, 201, { note });
            } catch (err) {
              logger.error('StaffAPI', 'Error creating manager note:', err);
              json(res, 500, { error: 'Erreur lors de la création de la note' });
            }
            return;
          }

          // DELETE /api/dashboard/guilds/:guildId/staff/:staffUserId/notes/:noteId - Delete manager note
          if (/^\d+$/.test(parts[5]) && parts[6] === 'notes' && parts[7] && req.method === 'DELETE') {
            const noteId = parts[7];
            try {
              await deleteManagerNote(noteId);

              await pushAudit(guildId, {
                user: user.username ?? `User${user.userId}`,
                action: 'Suppression note manager',
                context: getGuildName(client, guildId),
                module: 'Staff Management',
                eventType: 'Manuel',
                details: `Note supprimée: ${noteId}`,
                channelId: null
              });

              json(res, 200, { ok: true });
            } catch (err) {
              logger.error('StaffAPI', 'Error deleting manager note:', err);
              json(res, 500, { error: 'Erreur lors de la suppression de la note' });
            }
            return;
          }

          // POST /api/dashboard/guilds/:guildId/staff/warnings - Issue warning
          if (parts[5] === 'warnings' && req.method === 'POST') {
            const body = await readJsonBody<{
              staffUserId: string;
              reason: string;
              expiresAt?: string;
            }>(req);

            if (!body?.staffUserId || !body?.reason) {
              json(res, 400, { error: 'staffUserId et reason sont obligatoires' });
              return;
            }

            try {
              const warning = await issueStaffWarning(
                guildId,
                body.staffUserId,
                user.userId,
                body.reason,
                body.expiresAt ? new Date(body.expiresAt) : undefined
              );

              await pushAudit(guildId, {
                user: user.username ?? `User${user.userId}`,
                action: 'Avertissement staff',
                context: getGuildName(client, guildId),
                module: 'Staff Management',
                eventType: 'Manuel',
                details: `Avertissement généré: ${body.reason}`,
                channelId: null
              });

              json(res, 201, { warning });
            } catch (err) {
              logger.error('StaffAPI', 'Error issuing warning:', err);
              json(res, 500, { error: 'Erreur lors de la génération de l\'avertissement' });
            }
            return;
          }

          // POST /api/dashboard/guilds/:guildId/staff/blacklist - Blacklist staff member
          if (parts[5] === 'blacklist' && req.method === 'POST') {
            const body = await readJsonBody<{
              staffUserId: string;
              reason: string;
              endDate?: string;
            }>(req);

            if (!body?.staffUserId || !body?.reason) {
              json(res, 400, { error: 'staffUserId et reason sont obligatoires' });
              return;
            }

            try {
              const blacklist = await blacklistStaff(
                guildId,
                body.staffUserId,
                user.userId,
                body.reason,
                body.endDate ? new Date(body.endDate) : undefined
              );

              await pushAudit(guildId, {
                user: user.username ?? `User${user.userId}`,
                action: 'Blacklist staff',
                context: getGuildName(client, guildId),
                module: 'Staff Management',
                eventType: 'Manuel',
                details: `Blacklist appliquée: ${body.reason}`,
                channelId: null
              });

              json(res, 201, { blacklist });
            } catch (err) {
              logger.error('StaffAPI', 'Error blacklisting staff:', err);
              json(res, 500, { error: 'Erreur lors de la blacklist' });
            }
            return;
          }

          // GET /api/dashboard/guilds/:guildId/staff/roles - List staff roles
          if (parts[5] === 'roles' && req.method === 'GET' && !parts[6]) {
            try {
              const roles = await getStaffRoles(guildId);
              json(res, 200, { roles });
            } catch (err) {
              logger.error('StaffAPI', 'Error getting staff roles:', err);
              json(res, 500, { error: 'Erreur lors de la récupération des rôles staff' });
            }
            return;
          }

          // POST /api/dashboard/guilds/:guildId/staff/roles - Create staff role
          if (parts[5] === 'roles' && req.method === 'POST' && !parts[6]) {
            const body = await readJsonBody<{
              name: string;
              level: number;
              discordRoleId?: string;
              color?: string;
            }>(req);

            if (!body?.name || typeof body?.level !== 'number') {
              json(res, 400, { error: 'name et level sont obligatoires' });
              return;
            }

            try {
              const role = await createStaffRole(
                guildId,
                body.name,
                body.level,
                body.discordRoleId,
                body.color
              );

              await pushAudit(guildId, {
                user: user.username ?? `User${user.userId}`,
                action: 'Création rôle staff',
                context: getGuildName(client, guildId),
                module: 'Staff Management',
                eventType: 'Manuel',
                details: `Nouveau rôle staff: ${body.name}`,
                channelId: null
              });

              json(res, 201, { role });
            } catch (err) {
              logger.error('StaffAPI', 'Error creating staff role:', err);
              json(res, 500, { error: 'Erreur lors de la création du rôle staff' });
            }
            return;
          }

          // PATCH /api/dashboard/guilds/:guildId/staff/roles/order - Reorder staff roles
          if (parts[5] === 'roles' && parts[6] === 'order' && req.method === 'PATCH') {
            const body = await readJsonBody<{
              orderedRoleIds: string[];
            }>(req);

            if (!Array.isArray(body?.orderedRoleIds)) {
              json(res, 400, { error: 'orderedRoleIds doit être un tableau' });
              return;
            }

            try {
              await reorderStaffRoles(guildId, body.orderedRoleIds);

              await pushAudit(guildId, {
                user: user.username ?? `User${user.userId}`,
                action: 'Réorganisation rôles staff',
                context: getGuildName(client, guildId),
                module: 'Staff Management',
                eventType: 'Manuel',
                details: `Ordre mis à jour pour ${body.orderedRoleIds.length} rôle(s)`,
                channelId: null
              });

              json(res, 200, { success: true });
            } catch (err) {
              logger.error('StaffAPI', 'Error reordering staff roles:', err);
              json(res, 500, { error: 'Erreur lors du réordonnancement des rôles staff' });
            }
            return;
          }

          // GET/PATCH /api/dashboard/guilds/:guildId/staff/config - Staff global config
          if (parts[5] === 'config' && !parts[6]) {
            if (req.method === 'GET') {
              try {
                const guild = await prisma.guild.findUnique({
                  where: { id: guildId },
                  select: {
                    baseStaffRoleId: true,
                    testStaffRoleId: true,
                    meetingAnnouncementChannelId: true,
                    meetingVoiceChannelId: true,
                  },
                });

                if (!guild) {
                  json(res, 404, { error: 'Serveur introuvable' });
                  return;
                }

                json(res, 200, { config: guild });
              } catch (err) {
                logger.error('StaffAPI', 'Error getting staff config:', err);
                json(res, 500, { error: 'Erreur lors de la récupération de la configuration staff' });
              }
              return;
            }

            if (req.method === 'PATCH') {
              const body = await readJsonBody<{
                baseStaffRoleId?: string | null;
                testStaffRoleId?: string | null;
                meetingAnnouncementChannelId?: string | null;
                meetingVoiceChannelId?: string | null;
              }>(req);

              try {
                const data: {
                  baseStaffRoleId?: string | null;
                  testStaffRoleId?: string | null;
                  meetingAnnouncementChannelId?: string | null;
                  meetingVoiceChannelId?: string | null;
                } = {};

                if (Object.prototype.hasOwnProperty.call(body ?? {}, 'baseStaffRoleId')) {
                  data.baseStaffRoleId = extractDiscordSnowflake(body?.baseStaffRoleId ?? null);
                }
                if (Object.prototype.hasOwnProperty.call(body ?? {}, 'testStaffRoleId')) {
                  data.testStaffRoleId = extractDiscordSnowflake(body?.testStaffRoleId ?? null);
                }
                if (Object.prototype.hasOwnProperty.call(body ?? {}, 'meetingAnnouncementChannelId')) {
                  data.meetingAnnouncementChannelId = extractDiscordSnowflake(body?.meetingAnnouncementChannelId ?? null);
                }
                if (Object.prototype.hasOwnProperty.call(body ?? {}, 'meetingVoiceChannelId')) {
                  data.meetingVoiceChannelId = extractDiscordSnowflake(body?.meetingVoiceChannelId ?? null);
                }

                const updatedGuild = await prisma.guild.update({
                  where: { id: guildId },
                  data,
                  select: {
                    baseStaffRoleId: true,
                    testStaffRoleId: true,
                    meetingAnnouncementChannelId: true,
                    meetingVoiceChannelId: true,
                  },
                });

                await pushAudit(guildId, {
                  user: user.username ?? `User${user.userId}`,
                  action: 'Mise à jour config staff',
                  context: getGuildName(client, guildId),
                  module: 'Staff Management',
                  eventType: 'Manuel',
                  details: `Configuration staff mise à jour (base: ${updatedGuild.baseStaffRoleId ?? 'aucun'}, test: ${updatedGuild.testStaffRoleId ?? 'aucun'}, annonce: ${updatedGuild.meetingAnnouncementChannelId ?? 'aucun'}, conférence: ${updatedGuild.meetingVoiceChannelId ?? 'aucun'})`,
                  channelId: null,
                });

                json(res, 200, { config: updatedGuild });
              } catch (err) {
                logger.error('StaffAPI', 'Error updating staff config:', err);
                json(res, 500, { error: 'Erreur lors de la mise à jour de la configuration staff' });
              }
              return;
            }
          }

          // GET /api/dashboard/guilds/:guildId/staff/polls - List polls
          if (parts[5] === 'polls' && req.method === 'GET' && !parts[6]) {
            try {
              const polls = await getPolls(guildId);
              json(res, 200, { polls });
            } catch (err) {
              logger.error('StaffAPI', 'Error getting polls:', err);
              json(res, 500, { error: 'Erreur lors de la récupération des sondages' });
            }
            return;
          }

          // POST /api/dashboard/guilds/:guildId/staff/polls - Create poll
          if (parts[5] === 'polls' && req.method === 'POST' && !parts[6]) {
            const body = await readJsonBody<{
              title: string;
              description?: string;
              options: string[];
              closesAt?: string;
              isAnonymous?: boolean;
            }>(req);

            if (!body?.title || !Array.isArray(body?.options) || body.options.length < 2) {
              json(res, 400, { error: 'title et au moins 2 options sont obligatoires' });
              return;
            }

            try {
              const author = await getStaffMember(guildId, user.userId);
              if (!author) {
                json(res, 403, { error: 'Le créateur doit être membre du staff' });
                return;
              }

              const poll = await createPoll(
                guildId,
                author.id,
                body.title.trim(),
                body.description?.trim() || '',
                body.options.map((opt) => opt.trim()).filter(Boolean),
                body.isAnonymous ?? true,
                body.closesAt ? new Date(body.closesAt) : undefined
              );

              await pushAudit(guildId, {
                user: user.username ?? `User${user.userId}`,
                action: 'Création sondage staff',
                context: getGuildName(client, guildId),
                module: 'Staff Management',
                eventType: 'Manuel',
                details: `Sondage créé: ${poll.title}`,
                channelId: null
              });

              json(res, 201, { poll });
            } catch (err) {
              logger.error('StaffAPI', 'Error creating poll:', err);
              json(res, 500, { error: 'Erreur lors de la création du sondage' });
            }
            return;
          }

          // POST /api/dashboard/guilds/:guildId/staff/polls/vote - Cast vote
          if (parts[5] === 'polls' && parts[6] === 'vote' && req.method === 'POST') {
            const body = await readJsonBody<{
              pollId: string;
              optionId: string;
            }>(req);

            if (!body?.pollId || !body?.optionId) {
              json(res, 400, { error: 'pollId et optionId sont obligatoires' });
              return;
            }

            try {
              const voter = await getStaffMember(guildId, user.userId);
              if (!voter) {
                json(res, 403, { error: 'Le votant doit être membre du staff' });
                return;
              }

              const poll = await prisma.staffPoll.findFirst({
                where: { id: body.pollId, guildId },
                include: { options: true },
              });

              if (!poll) {
                json(res, 404, { error: 'Sondage introuvable' });
                return;
              }

              if (poll.status !== 'OPEN') {
                json(res, 400, { error: 'Ce sondage est fermé' });
                return;
              }

              if (poll.closesAt && poll.closesAt.getTime() <= Date.now()) {
                json(res, 400, { error: 'Ce sondage est expiré' });
                return;
              }

              const optionExists = poll.options.some((option) => option.id === body.optionId);
              if (!optionExists) {
                json(res, 400, { error: 'Option de vote invalide' });
                return;
              }

              const vote = await castPollVote(body.pollId, voter.id, body.optionId);
              json(res, 200, { vote });
            } catch (err) {
              logger.error('StaffAPI', 'Error casting poll vote:', err);
              json(res, 500, { error: 'Erreur lors du vote' });
            }
            return;
          }

          // PATCH /api/dashboard/guilds/:guildId/staff/polls/:pollId/close - Close poll
          if (parts[5] === 'polls' && parts[6] && parts[7] === 'close' && req.method === 'PATCH') {
            const pollId = parts[6];

            try {
              const result = await prisma.staffPoll.updateMany({
                where: { id: pollId, guildId },
                data: { status: 'CLOSED' },
              });

              if (result.count === 0) {
                json(res, 404, { error: 'Sondage introuvable' });
                return;
              }

              await pushAudit(guildId, {
                user: user.username ?? `User${user.userId}`,
                action: 'Clôture sondage staff',
                context: getGuildName(client, guildId),
                module: 'Staff Management',
                eventType: 'Manuel',
                details: `Sondage clôturé: ${pollId}`,
                channelId: null
              });

              json(res, 200, { ok: true });
            } catch (err) {
              logger.error('StaffAPI', 'Error closing poll:', err);
              json(res, 500, { error: 'Erreur lors de la clôture du sondage' });
            }
            return;
          }

          // POST /api/dashboard/guilds/:guildId/testing-periods - Create testing period
          if (parts[5] === 'testing-periods' && req.method === 'POST' && !parts[6]) {
            const body = await readJsonBody<{
              staffUserId: string;
              mentorId?: string;
            }>(req);

            if (!body?.staffUserId) {
              json(res, 400, { error: 'staffUserId est obligatoire' });
              return;
            }

            try {
              const period = await createTestingPeriod(guildId, body.staffUserId, body.mentorId);
              json(res, 201, { period });
            } catch (err) {
              logger.error('StaffAPI', 'Error creating testing period:', err);
              json(res, 500, { error: 'Erreur lors de la création de la période de test' });
            }
            return;
          }

          // PATCH /api/dashboard/guilds/:guildId/testing-periods/:periodId - End testing period
          if (parts[5] === 'testing-periods' && parts[6] && req.method === 'PATCH') {
            const periodId = parts[6];
            const body = await readJsonBody<{
              status: 'PASSED' | 'FAILED';
              notes?: string;
            }>(req);

            if (!body?.status) {
              json(res, 400, { error: 'status est obligatoire' });
              return;
            }

            try {
              const period = await endTestingPeriod(periodId, body.status, body.notes);

              await pushAudit(guildId, {
                user: user.username ?? `User${user.userId}`,
                action: `Fin période de test (${body.status})`,
                context: getGuildName(client, guildId),
                module: 'Staff Management',
                eventType: 'Manuel',
                details: `Période de test: ${periodId} - ${body.status}`,
                channelId: null
              });

              json(res, 200, { period });
            } catch (err) {
              logger.error('StaffAPI', 'Error ending testing period:', err);
              json(res, 500, { error: 'Erreur lors de la fin de la période de test' });
            }
            return;
          }

          // POST /api/dashboard/guilds/:guildId/mentor-reports - Add mentor report
          if (parts[5] === 'mentor-reports' && req.method === 'POST') {
            const body = await readJsonBody<{
              testingPeriodId: string;
              type: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
              content: string;
            }>(req);

            if (!body?.testingPeriodId || !body?.type || !body?.content) {
              json(res, 400, { error: 'testingPeriodId, type et content sont obligatoires' });
              return;
            }

            try {
              const report = await addMentorReport(
                body.testingPeriodId,
                user.userId,
                body.type,
                body.content
              );

              await pushAudit(guildId, {
                user: user.username ?? `User${user.userId}`,
                action: 'Rapport tuteur',
                context: getGuildName(client, guildId),
                module: 'Staff Management',
                eventType: 'Manuel',
                details: `Rapport ${body.type}: ${body.testingPeriodId}`,
                channelId: null
              });

              json(res, 201, { report });
            } catch (err) {
              logger.error('StaffAPI', 'Error adding mentor report:', err);
              json(res, 500, { error: 'Erreur lors de l\'ajout du rapport tuteur' });
            }
            return;
          }
        }

        // NOTIFICATIONS ROUTES
        if (parts[4] === 'notifications') {
          const guildId = parts[3] ?? null;
          if (!guildId) {
            json(res, 400, { error: 'guildId manquant' });
            return;
          }

          // GET /api/dashboard/guilds/:guildId/notifications
          if (req.method === 'GET' && !parts[5]) {
            try {
              const notifs = await getNotifications(guildId, user.userId);
              json(res, 200, { notifications: notifs });
            } catch (err) {
              logger.error('StaffAPI', 'Error getting notifications:', err);
              json(res, 500, { error: 'Erreur récupération notifications' });
            }
            return;
          }

          // PATCH /api/dashboard/guilds/:guildId/notifications/:id/read
          if (req.method === 'PATCH' && parts[5] && parts[6] === 'read') {
            try {
              await markNotificationRead(parts[5], user.userId);
              json(res, 200, { ok: true });
            } catch (err) {
              logger.error('StaffAPI', 'Error marking notification as read:', err);
              json(res, 500, { error: 'Erreur update notification' });
            }
            return;
          }

          // POST /api/dashboard/guilds/:guildId/notifications/mark-all-read
          if (req.method === 'POST' && parts[5] === 'mark-all-read') {
            try {
              await markAllNotificationsRead(guildId, user.userId);
              json(res, 200, { ok: true });
            } catch (err) {
              logger.error('StaffAPI', 'Error marking all as read:', err);
              json(res, 500, { error: 'Erreur update notifications' });
            }
            return;
          }
        }

        // ADMIN+ TESTING PERIOD ROUTES
        if (parts[4] === 'testing-periods') {
          const guildId = parts[3] ?? null;
          if (!guildId) {
            json(res, 400, { error: 'guildId manquant' });
            return;
          }

          const accessLevel = await resolveDashboardAccess(client, guildId, user.userId);
          if (accessLevel.level !== 'admin') {
            json(res, 403, { error: 'Accès admin requis' });
            return;
          }

          // GET /api/dashboard/guilds/:guildId/testing-periods - List testing periods
          if (req.method === 'GET' && !parts[5]) {
            try {
              const periods = await prisma.testingPeriod.findMany({
                where: { guildId },
                orderBy: { createdAt: 'desc' },
                include: {
                  staffMember: true,
                  mentor: true,
                  reports: {
                    orderBy: { createdAt: 'desc' },
                    include: { author: true },
                  },
                },
              });

              json(res, 200, { periods });
            } catch (err) {
              logger.error('StaffAPI', 'Error getting testing periods:', err);
              json(res, 500, { error: 'Erreur lors de la récupération des périodes de test' });
            }
            return;
          }

          // POST /api/dashboard/guilds/:guildId/testing-periods - Create testing period
          if (req.method === 'POST' && !parts[5]) {
            const body = await readJsonBody<{
              staffUserId: string;
              mentorId?: string;
            }>(req);

            if (!body?.staffUserId) {
              json(res, 400, { error: 'staffUserId est obligatoire' });
              return;
            }

            try {
              const period = await createTestingPeriod(guildId, body.staffUserId, body.mentorId);
              json(res, 201, { period });
            } catch (err) {
              logger.error('StaffAPI', 'Error creating testing period:', err);
              json(res, 500, { error: 'Erreur lors de la création de la période de test' });
            }
            return;
          }

          // PATCH /api/dashboard/guilds/:guildId/testing-periods/:periodId - End testing period
          if (req.method === 'PATCH' && parts[5]) {
            const periodId = parts[5];
            const body = await readJsonBody<{
              status: 'PASSED' | 'FAILED';
              notes?: string;
            }>(req);

            if (!body?.status) {
              json(res, 400, { error: 'status est obligatoire' });
              return;
            }

            try {
              const period = await endTestingPeriod(periodId, body.status, body.notes);

              await pushAudit(guildId, {
                user: user.username ?? `User${user.userId}`,
                action: `Fin période de test (${body.status})`,
                context: getGuildName(client, guildId),
                module: 'Staff Management',
                eventType: 'Manuel',
                details: `Période de test: ${periodId} - ${body.status}`,
                channelId: null
              });

              json(res, 200, { period });
            } catch (err) {
              logger.error('StaffAPI', 'Error ending testing period:', err);
              json(res, 500, { error: 'Erreur lors de la fin de la période de test' });
            }
            return;
          }
        }
      }

      json(res, 404, { error: 'Route introuvable' });
    } catch (error) {
      logger.error('DashboardAPI', error);
      json(res, 500, { error: 'Erreur interne API dashboard' });
    }
  });

  wsServer.on('connection', (socket) => {
    socket.send(
      JSON.stringify({
        type: 'dashboard_ws_connected',
        at: new Date().toISOString(),
      }),
    );
  });

  server.on('upgrade', (req, socket, head) => {
    if (!req.url) {
      socket.destroy();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host ?? `localhost:${port}`}`);
    if (url.pathname !== '/api/dashboard/ws') {
      socket.destroy();
      return;
    }

    const token = url.searchParams.get('token');
    if (!token) {
      socket.destroy();
      return;
    }

    try {
      jwt.verify(token, JWT_SECRET);
      wsServer.handleUpgrade(req, socket, head, (ws) => {
        wsServer.emit('connection', ws, req);
      });
    } catch {
      socket.destroy();
    }
  });

  server.listen(port, () => {
    logger.success('DashboardAPI', `API dashboard active sur http://localhost:${port}`);
  });

  return server;
};
