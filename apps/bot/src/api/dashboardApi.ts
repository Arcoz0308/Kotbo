import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { ChannelType, type Client, type TextChannel } from 'discord.js';
import { SanctionType, type Prisma } from '@prisma/client';
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
  processScheduledSanctions,
} from '../services/sanctionService.js';
import {
  COMMAND_CATALOG,
  normalizeCommandRestrictions,
  type CommandRestrictionRule,
} from '../utils/commandAccess.js';
import { runDigestForAllGuilds, runDailyAlgoForAllGuilds } from '../services/digestService.js';
import {
  runDailyAlgoSummariesForAllGuilds,
  getDailyAlgoUserProfile,
  getDailyAlgoUserParticipations,
  getLocalDateKey,
  reviewDailyAlgoSubmission,
  refreshDailyAlgoChallengeMessageForRun,
} from '../services/dailyAlgoService.js';
import {
  hashAPIKey,
  generateAPIKey,
  getStaffMember,
  addStaffMember,
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
  getAbsences,
  createAbsence,
  updateAbsenceStatus,
  getMeetings,
  createMeeting,
  checkInMeeting,
  getManagerNotes,
  createManagerNote,
  deleteManagerNote,
  getPolls,
  createPoll,
  castPollVote,
  getProcedures,
  upsertProcedure,
  deleteProcedure,
  markProcedureAsRead,
  getStaffAlertsAndProgression
} from '../services/staffLeadershipService.js';
import {
  getCandidatures,
  createCandidature,
  updateCandidatureStatus,
  deleteCandidature,
  approveCandidature,
  rejectCandidature,
  completeOral,
  getEligibleTutors,
  assignTutor,
  getCandidatureHistory,
  sendAutoRejectDM,
  handleRecruitmentButton,
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

type DiscordTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  error?: string;
  error_description?: string;
};

type DiscordUser = {
  id: string;
  username: string;
  avatar: string | null;
  discriminator: string;
  public_flags?: number;
  flags?: number;
  banner?: string | null;
  accent_color?: number | null;
  global_name?: string | null;
  mfa_enabled?: boolean;
  locale?: string;
  premium_type?: number;
};

type DiscordPartialGuild = {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
  features: string[];
};

interface DashboardJwtPayload extends jwt.JwtPayload {
  userId: string;
  username: string;
  avatar: string | null;
  discordToken: string;
}

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

function resolveDailyAlgoEffectiveSpeedBonus(params: {
  speedBonusPoints: number | null;
  runDateKey?: string | null;
  runCreatedAt?: Date;
}): number {
  const todayKey = getLocalDateKey();
  const runKey = params.runDateKey ?? (params.runCreatedAt ? getLocalDateKey(params.runCreatedAt) : todayKey);
  if (runKey >= todayKey) {
    return 0;
  }
  return params.speedBonusPoints ?? 0;
}

type DailyAlgoFunctionArg = {
  name: string;
  type: string;
};

type DailyAlgoUnitTest = {
  name: string;
  args: unknown[];
  expected: unknown;
};

type DailyAlgoProblemPayload = {
  title?: string;
  description?: string;
  solution?: string;
  difficulty?: string;
  language?: string;
  functionName?: string;
  functionArgs?: unknown;
  unitTests?: unknown;
  allowedLanguages?: unknown;
};

function normalizeDailyAlgoFunctionArgs(raw: unknown): DailyAlgoFunctionArg[] {
  if (!Array.isArray(raw)) return [];

  const parsed = raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const candidate = entry as { name?: unknown; type?: unknown };
      const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
      const type = typeof candidate.type === 'string' ? candidate.type.trim() : '';
      if (!name) return null;
      return {
        name,
        type: type || 'unknown',
      };
    })
    .filter((entry): entry is DailyAlgoFunctionArg => Boolean(entry));

  return parsed;
}

function normalizeDailyAlgoUnitTests(raw: unknown, expectedArgCount: number): DailyAlgoUnitTest[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object') return null;
      const candidate = entry as { name?: unknown; args?: unknown; expected?: unknown };
      const args = Array.isArray(candidate.args) ? candidate.args : null;
      if (!args || args.length !== expectedArgCount) return null;
      const name = typeof candidate.name === 'string' && candidate.name.trim()
        ? candidate.name.trim()
        : `Test ${index + 1}`;

      return {
        name,
        args,
        expected: candidate.expected,
      };
    })
    .filter((entry): entry is DailyAlgoUnitTest => Boolean(entry));
}

function normalizeDailyAlgoAllowedLanguages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const value = entry.trim();
    if (!value) continue;

    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(value);
  }

  return normalized;
}

function validateDailyAlgoProblemPayload(payload: DailyAlgoProblemPayload): {
  ok: boolean;
  error?: string;
  normalized?: {
    title: string;
    description: string;
    solution: string;
    difficulty: string;
    language: string;
    functionName: string;
    functionArgs: DailyAlgoFunctionArg[];
    unitTests: DailyAlgoUnitTest[];
    allowedLanguages: string[];
  };
} {
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  const description = typeof payload.description === 'string' ? payload.description.trim() : '';
  const difficulty = typeof payload.difficulty === 'string' ? payload.difficulty.trim().toLowerCase() : 'moyen';
  const language = typeof payload.language === 'string' && payload.language.trim() ? payload.language.trim().toLowerCase() : 'fr';
  const functionName = typeof payload.functionName === 'string' ? payload.functionName.trim() : '';
  const solution = typeof payload.solution === 'string' ? payload.solution.trim() : '';

  if (!title || !description) {
    return { ok: false, error: 'Titre et description obligatoires.' };
  }

  if (!['facile', 'moyen', 'difficile'].includes(difficulty)) {
    return { ok: false, error: 'Difficulté invalide.' };
  }

  if (!functionName || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(functionName)) {
    return { ok: false, error: 'Nom de fonction invalide (lettres/chiffres/underscore, sans espace).' };
  }

  const functionArgs = normalizeDailyAlgoFunctionArgs(payload.functionArgs);

  const duplicatedArgName = functionArgs.find(
    (arg, index) => functionArgs.findIndex((candidate) => candidate.name.toLowerCase() === arg.name.toLowerCase()) !== index,
  );
  if (duplicatedArgName) {
    return { ok: false, error: `Argument dupliqué: ${duplicatedArgName.name}` };
  }

  const allowedLanguages = normalizeDailyAlgoAllowedLanguages(payload.allowedLanguages);

  const unitTests = normalizeDailyAlgoUnitTests(payload.unitTests, functionArgs.length);
  if (unitTests.length === 0) {
    return { ok: false, error: 'Ajoute au moins un test unitaire valide avec le bon nombre d’arguments.' };
  }

  return {
    ok: true,
    normalized: {
      title,
      description,
      solution,
      difficulty,
      language,
      functionName,
      functionArgs,
      unitTests,
      allowedLanguages,
    },
  };
}

type DashboardState = {
  guildName: string;
  configChannelId: string;
  logChannelId: string;
  regulationChannelId: string;
  regulationMessageId: string | null;
  modules: ModuleItem[];
  feeds: FeedItem[];
  contentItems: ContentItem[];
  discordChannels: DashboardChannel[];
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
  recruitmentCategoryId: string | null;
  recruitmentLogChannelId: string | null;
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

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const nowIso = () => new Date().toISOString();

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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, X-API-Key',
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

const DAILY_ALGO_API_READ_PERMISSIONS = new Set([
  'daily_algo:read_exercise',
  'daily_algo:create_exercise',
  'daily_algo:update_exercise',
  'daily_algo:manage_exercises',
]);

const DAILY_ALGO_API_WRITE_PERMISSIONS = new Set([
  'daily_algo:create_exercise',
  'daily_algo:update_exercise',
  'daily_algo:manage_exercises',
]);

const getHeaderValue = (value: string | string[] | undefined): string | null => {
  if (!value) return null;
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return value[0]?.trim() || null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const extractApiKey = (req: IncomingMessage): string | null => {
  const directHeader = getHeaderValue(req.headers['x-api-key']);
  if (directHeader) return directHeader;

  const authHeader = getHeaderValue(req.headers.authorization);
  if (!authHeader) return null;

  if (authHeader.startsWith('ApiKey ')) {
    return authHeader.slice('ApiKey '.length).trim() || null;
  }

  if (authHeader.startsWith('Bearer ')) {
    const bearerValue = authHeader.slice('Bearer '.length).trim();
    if (bearerValue.startsWith('kb_')) {
      return bearerValue;
    }
  }

  return null;
};

const hasDailyAlgoApiPermission = (permissions: string[] | null | undefined, mode: 'read' | 'write') => {
  if (!Array.isArray(permissions) || permissions.length === 0) return false;
  const granted = new Set(permissions.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean));
  const required = mode === 'read' ? DAILY_ALGO_API_READ_PERMISSIONS : DAILY_ALGO_API_WRITE_PERMISSIONS;
  for (const permission of required) {
    if (granted.has(permission)) return true;
  }
  return false;
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

  // Any registered staff member should be able to access moderation features
  // (Daily Algo submission review, moderation views), even if they are not
  // mapped to the single Discord "moderator role" configured for the guild.
  if (guildConfig.moderatorRoleId && member.roles.cache.has(guildConfig.moderatorRoleId)) {
    return DASHBOARD_ACCESS_MODERATOR;
  }

  return DASHBOARD_ACCESS_MODERATOR;
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

  const [user, member, profile, sanctions, auditLogs, inviteConnections, candidatures] = await Promise.all([
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
    getCandidatureHistory(guildId, userId).catch(() => []),
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
    candidatures,
  };
}

const getGuildName = (client: Client, guildId: string) => client.guilds.cache.get(guildId)?.name ?? `Serveur ${guildId}`;

const getGuildState = async (client: Client, guildId: string, access: DashboardAccess): Promise<DashboardState | null> => {
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
      include: { feed: { select: { name: true, category: true } } },
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
    modules,
    feeds: feedMapped,
    contentItems,
    discordChannels,
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
    recruitmentCategoryId: guild.recruitmentCategoryId ?? null,
    recruitmentLogChannelId: guild.recruitmentLogChannelId ?? null,
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
        { label: 'Auto-Publi', value: feeds.filter(f => f.autoPublish).length > 0 ? (feeds.filter(f => f.autoPublish && !f.lastPollError).length / feeds.filter(f => f.autoPublish).length) * 100 : 85 },
        { label: 'Surcharge', value: 5 }, // Inferred logic for surcharge
        { label: 'Santé API', value: 100 }
      ],
      translationCount: translatedCount,
      healthStatus: Math.max(0, 100 - (feedErrorCount * 10))
    }
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

      if (url.pathname === '/health') {
        json(res, 200, { ok: true, service: 'kotbo-dashboard-api' });
        return;
      }

      if (parts[0] === 'api' && parts[1] === 'webhooks' && parts[2] === 'recruitment' && parts[3] && req.method === 'POST') {
        const guildId = parts[3];
        try {
          const body = await readJsonBody(req);
          if (!body) {
            logger.warn('RecruitmentAPI', `Requête vide reçue pour le serveur ${guildId}`);
            json(res, 400, { error: 'Payload vide' });
            return;
          }

          logger.info('RecruitmentAPI', `Candidature reçue pour le serveur ${guildId}. Données: ${JSON.stringify(body).substring(0, 100)}...`);
          const { candidature, autoRejected, autoRejectReason } = await createCandidature(guildId, body);

          // Send auto-reject DM if needed
          if (autoRejected && candidature.discordId) {
            await sendAutoRejectDM(client, guildId, candidature.discordId, autoRejectReason || 'Votre candidature ne remplit pas les conditions requises.');
            logger.info('RecruitmentAPI', `Candidature ${candidature.id} auto-rejetée: ${autoRejectReason}`);
          }

          // Broadcast to dashboard
          broadcastDashboardStateChange(guildId, 'recruitment_candidature_received');

          json(res, 201, { ok: true, message: autoRejected ? 'Candidature auto-rejetée' : 'Candidature enregistrée', autoRejected });
        } catch (err) {
          logger.error('RecruitmentAPI', 'Webhook error:', err);
          json(res, 500, { error: 'Erreur lors du traitement de la candidature' });
        }
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

      // --- PUBLIC PROFILE ROUTE ---
      if (parts.length === 4 && parts[0] === 'api' && parts[1] === 'public' && parts[2] === 'profile') {
        const profileUserId = parts[3];

        try {
          // 1. Fetch Discord User
          const discordUser = await client.users.fetch(profileUserId).catch(() => null);
          if (!discordUser) {
            json(res, 404, { error: 'Utilisateur introuvable' });
            return;
          }

          // 2. Fetch Daily Algo Stats (across all guilds if possible, but currently guild-scoped)
          // For now, we fetch from the first common guild or a global aggregation
          const guilds = await prisma.guild.findMany({
            where: { dailyAlgoEnabled: true },
            select: { id: true }
          });

          let algoStats = null;
          let recentAlgos: any[] = [];

          for (const guild of guilds) {
            const stats = await getDailyAlgoUserProfile(guild.id, profileUserId);
            if (stats && (!algoStats || stats.totalPoints > algoStats.totalPoints)) {
              algoStats = stats;
              recentAlgos = await getDailyAlgoUserParticipations(guild.id, profileUserId, 5);
            }
          }

          // 3. Fetch Scouting Stats (Articles validés via audit logs)
          const scoutingCount = await prisma.dashboardAuditLog.count({
            where: {
              user: { contains: discordUser.username },
              action: 'Validation contenu'
            }
          });

          json(res, 200, {
            user: {
              id: discordUser.id,
              username: discordUser.username,
              globalName: discordUser.globalName,
              avatarUrl: discordUser.displayAvatarURL({ size: 512 }),
            },
            algo: algoStats,
            recentAlgos,
            stats: {
              scoutedArticles: scoutingCount
            }
          });
          return;
        } catch (error) {
          logger.error('API', `Erreur profile public ${profileUserId}:`, error);
          json(res, 500, { error: 'Erreur lors de la récupération du profil' });
          return;
        }
      }

      // --- PUBLIC NEWS ROUTE ---
      if (parts.length === 3 && parts[0] === 'api' && parts[1] === 'public' && parts[2] === 'news') {
        try {
          const firstGuildConfig = await prisma.guild.findFirst({
            select: { id: true, publicChannelId: true }
          });

          if (!firstGuildConfig) {
            json(res, 404, { error: 'Aucune guilde configurée.' });
            return;
          }

          // Fetch real guild info from Discord client
          const discordGuild = client.guilds.cache.get(firstGuildConfig.id);
          const firstGuild = {
            id: firstGuildConfig.id,
            name: discordGuild?.name || 'Kotbo Gazette',
            icon: discordGuild?.iconURL() || null
          };

          const rawNews = await prisma.feedItem.findMany({
            where: {
              feed: { guildId: firstGuildConfig.id },
              status: 'APPROVED'
            },
            orderBy: { publishedAt: 'desc' },
            take: 30,
            include: { feed: true }
          });

          // Map to match frontend expectations (description -> excerpt)
          const news = rawNews.map(item => ({
            ...item,
            excerpt: item.descriptionTranslated || item.description
          }));

          json(res, 200, { news, guild: firstGuild });
          return;
        } catch (error) {
          logger.error('API', `Erreur public news:`, error);
          json(res, 500, { error: 'Erreur lors de la récupération des news' });
          return;
        }
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

              const tokenData = await tokenResponse.json() as DiscordTokenResponse;
              if (tokenData.error) throw new Error(tokenData.error_description);

              // Get user info
              const userResponse = await fetch('https://discord.com/api/users/@me', {
                headers: { Authorization: `Bearer ${tokenData.access_token}` },
              });
              const userData = await userResponse.json() as DiscordUser;

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

      if (parts.length >= 4 && parts[0] === 'api' && parts[1] === 'public' && parts[2] === 'guilds') {
        const guildId = parts[3];
        const rawApiKey = extractApiKey(req);
        if (!rawApiKey) {
          json(res, 401, { error: 'Clé API manquante. Utilise le header X-API-Key.' });
          return;
        }

        const keyHash = hashAPIKey(rawApiKey);
        const apiKey = await verifyAPIKey(keyHash, guildId);
        if (!apiKey) {
          json(res, 401, { error: 'Clé API invalide ou inactive.' });
          return;
        }

        const auditUser = `API ${apiKey.displayKey}`;

        if (parts.length === 5 && parts[4] === 'daily-algo-problems' && req.method === 'GET') {
          if (!hasDailyAlgoApiPermission(apiKey.permissions, 'read')) {
            json(res, 403, { error: 'Permission manquante: daily_algo:read_exercise' });
            return;
          }

          const problems = await prisma.dailyAlgoProblem.findMany({
            orderBy: [
              { usedAt: { sort: 'asc', nulls: 'first' } },
              { createdAt: 'desc' },
            ]
          });
          json(res, 200, problems);
          return;
        }

        if (parts.length === 5 && parts[4] === 'daily-algo-problems' && req.method === 'POST') {
          if (!hasDailyAlgoApiPermission(apiKey.permissions, 'write')) {
            json(res, 403, { error: 'Permission manquante: daily_algo:create_exercise' });
            return;
          }

          const body = await readJsonBody<DailyAlgoProblemPayload>(req);
          const validation = validateDailyAlgoProblemPayload(body ?? {});
          if (!validation.ok || !validation.normalized) {
            json(res, 400, { error: validation.error ?? 'Payload invalide.' });
            return;
          }

          const normalized = validation.normalized;
          const problem = await prisma.dailyAlgoProblem.create({
            data: {
              title: normalized.title,
              description: normalized.description,
              solution: normalized.solution || '',
              difficulty: normalized.difficulty,
              language: normalized.language,
              functionName: normalized.functionName,
              functionArgs: normalized.functionArgs as Prisma.InputJsonValue,
              unitTests: normalized.unitTests as Prisma.InputJsonValue,
              allowedLanguages: normalized.allowedLanguages,
            }
          });

          await pushAudit(guildId, {
            user: auditUser,
            action: 'Ajout Exercice (API)',
            context: getGuildName(client, guildId),
            module: 'Daily Algo',
            eventType: 'API',
            details: `Ajout d'un nouvel exercice via API : ${problem.title}`,
            channelId: null
          });

          broadcastDashboardStateChange(guildId, 'daily_algo_problem_created');
          json(res, 201, problem);
          return;
        }

        if (parts.length === 6 && parts[4] === 'daily-algo-problems' && req.method === 'PATCH') {
          if (!hasDailyAlgoApiPermission(apiKey.permissions, 'write')) {
            json(res, 403, { error: 'Permission manquante: daily_algo:update_exercise' });
            return;
          }

          const problemId = parts[5];
          const body = await readJsonBody<DailyAlgoProblemPayload>(req);
          const validation = validateDailyAlgoProblemPayload(body ?? {});
          if (!validation.ok || !validation.normalized) {
            json(res, 400, { error: validation.error ?? 'Payload invalide.' });
            return;
          }

          const normalized = validation.normalized;
          const existing = await prisma.dailyAlgoProblem.findUnique({
            where: { id: problemId },
            select: { id: true, title: true },
          });

          if (!existing) {
            json(res, 404, { error: 'Exercice introuvable.' });
            return;
          }

          const updated = await prisma.dailyAlgoProblem.update({
            where: { id: problemId },
            data: {
              title: normalized.title,
              description: normalized.description,
              solution: normalized.solution || '',
              difficulty: normalized.difficulty,
              language: normalized.language,
              functionName: normalized.functionName,
              functionArgs: normalized.functionArgs as Prisma.InputJsonValue,
              unitTests: normalized.unitTests as Prisma.InputJsonValue,
              allowedLanguages: normalized.allowedLanguages,
            },
          });

          const todayRun = await prisma.dailyAlgoRun.findFirst({
            where: {
              guildId,
              problemId: problemId,
              dateKey: getLocalDateKey(),
              challengeMessageId: { not: null },
            },
            select: { id: true },
          });

          let discordMessageUpdated = false;
          if (todayRun?.id) {
            discordMessageUpdated = await refreshDailyAlgoChallengeMessageForRun(client, todayRun.id).catch(() => false);
          }

          await pushAudit(guildId, {
            user: auditUser,
            action: 'Modification Exercice (API)',
            context: getGuildName(client, guildId),
            module: 'Daily Algo',
            eventType: 'API',
            details: discordMessageUpdated
              ? `Exercice modifié via API : ${updated.title} (message Discord du jour mis à jour).`
              : `Exercice modifié via API : ${updated.title}.`,
            channelId: null
          });

          broadcastDashboardStateChange(guildId, 'daily_algo_problem_updated');
          json(res, 200, { ...updated, discordMessageUpdated });
          return;
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
          const decoded = jwt.decode(token) as DashboardJwtPayload;
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

            const decoded = jwt.decode(token) as DashboardJwtPayload;
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

            const userGuilds = await guildsResponse.json() as DiscordPartialGuild[];
            if (!Array.isArray(userGuilds)) {
              logger.error('API', 'Discord did not return an array of guilds', userGuilds);
              json(res, 500, { error: 'Réponse Discord invalide' });
              return;
            }

            const userGuildPermissions = new Map<string, bigint>();
            const userGuildsById = new Map<string, DiscordPartialGuild>();

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

              const sourceGuild = userGuildsById.get(guildId)!;
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

          if (!access.canManageSettings && req.method !== 'GET' && !isContentAction && !isSanctionAction && !isDailyAlgoReviewAction) {
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
            const state = await getGuildState(client, guildId, access);
            if (!state) {
              json(res, 404, { error: 'Guilde introuvable' });
              return;
            }
            json(res, 200, state);
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

          if (parts.length === 6 && parts[4] === 'modules' && req.method === 'PUT') {
            const moduleId = parts[5];
            const body = (await readJsonBody<{ status: ModuleStatus }>(req)) ?? { status: 'inactive' };

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

          if (parts.length === 6 && parts[4] === 'daily-algo-runs' && parts[5] === 'schedule' && req.method === 'GET') {
            const daysBackParam = Number(url.searchParams.get('daysBack') ?? 7);
            const daysForwardParam = Number(url.searchParams.get('daysForward') ?? 21);

            const daysBack = Number.isFinite(daysBackParam)
              ? Math.max(0, Math.min(30, Math.trunc(daysBackParam)))
              : 7;
            const daysForward = Number.isFinite(daysForwardParam)
              ? Math.max(0, Math.min(60, Math.trunc(daysForwardParam)))
              : 21;

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const fromDate = new Date(today);
            fromDate.setDate(fromDate.getDate() - daysBack);

            const toDate = new Date(today);
            toDate.setDate(toDate.getDate() + daysForward);

            const fromKey = getLocalDateKey(fromDate);
            const toKey = getLocalDateKey(toDate);
            const todayKey = getLocalDateKey(today);

            const runs = await prisma.dailyAlgoRun.findMany({
              where: {
                guildId,
                dateKey: {
                  not: null,
                  gte: fromKey,
                  lte: toKey,
                },
              },
              orderBy: {
                dateKey: 'asc',
              },
              include: {
                problem: {
                  select: {
                    id: true,
                    title: true,
                    description: true,
                    difficulty: true,
                    language: true,
                    functionName: true,
                    functionArgs: true,
                    unitTests: true,
                    allowedLanguages: true,
                  },
                },
                _count: {
                  select: {
                    submissions: true,
                  },
                },
              },
            });

            json(res, 200, {
              todayKey,
              fromKey,
              toKey,
              runs: runs.map((run) => ({
                id: run.id,
                dateKey: run.dateKey,
                challengeChannelId: run.challengeChannelId,
                validationChannelId: run.validationChannelId,
                challengeMessageId: run.challengeMessageId,
                leaderboardMessageId: run.leaderboardMessageId,
                createdAt: run.createdAt.toISOString(),
                updatedAt: run.updatedAt.toISOString(),
                submissionsCount: run._count.submissions,
                problem: {
                  id: run.problem.id,
                  title: run.problem.title,
                  description: run.problem.description,
                  difficulty: run.problem.difficulty,
                  language: run.problem.language,
                  functionName: run.problem.functionName,
                  functionArgs: Array.isArray(run.problem.functionArgs) ? run.problem.functionArgs : [],
                  unitTests: Array.isArray(run.problem.unitTests) ? run.problem.unitTests : [],
                  allowedLanguages: Array.isArray(run.problem.allowedLanguages) ? run.problem.allowedLanguages : [],
                },
              })),
            });
            return;
          }

          if (
            parts.length === 7
            && parts[4] === 'daily-algo-runs'
            && parts[5] === 'schedule'
            && parts[6] === 'ensure'
            && req.method === 'POST'
          ) {
            const body = await readJsonBody<{ daysForward?: unknown }>(req);
            const daysForwardRaw = Number(body?.daysForward ?? 21);
            const daysForward = Number.isFinite(daysForwardRaw)
              ? Math.max(1, Math.min(60, Math.trunc(daysForwardRaw)))
              : 21;

            const guild = await prisma.guild.findUnique({
              where: { id: guildId },
              select: {
                dailyAlgoEnabled: true,
                dailyAlgoChannelId: true,
                dailyAlgoValidationChannelId: true,
              },
            });

            if (!guild?.dailyAlgoEnabled) {
              json(res, 400, { error: 'Le Daily Algo doit être activé avant de planifier des dates.' });
              return;
            }

            if (!guild.dailyAlgoChannelId) {
              json(res, 400, { error: 'Configure d’abord le salon Daily Algo.' });
              return;
            }

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayKey = getLocalDateKey(today);
            const endDate = new Date(today);
            endDate.setDate(endDate.getDate() + daysForward);
            const endKey = getLocalDateKey(endDate);

            const existingRuns = await prisma.dailyAlgoRun.findMany({
              where: {
                guildId,
                dateKey: {
                  gte: todayKey,
                  lte: endKey,
                },
              },
              select: {
                dateKey: true,
              },
            });

            const occupiedDateKeys = new Set(
              existingRuns
                .map((run) => (typeof run.dateKey === 'string' ? run.dateKey : null))
                .filter((value): value is string => Boolean(value)),
            );

            const candidateProblems = await prisma.dailyAlgoProblem.findMany({
              where: {
                usedAt: null,
                language: 'fr',
              },
              orderBy: [
                { createdAt: 'asc' },
                { id: 'asc' },
              ],
              select: {
                id: true,
                title: true,
              },
            });

            const problemQueue = [...candidateProblems];
            let createdRuns = 0;
            const now = new Date();

            for (let offset = 0; offset <= daysForward; offset += 1) {
              const date = new Date(today);
              date.setDate(date.getDate() + offset);
              const dateKey = getLocalDateKey(date);

              if (occupiedDateKeys.has(dateKey)) {
                continue;
              }

              const candidate = problemQueue.shift();
              if (!candidate) {
                break;
              }

              try {
                await prisma.$transaction(async (tx) => {
                  const reserve = await tx.dailyAlgoProblem.updateMany({
                    where: {
                      id: candidate.id,
                      usedAt: null,
                    },
                    data: {
                      usedAt: now,
                    },
                  });

                  if (reserve.count === 0) {
                    throw new Error('PROBLEM_ALREADY_RESERVED');
                  }

                  await tx.dailyAlgoRun.create({
                    data: {
                      guildId,
                      dateKey,
                      problemId: candidate.id,
                      challengeChannelId: guild.dailyAlgoChannelId!,
                      validationChannelId: guild.dailyAlgoValidationChannelId ?? null,
                    },
                  });
                });

                occupiedDateKeys.add(dateKey);
                createdRuns += 1;
              } catch (error) {
                // Ignore unique/race conflicts and continue filling the schedule.
                logger.warn('DailyAlgo', `Planification ignorée pour ${dateKey} / ${candidate.id}:`, error);
              }
            }

            if (createdRuns > 0) {
              await pushAudit(guildId, {
                user: auditUser,
                action: 'Planification Daily Algo',
                context: getGuildName(client, guildId),
                module: 'Daily Algo',
                eventType: 'Manuel',
                details: `${createdRuns} date(s) Daily Algo confirmée(s) jusqu'au ${endKey}.`,
                channelId: null,
              });
              broadcastDashboardStateChange(guildId, 'daily_algo_schedule_updated');
            }

            json(res, 200, {
              ok: true,
              todayKey,
              endKey,
              daysForward,
              createdRuns,
              remainingUnscheduledDays: Math.max(0, daysForward + 1 - occupiedDateKeys.size),
            });
            return;
          }

          if (
            parts.length === 7
            && parts[4] === 'daily-algo-runs'
            && parts[5] === 'today'
            && parts[6] === 'problem'
            && req.method === 'PATCH'
          ) {
            const body = await readJsonBody<{ problemId?: unknown }>(req);
            const problemId = typeof body?.problemId === 'string' ? body.problemId.trim() : '';

            if (!problemId) {
              json(res, 400, { error: 'problemId manquant.' });
              return;
            }

            const targetProblem = await prisma.dailyAlgoProblem.findUnique({
              where: { id: problemId },
              select: { id: true, title: true },
            });

            if (!targetProblem) {
              json(res, 404, { error: 'Exercice introuvable.' });
              return;
            }

            const todayKey = getLocalDateKey();
            const existingRun = await prisma.dailyAlgoRun.findUnique({
              where: {
                guildId_dateKey: {
                  guildId,
                  dateKey: todayKey,
                },
              },
              include: {
                _count: {
                  select: {
                    submissions: true,
                  },
                },
              },
            });

            if (
              existingRun
              && existingRun.problemId !== problemId
              && existingRun._count.submissions > 0
            ) {
              json(res, 409, {
                error: 'Impossible de changer l’exercice du jour: des soumissions existent déjà.',
              });
              return;
            }

            let challengeChannelId = existingRun?.challengeChannelId ?? null;
            let validationChannelId = existingRun?.validationChannelId ?? null;

            if (!existingRun) {
              const guild = await prisma.guild.findUnique({
                where: { id: guildId },
                select: {
                  dailyAlgoChannelId: true,
                  dailyAlgoValidationChannelId: true,
                },
              });

              if (!guild?.dailyAlgoChannelId) {
                json(res, 400, { error: 'Configure d’abord le salon Daily Algo.' });
                return;
              }

              challengeChannelId = guild.dailyAlgoChannelId;
              validationChannelId = guild.dailyAlgoValidationChannelId ?? null;
            }

            const now = new Date();
            const swapResult = await prisma.$transaction(async (tx) => {
              let runId = existingRun?.id ?? '';
              const previousProblemId = existingRun?.problemId ?? null;

              if (existingRun) {
                if (existingRun.problemId !== problemId) {
                  await tx.dailyAlgoRun.update({
                    where: { id: existingRun.id },
                    data: { problemId },
                  });
                }
              } else {
                const created = await tx.dailyAlgoRun.create({
                  data: {
                    guildId,
                    dateKey: todayKey,
                    problemId,
                    challengeChannelId: challengeChannelId!,
                    validationChannelId,
                  },
                  select: { id: true },
                });
                runId = created.id;
              }

              await tx.dailyAlgoProblem.updateMany({
                where: {
                  id: problemId,
                  usedAt: null,
                },
                data: {
                  usedAt: now,
                },
              });

              if (previousProblemId && previousProblemId !== problemId) {
                const remainingRunsForPrevious = await tx.dailyAlgoRun.count({
                  where: { problemId: previousProblemId },
                });

                if (remainingRunsForPrevious === 0) {
                  await tx.dailyAlgoProblem.updateMany({
                    where: { id: previousProblemId },
                    data: { usedAt: null },
                  });
                }
              }

              const run = await tx.dailyAlgoRun.findUnique({
                where: { id: runId },
                include: {
                  problem: {
                    select: {
                      id: true,
                      title: true,
                      description: true,
                      difficulty: true,
                      language: true,
                      functionName: true,
                      functionArgs: true,
                      unitTests: true,
                      allowedLanguages: true,
                    },
                  },
                  _count: {
                    select: {
                      submissions: true,
                    },
                  },
                },
              });

              return {
                run,
                previousProblemId,
                changed: previousProblemId !== problemId,
              };
            });

            if (!swapResult.run) {
              json(res, 500, { error: 'Impossible de charger le run Daily Algo après modification.' });
              return;
            }

            let discordMessageUpdated = false;
            if (swapResult.changed && swapResult.run.challengeMessageId) {
              discordMessageUpdated = await refreshDailyAlgoChallengeMessageForRun(client, swapResult.run.id).catch(() => false);
            }

            await pushAudit(guildId, {
              user: auditUser,
              action: 'Changement Exercice du Jour',
              context: getGuildName(client, guildId),
              module: 'Daily Algo',
              eventType: 'Manuel',
              details: discordMessageUpdated
                ? `Exercice du jour défini sur "${swapResult.run.problem.title}" (message Discord mis à jour).`
                : `Exercice du jour défini sur "${swapResult.run.problem.title}".`,
              channelId: null,
            });

            broadcastDashboardStateChange(guildId, 'daily_algo_today_problem_changed');
            json(res, 200, {
              ok: true,
              todayKey,
              changed: swapResult.changed,
              discordMessageUpdated,
              run: {
                id: swapResult.run.id,
                dateKey: swapResult.run.dateKey,
                challengeChannelId: swapResult.run.challengeChannelId,
                validationChannelId: swapResult.run.validationChannelId,
                challengeMessageId: swapResult.run.challengeMessageId,
                leaderboardMessageId: swapResult.run.leaderboardMessageId,
                createdAt: swapResult.run.createdAt.toISOString(),
                updatedAt: swapResult.run.updatedAt.toISOString(),
                submissionsCount: swapResult.run._count.submissions,
                problem: {
                  id: swapResult.run.problem.id,
                  title: swapResult.run.problem.title,
                  description: swapResult.run.problem.description,
                  difficulty: swapResult.run.problem.difficulty,
                  language: swapResult.run.problem.language,
                  functionName: swapResult.run.problem.functionName,
                  functionArgs: Array.isArray(swapResult.run.problem.functionArgs) ? swapResult.run.problem.functionArgs : [],
                  unitTests: Array.isArray(swapResult.run.problem.unitTests) ? swapResult.run.problem.unitTests : [],
                  allowedLanguages: Array.isArray(swapResult.run.problem.allowedLanguages) ? swapResult.run.problem.allowedLanguages : [],
                },
              },
            });
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
                    language: true,
                    functionName: true,
                    functionArgs: true,
                    unitTests: true,
                    allowedLanguages: true,
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
              const effectiveSpeedBonus = resolveDailyAlgoEffectiveSpeedBonus({
                speedBonusPoints: submission.speedBonusPoints,
                runDateKey: run.dateKey,
                runCreatedAt: run.createdAt,
              });
              const totalPoints = finalScore !== null
                ? Math.round((finalScore + effectiveSpeedBonus) * 10) / 10
                : null;

              return {
                id: submission.id,
                authorId: submission.authorId,
                authorName: submission.authorName,
                solution: submission.solution,
                language: null,
                status: submission.status,
                submittedAt: submission.submittedAt.toISOString(),
                speedRank: submission.speedRank,
                speedBonusPoints: effectiveSpeedBonus,
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
                  language: run.problem.language,
                  functionName: run.problem.functionName,
                  functionArgs: Array.isArray(run.problem.functionArgs) ? run.problem.functionArgs : [],
                  unitTests: Array.isArray(run.problem.unitTests) ? run.problem.unitTests : [],
                  allowedLanguages: Array.isArray(run.problem.allowedLanguages) ? run.problem.allowedLanguages : [],
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
                  speedBonusPoints: resolveDailyAlgoEffectiveSpeedBonus({
                    speedBonusPoints: submission.speedBonusPoints,
                    runDateKey: run.dateKey,
                    runCreatedAt: run.createdAt,
                  }),
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
              scores?: {
                correctness?: number;
                comments?: number;
                compactness?: number;
                optimization?: number;
                readability?: number;
              };
              feedback?: string;
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

            let success = false;
            try {
              success = await reviewDailyAlgoSubmission({
                client,
                submissionId,
                action: body.action,
                moderatorId: user.userId,
                allowReviewedUpdate: true,
                scores,
                feedback: typeof body.feedback === 'string' ? body.feedback : undefined,
              });
            } catch (error) {
              json(res, 400, {
                error: error instanceof Error ? error.message : 'Validation Daily Algo impossible.',
              });
              return;
            }

            if (!success) {
              json(res, 404, { error: 'Soumission Daily Algo introuvable ou non modifiable (édition autorisée uniquement sur le Daily Algo du jour).' });
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
            const body = await readJsonBody<DailyAlgoProblemPayload>(req);
            const validation = validateDailyAlgoProblemPayload(body ?? {});
            if (!validation.ok || !validation.normalized) {
              json(res, 400, { error: validation.error ?? 'Payload invalide.' });
              return;
            }

            const normalized = validation.normalized;
            const problem = await prisma.dailyAlgoProblem.create({
              data: {
                title: normalized.title,
                description: normalized.description,
                solution: normalized.solution || '',
                difficulty: normalized.difficulty,
                language: normalized.language,
                functionName: normalized.functionName,
                functionArgs: normalized.functionArgs as Prisma.InputJsonValue,
                unitTests: normalized.unitTests as Prisma.InputJsonValue,
                allowedLanguages: normalized.allowedLanguages,
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

            broadcastDashboardStateChange(guildId, 'daily_algo_problem_created');
            json(res, 201, problem);
            return;
          }

          if (parts.length === 6 && parts[4] === 'daily-algo-problems' && req.method === 'PATCH') {
            const problemId = parts[5];
            const body = await readJsonBody<DailyAlgoProblemPayload>(req);
            const validation = validateDailyAlgoProblemPayload(body ?? {});
            if (!validation.ok || !validation.normalized) {
              json(res, 400, { error: validation.error ?? 'Payload invalide.' });
              return;
            }

            const normalized = validation.normalized;
            const existing = await prisma.dailyAlgoProblem.findUnique({
              where: { id: problemId },
              select: { id: true, title: true },
            });

            if (!existing) {
              json(res, 404, { error: 'Exercice introuvable.' });
              return;
            }

            const updated = await prisma.dailyAlgoProblem.update({
              where: { id: problemId },
              data: {
                title: normalized.title,
                description: normalized.description,
                solution: normalized.solution || '',
                difficulty: normalized.difficulty,
                language: normalized.language,
                functionName: normalized.functionName,
                functionArgs: normalized.functionArgs as Prisma.InputJsonValue,
                unitTests: normalized.unitTests as Prisma.InputJsonValue,
                allowedLanguages: normalized.allowedLanguages,
              },
            });

            const todayRun = await prisma.dailyAlgoRun.findFirst({
              where: {
                guildId,
                problemId: problemId,
                dateKey: getLocalDateKey(),
                challengeMessageId: { not: null },
              },
              select: { id: true },
            });

            let discordMessageUpdated = false;
            if (todayRun?.id) {
              discordMessageUpdated = await refreshDailyAlgoChallengeMessageForRun(client, todayRun.id).catch(() => false);
            }

            await pushAudit(guildId, {
              user: auditUser,
              action: 'Modification Exercice',
              context: getGuildName(client, guildId),
              module: 'Daily Algo',
              eventType: 'Manuel',
              details: discordMessageUpdated
                ? `Exercice modifié : ${updated.title} (message Discord du Daily Algo du jour mis à jour).`
                : `Exercice modifié : ${updated.title}.`,
              channelId: null
            });

            broadcastDashboardStateChange(guildId, 'daily_algo_problem_updated');
            json(res, 200, { ...updated, discordMessageUpdated });
            return;
          }

          if (parts.length === 6 && parts[4] === 'daily-algo-problems' && req.method === 'DELETE') {
            const problemId = parts[5];
            const existing = await prisma.dailyAlgoProblem.findUnique({
              where: { id: problemId },
              select: { id: true, title: true },
            });

            if (!existing) {
              json(res, 404, { error: 'Exercice introuvable.' });
              return;
            }

            const linkedRuns = await prisma.dailyAlgoRun.count({
              where: { problemId },
            });

            if (linkedRuns > 0) {
              json(res, 409, {
                error: 'Impossible de supprimer cet exercice: il est déjà lié à un run Daily Algo.',
              });
              return;
            }

            await prisma.dailyAlgoProblem.delete({
              where: { id: problemId },
            });

            await pushAudit(guildId, {
              user: auditUser,
              action: 'Suppression Exercice',
              context: getGuildName(client, guildId),
              module: 'Daily Algo',
              eventType: 'Manuel',
              details: `Exercice supprimé: ${existing.title}`,
              channelId: null,
            });

            broadcastDashboardStateChange(guildId, 'daily_algo_problem_deleted');
            json(res, 200, { ok: true });
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

        // GET /api/dashboard/users/:userId/profile - User profile
        if (parts[2] === 'users' && parts[4] === 'profile' && req.method === 'GET') {
          const userId = parts[3];
          if (!userId) {
            json(res, 400, { error: 'userId manquant' });
            return;
          }

          try {
            const staffMember = await getStaffMember('any', userId); // Get profile without guildId restriction
            const apiKeys = staffMember ? await getAPIKeys(staffMember.guildId, userId) : [];
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

        // GET /api/dashboard/users/:userId/staff-stats - Staff statistics
        if (parts[2] === 'users' && parts[4] === 'staff-stats' && req.method === 'GET') {
          const userId = parts[3];
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
              json(res, 400, {
                error: err instanceof Error && err.message
                  ? err.message
                  : 'Erreur lors de la création de la clé API'
              });
            }
            return;
          }

          // GET /api/dashboard/guilds/:guildId/api-keys - List API keys
          if (req.method === 'GET') {
            try {
              const keys = await getAPIKeys(guildId, user.userId);
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
              const caller = await prisma.staffMember.findUnique({
                where: {
                  guildId_userId: {
                    guildId,
                    userId: user.userId,
                  },
                },
                select: { id: true },
              });

              if (!caller) {
                json(res, 403, { error: 'Membre staff introuvable pour cette action.' });
                return;
              }

              const ownedKey = await prisma.aPIKey.findFirst({
                where: {
                  id: keyId,
                  guildId,
                  createdByUserId: caller.id,
                  isActive: true,
                },
                select: { id: true, displayKey: true },
              });

              if (!ownedKey) {
                json(res, 404, { error: 'Clé API introuvable (ou non possédée par votre compte).' });
                return;
              }

              await deleteAPIKey(ownedKey.id);

              await pushAudit(guildId, {
                user: user.username ?? `User${user.userId}`,
                action: 'Suppression clé API',
                context: getGuildName(client, guildId),
                module: 'Staff Management',
                eventType: 'Manuel',
                details: `Clé API supprimée: ${ownedKey.displayKey}`,
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

        // --- MEMBER MANAGEMENT & MODERATION ---

        // GET /api/dashboard/guilds/:guildId/members/search - Search members (Moderator access)
        if (parts[4] === 'members' && parts[5] === 'search' && req.method === 'GET') {
          const guildId = parts[3];
          if (!guildId) {
            json(res, 400, { error: 'guildId manquant' });
            return;
          }

          const accessLevel = await resolveDashboardAccess(client, guildId, user.userId);
          if (accessLevel.level === 'none') {
            json(res, 403, { error: 'Accès restreint aux modérateurs.' });
            return;
          }

          const query = (url.searchParams.get('q') || url.searchParams.get('query') || '').trim();
          const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '24')));
          const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
          const skip = (page - 1) * limit;

          const sortBy = url.searchParams.get('sortBy') || 'lastSeenAt';
          const sortOrder = url.searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';
          const botFilter = url.searchParams.get('botFilter') || 'all';

          // Ensure sortBy is safe
          const safeSortBy = ['lastSeenAt', 'messageCount', 'guildJoinedAt'].includes(sortBy) ? sortBy : 'lastSeenAt';

          try {
            const discordGuild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
            if (!discordGuild) {
              json(res, 404, { error: 'Serveur introuvable' });
              return;
            }

            // Hybrid Approach: Fetch Discord members for 100% coverage, 
            // merge with Prisma profiles for sorting/filtering on stats
            if (discordGuild.members.cache.size < discordGuild.memberCount && discordGuild.members.cache.size < 50000) {
              await discordGuild.members.fetch().catch(() => null);
            }

            const dbProfiles = await prisma.memberProfile.findMany({
              where: { guildId },
              select: { userId: true, lastSeenAt: true, messageCount: true }
            });
            const profileMap = new Map(dbProfiles.map(p => [p.userId, p]));

            let candidates = Array.from(discordGuild.members.cache.values());

            if (query) {
              const lowerQ = query.toLowerCase();
              candidates = candidates.filter(m => 
                m.user.username.toLowerCase().includes(lowerQ) ||
                (m.displayName && m.displayName.toLowerCase().includes(lowerQ)) ||
                m.id.includes(lowerQ)
              );
            }

            if (botFilter === 'human') candidates = candidates.filter(m => !m.user.bot);
            if (botFilter === 'bot') candidates = candidates.filter(m => m.user.bot);

            candidates.sort((a, b) => {
              const pA = profileMap.get(a.id);
              const pB = profileMap.get(b.id);
              let valA = 0, valB = 0;

              if (safeSortBy === 'messageCount') {
                valA = pA?.messageCount || 0;
                valB = pB?.messageCount || 0;
              } else if (safeSortBy === 'lastSeenAt') {
                valA = pA?.lastSeenAt ? pA.lastSeenAt.getTime() : 0;
                valB = pB?.lastSeenAt ? pB.lastSeenAt.getTime() : 0;
              } else {
                valA = a.joinedTimestamp || 0;
                valB = b.joinedTimestamp || 0;
              }

              return sortOrder === 'asc' ? valA - valB : valB - valA;
            });

            const totalFound = candidates.length;
            const paginated = candidates.slice(skip, skip + limit);

            const members = paginated.map(m => {
              const p = profileMap.get(m.id);
              return {
                id: m.id,
                username: m.user.username,
                displayName: m.displayName,
                avatarUrl: m.user.displayAvatarURL(),
                isBot: m.user.bot,
                lastSeenAt: p?.lastSeenAt?.toISOString() || null,
                joinedAt: m.joinedAt?.toISOString() || null,
                messageCount: p?.messageCount || 0
              };
            });


            json(res, 200, {
              members,
              totalFound,
              page,
              limit,
              totalPages: Math.ceil(totalFound / limit)
            });
          } catch (err) {
            logger.error('MembersAPI', 'Error searching members:', err);
            json(res, 500, { error: 'Erreur lors de la recherche des membres' });
          }
          return;
        }

        // --- RECRUITMENT ROUTES ---
        if (parts[4] === 'recruitment') {
          const guildId = parts[3];
          const accessLevel = await resolveDashboardAccess(client, guildId, user.userId);
          if (accessLevel.level !== 'admin') {
            json(res, 403, { error: 'Accès administrateur requis pour le recrutement.' });
            return;
          }

          // GET /api/dashboard/guilds/:guildId/recruitment/candidatures
          if (parts[5] === 'candidatures' && req.method === 'GET' && !parts[6]) {
            try {
              const list = await getCandidatures(guildId);
              json(res, 200, { candidatures: list });
            } catch (err) {
              logger.error('RecruitmentAPI', 'Error fetching candidatures:', err);
              json(res, 500, { error: 'Erreur lors du chargement des candidatures' });
            }
            return;
          }

          // PATCH /api/dashboard/guilds/:guildId/recruitment/candidatures/:id
          if (parts[5] === 'candidatures' && parts[6] && req.method === 'PATCH') {
            const candidatureId = parts[6];
            try {
              const body = await readJsonBody<{
                action: string; // 'approve' | 'reject' | 'oral_pass' | 'oral_fail' | 'assign_tutor' | 'status_update'
                discordUserId?: string;
                reason?: string;
                tutorUserId?: string;
                status?: string;
                notes?: string;
              }>(req);

              if (!body || !body.action) {
                json(res, 400, { error: 'Action manquante' });
                return;
              }

              const auditUser = user.username ?? `User${user.userId}`;

              if (body.action === 'approve') {
                if (!body.discordUserId) {
                  json(res, 400, { error: 'discordUserId requis pour l\'approbation' });
                  return;
                }
                const updated = await approveCandidature(client, guildId, candidatureId, body.discordUserId, user.userId);
                await pushAudit(guildId, {
                  user: auditUser,
                  action: 'Candidature validée (oral)',
                  context: getGuildName(client, guildId),
                  module: 'Recrutement',
                  eventType: 'Manuel',
                  details: `Candidature ${candidatureId} validée pour <@${body.discordUserId}>`,
                  channelId: null,
                });
                broadcastDashboardStateChange(guildId, 'recruitment_candidature_updated');
                json(res, 200, updated);
              }

              else if (body.action === 'reject') {
                const updated = await rejectCandidature(client, guildId, candidatureId, body.reason, user.userId);
                await pushAudit(guildId, {
                  user: auditUser,
                  action: 'Candidature refusée',
                  context: getGuildName(client, guildId),
                  module: 'Recrutement',
                  eventType: 'Manuel',
                  details: `Candidature ${candidatureId} refusée${body.reason ? `: ${body.reason}` : ''}`,
                  channelId: null,
                });
                broadcastDashboardStateChange(guildId, 'recruitment_candidature_updated');
                json(res, 200, updated);
              }

              else if (body.action === 'oral_pass') {
                const updated = await completeOral(client, guildId, candidatureId, 'PASSED', body.reason, user.userId);
                await pushAudit(guildId, {
                  user: auditUser,
                  action: 'Oral concluant',
                  context: getGuildName(client, guildId),
                  module: 'Recrutement',
                  eventType: 'Manuel',
                  details: `Candidature ${candidatureId}: oral passé avec succès`,
                  channelId: null,
                });
                broadcastDashboardStateChange(guildId, 'recruitment_candidature_updated');
                json(res, 200, updated);
              }

              else if (body.action === 'oral_fail') {
                const updated = await completeOral(client, guildId, candidatureId, 'FAILED', body.reason, user.userId);
                await pushAudit(guildId, {
                  user: auditUser,
                  action: 'Oral non concluant',
                  context: getGuildName(client, guildId),
                  module: 'Recrutement',
                  eventType: 'Manuel',
                  details: `Candidature ${candidatureId}: oral échoué${body.reason ? ` — ${body.reason}` : ''}`,
                  channelId: null,
                });
                broadcastDashboardStateChange(guildId, 'recruitment_candidature_updated');
                json(res, 200, updated);
              }

              else if (body.action === 'assign_tutor') {
                if (!body.tutorUserId) {
                  json(res, 400, { error: 'tutorUserId requis pour l\'attribution du tuteur' });
                  return;
                }
                const updated = await assignTutor(candidatureId, body.tutorUserId);
                await pushAudit(guildId, {
                  user: auditUser,
                  action: 'Tuteur assigné',
                  context: getGuildName(client, guildId),
                  module: 'Recrutement',
                  eventType: 'Manuel',
                  details: `Tuteur <@${body.tutorUserId}> assigné à la candidature ${candidatureId}`,
                  channelId: null,
                });
                broadcastDashboardStateChange(guildId, 'recruitment_candidature_updated');
                json(res, 200, updated);
              }

              else if (body.action === 'status_update') {
                if (!body.status) {
                  json(res, 400, { error: 'Status manquant' });
                  return;
                }
                const updated = await updateCandidatureStatus(candidatureId, body.status as any, body.notes);
                json(res, 200, updated);
              }

              else {
                json(res, 400, { error: `Action inconnue: ${body.action}` });
              }
            } catch (err) {
              logger.error('RecruitmentAPI', 'Error updating candidature:', err);
              json(res, 500, { error: err instanceof Error ? err.message : 'Erreur lors de la mise à jour' });
            }
            return;
          }

          // DELETE /api/dashboard/guilds/:guildId/recruitment/candidatures/:id
          if (parts[5] === 'candidatures' && parts[6] && req.method === 'DELETE') {
            const candidatureId = parts[6];
            try {
              await deleteCandidature(candidatureId);
              json(res, 200, { ok: true });
            } catch (err) {
              logger.error('RecruitmentAPI', 'Error deleting candidature:', err);
              json(res, 500, { error: 'Erreur lors de la suppression' });
            }
            return;
          }

          // GET /api/dashboard/guilds/:guildId/recruitment/tutors
          if (parts[5] === 'tutors' && req.method === 'GET') {
            try {
              const tutors = await getEligibleTutors(guildId);
              json(res, 200, { tutors });
            } catch (err) {
              logger.error('RecruitmentAPI', 'Error fetching tutors:', err);
              json(res, 500, { error: 'Erreur lors du chargement des tuteurs' });
            }
            return;
          }

          // GET /api/dashboard/guilds/:guildId/recruitment/history/:discordId
          if (parts[5] === 'history' && parts[6] && req.method === 'GET') {
            try {
              const history = await getCandidatureHistory(guildId, parts[6]);
              json(res, 200, { history });
            } catch (err) {
              logger.error('RecruitmentAPI', 'Error fetching history:', err);
              json(res, 500, { error: 'Erreur lors du chargement de l\'historique' });
            }
            return;
          }

          // PATCH /api/dashboard/guilds/:guildId/recruitment/config
          if (parts[5] === 'config' && req.method === 'PATCH') {
            try {
              const body = await readJsonBody<{
                recruitmentCategoryId?: string | null;
                recruitmentLogChannelId?: string | null;
              }>(req);

              await prisma.guild.update({
                where: { id: guildId },
                data: {
                  ...(body?.recruitmentCategoryId !== undefined ? { recruitmentCategoryId: body.recruitmentCategoryId } : {}),
                  ...(body?.recruitmentLogChannelId !== undefined ? { recruitmentLogChannelId: body.recruitmentLogChannelId } : {}),
                },
              });

              json(res, 200, { ok: true });
            } catch (err) {
              logger.error('RecruitmentAPI', 'Error updating recruitment config:', err);
              json(res, 500, { error: 'Erreur lors de la mise à jour de la config' });
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
          const isModeratorRoute = parts[5] === 'discord-members' || parts[5] === 'member-case' || parts[6] === 'profile' || parts[6] === 'stats';

          if (accessLevel.level === 'none' || (accessLevel.level !== 'admin' && !isModeratorRoute)) {
            json(res, 403, { error: 'Accès admin requis' });
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
              } else {
                const members = await discordGuild.members.fetch({ limit }).catch(() => null);
                candidates = members
                  ? [...members.values()]
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

          // GET /api/dashboard/guilds/:guildId/staff/member-case/:userId
          if (parts[5] === 'member-case' && parts[6] && req.method === 'GET') {
            try {
              const caseData = await buildMemberCaseData(client, guildId, parts[6], user);
              if (!caseData) {
                json(res, 404, { error: 'Membre introuvable' });
                return;
              }
              json(res, 200, caseData);
            } catch (err) {
              logger.error('StaffAPI', 'Erreur chargement dossier membre:', err);
              json(res, 500, { error: 'Erreur lors du chargement du dossier' });
            }
            return;
          }

          // GET /api/dashboard/guilds/:guildId/staff/:userId/profile
          if (parts[6] === 'profile' && req.method === 'GET') {
            try {
              const targetUserId = parts[5];
              const profileData = await getStaffMember(guildId, targetUserId);
              if (!profileData) {
                json(res, 404, { error: 'Profil staff introuvable' });
                return;
              }
              const keys = await getAPIKeys(guildId);

              json(res, 200, {
                staffMember: profileData,
                apiKeys: targetUserId === user.userId ? keys : [],
                isBlacklisted: false,
                blacklistReason: '',
                blacklistEndDate: null,
                accessibleTools: ['daily_algo:create_exercise', 'manage_content']
              });
            } catch (err) {
              logger.error('StaffAPI', 'Erreur chargement profil:', err);
              json(res, 500, { error: 'Erreur lors du chargement du profil' });
            }
            return;
          }

          // GET /api/dashboard/guilds/:guildId/staff/:userId/stats
          if (parts[6] === 'stats' && req.method === 'GET') {
            try {
              const targetUserId = parts[5];
              const stats = await getStaffMemberStats(guildId, targetUserId);
              json(res, 200, { stats });
            } catch (err) {
              logger.error('StaffAPI', 'Erreur chargement stats:', err);
              json(res, 500, { error: 'Erreur lors du chargement des statistiques' });
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
                body.grade as string,
                body.userTag,
                body.username,
                body.displayName,
                body.avatarUrl
              );

              // Créer une période de test initiale
              await createTestingPeriod(guildId, body.userId);

              // Synchronisation des rôles Discord
              try {
                const discordGuild = client.guilds.cache.get(guildId);
                if (discordGuild) {
                  const discordMember = await discordGuild.members.fetch(body.userId).catch(() => null);
                  if (discordMember) {
                    const rolesToAssign: string[] = [];

                    // Rôle du grade choisi
                    const staffRoles = await getStaffRoles(guildId);
                    const gradeRole = staffRoles.find(r => r.name === body.grade);
                    if (gradeRole?.discordRoleId) {
                      rolesToAssign.push(gradeRole.discordRoleId);
                    }

                    // Rôles de base et de test configurés sur la guilde
                    const guildConfig = await prisma.guild.findUnique({
                      where: { id: guildId },
                      select: { baseStaffRoleId: true, testStaffRoleId: true }
                    });

                    if (guildConfig?.baseStaffRoleId) rolesToAssign.push(guildConfig.baseStaffRoleId);
                    if (guildConfig?.testStaffRoleId) rolesToAssign.push(guildConfig.testStaffRoleId);

                    if (rolesToAssign.length > 0) {
                      await discordMember.roles.add(rolesToAssign).catch(err =>
                        logger.error('StaffAPI', `Failed to assign initial roles to ${body.userId}:`, err)
                      );
                    }
                  }
                }
              } catch (roleErr) {
                logger.error('StaffAPI', 'Error syncing Discord roles during onboarding:', roleErr);
              }

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
                const existingStaff = await getStaffMember(guildId, staffUserId);
                const oldGrade = existingStaff?.grade;

                await updateStaffGrade(guildId, staffUserId, body.grade as string);

                // Synchronisation des rôles Discord
                try {
                  const discordGuild = client.guilds.cache.get(guildId);
                  if (discordGuild) {
                    const discordMember = await discordGuild.members.fetch(staffUserId).catch(() => null);
                    if (discordMember) {
                      const staffRoles = await getStaffRoles(guildId);
                      const oldRole = staffRoles.find(r => r.name === oldGrade);
                      const newRole = staffRoles.find(r => r.name === body.grade);

                      if (oldRole?.discordRoleId && discordMember.roles.cache.has(oldRole.discordRoleId)) {
                        if (oldRole.discordRoleId !== newRole?.discordRoleId) {
                          await discordMember.roles.remove(oldRole.discordRoleId).catch(() => null);
                        }
                      }

                      if (newRole?.discordRoleId) {
                        await discordMember.roles.add(newRole.discordRoleId).catch(err =>
                          logger.error('StaffAPI', `Failed to add new role ${newRole.discordRoleId} to ${staffUserId}:`, err)
                        );
                      }
                    }
                  }
                } catch (roleErr) {
                  logger.error('StaffAPI', 'Error syncing Discord roles during grade change:', roleErr);
                }

                await pushAudit(guildId, {
                  user: user.username ?? `User${user.userId}`,
                  action: 'Changement de grade staff',
                  context: getGuildName(client, guildId),
                  module: 'Staff Management',
                  eventType: 'Manuel',
                  details: `Grade changé pour ${staffUserId}: ${oldGrade} -> ${body.grade}`,
                  channelId: null
                });
              }

              if (body?.action === 'remove') {
                const existingStaff = await getStaffMember(guildId, staffUserId);
                const currentGrade = existingStaff?.grade;

                await removeStaffMember(guildId, staffUserId);

                // Nettoyage des rôles Discord
                try {
                  const discordGuild = client.guilds.cache.get(guildId);
                  if (discordGuild) {
                    const discordMember = await discordGuild.members.fetch(staffUserId).catch(() => null);
                    if (discordMember) {
                      const staffRoles = await getStaffRoles(guildId);
                      const currentRole = staffRoles.find(r => r.name === currentGrade);

                      const rolesToRemove: string[] = [];
                      if (currentRole?.discordRoleId) rolesToRemove.push(currentRole.discordRoleId);

                      const guildConfig = await prisma.guild.findUnique({
                        where: { id: guildId },
                        select: { baseStaffRoleId: true, testStaffRoleId: true }
                      });
                      if (guildConfig?.baseStaffRoleId) rolesToRemove.push(guildConfig.baseStaffRoleId);
                      if (guildConfig?.testStaffRoleId) rolesToRemove.push(guildConfig.testStaffRoleId);

                      if (rolesToRemove.length > 0) {
                        await discordMember.roles.remove(rolesToRemove).catch(() => null);
                      }
                    }
                  }
                } catch (roleErr) {
                  logger.error('StaffAPI', 'Error removing Discord roles after staff removal:', roleErr);
                }

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
                  reports: {
                    include: { author: true },
                    orderBy: { createdAt: 'desc' }
                  },
                  mentor: true,
                  staffMember: {
                    include: {
                      activities: {
                        orderBy: { activityDate: 'desc' },
                        take: 14
                      }
                    }
                  }
                },
              });
              json(res, 200, { periods });
            } catch (err) {
              logger.error('StaffAPI', 'Error listing testing periods:', err);
              json(res, 500, { error: 'Erreur lors de la récupération des périodes de test' });
            }
            return;
          }

          // POST /api/dashboard/guilds/:guildId/testing-periods - Create testing period
          if (req.method === 'POST' && !parts[5]) {
            const body = await readJsonBody<{
              staffUserId: string;
              mentorId?: string;
              plannedDurationDays?: number;
              targetGrade?: string;
            }>(req);

            if (!body?.staffUserId) {
              json(res, 400, { error: 'staffUserId est obligatoire' });
              return;
            }

            try {
              const period = await createTestingPeriod(
                guildId,
                body.staffUserId,
                body.mentorId,
                body.plannedDurationDays,
                body.targetGrade
              );
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

        // HR / LEADERSHIP METRICS
        if (parts[4] === 'leadership' && req.method === 'GET') {
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
          try {
            const metrics = await getStaffAlertsAndProgression(guildId);
            json(res, 200, { metrics });
          } catch (err) {
            logger.error('API', 'Error metrics:', err);
            json(res, 500, { error: 'Erreur interne' });
          }
          return;
        }

        // ABSENCES
        if (parts[4] === 'absences') {
          const guildId = parts[3] ?? null;
          if (!guildId) {
            json(res, 400, { error: 'guildId manquant' });
            return;
          }
          if (req.method === 'GET' && !parts[5]) {
            try {
              const absences = await getAbsences(guildId);
              json(res, 200, { absences });
            } catch (err) {
              json(res, 500, { error: 'Erreur' });
            }
            return;
          }
          if (req.method === 'PATCH' && parts[5]) {
            const accessLevel = await resolveDashboardAccess(client, guildId, user.userId);
            if (accessLevel.level !== 'admin') {
              json(res, 403, { error: 'Admin requis' });
              return;
            }
            const body = await readJsonBody<{ status: 'APPROVED' | 'REJECTED'; note?: string }>(req);
            if (body && body.status) {
              try {
                const absence = await updateAbsenceStatus(parts[5], body.status, user.userId, body.note);
                json(res, 200, { absence });
              } catch (err) {
                json(res, 500, { error: 'Erreur' });
              }
            } else {
              json(res, 400, { error: 'missing status' });
            }
            return;
          }
        }

        // MEETINGS
        if (parts[4] === 'meetings') {
          const guildId = parts[3] ?? null;
          if (!guildId) {
            json(res, 400, { error: 'guildId manquant' });
            return;
          }
          if (req.method === 'GET') {
            try {
              const meetings = await getMeetings(guildId);
              json(res, 200, { meetings });
            } catch (err) {
              json(res, 500, { error: 'Erreur' });
            }
            return;
          }
          if (req.method === 'POST' && !parts[5]) {
            const accessLevel = await resolveDashboardAccess(client, guildId, user.userId);
            if (accessLevel.level !== 'admin') {
              json(res, 403, { error: 'Admin requis' });
              return;
            }
            const body = await readJsonBody<{ title: string; description: string; scheduledAt: string }>(req);
            if (body && body.title && body.scheduledAt) {
              try {
                const meeting = await createMeeting(guildId, user.userId, body.title, body.description || '', new Date(body.scheduledAt));
                json(res, 201, { meeting });
              } catch (err) {
                json(res, 500, { error: 'Erreur' });
              }
            }
            return;
          }
        }

        // POLLS
        if (parts[4] === 'polls') {
          const guildId = parts[3] ?? null;
          if (!guildId) {
            json(res, 400, { error: 'guildId manquant' });
            return;
          }
          if (req.method === 'GET') {
            try {
              const polls = await getPolls(guildId);
              json(res, 200, { polls });
            } catch (err) {
              json(res, 500, { error: 'Erreur' });
            }
            return;
          }
          if (req.method === 'POST' && !parts[5]) {
            const accessLevel = await resolveDashboardAccess(client, guildId, user.userId);
            if (accessLevel.level !== 'admin') {
              json(res, 403, { error: 'Admin requis' });
              return;
            }
            const body = await readJsonBody<{ title: string; description: string; options: string[]; closesAt: string }>(req);
            if (body && body.title) {
              try {
                const poll = await createPoll(guildId, user.userId, body.title, body.description || '', body.options || [], true, body.closesAt ? new Date(body.closesAt) : undefined);
                json(res, 201, { poll });
              } catch (err) {
                json(res, 500, { error: 'Erreur' });
              }
            }
            return;
          }

          // POST /api/dashboard/guilds/:guildId/polls/vote - Cast vote
          if (parts[5] === 'vote' && req.method === 'POST') {
            try {
              const body = await readJsonBody<{ pollId: string; optionId: string }>(req);
              if (!body?.pollId || !body?.optionId) {
                json(res, 400, { error: 'pollId et optionId requis' });
                return;
              }

              // Récupérer le grade du membre pour le poids du vote
              const staff = await getStaffMember(guildId, user.userId);
              if (!staff) {
                json(res, 403, { error: 'Seulement le staff peut participer aux votes' });
                return;
              }

              const roles = await getStaffRoles(guildId);
              const userRole = roles.find(r => r.name === staff.grade);
              const weight = userRole?.level ?? 1.0;

              await castPollVote(body.pollId, user.userId, body.optionId, weight);
              json(res, 200, { ok: true });
            } catch (err) {
              logger.error('StaffAPI', 'Error casting vote:', err);
              json(res, 500, { error: 'Erreur lors du vote' });
            }
            return;
          }

          // PATCH /api/dashboard/guilds/:guildId/polls/:pollId/close - Close poll
          if (parts[5] && req.method === 'PATCH') {
            const accessLevel = await resolveDashboardAccess(client, guildId, user.userId);
            if (accessLevel.level !== 'admin') {
              json(res, 403, { error: 'Admin requis' });
              return;
            }

            try {
              await prisma.staffPoll.update({
                where: { id: parts[5] },
                data: { closesAt: new Date() }
              });
              json(res, 200, { ok: true });
            } catch (err) {
              json(res, 500, { error: 'Erreur clôture' });
            }
            return;
          }
        }

        // PROCEDURES
        if (parts[4] === 'procedures') {
          const guildId = parts[3] ?? null;
          if (!guildId) {
            json(res, 400, { error: 'guildId manquant' });
            return;
          }
          if (req.method === 'GET') {
            try {
              const procedures = await getProcedures(guildId);
              json(res, 200, { procedures });
            } catch (err) {
              json(res, 500, { error: 'Erreur' });
            }
            return;
          }
          if (req.method === 'POST' && !parts[5]) {
            const accessLevel = await resolveDashboardAccess(client, guildId, user.userId);
            if (accessLevel.level !== 'admin') {
              json(res, 403, { error: 'Admin requis' });
              return;
            }
            const body = await readJsonBody<{ title: string; content: string; sortOrder: number }>(req);
            if (body && body.title) {
              try {
                const procedure = await upsertProcedure(guildId, null, body.title, body.content || '', body.sortOrder || 0);
                json(res, 201, { procedure });
              } catch (err) {
                json(res, 500, { error: 'Erreur' });
              }
            }
            return;
          }
          if (req.method === 'PATCH' && parts[5]) {
            const accessLevel = await resolveDashboardAccess(client, guildId, user.userId);
            if (accessLevel.level !== 'admin') {
              json(res, 403, { error: 'Admin requis' });
              return;
            }
            const body = await readJsonBody<{ title: string; content: string; sortOrder: number }>(req);
            if (body) {
              try {
                const procedure = await upsertProcedure(guildId, parts[5], body.title, body.content, body.sortOrder);
                json(res, 200, { procedure });
              } catch (err) {
                json(res, 500, { error: 'Erreur' });
              }
            }
            return;
          }
          if (req.method === 'DELETE' && parts[5]) {
            const accessLevel = await resolveDashboardAccess(client, guildId, user.userId);
            if (accessLevel.level !== 'admin') {
              json(res, 403, { error: 'Admin requis' });
              return;
            }
            try {
              await deleteProcedure(parts[5]);
              json(res, 200, { success: true });
            } catch (err) {
              json(res, 500, { error: 'Erreur' });
            }
            return;
          }
          if (req.method === 'POST' && parts[5] === 'read') {
            try {
              const body = await readJsonBody<{ procedureId: string }>(req);
              if (body?.procedureId) {
                await markProcedureAsRead(body.procedureId, user.userId);
                json(res, 200, { success: true });
              } else {
                json(res, 400, { error: 'missing id' });
              }
            } catch (err) {
              json(res, 500, { error: 'Erreur' });
            }
            return;
          }
        }

        // STAFF NOTES
        if (parts[4] === 'staff' && parts[6] === 'notes') {
          const guildId = parts[3] ?? null;
          if (!guildId) {
            json(res, 400, { error: 'guildId manquant' });
            return;
          }
          const staffUserId = parts[5];
          if (req.method === 'GET') {
            const accessLevel = await resolveDashboardAccess(client, guildId, user.userId);
            if (accessLevel.level !== 'admin') {
              json(res, 403, { error: 'Admin requis' });
              return;
            }
            try {
              const notes = await getManagerNotes(guildId, staffUserId);
              json(res, 200, { notes });
            } catch (err) {
              json(res, 500, { error: 'Erreur' });
            }
            return;
          }
          if (req.method === 'POST' && !parts[7]) {
            const accessLevel = await resolveDashboardAccess(client, guildId, user.userId);
            if (accessLevel.level !== 'admin') {
              json(res, 403, { error: 'Admin requis' });
              return;
            }
            const body = await readJsonBody<{ content: string }>(req);
            if (body && body.content) {
              try {
                const note = await createManagerNote(guildId, staffUserId, user.userId, body.content);
                json(res, 201, { note });
              } catch (err) {
                json(res, 500, { error: 'Erreur' });
              }
            }
            return;
          }
          if (req.method === 'DELETE' && parts[7]) {
            const accessLevel = await resolveDashboardAccess(client, guildId, user.userId);
            if (accessLevel.level !== 'admin') {
              json(res, 403, { error: 'Admin requis' });
              return;
            }
            try {
              await deleteManagerNote(parts[7]);
              json(res, 200, { success: true });
            } catch (err) {
              json(res, 500, { error: 'Erreur' });
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
