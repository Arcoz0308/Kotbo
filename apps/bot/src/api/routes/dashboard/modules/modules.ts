/** Routes dashboard du module `modules`. */
import { getModuleActivationStats, getModulePerformanceStats, getModuleStatsSummary, getModuleUsageStats, KOTBO_MODULES, type KotboModule, setModuleActivation } from '../../../../services/analytics/moduleStatsService.js';
import prisma from '../../../../utils/db.js';
import { invalidateLevelConfigCache } from '../../../../services/progression/levelingService.js';
import { logger } from '../../../../utils/logger.js';
import { getGuildName, json, type ModuleStatus, pushAudit, readJsonBody } from '../../../shared.js';
import { type ModuleRouteContext } from './_shared.js';

export async function handleModuleToggleRoutes(ctx: ModuleRouteContext): Promise<boolean> {
  const { req, res, parts, url, client, guildId, method, auditUser, moduleKey } = ctx;

  // PUT /api/dashboard/guilds/:guildId/modules/:moduleId
  if (moduleKey === 'modules' && parts.length === 6 && method === 'PUT') {
    const moduleId = parts[5];
    try {
      const body = (await readJsonBody<{ status: ModuleStatus }>(req)) ?? { status: 'inactive' };

      const updates: Record<string, unknown> = {};
      if (moduleId === 'codepolice') updates.codePoliceEnabled = body.status === 'active';
      if (moduleId === 'dailyalgo' || moduleId === 'daily_algo') updates.dailyAlgoEnabled = body.status === 'active';
      if (moduleId === 'traduction' || moduleId === 'translation') updates.translationEnabled = body.status === 'active';
      if (moduleId === 'sanctions') {
        updates.sanctionSyncEnabled = body.status === 'active';
        updates.sanctionReportEnabled = body.status === 'active';
      }
      if (moduleId === 'nickname_moderation') updates.autoNicknameModerationEnabled = body.status === 'active';
      if (moduleId === 'auto_thread') updates.autoThreadEnabled = body.status === 'active';
      if (moduleId === 'fun') updates.funEnabled = body.status === 'active';
      if (moduleId === 'leveling') {
        await prisma.levelConfig.upsert({
          where: { guildId },
          create: { guildId, enabled: body.status === 'active' },
          update: { enabled: body.status === 'active' }
        });
        await invalidateLevelConfigCache(guildId);
      }

      if (Object.keys(updates).length > 0) {
        await prisma.guild.update({ where: { id: guildId }, data: updates });
      }

      const normalizedKey = moduleId === 'dailyalgo'
        ? 'daily_algo'
        : moduleId === 'traduction'
          ? 'translation'
          : moduleId;
      
      // Mapper l'ID du module vers le nom KotboModule
      const moduleMapping: Record<string, KotboModule> = {
        'codepolice': 'codePolice',
        'daily_algo': 'dailyAlgo',
        'translation': 'translation',
        'sanctions': 'sanction',
        'nickname_moderation': 'nicknameModeration',
        'auto_thread': 'autoThread',
        'fun': 'fun',
        'leveling': 'leveling',
      };
      
      const kotboModuleName = moduleMapping[normalizedKey];
      if (kotboModuleName) {
        await setModuleActivation(guildId, kotboModuleName, body.status === 'active', {
          featureKey: normalizedKey,
        }).catch((err) => {
          logger.warn('ModulesAPI', 'Failed to track module activation:', err);
        });
      }
      
      await prisma.dashboardFeatureConfig.upsert({
        where: { guildId_featureKey: { guildId, featureKey: normalizedKey } },
        create: {
          guildId,
          featureKey: normalizedKey,
          featureName: moduleId.charAt(0).toUpperCase() + moduleId.slice(1),
          enabled: body.status === 'active',
          loggingEnabled: true,
          userActivityTracking: true,
          notifyViaDiscordChannel: true,
        },
        update: {
          enabled: body.status === 'active'
        }
      });

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
    } catch (err) {
      logger.error('ModulesAPI', 'Error updating module:', err);
      json(res, 500, { error: 'Erreur lors de la mise à jour du module' });
    }
    return true;
  }

  // GET /api/dashboard/guilds/:guildId/modules/stats - Module statistics
  if (moduleKey === 'modules' && parts.length === 6 && parts[5] === 'stats' && method === 'GET') {
    try {
      const moduleName = (url.searchParams.get('moduleName') as KotboModule | null) ?? undefined;
      const startDate = url.searchParams.get('startDate') || undefined;
      const endDate = url.searchParams.get('endDate') || undefined;
      const periodDays = url.searchParams.get('period') ? parseInt(url.searchParams.get('period')!) : 30;
      const summary = url.searchParams.get('summary') === 'true';

      if (summary) {
        const data = await getModuleStatsSummary({ guildId, periodDays });
        json(res, 200, data);
      } else {
        const [activation, usage, performance] = await Promise.all([
          getModuleActivationStats(guildId),
          getModuleUsageStats({ guildId, moduleName, startDate, endDate, periodDays }),
          getModulePerformanceStats({ guildId, moduleName, startDate, endDate, periodDays }),
        ]);

        json(res, 200, {
          modules: KOTBO_MODULES,
          activation,
          usage,
          performance,
        });
      }
    } catch (err) {
      logger.error('ModulesAPI', 'Error fetching module stats:', err);
      json(res, 500, { error: 'Erreur interne du serveur' });
    }
    return true;
  }

  return false;
}
