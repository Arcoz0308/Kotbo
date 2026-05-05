import prisma from '../utils/db.js';

export const defaultFeatures = [
  // ─── Tableau de bord ───
  {
    featureKey: 'dashboard',
    featureName: 'Vue d\'ensemble',
    description: 'Page d\'accueil du tableau de bord',
    category: 'dashboard',
  },
  {
    featureKey: 'analytics',
    featureName: 'Analytics',
    description: 'Statistiques et graphiques du serveur',
    category: 'dashboard',
  },
  {
    featureKey: 'inbox',
    featureName: 'Inbox / Notifications',
    description: 'Boîte de réception et notifications',
    category: 'dashboard',
  },
  // ─── Modération ───
  {
    featureKey: 'content',
    featureName: 'Contenu',
    description: 'Gestion du contenu et messages',
    category: 'moderation',
  },
  {
    featureKey: 'daily_algo',
    featureName: 'Daily Algo',
    description: 'Défis algorithmiques quotidiens',
    category: 'moderation',
  },
  {
    featureKey: 'members',
    featureName: 'Membres',
    description: 'Recherche et gestion des membres',
    category: 'moderation',
  },
  {
    featureKey: 'sanctions',
    featureName: 'Sanctions',
    description: 'Gestion des sanctions et avertissements',
    category: 'moderation',
  },
  {
    featureKey: 'double_accounts',
    featureName: 'Doubles Comptes',
    description: 'Détection et gestion des doubles comptes',
    category: 'moderation',
  },
  {
    featureKey: 'logs',
    featureName: 'Logs Discord',
    description: 'Journaux de logs Discord',
    category: 'moderation',
  },
  {
    featureKey: 'activity',
    featureName: 'Journal d\'activité',
    description: 'Suivi de l\'activité utilisateur',
    category: 'moderation',
  },
  // ─── Gestion Staff ───
  {
    featureKey: 'recruitment',
    featureName: 'Recrutement',
    description: 'Gestion des candidatures staff',
    category: 'staff',
  },
  {
    featureKey: 'staff_directory',
    featureName: 'Annuaire Staff',
    description: 'Liste et profils des membres staff',
    category: 'staff',
  },
  {
    featureKey: 'staff_roles',
    featureName: 'Hiérarchie & Rôles',
    description: 'Gestion des rôles et niveaux staff',
    category: 'staff',
  },
  {
    featureKey: 'tutoring',
    featureName: 'Tutorat & Formation',
    description: 'Périodes d\'essai et mentorat',
    category: 'staff',
  },
  {
    featureKey: 'meetings',
    featureName: 'Réunions',
    description: 'Planification et suivi des réunions',
    category: 'staff',
  },
  {
    featureKey: 'absences',
    featureName: 'Absences',
    description: 'Gestion des absences du staff',
    category: 'staff',
  },
  {
    featureKey: 'polls',
    featureName: 'Sondages',
    description: 'Sondages internes au staff',
    category: 'staff',
  },
  {
    featureKey: 'discipline',
    featureName: 'Discipline',
    description: 'Avertissements et blacklist staff',
    category: 'staff',
  },
  // ─── Gestion ───
  {
    featureKey: 'regulation',
    featureName: 'Règlement',
    description: 'Configuration du règlement serveur',
    category: 'management',
  },
  // ─── Configuration ───
  {
    featureKey: 'modules',
    featureName: 'Modules',
    description: 'Activation/désactivation des modules bot',
    category: 'config',
  },
  {
    featureKey: 'centralized_config',
    featureName: 'Gestion Centralisée',
    description: 'Configuration centralisée du dashboard',
    category: 'config',
  },
  {
    featureKey: 'commands',
    featureName: 'Commandes',
    description: 'Accès et permissions des commandes',
    category: 'config',
  },
  {
    featureKey: 'settings',
    featureName: 'Paramètres',
    description: 'Paramètres généraux du serveur',
    category: 'config',
  },
  // ─── Intégrations ───
  {
    featureKey: 'youtube',
    featureName: 'YouTube',
    description: 'Intégration YouTube et notifications',
    category: 'integrations',
  },
  {
    featureKey: 'digest',
    featureName: 'Digest',
    description: 'Digest de nouvelles et flux RSS',
    category: 'integrations',
  },
];

export async function getOrCreateFeatureConfigs(guildId: string) {
  // 1. Fetch all existing configs with their relations first
  const existingConfigs = await prisma.dashboardFeatureConfig.findMany({
    where: { guildId },
    include: {
      roleAccess: {
        orderBy: { staffRoleLevel: 'asc' },
      },
      notificationTargets: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const existingKeys = new Set(existingConfigs.map(c => c.featureKey));
  const missingFeatures = defaultFeatures.filter(f => !existingKeys.has(f.featureKey));

  // 2. If none missing, return them immediately (saves a redundant findMany)
  if (missingFeatures.length === 0) {
    return existingConfigs;
  }

  // 3. Initialize missing features in parallel
  await Promise.all(missingFeatures.map(feature => 
    prisma.dashboardFeatureConfig.create({
      data: {
        guildId,
        featureKey: feature.featureKey,
        featureName: feature.featureName,
        enabled: true,
        loggingEnabled: true,
        userActivityTracking: true,
        notifyViaDiscordChannel: true,
        notifyViaDM: false,
        roleAccess: {
          create: [
            { guildId, staffRoleLevel: 0, canView: true },
            { guildId, staffRoleLevel: 1, canView: true, canModerate: true },
            { guildId, staffRoleLevel: 2, canView: true, canModerate: true, canConfigure: true, canDelete: true },
          ],
        },
      },
    })
  ));

  // 4. Fetch again to return everything (only happens once when missing)
  return prisma.dashboardFeatureConfig.findMany({
    where: { guildId },
    include: {
      roleAccess: { orderBy: { staffRoleLevel: 'asc' } },
      notificationTargets: true,
    },
    orderBy: { createdAt: 'asc' },
  });
}

export async function updateFeatureConfig(
  guildId: string,
  featureKey: string,
  data: {
    enabled?: boolean;
    channelId?: string | null;
    secondaryChannelId?: string | null;
    requiredRoleId?: string | null;
    notificationRoleId?: string | null;
    notifyViaDiscordChannel?: boolean;
    notifyViaDM?: boolean;
    loggingEnabled?: boolean;
    userActivityTracking?: boolean;
    metadata?: Record<string, any>;
  }
) {
  return prisma.dashboardFeatureConfig.update({
    where: {
      guildId_featureKey: { guildId, featureKey },
    },
    data: {
      ...data,
      metadata: data.metadata ? (data.metadata as any) : undefined,
    },
    include: {
      roleAccess: true,
      notificationTargets: true,
    },
  });
}

export async function updateRoleAccess(
  guildId: string,
  featureConfigId: string,
  roleAccessConfigs: Array<{
    staffRoleLevel: number;
    canView?: boolean;
    canModerate?: boolean;
    canConfigure?: boolean;
    canDelete?: boolean;
  }>
) {
  // Delete existing role accesses
  await prisma.dashboardRoleAccess.deleteMany({
    where: { featureConfigId },
  });

  // Create new ones in parallel for speed
  await Promise.all(roleAccessConfigs.map(config => 
    prisma.dashboardRoleAccess.create({
      data: {
        guildId,
        featureConfigId,
        staffRoleLevel: config.staffRoleLevel,
        canView: config.canView ?? false,
        canModerate: config.canModerate ?? false,
        canConfigure: config.canConfigure ?? false,
        canDelete: config.canDelete ?? false,
      },
    })
  ));

  return prisma.dashboardFeatureConfig.findUnique({
    where: { id: featureConfigId },
    include: {
      roleAccess: { orderBy: { staffRoleLevel: 'asc' } },
      notificationTargets: true,
    },
  });
}

export async function updateNotificationTargets(
  guildId: string,
  featureConfigId: string,
  notificationTargets: Array<{
    targetType: string;
    targetId?: string | null;
    enabled?: boolean;
  }>
) {
  // Delete existing notification targets
  await prisma.notificationTarget.deleteMany({
    where: { featureConfigId },
  });

  // Create new ones in parallel
  await Promise.all(notificationTargets.map(target => 
    prisma.notificationTarget.create({
      data: {
        guildId,
        featureConfigId,
        targetType: target.targetType as any,
        targetId: target.targetId || null,
        enabled: target.enabled ?? true,
      },
    })
  ));

  return prisma.dashboardFeatureConfig.findUnique({
    where: { id: featureConfigId },
    include: {
      roleAccess: true,
      notificationTargets: true,
    },
  });
}
