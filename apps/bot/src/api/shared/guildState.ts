/** Etat complet d une guilde et acces par fonctionnalite. */
import { ChannelType, PermissionFlagsBits, type Client } from 'discord.js';
import prisma from '../../utils/db.js';
import { logger } from '../../utils/logger.js';
import { isStaffServerGuild } from '../../services/staff/staffServerService.js';
import { parseEvidenceLinks } from '../evidence.js';
import type {
  DashboardSanctionType,
  DashboardSanctionStatus,
  DashboardRole,
  SanctionItem,
  SanctionReportItem,
  
  
  
  
  
  
  
  
  
  
} from '@kotbo/contracts';
import { getOrCreateDefaultTables } from '../../services/moderation/sanctionTableService.js';
import {
  COMMAND_CATALOG,
  
  
} from '../../utils/commandAccess.js';
import { commands } from '../../commands.js';
import { MODULE_DESCRIPTIONS, getGuildName, getOrCreateRuntime, isRecruitmentAutoRejectEnabled, resolveAdminAccess } from './core.js';
import type { AuditEntry, CommandCatalogEntry, DashboardAccess, DashboardChannel, DashboardState, FeatureAccess, FeatureAccessMap, ModuleItem, ModuleStatus, RegulationRuleItem } from './core.js';
import { interpretMentions } from './markdown.js';

export async function resolveFeatureAccessMap(
  client: Client,
  guildId: string,
  access: DashboardAccess,
  userId: string | null,
  roleIds: string[],
): Promise<FeatureAccessMap> {
  const { getOrCreateFeatureConfigs } = await import('../../services/core/dashboardManagementService.js');
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

  return featureAccess;
}

const COMMAND_CATEGORIES: Record<string, string> = {
  // Administration
  setup: 'Administration',
  config: 'Administration',
  admin: 'Administration',
  status: 'Administration',
  activate: 'Administration',
  link: 'Administration',
  staffserver: 'Administration',
  channelhealth: 'Administration',
  absent: 'Administration',
  meeting: 'Administration',
  demission: 'Administration',

  // Modération
  sanction: 'Modération',
  dc: 'Modération',
  rescan: 'Modération',
  casier: 'Modération',
  note: 'Modération',
  transcript: 'Modération',
  clear: 'Modération',
  channel: 'Modération',
  signal: 'Modération',
  role: 'Modération',

  // Économie
  buy: 'Économie',
  daily: 'Économie',
  coins: 'Économie',
  dice: 'Économie',
  economyInfo: 'Économie',
  games: 'Économie',
  giveCoins: 'Économie',
  giveItem: 'Économie',
  guess: 'Économie',
  items: 'Économie',
  removeCoins: 'Économie',
  removeItem: 'Économie',
  richest: 'Économie',
  rps: 'Économie',
  roulette: 'Économie',
  shop: 'Économie',
  spawnItem: 'Économie',
  use: 'Économie',
  work: 'Économie',
  market: 'Économie',

  // Utilitaire
  ping: 'Utilitaire',
  info: 'Utilitaire',
  epoch: 'Utilitaire',
  devutils: 'Utilitaire',
  help: 'Utilitaire',
  post: 'Utilitaire',
  stats: 'Utilitaire',
  invites: 'Utilitaire',
  serverstats: 'Utilitaire',
  event: 'Utilitaire',
  ticket: 'Utilitaire',
  suggest: 'Utilitaire',
  suggestionConfig: 'Utilitaire',
  dashboard: 'Utilitaire',

  // Profil & Commu
  profile: 'Communauté',
  profil: 'Communauté',
  rank: 'Communauté',
  leaderboard: 'Communauté',
  rep: 'Communauté',
  quests: 'Communauté',
  giveaway: 'Communauté',

  // Fun / Autre
  excuse: 'Fun',
  dailyAlgo: 'Fun',
  ctf: 'Fun',
  say: 'Fun'
};

export function buildRichCommandCatalog(): CommandCatalogEntry[] {
  const catalogMap = new Map(COMMAND_CATALOG.map(c => [c.name, c]));
  
  return commands.map(cmd => {
    const serialized = typeof (cmd.data as any).toJSON === 'function' ? (cmd.data as any).toJSON() : cmd.data;
    const name = serialized.name;
    const staticMeta = catalogMap.get(name);
    
    // Titre/label convivial
    let label = staticMeta?.label || (name.charAt(0).toUpperCase() + name.slice(1));
    if (name === 'dailyAlgo') label = 'Daily Algo';
    if (name === 'devutils') label = 'Outils Dev';
    if (name === 'serverstats') label = 'Stats Serveur';
    if (name === 'suggestionConfig') label = 'Config Suggestions';
    if (name === 'staffserver') label = 'Serveur Staff';
    if (name === 'channelhealth') label = 'Santé Salons';
    if (name === 'economyInfo') label = 'Éco Infos';
    if (name === 'giveCoins') label = 'Donner pièces';
    if (name === 'giveItem') label = 'Donner objet';
    if (name === 'removeCoins') label = 'Retirer pièces';
    if (name === 'removeItem') label = 'Retirer objet';
    if (name === 'spawnItem') label = 'Générer objet';
    
    // Détermination de l'accès par défaut si non spécifié statiquement
    let defaultAccess = staticMeta?.defaultAccess;
    if (!defaultAccess) {
      const perms = serialized.default_member_permissions;
      if (perms) {
        const adminFlag = BigInt(perms) & BigInt(PermissionFlagsBits.Administrator);
        const manageGuildFlag = BigInt(perms) & BigInt(PermissionFlagsBits.ManageGuild);
        if (adminFlag) {
          defaultAccess = 'administration';
        } else if (manageGuildFlag) {
          defaultAccess = 'modération';
        } else {
          defaultAccess = 'tout_le_monde';
        }
      } else {
        defaultAccess = 'tout_le_monde';
      }
    }
    
    const category = COMMAND_CATEGORIES[name] || 'Autre';

    return {
      name,
      label,
      description: serialized.description || staticMeta?.description || '',
      defaultAccess: defaultAccess as any,
      category,
      options: serialized.options || []
    };
  });
}

export const getGuildState = async (client: Client, guildId: string, access: DashboardAccess, userId?: string): Promise<DashboardState | null> => {
  const { ensureDashboardSchemaPatches } = await import('../../utils/schemaPatches.js');
  await ensureDashboardSchemaPatches();

  const guild = await prisma.guild.findUnique({ 
    where: { id: guildId },
    include: {
      dashboardFeatureConfigs: true,
      levelConfig: true,
      autoModConfig: { select: { adminLockEnabled: true } }
    }
  });
  if (!guild) return null;

  const last7Days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    last7Days.push(dateKey);
  }

  // Enforce default tables first
  await getOrCreateDefaultTables(guildId).catch((err) => {
    logger.error('DashboardAPI', `Failed to seed default sanction tables for guild ${guildId}:`, err);
  });

  const [
    dailyAlgoSubmissionCount,
    runtime,
    persistedDashboardAudit,
    persistedDiscordAudit,
    sanctions,
    sanctionReports,
    regulationRules,
    dailyStatsTrend,
    sanctionTables,
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
    prisma.sanctionTable.findMany({
      where: { guildId },
      include: {
        tiers: {
          orderBy: { level: 'asc' }
        }
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
      name: "Journal d'activité",
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
    },
    {
      id: 'economy',
      name: 'Économie & RPG',
      description: MODULE_DESCRIPTIONS.economy,
      status: getFeatureStatus('economy', guild.economyEnabled),
      uptime: guild.economyEnabled ? 99.9 : 100,
      interactions: 0,
      lastSync: guild.updatedAt.toISOString()
    },
    {
      id: 'leveling',
      name: 'Leveling & XP',
      description: MODULE_DESCRIPTIONS.leveling,
      status: getFeatureStatus('leveling', guild.levelConfig?.enabled ?? false),
      uptime: 100,
      interactions: 0,
      lastSync: guild.updatedAt.toISOString()
    },
    {
      id: 'channel_links',
      name: 'Liens de salons',
      description: 'Reliez des salons entre serveurs pour synchroniser les messages automatiquement.',
      status: getFeatureStatus('channel_links'),
      uptime: 100,
      interactions: 0,
      lastSync: guild.updatedAt.toISOString()
    },
    {
      id: 'staff_server',
      name: 'Serveurs Staff',
      description: 'Liez un serveur staff dédié pour synchroniser la hiérarchie et les rôles automatiquement.',
      status: getFeatureStatus('staff_server'),
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

  const textChannelTypes = new Set([
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildVoice,
    ChannelType.GuildForum,
    ChannelType.GuildMedia,
    ChannelType.PublicThread,
    ChannelType.PrivateThread,
    ChannelType.AnnouncementThread,
  ]);

  const channelTypeLabel = (type: ChannelType): DashboardChannel['type'] => {
    switch (type) {
      case ChannelType.GuildAnnouncement: return 'announcement';
      case ChannelType.GuildVoice: return 'voice';
      case ChannelType.GuildForum: return 'forum';
      case ChannelType.GuildMedia: return 'media';
      case ChannelType.PublicThread:
      case ChannelType.PrivateThread:
      case ChannelType.AnnouncementThread:
        return 'thread';
      default: return 'text';
    }
  };

  const discordChannels: DashboardChannel[] = allChannels
    .filter((channel) => textChannelTypes.has(channel.type))
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      mention: `<#${channel.id}>`,
      position: 'rawPosition' in channel ? channel.rawPosition : 0,
      type: channelTypeLabel(channel.type),
    }))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'fr'))
    .map(({ id, name, mention, type }) => ({ id, name, mention, type }));

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
  const isStaffServer = await isStaffServerGuild(guildId);

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
    crossServerSanctionsEnabled: guild.crossServerSanctionsEnabled,
    sanctionReportEnabled: guild.sanctionReportEnabled,
    translationEnabled: guild.translationEnabled,
    codePoliceEnabled: guild.codePoliceEnabled,
    dailyAlgoEnabled: guild.dailyAlgoEnabled,
    dailyAlgoTimezone: guild.dailyAlgoTimezone,
    dailyAlgoParticipationPoints: guild.dailyAlgoParticipationPoints,
    dailyAlgoWeekendMultiplier: guild.dailyAlgoWeekendMultiplier,
    dailyAlgoWeeklyRewardsEnabled: guild.dailyAlgoWeeklyRewardsEnabled,
    dailyAlgoWeekRole1Id: guild.dailyAlgoWeekRole1Id ?? '',
    dailyAlgoWeekRole2Id: guild.dailyAlgoWeekRole2Id ?? '',
    dailyAlgoWeekRole3Id: guild.dailyAlgoWeekRole3Id ?? '',
    dailyAlgoWeekRoleRotate: guild.dailyAlgoWeekRoleRotate,
    dailyAlgoWeekXp1: guild.dailyAlgoWeekXp1,
    dailyAlgoWeekXp2: guild.dailyAlgoWeekXp2,
    dailyAlgoWeekXp3: guild.dailyAlgoWeekXp3,
    dailyAlgoWeekParticipationXp: guild.dailyAlgoWeekParticipationXp,
    dailyAlgoWeekAnnouncementChannelId: guild.dailyAlgoWeekAnnouncementChannelId ?? '',
    dailyAlgoSanctionType: guild.dailyAlgoSanctionType,
    dailyAlgoSanctionWeight: guild.dailyAlgoSanctionWeight,
    dailyAlgoSanctionDurationMinutes: guild.dailyAlgoSanctionDurationMinutes,
    clanPointsFromDailyAlgo: guild.clanPointsFromDailyAlgo,
    clanPointsFromDailyAlgoRate: guild.clanPointsFromDailyAlgoRate,
    clanPointsDailyAlgoTop1: guild.clanPointsDailyAlgoTop1,
    clanPointsDailyAlgoTop2: guild.clanPointsDailyAlgoTop2,
    clanPointsDailyAlgoTop3: guild.clanPointsDailyAlgoTop3,
    githubReleasesEnabled: guild.githubReleasesEnabled,
    digestEnabled: guild.digestEnabled,
    autoThreadEnabled: guild.autoThreadEnabled,
    autoThreadChannels: guild.autoThreadChannels,
    autoThreadBotsEnabled: guild.autoThreadBotsEnabled,
    funEnabled: guild.funEnabled,
    economyEnabled: guild.economyEnabled,
    levelingEnabled: guild.levelConfig?.enabled ?? false,
    adminLockEnabled: guild.autoModConfig?.adminLockEnabled ?? false,
    isStaffServer,
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
    commandCatalog: buildRichCommandCatalog(),
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
    sanctionTables: (sanctionTables || []).map((table) => ({
      id: table.id,
      name: table.name,
      tiers: (table.tiers || []).map((tier) => ({
        id: tier.id,
        level: tier.level,
        action: tier.action,
        durationSeconds: tier.durationSeconds,
        customReason: tier.customReason,
      })),
    })),
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
