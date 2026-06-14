import { createServer, type IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const debugLogFile = path.resolve(__dirname, '../../scratch/debug_api.log');

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  PermissionFlagsBits,
  type Client,
  TextChannel,
  Collection,
  GuildMember,
  Guild,
} from 'discord.js';
import { SanctionType, TutoringItemState } from '@prisma/client';
import jwt from 'jsonwebtoken';
import prisma from '../utils/db.js';
import { logger } from '../utils/logger.js';
export { COLORS, successEmbed } from '../utils/embeds.js';
import { isGuildActivated, activateGuild, deactivateGuild, activatedGuilds } from '../utils/activation.js';
import { translate } from '../services/integrations/translationService.js';
import { getTwitchUserId } from '../services/integrations/twitchService.js';
import { resolveYoutubeChannel } from '../services/integrations/youtubeService.js';
export {
  registerBanSanction,
  registerKickSanction,
  registerTimeoutSanction,
  registerWarnSanction,
  runGuildBan,
  formatDurationFr,
} from '../services/moderation/sanctionService.js';
import {
  COMMAND_CATALOG,
  normalizeCommandRestrictions,
  type CommandRestrictionRule,
} from '../utils/commandAccess.js';
import { getDailyAlgoUserProfile, getDailyAlgoUserParticipations, getLocalDateKey, reviewDailyAlgoSubmission } from '../services/progression/dailyAlgoService.js';
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
  deleteStaffRole,
  updateStaffRole,
  createAPIKey,
  getAPIKeys,
  deleteAPIKey,
  verifyAPIKey,
  recordStaffActivity,
  getStaffHierarchies,
  createStaffHierarchy,
  updateStaffHierarchy,
  deleteStaffHierarchy,
  getHierarchySchema,
  addMemberToHierarchy,
  removeMemberFromHierarchy,
  syncStaffHierarchyMemberships,
  importRoleMembers,
} from '../services/staff/staffManagementService.js';
export {
  getPublicProfileSnapshot,
  getStaffProfileSnapshot,
} from '../services/progression/profileService.js';
import {
  getPolls,
  createPoll,
  castPollVote,
  getAbsences,
  createAbsence,
  deleteAbsence,
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
  createNotification,
  getStaffCalendarData,
} from '../services/staff/staffLeadershipService.js';
import * as tutoringService from '../services/core/tutoringService.js';
import {
  getEvents,
  getEvent,
  createEvent,
  publishEvent,
  nextQuestion,
  getEventStats,
  prevQuestion,
  finishEvent,
  deleteEvent
} from '../services/features/eventService.js';
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
  getCandidatureHistory,
} from '../services/staff/recruitmentService.js';
import * as altAccountService from '../services/moderation/altAccountService.js';
import { scanGuildMembersForYoungAccounts } from '../services/moderation/dcDetectionService.js';
import { publishOrUpdateRegulationMessage } from '../services/staff/regulationService.js';
import { publishNewsArticle, generateRssXml } from '../services/core/newsService.js';
import { env } from 'node:process';
import crypto from 'node:crypto';
import { fetchAllMembers } from '../utils/discord.js';

export const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
export const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
export const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;
export let JWT_SECRET: string = process.env.JWT_SECRET || '';
if (!JWT_SECRET) {
  logger.warn('DashboardAPI', 'JWT_SECRET variable is not set. Generating ephemeral secret. Instance-isolated!');
  JWT_SECRET = crypto.randomBytes(32).toString('hex');
}
export const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:5173';
export const DASHBOARD_ORIGIN = DASHBOARD_URL.replace(/\/$/, '');
export const DEFAULT_TRANSLATION_TARGET_LANG = 'FR';
export const DISCORD_CLIENT_OWNER_ID = process.env.DISCORD_CLIENT_OWNER_ID;

export const getMissingOAuthConfig = ({ includeSecret = false }: { includeSecret?: boolean } = {}) => {
  const missing: string[] = [];
  if (!DISCORD_CLIENT_ID?.trim()) missing.push('DISCORD_CLIENT_ID');
  if (!DISCORD_REDIRECT_URI?.trim()) missing.push('DISCORD_REDIRECT_URI');
  if (includeSecret && !DISCORD_CLIENT_SECRET?.trim()) missing.push('DISCORD_CLIENT_SECRET');
  return missing;
};

export const getClientIp = (req: IncomingMessage): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    } else if (Array.isArray(forwarded) && forwarded.length > 0) {
      return forwarded[0].trim();
    }
  }
  return req.socket.remoteAddress || '127.0.0.1';
};

export const configRateLimiter = new Map<string, number[]>();
export const errorReportRateLimiter = new Map<string, number[]>();
export const feedbackReportRateLimiter = new Map<string, number[]>();

export const checkRateLimit = (limiterMap: Map<string, number[]>, ip: string, limit: number, windowMs: number): boolean => {
  const now = Date.now();
  const timestamps = limiterMap.get(ip) || [];
  const validTimestamps = timestamps.filter(t => now - t < windowMs);
  if (validTimestamps.length >= limit) {
    return false;
  }
  validTimestamps.push(now);
  limiterMap.set(ip, validTimestamps);
  return true;
};

export type ModuleStatus = 'active' | 'inactive' | 'error';
export type SeverityLevel = 'off' | 'info' | 'attention' | 'critique';
export type DashboardPresetKey = 'general' | 'gaming' | 'dev';
export type CommandAccessLevel = 'tout_le_monde' | 'modération' | 'administration';
export type ShardingMode = 'auto' | 'fixed';

export type ShardSnapshot = {
  shardId: number;
  status: 'online' | 'offline' | 'starting' | 'restarting';
  guildCount: number;
  memberCount: number;
  ping: number;
  uptime: number;
  readyAt: string | null;
  memoryUsage: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
  };
};

export type ShardingConfig = {
  mode: ShardingMode;
  shardCount: number | null;
};

export type ModuleItem = {
  id: string;
  name: string;
  description: string;
  status: ModuleStatus;
  uptime: number;
  interactions: number;
  lastSync: string;
  errorMessage?: string;
  isFixed?: boolean;
};

export type NotificationSettings = {
  discordChannel: string;
  email: string;
  emailEnabled: boolean;
  cloudBackup: boolean;
  debugLog: boolean;
  killSwitchEnabled: boolean;
  severityByModule: Array<{ module: string; level: SeverityLevel }>;
};

export type AuditEntry = {
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

export const PRESET_LABELS: Record<DashboardPresetKey, string> = {
  general: 'Communauté générale',
  gaming: 'Gaming/Esport',
  dev: 'Dev/Tech',
};

export const PRESET_COMMAND_OVERRIDES: Record<DashboardPresetKey, Partial<Record<string, CommandAccessLevel>>> = {
  general: {},
  gaming: {},
  dev: { dailyAlgo: 'tout_le_monde' },
};

export type RoleDisplay = {
  id: string;
  name: string;
};

export type PrimaryRoleDisplay = RoleDisplay | null;

export interface CachedMembers {
  members: Collection<string, GuildMember>;
  timestamp: number;
}

export const guildMembersCache = new Map<string, CachedMembers>();
export const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

export async function getGuildMembers(discordGuild: Guild): Promise<Collection<string, GuildMember>> {
  const guildId = discordGuild.id;
  const cached = guildMembersCache.get(guildId);
  if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
    return cached.members;
  }

  try {
    const allMembers = await fetchAllMembers(discordGuild);
    guildMembersCache.set(guildId, {
      members: allMembers,
      timestamp: Date.now(),
    });
    return allMembers;
  } catch (fetchErr) {
    logger.warn('AnalyticsAPI', `Error fetching guild members for guild ${guildId}: ${String(fetchErr)}`);
    if (cached) {
      logger.info('AnalyticsAPI', `Using stale member cache for guild ${guildId} due to fetch error.`);
      return cached.members;
    }
    logger.info('AnalyticsAPI', `Falling back to members cache for guild ${guildId}.`);
    return discordGuild.members.cache;
  }
}

export function isDisplayableRoleName(name: string): boolean {
  const trimmedName = name.trim();
  return trimmedName.length > 0 && trimmedName !== '@everyone' && !/^[\W_]+$/u.test(trimmedName);
}

export async function resolveProfileRoleDisplay(client: Client, guildId: string, roleIds: string[]): Promise<{
  roles: RoleDisplay[];
  primaryRole: PrimaryRoleDisplay;
}> {
  const guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);

  if (!guild) {
    return { roles: [], primaryRole: null };
  }

  const resolvedRoles = roleIds
    .map((roleId) => guild.roles.cache.get(roleId) ?? guild.roles.cache.find((role) => role.name === roleId) ?? null)
    .filter((role): role is NonNullable<typeof role> => !!role && role.name !== '@everyone')
    .sort((left, right) => right.position - left.position || left.id.localeCompare(right.id));

  const primaryRole = resolvedRoles.find((role) => isDisplayableRoleName(role.name)) ?? resolvedRoles[0] ?? null;

  return {
    roles: resolvedRoles.map((role) => ({
      id: role.id,
      name: role.name,
    })),
    primaryRole: primaryRole
      ? {
          id: primaryRole.id,
          name: primaryRole.name,
        }
      : null,
  };
}

export const buildModuleUpdatesForPreset = (presetKey: DashboardPresetKey) => {
  if (presetKey === 'dev') {
    return {
      codePoliceEnabled: true,
      dailyAlgoEnabled: true,
      translationEnabled: false,
    };
  }

  return {
    codePoliceEnabled: false,
    dailyAlgoEnabled: false,
    translationEnabled: true,
  };
};

export const buildCommandRestrictionsForPreset = (
  presetKey: DashboardPresetKey,
  options: {
    moderatorRoleId?: string | null;
    adminRoleIds: string[];
    fallbackUserId: string;
    modRoleIds: string[];
  },
): CommandRestrictionRule[] => {
  const accessByCommand: Record<string, CommandAccessLevel> = Object.create(null);
  for (const command of COMMAND_CATALOG) {
    accessByCommand[command.name] = command.defaultAccess;
  }

  const overrides = PRESET_COMMAND_OVERRIDES[presetKey] ?? {};
  for (const [commandName, access] of Object.entries(overrides)) {
    if (access) {
      accessByCommand[commandName] = access;
    }
  }

  return Object.entries(accessByCommand)
    .filter(([, access]) => access !== 'tout_le_monde')
    .map(([commandName, access]) => {
      const allowedRoleIds = access === 'administration'
        ? options.adminRoleIds
        : (options.moderatorRoleId ? [options.moderatorRoleId] : options.modRoleIds);
      const allowedUserIds = allowedRoleIds.length > 0 ? [] : [options.fallbackUserId];

      return {
        commandName,
        allowedChannelIds: [],
        blockedChannelIds: [],
        allowedRoleIds,
        blockedRoleIds: [],
        allowedUserIds,
        blockedUserIds: [],
      };
    });
};

export type DashboardSanctionType = 'WARN' | 'KICK' | 'TIMEOUT' | 'TEMP_BAN' | 'BAN' | 'SOFTBAN';
export type DashboardSanctionStatus = 'ACTIVE' | 'RESOLVED' | 'FAILED';

export type SanctionItem = {
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

export type SanctionReportItem = {
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

export type RegulationRuleItem = {
  id: string;
  title: string;
  description: string;
  emoji: string | null;
  sortOrder: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AnalyticsData = {
  activityTrend: number[];
  messagesTrend: number[];
  voiceTrend: number[];
  joinsTrend: number[];
  leavesTrend: number[];
  sanctionsTrend: number[];
  totalAutomations: number;
  healthStatus: number;
};

export type DashboardChannel = {
  id: string;
  name: string;
  mention: string;
};

export type DashboardRole = {
  id: string;
  name: string;
  mention: string;
  permissions: string[];
  position?: number;
  color?: string;
};

export type MemberCaseQuickAction = 'WARN' | 'KICK' | 'TIMEOUT' | 'BAN';

export type MemberCaseLogEntry = {
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

export type MemberCaseChannelMessage = {
  id: string;
  channelId: string;
  channelName: string;
  content: string;
  dateIso: string;
};

export type MemberCaseChannelSummary = {
  channelId: string;
  channelName: string;
  count: number;
  lastMessageAt: string | null;
  recentMessages: MemberCaseChannelMessage[];
};

export type MemberCaseInviteInfo = {
  code: string | null;
  inviterId: string | null;
  inviterTag: string | null;
  inviterAvatarUrl: string | null;
  joinedAt: string | null;
};

export type MemberCaseProfile = {
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
  isTutor: boolean;
  staffGrade: string | null;
  isSuspectedDC: boolean;
  moderatorNote: string | null;
  isOnServer: boolean;
};

export type LinkedAccountItem = {
  userId: string;
  userTag: string | null;
  avatarUrl: string | null;
  type: string;
  status: string;
};

export type MemberCaseInteractionNode = {
  id: string;
  label: string;
  type: 'user' | 'target';
  avatar?: string | null;
};

export type MemberCaseInteractionEdge = {
  from: string;
  to: string;
  type: 'mention' | 'reply' | 'reaction';
  count: number;
};

export type MemberCaseInteractionGraph = {
  nodes: MemberCaseInteractionNode[];
  edges: MemberCaseInteractionEdge[];
};

export type MemberCaseResponse = {
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
  candidatures: Array<{
    id: string;
    status: string;
    notes: string;
    createdAt: string;
    data: unknown;
    autoRejected: boolean;
    autoRejectReason: string | null;
    rejectionReason: string | null;
    oralResult: string | null;
    reapplyAfter: string | null;
  }>;
  linkedAccounts: LinkedAccountItem[];
  isSuspectedDC: boolean;
  sanctionReports: SanctionReportItem[];
  interactionGraph: MemberCaseInteractionGraph;
};

export type CommandRestrictionState = CommandRestrictionRule;

export type CommandCatalogEntry = {
  name: string;
  label: string;
  description: string;
  defaultAccess: 'tout_le_monde' | 'modération' | 'administration';
};

export type DashboardAccessLevel = 'none' | 'moderator' | 'admin';

export type DashboardAccess = {
  level: DashboardAccessLevel;
  canViewDashboard: boolean;
  canModerateContent: boolean;
  canModerateDailyAlgo: boolean;
  canManageSettings: boolean;
  canManageTutoring: boolean;
};

export type FeatureAccess = {
  canView: boolean;
  canModerate: boolean;
  canConfigure: boolean;
  canDelete: boolean;
};

export type FeatureAccessMap = Record<string, FeatureAccess>;

export function resolveDailyAlgoFinalScore(submission: {
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

export type DashboardState = {
  guildName: string;
  configChannelId: string;
  logChannelId: string;
  regulationChannelId: string;
  regulationMessageId: string | null;
  regulationVerificationEnabled: boolean;
  regulationRoleId: string | null;
  regulationLockEnabled: boolean;
  meetingAnnouncementChannelId: string;
  meetingVoiceChannelId: string;
  publicChannelId: string;
  newsChannelId: string;
  dailyAlgoChannelId: string;
  baseStaffRoleId: string;
  testStaffRoleId: string;
  propagateSanctions: boolean;
  translationEnabled: boolean;
  codePoliceEnabled: boolean;
  dailyAlgoEnabled: boolean;
  githubReleasesEnabled: boolean;
  digestEnabled: boolean;
  youtubeEnabled: boolean;
  twitchEnabled: boolean;
  socialNetworksEnabled: boolean;
  autoThreadEnabled: boolean;
  autoThreadChannels: string[];
  autoThreadBotsEnabled: boolean;
  funEnabled: boolean;
  funCountingChannelId: string;
  funOneWordStoryChannelId: string;
  funGuessNumberChannelId: string;
  recruitmentCategoryId: string;
  recruitmentLogChannelId: string;
  recruitmentAutoRejectEnabled: boolean;
  modules: ModuleItem[];
  discordChannels: DashboardChannel[];
  discordVoiceChannels: DashboardChannel[];
  discordCategories: DashboardChannel[];
  discordRoles: DashboardRole[];
  moderatorRoleId: string;
  commandRestrictions: CommandRestrictionState[];
  sidebarFavorites: string[];
  commandCatalog: CommandCatalogEntry[];
  access: {
    level: Exclude<DashboardAccessLevel, 'none'>;
    canModerateContent: boolean;
    canModerateDailyAlgo: boolean;
    canManageSettings: boolean;
  };
  featureAccess: FeatureAccessMap;
  notifications: NotificationSettings;
  auditTrail: AuditEntry[];
  sanctions: SanctionItem[];
  sanctionReports: SanctionReportItem[];
  sanctionReportEnabled: boolean;
  regulationRules: RegulationRuleItem[];
  messageTemplate: string;
  analytics: AnalyticsData;
  member: null | {
    id: string;
    nickname: string | null;
    roles: Array<{
      id: string;
      name: string;
      position: number;
      managed: boolean;
    }>;
    isTutor?: boolean;
  };
};

export type RuntimeState = {
  email: string;
  emailEnabled: boolean;
  cloudBackup: boolean;
  debugLog: boolean;
  killSwitchEnabled: boolean;
  severityByModule: Array<{ module: string; level: SeverityLevel }>;
  commandRestrictions: CommandRestrictionState[];
  sidebarFavorites: string[];
  messageTemplate: string;
};

export const MODULE_DESCRIPTIONS: Record<string, string> = {
  codepolice: 'Vérification de la syntaxe et bonnes pratiques sur les snippets.',
  dailyalgo: "Génération quotidienne d'un défi d'algorithmique.",
  traduction: 'Traduction instantanée vers la langue configurée.',
  regulation: 'Configuration et publication du règlement du serveur.',
  staff_management: 'Gestion complète du personnel, recrutements et absences.',
  sanctions: 'Historique et gestion des sanctions (warns, mutes, bans).',
  members: 'Gestion avancée des membres et détection de doubles comptes.',
  logs: 'Journaux d\'événements Discord (messages, salons, membres).',
  nickname_moderation: 'Détection et modération automatique des pseudos inappropriés.',
  activity: 'Suivi détaillé de l\'activité utilisateur sur le dashboard.',
  auto_thread: 'Création automatique de fils de discussion sur les messages.',
  analytics: 'Statistiques de croissance et d\'engagement du serveur.',
  profile: 'Gestion du profil utilisateur et paramètres personnels.',
  fun: 'Salons de jeux et divertissement (comptage, one word story, nombre mystère).',
  recruitment: 'Suivi des candidatures et intégration du personnel.',
  tickets: 'Système complet de tickets d\'assistance et de support configurable.',
  youtube: 'Intégration YouTube pour les notifications de nouvelles vidéos.',
  twitch: 'Intégration Twitch pour les notifications de lives.',
  social_networks: 'Configuration des flux YouTube et Twitch suivis.',
  digest: 'Génération de résumés automatiques et flux RSS.',
  tutoring: 'Gestion des périodes d\'essai et formation des nouveaux staff.',
  meetings: 'Planification et suivi des réunions d\'équipe.',
  absences: 'Gestion des congés et disponibilités du personnel.',
  double_accounts: 'Détection et gestion des comptes multiples pour la sécurité.',
  events: 'Organisation et gestion d\'événements communautaires et quiz.',
};

export const DEFAULT_SEVERITY_BY_MODULE: Array<{ module: string; level: SeverityLevel }> = [
  { module: 'Auto-Modération', level: 'attention' },
  { module: 'Daily Algo', level: 'info' }
];

export const DEFAULT_MESSAGE_TEMPLATE =
  '🔔 {titre}\n\n{resume}\n\nSource: {source}\nAuteur: {auteur}\n\nPublié automatiquement par Kotbo.';

export const recruitmentAutoRejectEnabledByGuild = new Map<string, boolean>();

export const isRecruitmentAutoRejectEnabled = (guildId: string) => {
  return recruitmentAutoRejectEnabledByGuild.get(guildId) ?? true;
};

export const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
export const nowIso = () => new Date().toISOString();

export function getDailyAlgoDateKeyWithOffset(offsetDays: number, baseDate = new Date()): string {
  const anchor = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), baseDate.getUTCDate()));
  anchor.setUTCDate(anchor.getUTCDate() + offsetDays);

  const year = anchor.getUTCFullYear();
  const month = String(anchor.getUTCMonth() + 1).padStart(2, '0');
  const day = String(anchor.getUTCDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export async function getDailyAlgoScheduleRuns(guildId: string, daysBack: number, daysForward: number) {
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

export async function ensureDailyAlgoScheduleRuns(guildId: string, daysForward: number) {
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
    return {
      createdDateKeys: [],
      createdCount: 0,
    };
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
    });

    if (existingRun) {
      continue;
    }

    const existingRunForDate = await prisma.dailyAlgoRun.findFirst({
      where: { dateKey },
      select: { problemId: true }
    });

    let problemId = existingRunForDate?.problemId;

    if (!problemId) {
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
      problemId = problemCandidate.id;

      await prisma.dailyAlgoProblem.update({
        where: { id: problemId },
        data: { usedAt: new Date() }
      });
    }

    await prisma.dailyAlgoRun.create({
      data: {
        guildId,
        dateKey,
        problemId: problemId,
        challengeChannelId: guild.dailyAlgoChannelId!,
        validationChannelId: guild.dailyAlgoValidationChannelId ?? null,
      },
    });

    createdDateKeys.push(dateKey);
  }

  return {
    createdDateKeys,
    createdCount: createdDateKeys.length,
  };
}

export function normalizeLangCode(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) return null;
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

export function isDashboardSanctionType(value: string): value is DashboardSanctionType {
  return value === 'WARN' || value === 'KICK' || value === 'TIMEOUT' || value === 'TEMP_BAN' || value === 'BAN' || value === 'SOFTBAN';
}

export function toSanctionType(value: DashboardSanctionType): SanctionType {
  return value as SanctionType;
}

export function parseEvidenceLinks(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => /^https?:\/\//i.test(entry));
}

export function formatSanctionDurationLabel(seconds: number | null): string | null {
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

export function normalizeBrokenRulesPayload(value: string): string {
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

export const toRuntimeState = (settings: {
  email: string;
  emailEnabled: boolean;
  cloudBackup: boolean;
  debugLog: boolean;
  killSwitchEnabled: boolean;
  severityByModule: unknown;
  commandRestrictions: unknown;
  sidebarFavorites: unknown;
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
    sidebarFavorites: Array.isArray(settings.sidebarFavorites)
      ? settings.sidebarFavorites.filter((entry): entry is string => typeof entry === 'string' && entry.startsWith('/'))
      : [],
    messageTemplate: settings.messageTemplate || DEFAULT_MESSAGE_TEMPLATE
  };
};

export const json = (res: ServerResponse, statusCode: number, data: unknown) => {
  if (!res.headersSent) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
  }

  res.statusCode = statusCode;
  if (statusCode === 204) {
    res.end();
  } else {
    res.end(JSON.stringify(data));
  }
};

export type AuthClaims = {
  userId: string;
  username?: string;
  avatar?: string;
  discordToken?: string;
};

export const verifyAuth = (req: IncomingMessage): AuthClaims | null => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  try {
    return jwt.verify(token, JWT_SECRET!) as AuthClaims;
  } catch {
    return null;
  }
};

export type RecruitmentWebhookAuthResult = {
  auth: AuthClaims | null;
  reason: 'ok_jwt' | 'ok_api_key' | 'missing_credentials' | 'invalid_jwt' | 'invalid_api_key' | 'insufficient_permissions';
};

export const verifyRecruitmentWebhookAuth = async (req: IncomingMessage, guildId: string): Promise<RecruitmentWebhookAuthResult> => {
  const authHeader = req.headers.authorization;
  let bearerToken: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      return {
        auth: jwt.verify(token, JWT_SECRET!) as AuthClaims,
        reason: 'ok_jwt',
      };
    } catch {
      // ignore, might be a raw API key passed in Authorization header
      bearerToken = token;
    }
  }

  const apiKey = req.headers['x-kotbo-api-key'] ?? req.headers['x-api-key'] ?? bearerToken;
  const apiKeyValue = Array.isArray(apiKey) ? apiKey[0] : apiKey;
  if (!apiKeyValue || typeof apiKeyValue !== 'string') {
    return { auth: null, reason: 'missing_credentials' };
  }

  // Try the new recruitment form API key system first
  const { verifyAPIKey: verifyRecruitmentAPIKey } = await import('../services/staff/recruitmentFormService.js');
  const isValidRecruitmentKey = await verifyRecruitmentAPIKey(apiKeyValue.trim(), guildId);
  
  if (isValidRecruitmentKey) {
    // For recruitment forms, we don't need a specific user - the form itself is authenticated
    return {
      auth: {
        userId: 'recruitment_form',
        username: 'Recruitment Form Webhook',
      },
      reason: 'ok_api_key',
    };
  }

  // Fallback to the old API key system
  const key = await verifyAPIKey(hashAPIKey(apiKeyValue.trim()), guildId);
  if (!key) return { auth: null, reason: 'invalid_api_key' };

  if (!key.permissions || (!key.permissions.includes('recruitment:forms') && !key.permissions.includes('recruitment:manage'))) {
    return { auth: null, reason: 'insufficient_permissions' };
  }

  return {
    auth: {
      userId: key.createdByUserId,
      username: key.name,
    },
    reason: 'ok_api_key',
  };
};

export const getAuditActor = (auth: AuthClaims) => {
  const username = auth.username?.trim();
  if (username) return username;
  return `Utilisateur ${auth.userId.slice(0, 8)}`;
};

export const DISCORD_PERMISSION_ADMINISTRATOR = BigInt(0x8);
export const DISCORD_PERMISSION_MANAGE_GUILD = BigInt(0x20);

export const hasDashboardAdminPermission = (permissions: bigint) => {
  return (permissions & DISCORD_PERMISSION_ADMINISTRATOR) === DISCORD_PERMISSION_ADMINISTRATOR
    || (permissions & DISCORD_PERMISSION_MANAGE_GUILD) === DISCORD_PERMISSION_MANAGE_GUILD;
};

export const DASHBOARD_ACCESS_NONE: DashboardAccess = {
  level: 'none',
  canViewDashboard: false,
  canModerateContent: false,
  canModerateDailyAlgo: false,
  canManageSettings: false,
  canManageTutoring: false,
};

export const DASHBOARD_ACCESS_MODERATOR: DashboardAccess = {
  level: 'moderator',
  canViewDashboard: true,
  canModerateContent: true,
  canModerateDailyAlgo: true,
  canManageSettings: false,
  canManageTutoring: false,
};

export const DASHBOARD_ACCESS_DAILY_ALGO_REVIEWER: DashboardAccess = {
  level: 'moderator',
  canViewDashboard: true,
  canModerateContent: false,
  canModerateDailyAlgo: true,
  canManageSettings: false,
  canManageTutoring: false,
};

export const DASHBOARD_ACCESS_ADMIN: DashboardAccess = {
  level: 'admin',
  canViewDashboard: true,
  canModerateContent: true,
  canModerateDailyAlgo: true,
  canManageSettings: true,
  canManageTutoring: true,
};

export const resolveDashboardAccess = async (
  client: Client,
  guildId: string,
  userId: string,
  knownPermissions?: bigint | null,
): Promise<DashboardAccess> => {
  const isGlobalAdmin = await resolveAdminAccess(client, userId);
  if (isGlobalAdmin) return DASHBOARD_ACCESS_ADMIN;

  const guildConfig = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { moderatorRoleId: true }
  });

  if (!guildConfig) return DASHBOARD_ACCESS_NONE;

  if (knownPermissions !== null && knownPermissions !== undefined && hasDashboardAdminPermission(knownPermissions)) {
    return DASHBOARD_ACCESS_ADMIN;
  }

  const discordGuild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!discordGuild) return DASHBOARD_ACCESS_NONE;

  const member = await discordGuild.members.fetch(userId).catch(() => null);
  if (!member) return DASHBOARD_ACCESS_NONE;

  if (member.permissions.has('Administrator') || member.permissions.has('ManageGuild')) {
    return DASHBOARD_ACCESS_ADMIN;
  }

  if (guildConfig.moderatorRoleId && member.roles.cache.has(guildConfig.moderatorRoleId)) {
    return DASHBOARD_ACCESS_MODERATOR;
  }

  const staffProfile = await prisma.staffMember.findUnique({
    where: { guildId_userId: { guildId, userId } },
    select: { id: true, isTutor: true },
  });

  if (!staffProfile) {
    return DASHBOARD_ACCESS_NONE;
  }

  if (staffProfile.isTutor) {
    return {
      ...DASHBOARD_ACCESS_MODERATOR,
      canManageTutoring: true,
    };
  }

  return DASHBOARD_ACCESS_DAILY_ALGO_REVIEWER;
};

export async function resolveAdminAccess(client: Client, userId: string): Promise<boolean> {
  if (userId === DISCORD_CLIENT_OWNER_ID) return true;

  const admin = await prisma.globalAdmin.findUnique({
    where: { userId }
  });
  
  return !!admin;
}

export class HttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export class BunServerResponse extends ServerResponse {
  private chunks: Buffer[] = [];
  private resolvePromise: (res: Response) => void;

  constructor(req: IncomingMessage, resolvePromise: (res: Response) => void) {
    super(req);
    this.resolvePromise = resolvePromise;
  }

  override write(chunk: unknown, cb?: (error: Error | null | undefined) => void): boolean;
  override write(chunk: unknown, encoding: BufferEncoding, cb?: (error: Error | null | undefined) => void): boolean;
  override write(chunk: unknown, encodingOrCb?: unknown, cb?: unknown): boolean {
    const actualChunk = typeof chunk === 'string'
      ? Buffer.from(chunk, typeof encodingOrCb === 'string' ? (encodingOrCb as BufferEncoding) : 'utf8')
      : (chunk instanceof Uint8Array ? Buffer.from(chunk) : Buffer.from(String(chunk || '')));
    this.chunks.push(actualChunk);
    
    const callback = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
    if (typeof callback === 'function') {
      (callback as (error: Error | null | undefined) => void)(null);
    }
    return true;
  }

  override writeHead(statusCode: number, statusMessage?: unknown, headers?: unknown): this {
    this.statusCode = statusCode;
    const actualHeaders = typeof statusMessage === 'object' && statusMessage !== null ? statusMessage : headers;
    if (actualHeaders && typeof actualHeaders === 'object') {
      for (const [key, val] of Object.entries(actualHeaders)) {
        if (typeof val === 'string' || Array.isArray(val)) {
          this.setHeader(key, val);
        }
      }
    }
    return this;
  }

  override flushHeaders(): void {}

  override end(cb?: () => void): this;
  override end(chunk: unknown, cb?: () => void): this;
  override end(chunk: unknown, encoding: BufferEncoding, cb?: () => void): this;
  override end(chunk?: unknown, encodingOrCb?: unknown, cb?: unknown): this {
    if (chunk !== undefined && chunk !== null) {
      const actualChunk = typeof chunk === 'string'
        ? Buffer.from(chunk, typeof encodingOrCb === 'string' ? (encodingOrCb as BufferEncoding) : 'utf8')
        : (chunk instanceof Uint8Array ? Buffer.from(chunk) : Buffer.from(String(chunk)));
      this.chunks.push(actualChunk);
    }
    
    const body = Buffer.concat(this.chunks);
    const headers = new Headers();
    const nodeHeaders = this.getHeaders();
    for (const [key, val] of Object.entries(nodeHeaders)) {
      if (val !== undefined) {
        if (Array.isArray(val)) {
          val.forEach(v => headers.append(key, String(v)));
        } else {
          headers.set(key, String(val));
        }
      }
    }
    
    const response = new Response(body, {
      status: this.statusCode,
      headers
    });
    
    this.resolvePromise(response);
    
    const callback = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
    if (typeof callback === 'function') callback();
    return this;
  }
}

export const readJsonBody = async <T>(req: IncomingMessage): Promise<T | null> => {
  const contentType = req.headers['content-type'];
  const logFile = '/mnt/c/Users/Elouan/Documents/GitHub/Kotbo/apps/bot/scratch/debug_api.log';
  const logMsg = (msg: string) => {
    try {
      appendFileSync(logFile, `[${new Date().toISOString()}] [readJsonBody] ${msg}\n`, 'utf8');
    } catch {}
  };

  logMsg(`URL: ${req.url}, contentType: ${contentType}`);

  if (!contentType || !contentType.includes('application/json')) {
    logMsg(`Invalid content type: ${contentType}`);
    throw new HttpError(415, 'Content-Type doit être application/json');
  }

  if (req.bodyText !== undefined) {
    const text = req.bodyText.trim();
    logMsg(`Using pre-read bodyText: length=${text.length}, content="${text}"`);
    if (!text) {
      logMsg(`Empty bodyText, returning null`);
      logger.info('readJsonBody', `Empty body for URL: ${req.url}`);
      return null;
    }
    try {
      const parsed = JSON.parse(text) as T;
      logMsg(`JSON parse success`);
      return parsed;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logMsg(`JSON parse error: ${errMsg}`);
      logger.error('readJsonBody', `JSON parse error for URL ${req.url}, text="${text}":`, err);
      throw new HttpError(400, 'Format JSON invalide');
    }
  }

  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const text = buffer.toString('utf-8').trim();
      if (!text) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(text) as T);
      } catch (err) {
        reject(new HttpError(400, 'Format JSON invalide'));
      }
    });
    req.on('error', (err) => reject(err));
  });
};


export const truncate = (value?: string | null, length = 160) => {
  if (!value) return '';
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
};

export const describeUnknownError = (err: unknown) => {
  if (err instanceof Error) {
    return err.message;
  }

  if (typeof err === 'string' && err.trim()) {
    return err.trim();
  }

  if (err && typeof err === 'object') {
    const maybeMessage = typeof (err as { message?: unknown }).message === 'string'
      ? (err as { message: string }).message.trim()
      : '';
    const maybeCode = typeof (err as { code?: unknown }).code === 'string'
      ? ` [${(err as { code: string }).code}]`
      : '';
    const maybeMeta = (err as { meta?: unknown }).meta;
    if (maybeMessage) {
      return `${maybeMessage}${maybeCode}`;
    }
    if (maybeMeta !== undefined) {
      try {
        return `${maybeCode || 'Erreur inconnue'} ${JSON.stringify(maybeMeta)}`.trim();
      } catch {
        return maybeCode || 'Erreur inconnue';
      }
    }
  }

  return 'Erreur lors de la mise à jour de la hiérarchie staff';
};

export const DASHBOARD_CONTENT_EXCERPT_LENGTH = 160;

export const prepareDescriptionForTranslation = (value?: string | null) => {
  if (!value) return '';
  return truncate(value.trim(), DASHBOARD_CONTENT_EXCERPT_LENGTH);
};

export const deleteValidationQueueMessage = async (client: Client, guildId: string, queueMessageId: string | null) => {
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

const DEFAULT_RUNTIME_STATE: RuntimeState = {
  email: '',
  emailEnabled: false,
  cloudBackup: true,
  debugLog: false,
  killSwitchEnabled: false,
  severityByModule: DEFAULT_SEVERITY_BY_MODULE,
  commandRestrictions: [],
  sidebarFavorites: [],
  messageTemplate: DEFAULT_MESSAGE_TEMPLATE,
};

export const getOrCreateRuntime = async (guildId: string): Promise<RuntimeState> => {
  const { ensureDashboardSchemaPatches } = await import('../utils/schemaPatches.js');
  await ensureDashboardSchemaPatches();

  try {
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
        sidebarFavorites: [],
        messageTemplate: DEFAULT_MESSAGE_TEMPLATE,
      },
    });

    return toRuntimeState(settings);
  } catch (error) {
    logger.error('Runtime', `getOrCreateRuntime failed for ${guildId}:`, error);
    return { ...DEFAULT_RUNTIME_STATE };
  }
};

export const pushAudit = async (guildId: string, entry: Omit<AuditEntry, 'id' | 'dateIso' | 'source'>) => {
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

export const safePushAudit = async (guildId: string, entry: Omit<AuditEntry, 'id' | 'dateIso' | 'source'>, context: string) => {
  try {
    await pushAudit(guildId, entry);
  } catch (err) {
    logger.warn('StaffAPI', `Audit log failed during ${context}:`, err);
  }
};

export const GLOBAL_BANNED_WORD_CATEGORIES = new Set([
  'custom',
  'racism',
  'threat',
  'sexual',
  'lgbtphobia',
  'hate',
  'insult',
]);

export const normalizeGlobalBannedWordCategory = (value: unknown): string => {
  if (typeof value !== 'string') return 'custom';
  return GLOBAL_BANNED_WORD_CATEGORIES.has(value) ? value : 'custom';
};

export const normalizeGlobalBannedWord = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().slice(0, 100);
};

export const normalizeGlobalBannedWordKey = (value: string): string => {
  return normalizeGlobalBannedWord(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
};

export const cleanupGlobalBannedWords = async () => {
  const words = await prisma.bannedWord.findMany({
    where: { guildId: null },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  const seen = new Map<string, (typeof words)[number]>();
  const duplicates: string[] = [];

  for (const word of words) {
    const key = normalizeGlobalBannedWordKey(word.word);
    if (!key) continue;

    if (seen.has(key)) {
      duplicates.push(word.id);
      continue;
    }

    seen.set(key, {
      ...word,
      word: normalizeGlobalBannedWord(word.word),
    });
  }

  const updates = Array.from(seen.values()).map((word) => {
    return prisma.bannedWord.update({
      where: { id: word.id },
      data: {
        word: word.word,
      },
    });
  });

  if (duplicates.length > 0) {
    await prisma.bannedWord.deleteMany({ where: { id: { in: duplicates } } });
  }

  await Promise.all(updates);

  return {
    cleanedCount: seen.size,
    duplicateCount: duplicates.length,
    words: await prisma.bannedWord.findMany({
      where: { guildId: null },
      orderBy: [{ word: 'asc' }],
      select: { id: true, word: true, category: true, enabled: true, guildId: true },
    }),
  };
};

export function formatChannelName(guild: { channels: { cache: Map<string, { id: string; name?: string }> } } | null, channelId: string | null): string {
  if (!channelId) return 'Aucun';
  const channel = guild?.channels.cache.get(channelId);
  return channel?.name ? `#${channel.name}` : `Salon ${channelId}`;
}

export function interpretMentions(guild: Guild | null, content: string): string {
  if (!content) return content;
  
  let escaped = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  let processed = escaped.replace(/&lt;@!?(\d+)&gt;/g, (match, id) => {
    const member = guild?.members.cache.get(id);
    const rawName = member ? (member.displayName || member.user.username) : id;
    const name = escapeHtml(rawName);
    return `<span class="mention">@${name}</span>`;
  });

  processed = processed.replace(/&lt;#(\d+)&gt;/g, (match, id) => {
    const channel = guild?.channels.cache.get(id);
    const rawName = channel?.name || id;
    const name = escapeHtml(rawName);
    const safeGuildId = escapeHtml(guild?.id || '@me');
    const safeId = escapeHtml(id);
    return `<a href="https://discord.com/channels/${safeGuildId}/${safeId}" target="_blank" class="mention-link">#${name}</a>`;
  });

  processed = processed.replace(/&lt;@&amp;(\d+)&gt;/g, (match, id) => {
    const role = guild?.roles.cache.get(id);
    const rawName = role?.name || id;
    const name = escapeHtml(rawName);
    return `<span class="mention">@${name}</span>`;
  });

  return processed;
}

export function extractMessageId(details: string): string | null {
  return parseCaseField(details, 'ID');
}

export function extractDiscordSnowflake(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/[^0-9]/g, '');
  return normalized.length > 0 ? normalized : null;
}

export function parseCaseField(details: string, label: string): string | null {
  const safeLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = details.match(new RegExp(`${safeLabel}:\\s*([^\\n|]+)`, 'i'));
  const value = match?.[1]?.trim();
  return value && value.length > 0 ? value : null;
}

export function parseInviteFromDetails(details: string): MemberCaseInviteInfo | null {
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
    inviterAvatarUrl: null,
    joinedAt: null,
  };
}

export function extractMessagePreview(details: string): string | null {
  const content = parseCaseField(details, 'Contenu');
  if (!content) return null;
  return content === '_vide_' ? '' : content;
}

export function mapGuildRolePermissions(role: { id: string; name: string; hexColor?: string; permissions?: { toArray: () => string[] } | string[] }, mention: string): DashboardRole {
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
    color: role.hexColor,
  };
}

export async function fetchMemberConnections(discordToken?: string | null): Promise<{ connections: Array<{ name: string; type: string; visible: boolean }>; note: string }> {
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

export function safeIsoDate(value: unknown, fallback: string | null = null): string | null {
  if (!value) return fallback;
  try {
    const date = value instanceof Date ? value : new Date(typeof value === 'string' || typeof value === 'number' ? value : String(value));
    if (isNaN(date.getTime())) return fallback;
    return date.toISOString();
  } catch {
    return fallback;
  }
}

function resolveMemberCaseRoles(
  discordGuild: NonNullable<ReturnType<Client['guilds']['cache']['get']>>,
  member: { roles: { cache: { values: () => IterableIterator<{ id: string; name: string; hexColor?: string; permissions?: { toArray: () => string[] } | string[] }> } } } | null,
  rolesSnapshot: string[] | null | undefined,
): DashboardRole[] {
  const sortRoles = (left: DashboardRole, right: DashboardRole) => {
    const positionLeft = discordGuild.roles.cache.get(left.id)?.position ?? 0;
    const positionRight = discordGuild.roles.cache.get(right.id)?.position ?? 0;
    return positionRight - positionLeft || left.name.localeCompare(right.name, 'fr');
  };

  if (member) {
    return [...member.roles.cache.values()]
      .filter((role) => !!role && role.id !== discordGuild.id)
      .map((role) => mapGuildRolePermissions(role, `<@&${role.id}>`))
      .sort(sortRoles);
  }

  return (rolesSnapshot ?? [])
    .map((roleId) => {
      const role = discordGuild.roles.cache.get(roleId);
      if (!role || role.id === discordGuild.id) return null;
      return mapGuildRolePermissions(role, `<@&${role.id}>`);
    })
    .filter((role): role is DashboardRole => role !== null)
    .sort(sortRoles);
}

function resolveMemberDisplayLabel(
  userId: string,
  user: { tag?: string | null; username?: string | null; globalName?: string | null; displayName?: string | null } | null,
  profile: { userTag?: string | null; username?: string | null; globalName?: string | null; displayName?: string | null } | null,
): string {
  return (
    user?.globalName
    ?? user?.username
    ?? user?.tag
    ?? profile?.displayName
    ?? profile?.globalName
    ?? profile?.userTag
    ?? profile?.username
    ?? `Utilisateur ${userId}`
  );
}

export async function buildMemberCaseData(client: Client, guildId: string, userId: string, auth: AuthClaims): Promise<MemberCaseResponse | null> {
  const discordGuild = client.guilds.cache.get(guildId);
  if (!discordGuild) return null;

  let actualUserId = userId.startsWith('!') ? userId.substring(1) : userId;
  
  if (!/^\d+$/.test(actualUserId)) {
    const staff = await prisma.staffMember.findUnique({
      where: { id: actualUserId },
      select: { userId: true }
    });
    if (staff) {
      actualUserId = staff.userId;
    } else {
      const profile = await prisma.memberProfile.findUnique({
        where: { id: actualUserId },
        select: { userId: true }
      });
      if (profile) actualUserId = profile.userId;
    }
  }

  if (!/^\d{17,20}$/.test(actualUserId)) {
    return null;
  }

  try {
    const linkedUserIds = await altAccountService
      .getAllLinkedUserIds(guildId, actualUserId)
      .catch(() => [actualUserId]);

    const [user, member, profile, sanctions, auditLogs, inviteConnections, staffMember, candidatureHistory, sanctionReports, dbInvite] = await Promise.all([
      Promise.race([
        client.users.fetch(actualUserId).catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000))
      ]),
      Promise.race([
        discordGuild.members.fetch(actualUserId).catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000))
      ]),
      prisma.memberProfile.findUnique({
        where: {
          guildId_userId: {
            guildId,
            userId: actualUserId,
          },
        },
      }).catch(() => null),
      prisma.sanction.findMany({
        where: { guildId, targetUserId: { in: linkedUserIds } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }).catch(() => []),
      prisma.dashboardAuditLog.findMany({
        where: {
          guildId,
          OR: [
            { user: { contains: actualUserId } },
            { details: { contains: actualUserId } }
          ]
        },
        orderBy: { dateIso: 'desc' },
        take: 500,
      }).catch(() => []),
      fetchMemberConnections(auth.userId === actualUserId ? auth.discordToken : null).catch(() => ({ connections: [], note: "Erreur lors de la récupération des connexions." })),
      getStaffMember(guildId, actualUserId).catch(() => null),
      getCandidatureHistory(guildId, actualUserId).catch(() => []),
      prisma.sanctionReport.findMany({
        where: { guildId, memberReference: { in: linkedUserIds } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }).catch(() => []),
      prisma.memberInvite.findFirst({
        where: { guildId, userId: actualUserId },
      }).catch(() => null),
    ]);

    if (
      !user
      && !member
      && !profile
      && (sanctions?.length ?? 0) === 0
      && (auditLogs?.length ?? 0) === 0
      && (sanctionReports?.length ?? 0) === 0
    ) {
      return null;
    }

  const isOnServer = !!member;
  const displayLabel = resolveMemberDisplayLabel(actualUserId, user, profile);
  const effectivePermissions = member?.permissions?.toArray() ?? [];
  const roles = resolveMemberCaseRoles(discordGuild, member, profile?.rolesSnapshot);

  const tagCandidates = new Set<string>(
    [user?.tag, user?.username, profile?.userTag, profile?.username, member?.user?.tag, displayLabel]
      .filter((entry): entry is string => !!entry),
  );

    const relevantLogs = (auditLogs || []).filter((entry) => {
      try {
        const haystack = `${entry.user || ""} ${entry.details || ""}`;
        if (haystack.includes(actualUserId)) return true;
        if ([...tagCandidates].some((candidate) => candidate && haystack.includes(candidate))) return true;
        if (entry.user === actualUserId) return true;
        return false;
      } catch (e) {
        return false;
      }
    });

    const mappedLogs: MemberCaseLogEntry[] = relevantLogs.slice(0, 120).map((entry) => ({
      id: entry.id,
      user: entry.user,
      action: entry.action,
      context: entry.context,
      module: entry.module,
      eventType: entry.eventType,
      source: entry.eventType === 'Discord' ? 'discord' : 'dashboard',
      details: interpretMentions(discordGuild, entry.details),
      dateIso: safeIsoDate(entry.dateIso) || new Date().toISOString(),
      channelId: entry.channelId,
    }));

  let invite: MemberCaseInviteInfo | null = dbInvite ? {
    code: dbInvite.inviteCode,
    inviterId: dbInvite.inviterId,
    inviterTag: dbInvite.inviterTag,
    inviterAvatarUrl: null,
    joinedAt: safeIsoDate(dbInvite.joinedAt),
  } : null;

  if (!invite) {
    invite = mappedLogs
      .map((entry) => parseInviteFromDetails(entry.details))
      .find((entry): entry is MemberCaseInviteInfo => !!entry) ?? null;
  }

  if (invite && invite.inviterId) {
    const cachedUser = client.users.cache.get(invite.inviterId);
    if (cachedUser) {
      invite.inviterTag = cachedUser.tag || cachedUser.username;
      invite.inviterAvatarUrl = cachedUser.displayAvatarURL({ size: 64 }) || null;
    } else {
      const fetchedUser = await client.users.fetch(invite.inviterId).catch(() => null);
      if (fetchedUser) {
        invite.inviterTag = fetchedUser.tag || fetchedUser.username;
        invite.inviterAvatarUrl = fetchedUser.displayAvatarURL({ size: 64 }) || null;
      } else {
        const inviterProfile = await prisma.memberProfile.findFirst({
          where: { guildId, userId: invite.inviterId },
          select: { userTag: true, displayName: true, username: true, avatarUrl: true }
        }).catch(() => null);
        if (inviterProfile) {
          invite.inviterTag = inviterProfile.displayName || inviterProfile.userTag || inviterProfile.username;
          invite.inviterAvatarUrl = inviterProfile.avatarUrl || null;
        }
      }
    }
  }

  if (invite && invite.inviterId && !invite.inviterTag) {
    invite.inviterTag = `Utilisateur ${invite.inviterId}`;
  }

    const messages = (auditLogs || [])
      .filter((entry) => {
        if (entry.module !== 'Messages' || entry.action !== 'Message envoyé') return false;
        if (!entry.user) return false;
        return entry.user === actualUserId || entry.user.endsWith(`(${actualUserId})`);
      })
      .slice(0, 250)
      .map((entry) => {
        const msgId = extractMessageId(entry.details);
        return {
          id: entry.id,
          channelId: entry.channelId ?? 'unknown',
          channelName: formatChannelName(discordGuild, entry.channelId),
          content: interpretMentions(discordGuild, extractMessagePreview(entry.details) ?? entry.details),
          dateIso: safeIsoDate(entry.dateIso) || new Date().toISOString(),
          discordUrl: msgId ? `https://discord.com/channels/${guildId}/${entry.channelId}/${msgId}` : null,
        };
      });

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

    const extractIdFromUserStr = (str: string | null | undefined): string | null => {
      if (!str) return null;
      const match = str.match(/\(<@(\d+)>\)/);
      if (match) return match[1];
      const rawIdMatch = str.match(/^(\d+)$/);
      return rawIdMatch ? rawIdMatch[1] : null;
    };

    const nodes: MemberCaseInteractionNode[] = [
      {
        id: actualUserId,
        label: displayLabel,
        type: 'user',
        avatar: profile?.avatarUrl ?? user?.displayAvatarURL?.({ size: 128 }) ?? null,
      },
    ];
    const edges: MemberCaseInteractionEdge[] = [];
    const targets = new Map<string, { label: string; mention: number; reply: number; reaction: number; total: number }>();

    const getOrCreateTarget = (targetId: string, defaultLabel: string) => {
      let t = targets.get(targetId);
      if (!t) {
        t = { label: defaultLabel, mention: 0, reply: 0, reaction: 0, total: 0 };
        targets.set(targetId, t);
      }
      return t;
    };

    for (const log of auditLogs || []) {
      const logUserId = extractIdFromUserStr(log.user);
      if (!logUserId) continue;

      if (log.module === 'Messages' && log.action === 'Message envoyé') {
        const details = log.details || '';
        const contentMatch = details.match(/Contenu: (.*)/);
        const content = contentMatch ? contentMatch[1] : details;

        const mentionRegex = /<@!?(\d+)>/g;
        let match;
        const processedMentions = new Set<string>();
        while ((match = mentionRegex.exec(content)) !== null) {
          const targetId = match[1];
          if (processedMentions.has(targetId)) continue;
          processedMentions.add(targetId);

          if (logUserId === actualUserId) {
            if (targetId !== actualUserId) {
              const t = getOrCreateTarget(targetId, `User ${targetId}`);
              t.mention += 1;
              t.total += 1;
            }
          } else {
            if (targetId === actualUserId) {
              const t = getOrCreateTarget(logUserId, `User ${logUserId}`);
              t.mention += 1;
              t.total += 1;
            }
          }
        }

        const replyMatch = details.match(/Réponse à:\s*<@!?(\d+)>/i);
        if (replyMatch) {
          const targetId = replyMatch[1];
          if (logUserId === actualUserId) {
            if (targetId !== actualUserId) {
              const t = getOrCreateTarget(targetId, `User ${targetId}`);
              t.reply += 1;
              t.total += 1;
            }
          } else {
            if (targetId === actualUserId) {
              const t = getOrCreateTarget(logUserId, `User ${logUserId}`);
              t.reply += 1;
              t.total += 1;
            }
          }
        }
      } else if (log.module === 'Interactions' && log.action === 'Réaction ajoutée') {
        const details = log.details || '';
        const targetMatch = details.match(/Cible:\s*.*?\(<@!?(\d+)>\)/i);
        if (targetMatch) {
          const targetId = targetMatch[1];
          if (logUserId === actualUserId) {
            if (targetId !== actualUserId) {
              const t = getOrCreateTarget(targetId, `User ${targetId}`);
              t.reaction += 1;
              t.total += 1;
            }
          } else {
            if (targetId === actualUserId) {
              const t = getOrCreateTarget(logUserId, `User ${logUserId}`);
              t.reaction += 1;
              t.total += 1;
            }
          }
        }
      }
    }

    const topTargets = [...targets.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 12);

    for (const [targetId, data] of topTargets) {
      let targetLabel = data.label;
      let targetAvatar: string | null = null;
      const cachedUser = client.users.cache.get(targetId);
      if (cachedUser) {
        targetLabel = cachedUser.tag;
        targetAvatar = cachedUser.displayAvatarURL({ size: 128 });
      }

      nodes.push({ id: targetId, label: targetLabel, type: 'target', avatar: targetAvatar });
      
      if (data.mention > 0) {
        edges.push({ from: actualUserId, to: targetId, type: 'mention', count: data.mention });
      }
      if (data.reply > 0) {
        edges.push({ from: actualUserId, to: targetId, type: 'reply', count: data.reply });
      }
      if (data.reaction > 0) {
        edges.push({ from: actualUserId, to: targetId, type: 'reaction', count: data.reaction });
      }
    }

    const result: MemberCaseResponse = {
      profile: {
        id: profile?.id ?? `${guildId}:${actualUserId}`,
        userId: actualUserId,
        userTag: user?.tag ?? profile?.userTag ?? null,
        username: user?.username ?? profile?.username ?? null,
        globalName: user?.globalName ?? profile?.globalName ?? null,
        displayName: member?.displayName ?? profile?.displayName ?? user?.globalName ?? user?.username ?? null,
        avatarUrl: profile?.avatarUrl ?? user?.displayAvatarURL?.({ size: 256 }) ?? null,
        bannerUrl: profile?.bannerUrl ?? null,
        accentColor: profile?.accentColor ?? user?.accentColor ?? null,
        locale: profile?.locale ?? null,
        isBot: profile?.isBot ?? user?.bot ?? false,
        accountCreatedAt: safeIsoDate(profile?.accountCreatedAt ?? user?.createdAt),
        guildJoinedAt: safeIsoDate(profile?.guildJoinedAt ?? member?.joinedAt),
        guildLeftAt: safeIsoDate(profile?.guildLeftAt),
        firstSeenAt: safeIsoDate(profile?.firstSeenAt),
        lastSeenAt: safeIsoDate(profile?.lastSeenAt),
        lastMessageAt: safeIsoDate(profile?.lastMessageAt),
        lastMessageChannelId: profile?.lastMessageChannelId ?? null,
        messageCount: profile?.messageCount ?? 0,
        voiceSessionCount: profile?.voiceSessionCount ?? 0,
        voiceTimeSeconds: profile?.voiceTimeSeconds ?? 0,
        voiceLastChannelId: profile?.voiceLastChannelId ?? null,
        voiceLastJoinedAt: safeIsoDate(profile?.voiceLastJoinedAt),
        voiceLastLeftAt: safeIsoDate(profile?.voiceLastLeftAt),
        rolesSnapshot: profile?.rolesSnapshot ?? [],
        presenceStatus: member?.presence?.status ?? (!isOnServer || profile?.guildLeftAt ? 'left' : null),
        pronouns: null,
        isTutor: staffMember?.isTutor ?? false,
        staffGrade: staffMember?.grade ?? null,
        isSuspectedDC: profile?.isSuspectedDC ?? false,
        moderatorNote: profile?.moderatorNote ?? null,
        isOnServer,
      },
      invite: invite
        ? {
            ...invite,
            joinedAt: invite.joinedAt ?? safeIsoDate(member?.joinedAt ?? profile?.guildJoinedAt),
          }
        : null,
      roles,
      effectivePermissions,
      sanctions: (sanctions || []).map((entry) => ({
        id: entry.id,
        type: entry.type as DashboardSanctionType,
        status: entry.status as DashboardSanctionStatus,
        targetUserId: entry.targetUserId,
        targetTag: entry.targetTag ?? `Utilisateur ${entry.targetUserId}`,
        moderatorUserId: entry.moderatorUserId,
        moderatorTag: entry.moderatorTag ?? `Modérateur ${entry.moderatorUserId}`,
        reason: entry.reason,
        durationSeconds: entry.durationSeconds,
        expiresAt: safeIsoDate(entry.expiresAt),
        createdAt: safeIsoDate(entry.createdAt) || new Date().toISOString(),
        resolvedAt: safeIsoDate(entry.resolvedAt),
        resolutionNote: entry.resolutionNote ?? null,
      })),
      logs: mappedLogs,
      messagesByChannel: [...messagesByChannelMap.values()].sort((left, right) => (right.lastMessageAt ?? '').localeCompare(left.lastMessageAt ?? '')),
      recentMessageCount: messages.length,
      recentLogCount: mappedLogs.length,
      connections: inviteConnections?.connections || [],
      connectionsNote: inviteConnections?.note || "",
      isSuspectedDC: profile?.isSuspectedDC ?? false,
      interactionGraph: { nodes, edges },
      candidatures: (candidatureHistory || []).map((c) => ({
        id: c.id,
        status: c.status,
        notes: c.notes ?? '',
        createdAt: safeIsoDate(c.createdAt) || new Date().toISOString(),
        data: c.data,
        autoRejected: c.autoRejected,
        autoRejectReason: c.autoRejectReason,
        rejectionReason: c.rejectionReason,
        oralResult: c.oralResult,
        reapplyAfter: safeIsoDate(c.reapplyAfter),
      })),
      sanctionReports: (sanctionReports || []).map((entry) => ({
        id: entry.id,
        sanctionId: entry.sanctionId ?? null,
        staffPseudo: entry.staffPseudo,
        incidentAt: safeIsoDate(entry.incidentAt) || new Date().toISOString(),
        memberPseudo: entry.memberPseudo,
        memberReference: entry.memberReference,
        sanctionType: entry.sanctionType as DashboardSanctionType,
        sanctionDurationLabel: entry.sanctionDurationLabel ?? null,
        brokenRules: entry.brokenRules,
        detailedReason: entry.detailedReason,
        evidenceLinks: parseEvidenceLinks(entry.evidenceLinks),
        additionalNotes: entry.additionalNotes ?? null,
        createdByUserId: entry.createdByUserId,
        createdByTag: entry.createdByTag ?? null,
        createdAt: safeIsoDate(entry.createdAt) || new Date().toISOString(),
      })),
      linkedAccounts: await Promise.all(
        linkedUserIds
          .filter(id => id !== actualUserId)
          .map(async (lid) => {
            try {
              const lProfile = await prisma.memberProfile.findUnique({
                where: { guildId_userId: { guildId, userId: lid } },
                select: { userTag: true, username: true, displayName: true, avatarUrl: true }
              });
              const lLink = await prisma.linkedAccount.findFirst({
                where: {
                  guildId,
                  OR: [
                    { user1Id: actualUserId, user2Id: lid },
                    { user1Id: lid, user2Id: actualUserId }
                  ]
                }
              });
              return {
                userId: lid,
                userTag: lProfile?.displayName ?? lProfile?.userTag ?? lProfile?.username ?? `Utilisateur ${lid}`,
                avatarUrl: lProfile?.avatarUrl ?? null,
                type: lLink?.type ?? 'DC',
                status: lLink?.status ?? 'UNKNOWN'
              };
            } catch (e) {
              return {
                userId: lid,
                userTag: `Utilisateur ${lid}`,
                avatarUrl: null,
                type: 'DC',
                status: 'UNKNOWN'
              };
            }
          })
      )
    };

    return result;
  } catch (err) {
    logger.error('MembersAPI', `Fatal error building member case for ${actualUserId}:`, err);
    throw err;
  }
}

export const getGuildName = (client: Client, guildId: string) => client.guilds.cache.get(guildId)?.name ?? `Serveur ${guildId}`;

export async function resolveFeatureAccessMap(
  client: Client,
  guildId: string,
  access: DashboardAccess,
  userId: string | null,
  roleIds: string[],
): Promise<FeatureAccessMap> {
  const { getOrCreateFeatureConfigs } = await import('../services/core/dashboardManagementService.js');
  const featureConfigs = await getOrCreateFeatureConfigs(guildId);
  const isGlobalAdmin = userId ? await resolveAdminAccess(client, userId) : false;

  const moderationFeatureKeys = new Set([
    'content',
    'members',
    'sanctions',
    'double_accounts',
    'logs',
    'activity',
    'auto_thread',
  ]);
  const staffFeatureKeys = new Set([
    'recruitment',
    'staff_directory',
    'staff_roles',
    'tutoring',
    'meetings',
    'absences',
    'polls',
    'discipline',
    'events',
  ]);

  const featureAccess: FeatureAccessMap = Object.create(null);
  for (const feature of featureConfigs) {
    if (isGlobalAdmin || access.level === 'admin') {
      featureAccess[feature.featureKey] = {
        canView: true,
        canModerate: true,
        canConfigure: true,
        canDelete: true,
      };
      continue;
    }

    const hasFeatureRoleOverrides = (feature.roleAccessByRole?.length ?? 0) > 0;
    
    if (!hasFeatureRoleOverrides) {
      const isDailyAlgo = feature.featureKey === 'daily_algo';
      const isModeration = moderationFeatureKeys.has(feature.featureKey);
      const isStaff = staffFeatureKeys.has(feature.featureKey);

      featureAccess[feature.featureKey] = {
        canView: access.canViewDashboard,
        canModerate: isDailyAlgo
          ? access.canModerateDailyAlgo
          : isModeration || isStaff
            ? access.canModerateContent
            : false,
        canConfigure: access.canManageSettings,
        canDelete: access.canManageSettings,
      };
      continue;
    }

    const permissions = feature.roleAccessByRole?.filter((entry) => roleIds.includes(entry.roleId)) ?? [];
    if (permissions.length === 0) {
      featureAccess[feature.featureKey] = {
        canView: false,
        canModerate: false,
        canConfigure: false,
        canDelete: false,
      };
      continue;
    }

    featureAccess[feature.featureKey] = permissions.reduce<FeatureAccess>((acc, entry) => {
      return {
        canView: acc.canView || entry.canView,
        canModerate: acc.canModerate || entry.canModerate,
        canConfigure: acc.canConfigure || entry.canConfigure,
        canDelete: acc.canDelete || entry.canDelete,
      };
    }, {
      canView: false,
      canModerate: false,
      canConfigure: false,
      canDelete: false,
    });
  }

  logger.info('DashboardAPI', `Resolved feature access for user ${userId} in guild ${guildId}`, { featureAccess });
  return featureAccess;
}

export const getGuildState = async (client: Client, guildId: string, access: DashboardAccess, userId?: string): Promise<DashboardState | null> => {
  const { ensureDashboardSchemaPatches } = await import('../utils/schemaPatches.js');
  await ensureDashboardSchemaPatches();

  const guild = await prisma.guild.findUnique({ 
    where: { id: guildId },
    include: { dashboardFeatureConfigs: true }
  });
  if (!guild) return null;

  const last7Days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    last7Days.push(dateKey);
  }

  const [
    dailyAlgoSubmissionCount,
    runtime,
    persistedDashboardAudit,
    persistedDiscordAudit,
    sanctions,
    sanctionReports,
    regulationRules,
    dailyStatsTrend,
  ] = await Promise.all([
    prisma.dailyAlgoSubmission.count({ where: { run: { guildId } } }),
    getOrCreateRuntime(guildId),
    prisma.dashboardAuditLog.findMany({
      where: { guildId, eventType: { not: 'Discord' } },
      orderBy: { dateIso: 'desc' },
      take: 300
    }),
    prisma.dashboardAuditLog.findMany({
      where: { guildId, eventType: 'Discord' },
      orderBy: { dateIso: 'desc' },
      take: 500
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
    prisma.guildDailyStat.findMany({
      where: {
        guildId,
        dateKey: { in: last7Days }
      }
    }),
  ]);

  const persistedAudit = [...persistedDashboardAudit, ...persistedDiscordAudit].sort(
    (a, b) => b.dateIso.getTime() - a.dateIso.getTime()
  );

  const auditTrailFromDb: AuditEntry[] = persistedAudit.map((entry) => ({
    id: entry.id,
    user: entry.user,
    action: entry.action,
    context: entry.context,
    module: entry.module,
    eventType: entry.eventType,
    source: entry.eventType === 'Discord' ? 'discord' : 'dashboard',
    details: interpretMentions(client.guilds.cache.get(guildId) || null, entry.details),
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
    evidenceLinks: parseEvidenceLinks(entry.evidenceLinks),
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

  const featureConfigs = guild.dashboardFeatureConfigs || [];
  const getFeatureStatus = (key: string, defaultEnabled = true): ModuleStatus => {
    const config = featureConfigs.find((c) => c.featureKey === key);
    if (config) return config.enabled ? 'active' : 'inactive';
    return defaultEnabled ? 'active' : 'inactive';
  };

  const modules: ModuleItem[] = [
    {
      id: 'codepolice',
      name: 'Code Police',
      description: MODULE_DESCRIPTIONS.codepolice,
      status: getFeatureStatus('codepolice', guild.codePoliceEnabled),
      uptime: 99.9,
      interactions: 0,
      lastSync: guild.updatedAt.toISOString()
    },
    {
      id: 'daily_algo',
      name: 'Daily Algo',
      description: MODULE_DESCRIPTIONS.dailyalgo,
      status: getFeatureStatus('daily_algo', guild.dailyAlgoEnabled),
      uptime: guild.dailyAlgoEnabled ? 98.8 : 100,
      interactions: dailyAlgoSubmissionCount,
      lastSync: guild.updatedAt.toISOString()
    },
    {
      id: 'fun',
      name: 'Salons Fun',
      description: MODULE_DESCRIPTIONS.fun,
      status: getFeatureStatus('fun', guild.funEnabled),
      uptime: guild.funEnabled ? 99.9 : 100,
      interactions: 0,
      lastSync: guild.updatedAt.toISOString()
    },
    {
      id: 'tutoring',
      name: 'Tutorat & Formation',
      description: MODULE_DESCRIPTIONS.tutoring,
      status: getFeatureStatus('tutoring'),
      uptime: 100,
      interactions: 0,
      lastSync: guild.updatedAt.toISOString()
    },
    {
      id: 'meetings',
      name: 'Réunions',
      description: MODULE_DESCRIPTIONS.meetings,
      status: getFeatureStatus('meetings'),
      uptime: 100,
      interactions: 0,
      lastSync: guild.updatedAt.toISOString()
    },
    {
      id: 'absences',
      name: 'Absences',
      description: MODULE_DESCRIPTIONS.absences,
      status: getFeatureStatus('absences'),
      uptime: 100,
      interactions: 0,
      lastSync: guild.updatedAt.toISOString()
    },
    {
      id: 'events',
      name: 'Événements & Quiz',
      description: MODULE_DESCRIPTIONS.events,
      status: getFeatureStatus('events'),
      uptime: 100,
      interactions: 0,
      lastSync: guild.updatedAt.toISOString()
    },
    {
      id: 'traduction',
      name: 'Traduction Automatique',
      description: MODULE_DESCRIPTIONS.traduction,
      status: getFeatureStatus('translation', guild.translationEnabled),
      uptime: guild.translationEnabled ? 97.1 : 100,
      interactions: 0,
      lastSync: guild.updatedAt.toISOString()
    },
    {
      id: 'regulation',
      name: 'Règlement',
      description: MODULE_DESCRIPTIONS.regulation,
      status: getFeatureStatus('regulation'),
      uptime: 100,
      interactions: 0,
      lastSync: guild.updatedAt.toISOString()
    },
    {
      id: 'staff_management',
      name: 'Gestion Staff',
      description: MODULE_DESCRIPTIONS.staff_management,
      status: 'active',
      uptime: 100,
      interactions: 0,
      lastSync: guild.updatedAt.toISOString()
    },
    {
      id: 'sanctions',
      name: 'Gestion Sanctions',
      description: MODULE_DESCRIPTIONS.sanctions,
      status: getFeatureStatus('sanctions'),
      uptime: 100,
      interactions: sanctions.length,
      lastSync: guild.updatedAt.toISOString()
    },
    {
      id: 'members',
      name: 'Membres & DC',
      description: MODULE_DESCRIPTIONS.members,
      status: 'active',
      uptime: 100,
      interactions: 0,
      lastSync: guild.updatedAt.toISOString()
    },
    {
      id: 'double_accounts',
      name: 'Doubles Comptes',
      description: MODULE_DESCRIPTIONS.double_accounts,
      status: getFeatureStatus('double_accounts'),
      uptime: 100,
      interactions: 0,
      lastSync: guild.updatedAt.toISOString()
    },
    {
      id: 'logs',
      name: 'Logs Discord',
      description: MODULE_DESCRIPTIONS.logs,
      status: getFeatureStatus('logs'),
      uptime: 100,
      interactions: 0,
      lastSync: guild.updatedAt.toISOString()
    },
    {
      id: 'nickname_moderation',
      name: 'Modération des pseudos',
      description: MODULE_DESCRIPTIONS.nickname_moderation,
      status: getFeatureStatus('nickname_moderation', guild.autoNicknameModerationEnabled),
      uptime: guild.autoNicknameModerationEnabled ? 100 : 0,
      interactions: 0,
      lastSync: guild.updatedAt.toISOString()
    },
    {
      id: 'auto_thread',
      name: 'Auto-Thread',
      description: MODULE_DESCRIPTIONS.auto_thread,
      status: getFeatureStatus('auto_thread', guild.autoThreadEnabled),
      uptime: 100,
      interactions: 0,
      lastSync: guild.updatedAt.toISOString()
    },
    {
      id: 'recruitment',
      name: 'Recrutement',
      description: MODULE_DESCRIPTIONS.recruitment,
      status: getFeatureStatus('recruitment'),
      uptime: 100,
      interactions: 0,
      lastSync: guild.updatedAt.toISOString()
    },
    {
      id: 'tickets',
      name: 'Tickets Support',
      description: MODULE_DESCRIPTIONS.tickets,
      status: getFeatureStatus('tickets'),
      uptime: 100,
      interactions: 0,
      lastSync: guild.updatedAt.toISOString()
    },
    {
      id: 'activity',
      name: 'Journal d\'activité',
      description: MODULE_DESCRIPTIONS.activity,
      status: 'active',
      uptime: 100,
      interactions: auditTrailFromDb.length,
      lastSync: guild.updatedAt.toISOString(),
      isFixed: true,
    },
    {
      id: 'analytics',
      name: 'Analytics',
      description: MODULE_DESCRIPTIONS.analytics,
      status: 'active',
      uptime: 100,
      interactions: 0,
      lastSync: guild.updatedAt.toISOString()
    },
    {
      id: 'profile',
      name: 'Profil',
      description: MODULE_DESCRIPTIONS.profile,
      status: 'active',
      uptime: 100,
      interactions: 0,
      lastSync: guild.updatedAt.toISOString()
    },
    {
      id: 'youtube',
      name: 'YouTube',
      description: MODULE_DESCRIPTIONS.youtube,
      status: getFeatureStatus('youtube', false),
      uptime: 100,
      interactions: 0,
      lastSync: guild.updatedAt.toISOString()
    },
    {
      id: 'twitch',
      name: 'Twitch',
      description: MODULE_DESCRIPTIONS.twitch,
      status: getFeatureStatus('twitch', false),
      uptime: 100,
      interactions: 0,
      lastSync: guild.updatedAt.toISOString()
    },
    {
      id: 'social_networks',
      name: 'Réseaux Sociaux',
      description: MODULE_DESCRIPTIONS.social_networks,
      status: getFeatureStatus('social_networks', true),
      uptime: 100,
      interactions: 0,
      lastSync: guild.updatedAt.toISOString()
    },
    {
      id: 'digest',
      name: 'Digest',
      description: MODULE_DESCRIPTIONS.digest,
      status: guild.digestEnabled ? 'active' : 'inactive',
      uptime: 100,
      interactions: 0,
      lastSync: guild.updatedAt.toISOString()
    }
  ];

  let discordGuild = client.guilds.cache.get(guildId) ?? null;
  if (!discordGuild) {
    discordGuild = await client.guilds.fetch(guildId).catch(() => null);
  }
  if (discordGuild && discordGuild.channels.cache.size === 0) {
    await discordGuild.channels.fetch().catch(() => null);
  }
  const currentMember = userId && discordGuild ? await discordGuild.members.fetch(userId).catch(() => null) : null;
  const currentRoleIds = currentMember
    ? currentMember.roles.cache
        .map((role) => role?.id)
        .filter((roleId): roleId is string => !!roleId)
    : [];
  const featureAccess = await resolveFeatureAccessMap(client, guildId, access, userId ?? null, currentRoleIds);

  const allChannels = discordGuild ? Array.from(discordGuild.channels.cache.values()) : [];
  const allRoles = discordGuild ? Array.from(discordGuild.roles.cache.values()) : [];

  const discordChannels: DashboardChannel[] = allChannels
    .filter((channel) => channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      mention: `<#${channel.id}>`,
      position: channel.rawPosition ?? 0
    }))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'fr'))
    .map(({ id, name, mention }) => ({ id, name, mention }));

  const discordVoiceChannels: DashboardChannel[] = allChannels
    .filter((channel) => channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice)
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      mention: `<#${channel.id}>`,
      position: channel.rawPosition ?? 0
    }))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'fr'))
    .map(({ id, name, mention }) => ({ id, name, mention }));

  const discordCategories: DashboardChannel[] = allChannels
    .filter((channel) => channel.type === ChannelType.GuildCategory)
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      mention: `<#${channel.id}>`,
      position: channel.rawPosition ?? 0
    }))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'fr'))
    .map(({ id, name, mention }) => ({ id, name, mention }));

  const discordRoles: DashboardRole[] = allRoles
    .filter((role) => role.name !== '@everyone' && !role.managed)
    .map((role) => ({
          id: role.id,
          name: role.name,
          mention: `<@&${role.id}>`,
          permissions: role.permissions.toArray(),
          position: role.position
    }))
    .sort((a, b) => b.position - a.position || a.name.localeCompare(a.name, 'fr'))
    .map(({ id, name, mention, permissions, position }) => ({ id, name, mention, permissions, position }));

  const trendMap = new Map(dailyStatsTrend.map(s => [s.dateKey, s]));
  const messagesTrend = last7Days.map(dateKey => trendMap.get(dateKey)?.messagesCount ?? 0);
  const voiceTrend = last7Days.map(dateKey => trendMap.get(dateKey)?.voiceMinutes ?? 0);
  const joinsTrend = last7Days.map(dateKey => trendMap.get(dateKey)?.membersJoined ?? 0);
  const leavesTrend = last7Days.map(dateKey => trendMap.get(dateKey)?.membersLeft ?? 0);
  const sanctionsTrend = last7Days.map(dateKey => trendMap.get(dateKey)?.sanctionsCount ?? 0);

  return {
    guildName: getGuildName(client, guildId),
    configChannelId: guild.configChannelId ?? '',
    logChannelId: guild.logChannelId ?? '',
    regulationChannelId: guild.regulationChannelId ?? '',
    regulationMessageId: guild.regulationMessageId ?? null,
    regulationVerificationEnabled: guild.regulationVerificationEnabled,
    regulationRoleId: guild.regulationRoleId,
    regulationLockEnabled: guild.regulationLockEnabled,
    meetingAnnouncementChannelId: guild.meetingAnnouncementChannelId ?? '',
    meetingVoiceChannelId: guild.meetingVoiceChannelId ?? '',
    publicChannelId: guild.publicChannelId ?? '',
    newsChannelId: guild.newsChannelId ?? '',
    dailyAlgoChannelId: guild.dailyAlgoChannelId ?? '',
    baseStaffRoleId: guild.baseStaffRoleId ?? '',
    testStaffRoleId: guild.testStaffRoleId ?? '',
    propagateSanctions: guild.propagateSanctions,
    sanctionReportEnabled: guild.sanctionReportEnabled,
    translationEnabled: guild.translationEnabled,
    codePoliceEnabled: guild.codePoliceEnabled,
    dailyAlgoEnabled: guild.dailyAlgoEnabled,
    githubReleasesEnabled: guild.githubReleasesEnabled,
    digestEnabled: guild.digestEnabled,
    autoThreadEnabled: guild.autoThreadEnabled,
    autoThreadChannels: guild.autoThreadChannels,
    autoThreadBotsEnabled: guild.autoThreadBotsEnabled,
    funEnabled: guild.funEnabled,
    funCountingChannelId: guild.funCountingChannelId ?? '',
    funOneWordStoryChannelId: guild.funOneWordStoryChannelId ?? '',
    funGuessNumberChannelId: guild.funGuessNumberChannelId ?? '',
    youtubeEnabled: getFeatureStatus('youtube', false) === 'active',
    twitchEnabled: getFeatureStatus('twitch', false) === 'active',
    socialNetworksEnabled: getFeatureStatus('social_networks', true) === 'active',
    recruitmentCategoryId: guild.recruitmentCategoryId ?? '',
    recruitmentLogChannelId: guild.recruitmentLogChannelId ?? '',
    recruitmentAutoRejectEnabled: isRecruitmentAutoRejectEnabled(guildId),
    modules,
    discordChannels,
    discordVoiceChannels,
    discordCategories,
    discordRoles,
    moderatorRoleId: guild.moderatorRoleId ?? '',
    commandRestrictions: runtime.commandRestrictions,
    sidebarFavorites: runtime.sidebarFavorites,
    commandCatalog: COMMAND_CATALOG,
    access: {
      level: access.level === 'admin' ? 'admin' : 'moderator',
      canModerateContent: access.canModerateContent,
      canModerateDailyAlgo: access.canModerateDailyAlgo,
      canManageSettings: access.canManageSettings || Object.values(featureAccess).some(f => f.canConfigure),
    },
    featureAccess,
    notifications: {
      discordChannel: guild.statusCheckChannelId ? `<#${guild.statusCheckChannelId}>` : '#alertes-redaction',
      email: runtime.email,
      emailEnabled: runtime.emailEnabled,
      cloudBackup: runtime.cloudBackup,
      debugLog: runtime.debugLog,
      killSwitchEnabled: runtime.killSwitchEnabled,
      severityByModule: runtime.severityByModule
    },
    auditTrail: auditTrailFromDb,
    sanctions: mappedSanctions,
    sanctionReports: mappedSanctionReports,
    regulationRules: mappedRegulationRules,
    messageTemplate: runtime.messageTemplate,
    analytics: {
      activityTrend: messagesTrend,
      messagesTrend,
      voiceTrend,
      joinsTrend,
      leavesTrend,
      sanctionsTrend,
      totalAutomations: modules.reduce((acc, m) => acc + m.interactions, 0),
      healthStatus: 100
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

export const splitPath = (pathname: string) => pathname.split('/').filter(Boolean);

export const SHARDING_CONFIG_KEY = 'SHARDING_CONFIG';

export const DEFAULT_SHARDING_CONFIG: ShardingConfig = {
  mode: 'auto',
  shardCount: null,
};

export function parseShardingConfig(rawValue: string | null | undefined): ShardingConfig {
  if (!rawValue) return DEFAULT_SHARDING_CONFIG;

  try {
    const parsed = JSON.parse(rawValue) as Partial<ShardingConfig>;
    if (parsed.mode === 'fixed') {
      const shardCount = Number(parsed.shardCount);
      if (Number.isFinite(shardCount) && shardCount > 0) {
        return { mode: 'fixed', shardCount: Math.floor(shardCount) };
      }
    }
  } catch {
    // ignore
  }

  return DEFAULT_SHARDING_CONFIG;
}

export async function loadShardingConfig(): Promise<ShardingConfig> {
  const config = await prisma.botGlobalConfig.findUnique({ where: { key: SHARDING_CONFIG_KEY } });
  return parseShardingConfig(config?.value ?? null);
}

export async function saveShardingConfig(config: ShardingConfig) {
  await prisma.botGlobalConfig.upsert({
    where: { key: SHARDING_CONFIG_KEY },
    update: { value: JSON.stringify(config) },
    create: { key: SHARDING_CONFIG_KEY, value: JSON.stringify(config) },
  });
}

export function requestContainerRestart() {
  if (typeof process.send === 'function') {
    process.send({ type: 'restart-container' });
    return;
  }

  setTimeout(() => process.exit(0), 250);
}

export function requestShardRespawn(shardId: number) {
  if (typeof process.send === 'function') {
    process.send({ type: 'respawn-shard', shardId });
    return;
  }

  requestContainerRestart();
}

export async function resolveGuildById(client: Client, guildId: string) {
  return client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
}

export async function collectShardSnapshots(client: Client): Promise<ShardSnapshot[]> {
  const sharding = client.shard;
  if (!sharding) {
    return [{
      shardId: 0,
      status: 'online',
      guildCount: client.guilds.cache.size,
      memberCount: client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0),
      ping: Math.round(client.ws.ping || 0),
      uptime: Math.floor(process.uptime()),
      readyAt: client.readyAt?.toISOString() ?? null,
      memoryUsage: process.memoryUsage(),
    }];
  }

  const configuredShardCount = Number(sharding.count ?? 1);
  const onlineSnapshots = await sharding.broadcastEval<ShardSnapshot>((shardClient: Client) => ({
    shardId: Number(shardClient.shard?.ids?.[0] ?? 0),
    status: shardClient.isReady() ? 'online' : 'starting',
    guildCount: shardClient.guilds.cache.size,
    memberCount: shardClient.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0),
    ping: Math.round(shardClient.ws.ping || 0),
    uptime: Math.floor(process.uptime()),
    readyAt: shardClient.readyAt?.toISOString() ?? null,
    memoryUsage: process.memoryUsage(),
  }));

  const snapshotById = new Map<number, ShardSnapshot>();
  for (const snapshot of onlineSnapshots) {
    snapshotById.set(snapshot.shardId, snapshot);
  }

  for (let shardId = 0; shardId < configuredShardCount; shardId += 1) {
    if (!snapshotById.has(shardId)) {
      snapshotById.set(shardId, {
        shardId,
        status: 'offline',
        guildCount: 0,
        memberCount: 0,
        ping: 0,
        uptime: 0,
        readyAt: null,
        memoryUsage: { rss: 0, heapUsed: 0, heapTotal: 0 },
      });
    }
  }

  return [...snapshotById.values()].sort((a, b) => a.shardId - b.shardId);
}

export async function collectShardGuilds(client: Client) {
  const sharding = client.shard;
  if (!sharding) {
    return client.guilds.cache.map((guild) => ({
      id: guild.id,
      name: guild.name,
      icon: guild.iconURL(),
      memberCount: guild.memberCount,
      joinedAt: guild.joinedAt?.toISOString() ?? null,
      activated: false,
      activationCode: null,
      shardId: 0,
    }));
  }

  interface ShardGuildResult {
    id: string;
    name: string;
    icon: string | null;
    memberCount: number;
    joinedAt: string | null;
    shardId: number;
  }

  const results = await sharding.broadcastEval<ShardGuildResult[]>((shardClient: Client) => shardClient.guilds.cache.map((guild) => ({
    id: guild.id,
    name: guild.name,
    icon: guild.iconURL(),
    memberCount: guild.memberCount,
    joinedAt: guild.joinedAt?.toISOString() ?? null,
    shardId: Number(shardClient.shard?.ids?.[0] ?? 0),
  })));

  return results.flat();
}

export let dashboardStateBroadcaster: ((guildId: string, reason: string) => void) | null = null;
export const setDashboardStateBroadcaster = (fn: (guildId: string, reason: string) => void) => {
  dashboardStateBroadcaster = fn;
};

export const broadcastDashboardStateChange = (guildId: string, reason: string) => {
  dashboardStateBroadcaster?.(guildId, reason);
};

export function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function parseDiscordMarkdown(text: string, guild?: any): string {
  if (!text) return '';
  let escaped = escapeHtml(text);

  escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  escaped = escaped.replace(/\*(.*?)\*/g, '<em>$1</em>');
  escaped = escaped.replace(/__(.*?)__/g, '<u>$1</u>');
  escaped = escaped.replace(/~~(.*?)~~/g, '<del>$1</del>');
  escaped = escaped.replace(/`(.*?)`/g, '<code class="px-1.5 py-0.5 rounded bg-zinc-800 font-mono text-sm">$1</code>');

  escaped = escaped.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const safeLang = escapeHtml(lang || 'plaintext');
    const safeCode = escapeHtml(code);
    return `<pre class="p-3 my-2 rounded bg-zinc-800 font-mono text-sm overflow-x-auto"><code class="language-${safeLang}">${safeCode}</code></pre>`;
  });

  escaped = escaped.replace(/&lt;:([a-zA-Z0-9_]+):(\d+)&gt;/g, (_, name, id) => {
    const safeName = escapeHtml(name);
    const safeId = escapeHtml(id);
    return `<img class="inline-block h-[1.375em] w-auto align-middle mx-[0.15em]" src="https://cdn.discordapp.com/emojis/${safeId}.png?size=48&quality=lossless" alt=":${safeName}:" title=":${safeName}:" />`;
  });
  escaped = escaped.replace(/&lt;a:([a-zA-Z0-9_]+):(\d+)&gt;/g, (_, name, id) => {
    const safeName = escapeHtml(name);
    const safeId = escapeHtml(id);
    return `<img class="inline-block h-[1.375em] w-auto align-middle mx-[0.15em]" src="https://cdn.discordapp.com/emojis/${safeId}.gif?size=48&quality=lossless" alt=":${safeName}:" title=":${safeName}:" />`;
  });

  if (guild) {
    escaped = escaped.replace(/&lt;@!?(\d+)&gt;/g, (_, id) => {
      const member = guild.members.cache.get(id);
      const user = guild.client.users.cache.get(id);
      const name = member?.displayName || user?.username || 'Utilisateur';
      const safeName = escapeHtml(name);
      return `<span class="font-semibold text-sky-400 px-1.5 py-0.5 bg-sky-500/10 rounded hover:bg-sky-500 hover:text-white transition-colors cursor-pointer">@${safeName}</span>`;
    });
    escaped = escaped.replace(/&lt;#(\d+)&gt;/g, (_, id) => {
      const ch = guild.channels.cache.get(id);
      const safeName = escapeHtml(ch ? ch.name : 'salon-inconnu');
      return `<span class="font-semibold text-sky-400 px-1.5 py-0.5 bg-sky-500/10 rounded hover:bg-sky-500 hover:text-white transition-colors cursor-pointer">#${safeName}</span>`;
    });
    escaped = escaped.replace(/&lt;@&amp;(\d+)&gt;/g, (_, id) => {
      const role = guild.roles.cache.get(id);
      const safeName = escapeHtml(role ? role.name : 'rôle-inconnu');
      return `<span class="font-semibold text-sky-400 px-1.5 py-0.5 bg-sky-500/10 rounded hover:bg-sky-500 hover:text-white transition-colors cursor-pointer">@${safeName}</span>`;
    });
  } else {
    escaped = escaped.replace(/&lt;@!?(\d+)&gt;/g, '<span class="font-semibold text-sky-400 px-1.5 py-0.5 bg-sky-500/10 rounded cursor-pointer">@Utilisateur</span>');
    escaped = escaped.replace(/&lt;#(\d+)&gt;/g, '<span class="font-semibold text-sky-400 px-1.5 py-0.5 bg-sky-500/10 rounded cursor-pointer">#salon</span>');
    escaped = escaped.replace(/&lt;@&amp;(\d+)&gt;/g, '<span class="font-semibold text-sky-400 px-1.5 py-0.5 bg-sky-500/10 rounded cursor-pointer">@Rôle</span>');
  }

  return escaped;
}

export function extractMediaUrls(content: string): { type: 'image' | 'video' | 'audio', url: string }[] {
  if (!content) return [];
  const urls: { type: 'image' | 'video' | 'audio', url: string }[] = [];
  const regex = /(https?:\/\/[^\s]+)/g;
  const matches = content.match(regex);
  if (matches) {
    for (const url of matches) {
      const cleanUrl = url.split('?')[0];
      if (/\.(gif|jpg|jpeg|png|webp)/i.test(cleanUrl)) {
        urls.push({ type: 'image', url });
      } else if (/\.(mp4|webm|mov|ogg)/i.test(cleanUrl)) {
        urls.push({ type: 'video', url });
      } else if (/\.(mp3|wav|ogg|flac|m4a)/i.test(cleanUrl)) {
        urls.push({ type: 'audio', url });
      } else if (/giphy\.com\/gifs\//i.test(cleanUrl)) {
        const parts = cleanUrl.split('-');
        const id = parts.at(-1);
        if (id) {
          urls.push({ type: 'image', url: `https://media.giphy.com/media/${id}/giphy.gif` });
        }
      }
    }
  }
  return urls;
}
