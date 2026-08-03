/**
 * Activation d'un module depuis le dashboard.
 *
 * Un module se lit a deux endroits : `dashboardFeatureConfig`, qui porte le
 * statut affiche, et le champ propre au module quand il en a un
 * (`autoNicknameModerationEnabled`, `levelConfig.enabled`...). Ecrire l'un sans
 * l'autre laisse le serveur dans un etat ou la page dit une chose et le bot en
 * fait une autre.
 *
 * La bascule depuis la page Modules et la mise en place guidee du serveur
 * passent donc toutes deux par ici plutot que d'ecrire chacune sa version.
 */
import prisma from '../../utils/db.js';
import { logger } from '../../utils/logger.js';
import { invalidateLevelConfigCache } from '../progression/levelingService.js';
import { type KotboModule, setModuleActivation } from '../analytics/moduleStatsService.js';

/** Cles historiques de la page Modules, ramenees a celle qui fait foi. */
function normalizeModuleKey(moduleId: string): string {
  if (moduleId === 'dailyalgo') return 'daily_algo';
  if (moduleId === 'traduction') return 'translation';
  return moduleId;
}

/** Champs du serveur a basculer en meme temps que le statut, par module. */
function guildFieldsFor(moduleKey: string, enabled: boolean): Record<string, unknown> {
  switch (moduleKey) {
    case 'codepolice': return { codePoliceEnabled: enabled };
    case 'daily_algo': return { dailyAlgoEnabled: enabled };
    case 'translation': return { translationEnabled: enabled };
    // Les deux volets des sanctions vont ensemble : la page n'en expose qu'un.
    case 'sanctions': return { sanctionSyncEnabled: enabled, sanctionReportEnabled: enabled };
    case 'nickname_moderation': return { autoNicknameModerationEnabled: enabled };
    case 'auto_thread': return { autoThreadEnabled: enabled };
    case 'fun': return { funEnabled: enabled };
    case 'economy': return { economyEnabled: enabled };
    default: return {};
  }
}

const KOTBO_MODULE_BY_KEY: Record<string, KotboModule> = {
  'codepolice': 'codePolice',
  'daily_algo': 'dailyAlgo',
  'translation': 'translation',
  'sanctions': 'sanction',
  'nickname_moderation': 'nicknameModeration',
  'auto_thread': 'autoThread',
  'fun': 'fun',
  'leveling': 'leveling',
  'tickets': 'ticket',
};

export async function setDashboardModuleStatus(
  guildId: string,
  moduleId: string,
  enabled: boolean,
): Promise<void> {
  const key = normalizeModuleKey(moduleId);

  const fields = guildFieldsFor(key, enabled);
  if (Object.keys(fields).length > 0) {
    await prisma.guild.update({ where: { id: guildId }, data: fields });
  }

  // Le niveau vit dans sa propre table, creee au besoin : un serveur qui n'a
  // jamais touche au module n'a pas encore de ligne.
  if (key === 'leveling') {
    await prisma.levelConfig.upsert({
      where: { guildId },
      create: { guildId, enabled },
      update: { enabled },
    });
    await invalidateLevelConfigCache(guildId);
  }

  const kotboModule = KOTBO_MODULE_BY_KEY[key];
  if (kotboModule) {
    // Suivi statistique : son echec ne doit pas faire echouer la bascule.
    await setModuleActivation(guildId, kotboModule, enabled, { featureKey: key })
      .catch((err) => logger.warn('ModuleActivation', 'Suivi d\'activation impossible :', err));
  }

  await prisma.dashboardFeatureConfig.upsert({
    where: { guildId_featureKey: { guildId, featureKey: key } },
    create: {
      guildId,
      featureKey: key,
      // Depuis l'identifiant recu et non la cle normalisee : ce libelle
      // s'affiche dans le Centre de gestion, ou « Dailyalgo » etait deja pose
      // ainsi. Les lignes creees par la suite ne doivent pas s'en ecarter.
      featureName: moduleId.charAt(0).toUpperCase() + moduleId.slice(1),
      enabled,
      loggingEnabled: true,
      userActivityTracking: true,
      notifyViaDiscordChannel: true,
    },
    update: { enabled },
  });
}
