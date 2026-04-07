import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { ChannelType, type Client, type TextChannel } from 'discord.js';
import jwt from 'jsonwebtoken';
import WebSocket, { WebSocketServer } from 'ws';
import prisma from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { translate } from '../services/translationService.js';
import { sendApprovedItem } from '../services/notificationService.js';
import { applyTopicFeedback, extractInterestTopics } from '../services/interestService.js';

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
  details: string;
  dateIso: string;
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
};

type DashboardAccessLevel = 'none' | 'moderator' | 'admin';

type DashboardAccess = {
  level: DashboardAccessLevel;
  canViewDashboard: boolean;
  canModerateContent: boolean;
  canManageSettings: boolean;
};

type DashboardState = {
  guildName: string;
  modules: ModuleItem[];
  feeds: FeedItem[];
  contentItems: ContentItem[];
  discordChannels: DashboardChannel[];
  discordRoles: DashboardRole[];
  moderatorRoleId: string;
  access: {
    level: Exclude<DashboardAccessLevel, 'none'>;
    canModerateContent: boolean;
    canManageSettings: boolean;
  };
  youtubeReferenceChannelId: string;
  notifications: NotificationSettings;
  auditTrail: AuditEntry[];
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

const toRuntimeState = (settings: {
  email: string;
  emailEnabled: boolean;
  cloudBackup: boolean;
  debugLog: boolean;
  killSwitchEnabled: boolean;
  severityByModule: unknown;
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
      messageTemplate: DEFAULT_MESSAGE_TEMPLATE
    }
  });

  return toRuntimeState(settings);
};

const pushAudit = async (guildId: string, entry: Omit<AuditEntry, 'id' | 'dateIso'>) => {
  await prisma.dashboardAuditLog.create({
    data: {
      guildId,
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
    persistedAudit
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
    })
  ]);

  const auditTrailFromDb: AuditEntry[] = persistedAudit.map((entry) => ({
    id: entry.id,
    user: entry.user,
    action: entry.action,
    context: entry.context,
    module: entry.module,
    eventType: entry.eventType,
    details: entry.details,
    dateIso: entry.dateIso.toISOString()
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
      details: `${feedMapped.length} flux, ${contentItems.length} contenus suivis.`,
      dateIso: nowIso()
    },
    {
      id: makeId(),
      user: 'Système',
      action: 'État YouTube synchronisé',
      context: getGuildName(client, guildId),
      module: 'YouTube',
      eventType: 'Automatique',
      details: `${youtubeApprovedCount} approuvés, ${youtubePendingCount} en attente.`,
      dateIso: guild.updatedAt.toISOString()
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
          position: role.position
        }))
        .sort((a, b) => b.position - a.position || a.name.localeCompare(b.name, 'fr'))
        .map(({ id, name, mention }) => ({ id, name, mention }))
    : [];

  return {
    guildName: getGuildName(client, guildId),
    modules,
    feeds: feedMapped,
    contentItems,
    discordChannels,
    discordRoles,
    moderatorRoleId: guild.moderatorRoleId ?? '',
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

export const startDashboardApi = (client: Client) => {
  const port = Number(process.env.DASHBOARD_API_PORT ?? '8787');
  const wsServer = new WebSocketServer({ noServer: true });

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
    logger.error('DashboardAPI', message);
    throw new Error(message);
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

          if (!access.canManageSettings && req.method !== 'GET' && !isContentAction) {
            json(res, 403, { error: 'Action réservée aux administrateurs du dashboard.' });
            return;
          }

          if (isContentAction && !access.canModerateContent) {
            json(res, 403, { error: 'Action de modération non autorisée.' });
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
              details: `Statut changé vers ${body.status}.`
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
              details: `Flux ${body.name} ajouté.`
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
              details: `Flux ${body.name} mis à jour.`
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
              details: `Flux ${feedId} supprimé.`
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
                : 'Canal de référence YouTube vidé.'
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
                details: `Contenu ${contentId} traduit en ${targetLang} via le dashboard.`
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
                  details: `Contenu ${contentId} validé, publié et retiré de la file de validation.`
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
                  details: `Impossible de valider le contenu ${contentId}: ${error instanceof Error ? error.message : 'erreur inconnue'}.`
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
                  details: `Contenu ${contentId} rejeté et retiré de la file de validation.`
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
                  details: `Impossible de rejeter le contenu ${contentId}: ${error instanceof Error ? error.message : 'erreur inconnue'}.`
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
              details: `Brouillon créé sur le flux ${firstFeed.name}.`
            });

            json(res, 201, { ok: true });
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
              details: 'Paramètres globaux mis à jour.'
            });

            json(res, 200, { ok: true });
            return;
          }

          if (parts.length === 5 && parts[4] === 'settings' && (req.method === 'PATCH' || req.method === 'PUT')) {
            const body = await readJsonBody<{
              discordChannel?: string;
              moderatorRoleId?: string | null;
              messageTemplate?: string;
            }>(req);

            if (!body) {
              json(res, 400, { error: 'Payload settings invalide' });
              return;
            }

            const data: { statusCheckChannelId?: string | null; moderatorRoleId?: string | null } = {};
            if (Object.prototype.hasOwnProperty.call(body, 'discordChannel')) {
              data.statusCheckChannelId = body.discordChannel?.replace(/[^0-9]/g, '') || null;
            }

            if (Object.prototype.hasOwnProperty.call(body, 'moderatorRoleId')) {
              const rawModeratorRoleId = body.moderatorRoleId;
              if (typeof rawModeratorRoleId === 'string' || rawModeratorRoleId === null) {
                data.moderatorRoleId = rawModeratorRoleId?.replace(/[^0-9]/g, '') || null;
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
              details: 'Paramètres globaux mis à jour.'
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
              details: 'Template de message éditorial mis à jour.'
            });
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
              details: 'Configuration importée depuis un fichier JSON.'
            });

            json(res, 200, { ok: true });
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
