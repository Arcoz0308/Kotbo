import { IncomingMessage, ServerResponse } from 'node:http';
import { Client, EmbedBuilder } from 'discord.js';
import prisma from '../../../utils/db.js';
import { logger } from '../../../utils/logger.js';
import { getOrCreateLevelConfig, updateMemberLevelRoles, getXpForLevel } from '../../../services/progression/levelingService.js';
import { getOrCreateWelcomeConfig } from '../../../services/features/welcomeGoodbyeService.js';
import { getOrCreateAutoModConfig, invalidateAutoModCache, syncDiscordAutoModRules } from '../../../services/moderation/autoModService.js';
import { createGiveaway, endGiveaway, rerollGiveaway } from '../../../services/features/giveawayService.js';
import { createReactionRoleMenu } from '../../../services/features/reactionRoleService.js';
import { invalidateAutoResponseCache } from '../../../services/features/autoResponseService.js';
import { resolveSuggestion } from '../../../services/features/suggestionService.js';
import { json, readJsonBody, getGuildName, pushAudit, type AuthClaims, type DashboardAccess } from '../../shared.js';

export async function handleGeneralistModulesRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  parts: string[],
  url: URL,
  client: Client,
  user: AuthClaims,
  guildId: string,
  _access: DashboardAccess
): Promise<boolean> {
  const method = req.method;
  const moduleKey = parts[4];
  const auditUser = `${user.username}#${user.discriminator || '0000'} (${user.userId})`;

  // Economy & RPG module routes
  if (moduleKey === 'economy') {
    const { handleEconomyRoutes } = await import('./economy.js');
    return handleEconomyRoutes(req, res, parts, client, user, guildId, _access);
  }

  // 1. LEVELING MODULE ROUTES
  if (moduleKey === 'leveling') {
    // GET /api/dashboard/guilds/:guildId/leveling
    if (parts.length === 5 && method === 'GET') {
      try {
        const config = await getOrCreateLevelConfig(guildId);
        const rewards = await prisma.levelRoleReward.findMany({
          where: { guildId },
          orderBy: { level: 'asc' },
        });
        const levels = await prisma.memberLevel.findMany({
          where: { guildId },
          orderBy: { xp: 'desc' },
        });

        // Charger les profils de membres de la base de données
        const userIds = levels.map(l => l.userId);
        const dbProfiles = await prisma.memberProfile.findMany({
          where: {
            guildId,
            userId: { in: userIds }
          }
        });
        const profileMap = new Map(dbProfiles.map(p => [p.userId, p]));

        // Charger les membres depuis le cache du serveur Discord si présent
        const discordGuild = client.guilds.cache.get(guildId);

        const levelsWithUserData = levels.map(l => {
          const profile = profileMap.get(l.userId);
          const discordMember = discordGuild?.members.cache.get(l.userId);

          const username = discordMember?.user?.username || profile?.username || null;
          const displayName = discordMember?.displayName || profile?.displayName || profile?.globalName || `Utilisateur ${l.userId}`;
          const avatarUrl = discordMember?.user?.displayAvatarURL({ size: 128 }) || profile?.avatarUrl || null;

          return {
            ...l,
            username,
            displayName,
            avatarUrl
          };
        });

        json(res, 200, { config, rewards, levels: levelsWithUserData });
      } catch (err) {
        logger.error('LevelingAPI', 'Error fetching leveling data:', err);
        json(res, 500, { error: 'Erreur lors de la récupération du leveling' });
      }
      return true;
    }

    // PATCH /api/dashboard/guilds/:guildId/leveling (Mise à jour config)
    if (parts.length === 5 && method === 'PATCH') {
      try {
        const body = await readJsonBody<{
          enabled?: boolean;
          xpMin?: number;
          xpMax?: number;
          cooldownSeconds?: number;
          vocalXpPerMin?: number;
          levelUpChannelId?: string | null;
          levelUpMessage?: string;
          stackRewards?: boolean;
          ignoredChannels?: string[];
          ignoredRoles?: string[];
          xpMultipliers?: any;
        }>(req);

        if (!body) {
          json(res, 400, { error: 'Corps de requête manquant' });
          return true;
        }

        const config = await prisma.levelConfig.update({
          where: { guildId },
          data: {
            enabled: body.enabled,
            xpMin: body.xpMin,
            xpMax: body.xpMax,
            cooldownSeconds: body.cooldownSeconds,
            vocalXpPerMin: body.vocalXpPerMin,
            levelUpChannelId: body.levelUpChannelId,
            levelUpMessage: body.levelUpMessage,
            stackRewards: body.stackRewards,
            ignoredChannels: body.ignoredChannels,
            ignoredRoles: body.ignoredRoles,
            xpMultipliers: body.xpMultipliers,
          },
        });

        await pushAudit(guildId, {
          user: auditUser,
          action: 'Mise à jour Leveling',
          context: getGuildName(client, guildId),
          module: 'Leveling',
          eventType: 'Manuel',
          details: `Configuration modifiée. Actif: ${config.enabled}`,
          channelId: null
        });

        json(res, 200, { config });
      } catch (err) {
        logger.error('LevelingAPI', 'Error updating leveling config:', err);
        json(res, 500, { error: 'Erreur lors de la mise à jour du leveling' });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/leveling/rewards (Ajouter récompense)
    if (parts.length === 6 && parts[5] === 'rewards' && method === 'POST') {
      try {
        const body = await readJsonBody<{ level: number; roleId: string }>(req);
        if (!body || !body.level || !body.roleId) {
          json(res, 400, { error: 'Niveau et rôle requis' });
          return true;
        }

        const reward = await prisma.levelRoleReward.create({
          data: {
            guildId,
            level: body.level,
            roleId: body.roleId,
          },
        });

        json(res, 200, { reward });
      } catch (err) {
        logger.error('LevelingAPI', 'Error creating reward:', err);
        json(res, 500, { error: 'Erreur lors de la création de la récompense' });
      }
      return true;
    }

    // DELETE /api/dashboard/guilds/:guildId/leveling/rewards/:rewardId
    if (parts.length === 7 && parts[5] === 'rewards' && method === 'DELETE') {
      const rewardId = parts[6];
      try {
        await prisma.levelRoleReward.delete({
          where: { id: rewardId },
        });
        json(res, 200, { success: true });
      } catch (err) {
        logger.error('LevelingAPI', 'Error deleting reward:', err);
        json(res, 500, { error: 'Erreur lors de la suppression de la récompense' });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/leveling/import
    if (parts.length === 6 && parts[5] === 'import' && method === 'POST') {
      try {
        const body = await readJsonBody<unknown>(req);
        if (!body || !Array.isArray(body)) {
          json(res, 400, { error: "Le corps de la requête doit être un tableau d'utilisateurs." });
          return true;
        }

        const validItems: Array<{
          username?: string;
          displayName?: string;
          level?: number;
          xp?: number;
        }> = [];

        const failedMembers: Array<{
          username?: string;
          display_name?: string;
          reason: string;
        }> = [];

        for (const item of body) {
          if (!item || typeof item !== 'object') {
            failedMembers.push({ reason: "Format invalide (doit être un objet)" });
            continue;
          }

          const rawItem = item as Record<string, unknown>;
          const username = rawItem.username;
          const displayName = rawItem.display_name || rawItem.displayName;
          const level = typeof rawItem.level === 'number' ? rawItem.level : (typeof rawItem.level === 'string' ? parseInt(rawItem.level as string, 10) : NaN);
          const xp = typeof rawItem.xp === 'number' ? rawItem.xp : (typeof rawItem.xp === 'string' ? parseInt(rawItem.xp as string, 10) : NaN);

          if (!username && !displayName) {
            failedMembers.push({ reason: "Nom d'utilisateur ou pseudo manquant" });
            continue;
          }

          if (isNaN(level) && isNaN(xp)) {
            failedMembers.push({
              username: username ? String(username) : undefined,
              display_name: displayName ? String(displayName) : undefined,
              reason: "Niveau ou XP invalide/manquant"
            });
            continue;
          }

          validItems.push({
            username: username ? String(username) : undefined,
            displayName: displayName ? String(displayName) : undefined,
            level: isNaN(level) ? undefined : level,
            xp: isNaN(xp) ? undefined : xp
          });
        }

        const dbProfiles = await prisma.memberProfile.findMany({
          where: { guildId }
        });

        const discordGuild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
        const discordMembers = discordGuild ? await discordGuild.members.fetch().catch(() => new Map()) : new Map();

        const identityMap = new Map<string, string>();

        const normalize = (str: string) => {
          return str.toLowerCase().replace(/^@/, '').trim();
        };

        for (const p of dbProfiles) {
          if (p.userId) {
            if (p.username) identityMap.set(normalize(p.username), p.userId);
            if (p.displayName) identityMap.set(normalize(p.displayName), p.userId);
            if (p.globalName) identityMap.set(normalize(p.globalName), p.userId);
            if (p.userTag) identityMap.set(normalize(p.userTag), p.userId);
          }
        }

        if (discordMembers.size > 0) {
          for (const [id, member] of discordMembers) {
            identityMap.set(normalize(member.user.username), id);
            if (member.nickname) identityMap.set(normalize(member.nickname), id);
            identityMap.set(normalize(member.displayName), id);
            identityMap.set(normalize(member.user.tag), id);
          }
        }

        const importedSuccessfully: Array<{ userId: string; level: number; xp: number }> = [];

        for (const item of validItems) {
          let userId: string | undefined;

          if (item.username) {
            userId = identityMap.get(normalize(item.username));
          }
          if (!userId && item.displayName) {
            userId = identityMap.get(normalize(item.displayName));
          }

          if (!userId) {
            failedMembers.push({
              username: item.username,
              display_name: item.displayName,
              reason: "Membre introuvable sur le serveur Discord"
            });
            continue;
          }

          let xp = item.xp;
          let level = item.level;

          if (xp === undefined && level !== undefined) {
            xp = getXpForLevel(level - 1);
          } else if (level === undefined && xp !== undefined) {
            level = 0;
            let nextXp = getXpForLevel(level);
            while (xp >= nextXp) {
              level++;
              nextXp = getXpForLevel(level);
            }
          }

          if (xp === undefined || level === undefined) {
            failedMembers.push({
              username: item.username,
              display_name: item.displayName,
              reason: "Valeur de niveau/XP invalide"
            });
            continue;
          }

          importedSuccessfully.push({ userId, level, xp });
        }

        for (const record of importedSuccessfully) {
          await prisma.memberLevel.upsert({
            where: { guildId_userId: { guildId, userId: record.userId } },
            update: {
              xp: record.xp,
              level: record.level,
              lastXpGain: new Date()
            },
            create: {
              guildId,
              userId: record.userId,
              xp: record.xp,
              level: record.level,
              lastXpGain: new Date()
            }
          });
        }

        if (importedSuccessfully.length > 0) {
          (async () => {
            for (const record of importedSuccessfully) {
              await updateMemberLevelRoles(guildId, record.userId, record.level, client).catch(() => {});
              await new Promise(resolve => setTimeout(resolve, 250));
            }
          })().catch(err => {
            logger.error('LevelingAPI', 'Error updating roles in background:', err);
          });
        }

        await pushAudit(guildId, {
          user: auditUser,
          action: 'Import de classement',
          context: getGuildName(client, guildId),
          module: 'Leveling',
          eventType: 'Manuel',
          details: `Importation réussie de ${importedSuccessfully.length} membres (échec: ${failedMembers.length})`,
          channelId: null
        });

        json(res, 200, {
          success: true,
          importedCount: importedSuccessfully.length,
          failedCount: failedMembers.length,
          failedMembers
        });
      } catch (err) {
        logger.error('LevelingAPI', 'Error during leveling import:', err);
        json(res, 500, { error: 'Erreur lors de l\'importation des données' });
      }
      return true;
    }

  }

  // 2. GIVEAWAYS MODULE ROUTES
  if (moduleKey === 'giveaways') {
    // GET /api/dashboard/guilds/:guildId/giveaways
    if (parts.length === 5 && method === 'GET') {
      try {
        const giveaways = await prisma.giveaway.findMany({
          where: { guildId },
          orderBy: { createdAt: 'desc' },
        });
        json(res, 200, { giveaways });
      } catch (err) {
        logger.error('GiveawaysAPI', 'Error fetching giveaways:', err);
        json(res, 500, { error: 'Erreur lors de la récupération des giveaways' });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/giveaways (Créer)
    if (parts.length === 5 && method === 'POST') {
      try {
        const body = await readJsonBody<{
          prize: string;
          winnerCount: number;
          durationMinutes: number;
          description?: string;
          channelId: string;
        }>(req);

        if (!body || !body.prize || !body.winnerCount || !body.durationMinutes || !body.channelId) {
          json(res, 400, { error: 'Champs obligatoires manquants' });
          return true;
        }

        const giveaway = await createGiveaway(
          client,
          guildId,
          body.channelId,
          body.prize,
          body.winnerCount,
          body.durationMinutes,
          body.description
        );

        json(res, 200, { giveaway });
      } catch (err) {
        logger.error('GiveawaysAPI', 'Error creating giveaway:', err);
        json(res, 500, { error: 'Erreur lors de la création du giveaway' });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/giveaways/:giveawayId/end (Forcer fin)
    if (parts.length === 7 && parts[6] === 'end' && method === 'POST') {
      const giveawayId = parts[5];
      try {
        await endGiveaway(client, giveawayId);
        json(res, 200, { success: true });
      } catch (err) {
        logger.error('GiveawaysAPI', 'Error ending giveaway:', err);
        json(res, 500, { error: 'Erreur lors de la clôture du giveaway' });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/giveaways/:giveawayId/reroll (Reroll)
    if (parts.length === 7 && parts[6] === 'reroll' && method === 'POST') {
      const giveawayId = parts[5];
      try {
        await rerollGiveaway(client, giveawayId);
        json(res, 200, { success: true });
      } catch (err) {
        logger.error('GiveawaysAPI', 'Error rerolling giveaway:', err);
        json(res, 500, { error: 'Erreur lors du reroll' });
      }
      return true;
    }

    // DELETE /api/dashboard/guilds/:guildId/giveaways/:giveawayId
    if (parts.length === 6 && method === 'DELETE') {
      const giveawayId = parts[5];
      try {
        await prisma.giveaway.delete({
          where: { id: giveawayId },
        });
        json(res, 200, { success: true });
      } catch (err) {
        logger.error('GiveawaysAPI', 'Error deleting giveaway:', err);
        json(res, 500, { error: 'Erreur lors de la suppression' });
      }
      return true;
    }
  }

  // 3. WELCOME & GOODBYE / ANNOUNCEMENT ROUTES
  if (moduleKey === 'announcement' || moduleKey === 'welcome') {
    // GET /api/dashboard/guilds/:guildId/announcement (or /welcome)
    if (parts.length === 5 && method === 'GET') {
      try {
        const config = await getOrCreateWelcomeConfig(guildId);
        json(res, 200, { config });
      } catch (err) {
        logger.error('WelcomeGoodbyeAPI', 'Error fetching welcome config:', err);
        json(res, 500, { error: 'Erreur config accueil' });
      }
      return true;
    }

    // PATCH /api/dashboard/guilds/:guildId/announcement (or /welcome)
    if (parts.length === 5 && method === 'PATCH') {
      try {
        const body = await readJsonBody<{
          welcomeEnabled?: boolean;
          welcomeChannelId?: string | null;
          welcomeMessage?: string;
          welcomeImageEnabled?: boolean;
          welcomeImageUrl?: string | null;
          leaveEnabled?: boolean;
          leaveChannelId?: string | null;
          leaveMessage?: string;
          boostEnabled?: boolean;
          boostChannelId?: string | null;
          boostMessage?: string;
          boostImageEnabled?: boolean;
          boostImageUrl?: string | null;
          joinRoleId?: string | null;
          tagAutoRoleEnabled?: boolean;
          tagAutoRoleWord?: string;
          tagAutoRoleId?: string | null;
        }>(req);

        if (!body) {
          json(res, 400, { error: 'Corps de requête manquant' });
          return true;
        }

        const config = await prisma.welcomeConfig.update({
          where: { guildId },
          data: {
            welcomeEnabled: body.welcomeEnabled,
            welcomeChannelId: body.welcomeChannelId,
            welcomeMessage: body.welcomeMessage,
            welcomeImageEnabled: body.welcomeImageEnabled,
            welcomeImageUrl: body.welcomeImageUrl,
            leaveEnabled: body.leaveEnabled,
            leaveChannelId: body.leaveChannelId,
            leaveMessage: body.leaveMessage,
            boostEnabled: body.boostEnabled,
            boostChannelId: body.boostChannelId,
            boostMessage: body.boostMessage,
            boostImageEnabled: body.boostImageEnabled,
            boostImageUrl: body.boostImageUrl,
            joinRoleId: body.joinRoleId,
            tagAutoRoleEnabled: body.tagAutoRoleEnabled,
            tagAutoRoleWord: body.tagAutoRoleWord,
            tagAutoRoleId: body.tagAutoRoleId,
          },
        });

        await pushAudit(guildId, {
          user: auditUser,
          action: 'Mise à jour Annonces/Auto-Rôle',
          context: getGuildName(client, guildId),
          module: 'Announcement',
          eventType: 'Manuel',
          details: `Modifications appliquées. Accueil: ${config.welcomeEnabled}, Départ: ${config.leaveEnabled}, Boost: ${config.boostEnabled}, Tag Auto-Role: ${config.tagAutoRoleEnabled}`,
          channelId: null
        });

        json(res, 200, { config });
      } catch (err) {
        logger.error('WelcomeGoodbyeAPI', 'Error updating welcome config:', err);
        json(res, 500, { error: 'Erreur lors de la mise à jour de la config' });
      }
      return true;
    }
  }

  // 4. REACTION ROLES ROUTES
  if (moduleKey === 'reaction-roles') {
    // GET /api/dashboard/guilds/:guildId/reaction-roles
    if (parts.length === 5 && method === 'GET') {
      try {
        const menus = await prisma.reactionRoleMenu.findMany({
          where: { guildId },
          orderBy: { createdAt: 'desc' },
        });
        json(res, 200, { menus });
      } catch (err) {
        logger.error('ReactionRolesAPI', 'Error fetching menus:', err);
        json(res, 500, { error: 'Erreur lors de la récupération des menus' });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/reaction-roles (Créer)
    if (parts.length === 5 && method === 'POST') {
      try {
        const body = await readJsonBody<{
          title: string;
          channelId: string;
          options: Array<{ emoji?: string; label: string; roleId: string }>;
        }>(req);

        if (!body || !body.title || !body.channelId || !body.options || body.options.length === 0) {
          json(res, 400, { error: 'Champs obligatoires manquants ou vides' });
          return true;
        }

        const menu = await createReactionRoleMenu(
          client,
          guildId,
          body.channelId,
          body.title,
          body.options
        );

        json(res, 200, { menu });
      } catch (err) {
        logger.error('ReactionRolesAPI', 'Error creating menu:', err);
        json(res, 500, { error: 'Erreur lors de la création du menu de rôles' });
      }
      return true;
    }

    // DELETE /api/dashboard/guilds/:guildId/reaction-roles/:menuId
    if (parts.length === 6 && method === 'DELETE') {
      const menuId = parts[5];
      try {
        await prisma.reactionRoleMenu.delete({
          where: { id: menuId },
        });
        json(res, 200, { success: true });
      } catch (err) {
        logger.error('ReactionRolesAPI', 'Error deleting menu:', err);
        json(res, 500, { error: 'Erreur de suppression du menu' });
      }
      return true;
    }
  }

  // 5. triggers ROUTES
  if (moduleKey === 'triggers') {
    // GET /api/dashboard/guilds/:guildId/triggers
    if (parts.length === 5 && method === 'GET') {
      try {
        const list = await prisma.autoResponse.findMany({
          where: { guildId },
          orderBy: { createdAt: 'desc' },
        });
        json(res, 200, { list });
      } catch (err) {
        logger.error('AutoResponsesAPI', 'Error fetching triggers:', err);
        json(res, 500, { error: 'Erreur lors de la récupération des triggers' });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/triggers
    if (parts.length === 5 && method === 'POST') {
      try {
        const body = await readJsonBody<{
          trigger: string;
          response: string | null;
          matchType: string;
          enabled?: boolean;
          roleIdToAdd?: string | null;
          roleIdToRemove?: string | null;
          deleteTrigger?: boolean;
          allowedRoleIds?: string[];
          bannedRoleIds?: string[];
          allowedChannelIds?: string[];
          bannedChannelIds?: string[];
        }>(req);

        if (!body || !body.trigger) {
          json(res, 400, { error: 'Déclencheur requis' });
          return true;
        }

        if (!body.response && !body.roleIdToAdd && !body.roleIdToRemove && !body.deleteTrigger) {
          json(res, 400, { error: 'Au moins une action doit être configurée (réponse, ajout/retrait de rôle, ou suppression du message)' });
          return true;
        }

        const autoResponse = await prisma.autoResponse.create({
          data: {
            guildId,
            trigger: body.trigger,
            response: body.response,
            matchType: body.matchType || 'CONTAINS',
            enabled: body.enabled ?? true,
            roleIdToAdd: body.roleIdToAdd || null,
            roleIdToRemove: body.roleIdToRemove || null,
            deleteTrigger: body.deleteTrigger ?? false,
            allowedRoleIds: body.allowedRoleIds ?? [],
            bannedRoleIds: body.bannedRoleIds ?? [],
            allowedChannelIds: body.allowedChannelIds ?? [],
            bannedChannelIds: body.bannedChannelIds ?? [],
          },
        });

        invalidateAutoResponseCache(guildId);
        json(res, 200, { autoResponse });
      } catch (err) {
        logger.error('AutoResponsesAPI', 'Error creating trigger:', err);
        json(res, 500, { error: 'Erreur lors de la création du déclencheur' });
      }
      return true;
    }

    // PATCH /api/dashboard/guilds/:guildId/triggers/:id
    if (parts.length === 6 && method === 'PATCH') {
      const id = parts[5];
      try {
        const body = await readJsonBody<{
          trigger?: string;
          response?: string | null;
          matchType?: string;
          enabled?: boolean;
          roleIdToAdd?: string | null;
          roleIdToRemove?: string | null;
          deleteTrigger?: boolean;
          allowedRoleIds?: string[];
          bannedRoleIds?: string[];
          allowedChannelIds?: string[];
          bannedChannelIds?: string[];
        }>(req);

        if (!body) {
          json(res, 400, { error: 'Corps de requête manquant' });
          return true;
        }

        const existing = await prisma.autoResponse.findUnique({
          where: { id },
        });

        if (!existing) {
          json(res, 404, { error: 'Déclencheur introuvable' });
          return true;
        }

        const combinedTrigger = body.trigger !== undefined ? body.trigger : existing.trigger;
        const combinedResponse = body.response !== undefined ? body.response : existing.response;
        const combinedRoleIdToAdd = body.roleIdToAdd !== undefined ? body.roleIdToAdd : existing.roleIdToAdd;
        const combinedRoleIdToRemove = body.roleIdToRemove !== undefined ? body.roleIdToRemove : existing.roleIdToRemove;
        const combinedDeleteTrigger = body.deleteTrigger !== undefined ? body.deleteTrigger : existing.deleteTrigger;

        if (!combinedTrigger) {
          json(res, 400, { error: 'Déclencheur requis' });
          return true;
        }

        if (!combinedResponse && !combinedRoleIdToAdd && !combinedRoleIdToRemove && !combinedDeleteTrigger) {
          json(res, 400, { error: 'Au moins une action doit être configurée (réponse, ajout/retrait de rôle, ou suppression du message)' });
          return true;
        }

        const autoResponse = await prisma.autoResponse.update({
          where: { id },
          data: {
            trigger: body.trigger,
            response: body.response,
            matchType: body.matchType,
            enabled: body.enabled,
            roleIdToAdd: body.roleIdToAdd,
            roleIdToRemove: body.roleIdToRemove,
            deleteTrigger: body.deleteTrigger,
            allowedRoleIds: body.allowedRoleIds,
            bannedRoleIds: body.bannedRoleIds,
            allowedChannelIds: body.allowedChannelIds,
            bannedChannelIds: body.bannedChannelIds,
          },
        });

        invalidateAutoResponseCache(guildId);
        json(res, 200, { autoResponse });
      } catch (err) {
        logger.error('AutoResponsesAPI', 'Error updating trigger:', err);
        json(res, 500, { error: 'Erreur lors de la modification' });
      }
      return true;
    }

    // DELETE /api/dashboard/guilds/:guildId/triggers/:id
    if (parts.length === 6 && method === 'DELETE') {
      const id = parts[5];
      try {
        await prisma.autoResponse.delete({
          where: { id },
        });
        invalidateAutoResponseCache(guildId);
        json(res, 200, { success: true });
      } catch (err) {
        logger.error('AutoResponsesAPI', 'Error deleting trigger:', err);
        json(res, 500, { error: 'Erreur lors de la suppression' });
      }
      return true;
    }
  }

  // 6. AUTOMOD ROUTES
  if (moduleKey === 'automod') {
    // GET /api/dashboard/guilds/:guildId/automod
    if (parts.length === 5 && method === 'GET') {
      try {
        const config = await getOrCreateAutoModConfig(guildId);
        json(res, 200, { config });
      } catch (err) {
        logger.error('AutoModAPI', 'Error fetching config:', err);
        json(res, 500, { error: 'Erreur de récupération config AutoMod' });
      }
      return true;
    }

    // PATCH /api/dashboard/guilds/:guildId/automod
    if (parts.length === 5 && method === 'PATCH') {
      try {
        const body = await readJsonBody<{
          discordAutoModEnabled?: boolean;
          spamEnabled?: boolean;
          spamLimit?: number;
          spamIntervalSeconds?: number;
          spamAction?: string;
          linksEnabled?: boolean;
          linksAction?: string;
          linksWhitelist?: string[];
          capsEnabled?: boolean;
          capsThresholdPercent?: number;
          capsMinLength?: number;
          emojisEnabled?: boolean;
          emojisLimit?: number;
          mentionsEnabled?: boolean;
          mentionsLimit?: number;
          ghostPingEnabled?: boolean;
          ghostPingAction?: string;
          antiEveryoneEnabled?: boolean;
          antiEveryoneAction?: string;
          bypassRoles?: string[];
          bypassChannels?: string[];
        }>(req);

        if (!body) {
          json(res, 400, { error: 'Corps de requête manquant' });
          return true;
        }

        const config = await prisma.autoModConfig.update({
          where: { guildId },
          data: {
            discordAutoModEnabled: body.discordAutoModEnabled,
            spamEnabled: body.spamEnabled,
            spamLimit: body.spamLimit,
            spamIntervalSeconds: body.spamIntervalSeconds,
            spamAction: body.spamAction,
            linksEnabled: body.linksEnabled,
            linksAction: body.linksAction,
            linksWhitelist: body.linksWhitelist,
            capsEnabled: body.capsEnabled,
            capsThresholdPercent: body.capsThresholdPercent,
            capsMinLength: body.capsMinLength,
            emojisEnabled: body.emojisEnabled,
            emojisLimit: body.emojisLimit,
            mentionsEnabled: body.mentionsEnabled,
            mentionsLimit: body.mentionsLimit,
            ghostPingEnabled: body.ghostPingEnabled,
            ghostPingAction: body.ghostPingAction,
            antiEveryoneEnabled: body.antiEveryoneEnabled,
            antiEveryoneAction: body.antiEveryoneAction,
            bypassRoles: body.bypassRoles,
            bypassChannels: body.bypassChannels,
          },
        });

        invalidateAutoModCache(guildId);

        // Synchroniser les règles avec Discord
        await syncDiscordAutoModRules(client, guildId, config);

        await pushAudit(guildId, {
          user: auditUser,
          action: 'Mise à jour AutoMod',
          context: getGuildName(client, guildId),
          module: 'AutoMod',
          eventType: 'Manuel',
          details: `Verrous de sécurité mis à jour. Anti-spam: ${config.spamEnabled}, Anti-liens: ${config.linksEnabled}, Synchro native: ${config.discordAutoModEnabled}`,
          channelId: null
        });

        json(res, 200, { config });
      } catch (err) {
        logger.error('AutoModAPI', 'Error updating config:', err);
        json(res, 500, { error: 'Erreur lors de la mise à jour AutoMod' });
      }
      return true;
    }
  }

  // 7. SUGGESTIONS ROUTES
  if (moduleKey === 'suggestions') {
    // GET /api/dashboard/guilds/:guildId/suggestions/config
    if (parts.length === 6 && parts[5] === 'config' && method === 'GET') {
      try {
        const { getOrCreateFeatureConfigs } = await import('../../../services/core/dashboardManagementService.js');
        const configs = await getOrCreateFeatureConfigs(guildId);
        const featureConfig = configs.find((c) => c.featureKey === 'suggestions');
        json(res, 200, {
          config: {
            enabled: featureConfig?.enabled ?? true,
            channelId: featureConfig?.channelId ?? null,
          },
        });
      } catch (err) {
        logger.error('SuggestionsAPI', 'Error fetching suggestions config:', err);
        json(res, 500, { error: 'Erreur de récupération de la configuration' });
      }
      return true;
    }

    // PATCH /api/dashboard/guilds/:guildId/suggestions/config
    if (parts.length === 6 && parts[5] === 'config' && method === 'PATCH') {
      try {
        const body = await readJsonBody<{
          enabled?: boolean;
          channelId?: string | null;
        }>(req);

        if (!body) {
          json(res, 400, { error: 'Corps de requête manquant' });
          return true;
        }

        const { getOrCreateFeatureConfigs, updateFeatureConfig } = await import('../../../services/core/dashboardManagementService.js');
        await getOrCreateFeatureConfigs(guildId);
        const updated = await updateFeatureConfig(guildId, 'suggestions', {
          enabled: body.enabled,
          channelId: body.channelId,
        });

        await pushAudit(guildId, {
          user: auditUser,
          action: 'Mise à jour configuration suggestions',
          context: getGuildName(client, guildId),
          module: 'Suggestions',
          eventType: 'Manuel',
          details: `Module ${updated.enabled ? 'activé' : 'désactivé'}${updated.channelId ? `, salon <#${updated.channelId}>` : ''}.`,
          channelId: updated.channelId,
        });

        json(res, 200, {
          config: {
            enabled: updated.enabled,
            channelId: updated.channelId,
          },
        });
      } catch (err) {
        logger.error('SuggestionsAPI', 'Error updating suggestions config:', err);
        json(res, 500, { error: 'Erreur lors de la mise à jour de la configuration' });
      }
      return true;
    }

    // GET /api/dashboard/guilds/:guildId/suggestions
    if (parts.length === 5 && method === 'GET') {
      try {
        const suggestions = await prisma.suggestion.findMany({
          where: { guildId },
          orderBy: { createdAt: 'desc' },
        });
        json(res, 200, { suggestions });
      } catch (err) {
        logger.error('SuggestionsAPI', 'Error fetching suggestions:', err);
        json(res, 500, { error: 'Erreur de récupération des suggestions' });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/suggestions/:suggestionId/resolve (Prendre une décision)
    if (parts.length === 7 && parts[6] === 'resolve' && method === 'POST') {
      const suggestionId = parts[5];
      try {
        const body = await readJsonBody<{
          status: 'APPROVED' | 'REJECTED' | 'IMPLEMENTED';
          responseText: string;
        }>(req);

        if (!body || !body.status || !body.responseText) {
          json(res, 400, { error: 'Statut et commentaire de réponse requis' });
          return true;
        }

        const suggestion = await resolveSuggestion(
          suggestionId,
          body.status,
          body.responseText,
          user.userId,
          client
        );

        if (!suggestion) {
          json(res, 404, { error: 'Suggestion introuvable' });
          return true;
        }

        await pushAudit(guildId, {
          user: auditUser,
          action: 'Résolution suggestion',
          context: getGuildName(client, guildId),
          module: 'Suggestions',
          eventType: 'Manuel',
          details: `Suggestion ${suggestionId} résolue avec le statut : ${body.status}.`,
          channelId: null
        });

        json(res, 200, { suggestion });
      } catch (err) {
        logger.error('SuggestionsAPI', 'Error resolving suggestion:', err);
        json(res, 500, { error: 'Erreur lors de la résolution de la suggestion' });
      }
      return true;
    }
  }

  // 8. EMBED BUILDER ROUTES
  if (moduleKey === 'embed-builder') {
    // POST /api/dashboard/guilds/:guildId/embed-builder (Envoyer ou mettre à jour un embed)
    if (parts.length === 5 && method === 'POST') {
      try {
        const body = await readJsonBody<{
          channelId: string;
          messageId?: string | null;
          content?: string | null;
          embed?: {
            title?: string;
            description?: string;
            color?: string;
            thumbnailUrl?: string | null;
            imageUrl?: string | null;
            url?: string | null;
            authorName?: string | null;
            authorIconUrl?: string | null;
            authorUrl?: string | null;
            footerText?: string | null;
            footerIconUrl?: string | null;
            timestamp?: boolean | string | null;
            fields?: Array<{ name: string; value: string; inline?: boolean }>;
          };
        }>(req);

        if (!body || !body.channelId || (!body.embed && !body.content)) {
          json(res, 400, { error: 'Salon et données d\'envoi requis (content ou embed)' });
          return true;
        }

        const discordGuild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
        if (!discordGuild) {
          json(res, 404, { error: 'Serveur introuvable' });
          return true;
        }

        const channel = discordGuild.channels.cache.get(body.channelId);
        if (!channel?.isTextBased()) {
          json(res, 404, { error: 'Salon introuvable ou invalide' });
          return true;
        }

        // Construire l'embed Discord si fourni
        const embed = new EmbedBuilder();
        let hasEmbedData = false;

        if (body.embed) {
          if (body.embed.title) { embed.setTitle(body.embed.title); hasEmbedData = true; }
          if (body.embed.description) { embed.setDescription(body.embed.description); hasEmbedData = true; }
          if (body.embed.color) { embed.setColor(body.embed.color as any); hasEmbedData = true; }
          if (body.embed.thumbnailUrl) { embed.setThumbnail(body.embed.thumbnailUrl); hasEmbedData = true; }
          if (body.embed.imageUrl) { embed.setImage(body.embed.imageUrl); hasEmbedData = true; }
          if (body.embed.url) { embed.setURL(body.embed.url); hasEmbedData = true; }
          if (body.embed.timestamp) {
            embed.setTimestamp(body.embed.timestamp === true ? new Date() : new Date(body.embed.timestamp));
            hasEmbedData = true;
          }

          if (body.embed.authorName) {
            embed.setAuthor({
              name: body.embed.authorName,
              iconURL: body.embed.authorIconUrl || undefined,
              url: body.embed.authorUrl || undefined
            });
            hasEmbedData = true;
          }

          if (body.embed.footerText) {
            embed.setFooter({
              text: body.embed.footerText,
              iconURL: body.embed.footerIconUrl || undefined
            });
            hasEmbedData = true;
          }

          if (body.embed.fields && body.embed.fields.length > 0) {
            embed.addFields(body.embed.fields.map(f => ({
              name: f.name || '-',
              value: f.value || '-',
              inline: !!f.inline
            })));
            hasEmbedData = true;
          }
        }

        if (!body.content && !hasEmbedData) {
          json(res, 400, { error: 'Vous devez fournir du texte de message ou au moins un champ d\'embed.' });
          return true;
        }

        const messageOptions = {
          content: body.content || undefined,
          embeds: hasEmbedData ? [embed] : undefined
        };

        let messageSent;
        if (body.messageId) {
          // Tenter de modifier un message existant
          const msg = await channel.messages.fetch(body.messageId).catch(() => null);
          if (msg) {
            messageSent = await msg.edit(messageOptions).catch(() => null);
          }
        }

        if (!messageSent) {
          // Envoyer un nouveau message
          messageSent = await channel.send(messageOptions).catch(() => null);
        }

        if (!messageSent) {
          json(res, 500, { error: 'Le bot n\'a pas pu envoyer ou modifier le message (vérifiez ses permissions).' });
          return true;
        }

        await pushAudit(guildId, {
          user: auditUser,
          action: body.messageId ? 'Mise à jour embed' : 'Envoi embed personnalisé',
          context: getGuildName(client, guildId),
          module: 'EmbedBuilder',
          eventType: 'Manuel',
          details: `Embed envoyé dans le salon <#${body.channelId}> (Message: ${messageSent.id}).`,
          channelId: body.channelId
        });

        json(res, 200, { ok: true, messageId: messageSent.id });
      } catch (err) {
        logger.error('EmbedBuilderAPI', 'Error building/sending embed:', err);
        json(res, 500, { error: 'Erreur lors du traitement de l\'embed' });
      }
      return true;
    }
  }

  // 9. FUN MODULE ROUTES
  if (moduleKey === 'fun') {
    // GET /api/dashboard/guilds/:guildId/fun
    if (parts.length === 5 && method === 'GET') {
      try {
        const guild = await prisma.guild.findUnique({
          where: { id: guildId },
          select: {
            funEnabled: true,
            funCountingChannelId: true,
            funOneWordStoryChannelId: true,
            funGuessNumberChannelId: true,
          }
        });

        if (!guild) {
          json(res, 404, { error: 'Serveur introuvable' });
          return true;
        }

        const { getOrCreateFunGameState } = await import('../../../services/features/funService.js');
        const gameState = await getOrCreateFunGameState(guildId);

        json(res, 200, {
          config: guild,
          gameState: {
            countingCurrent: gameState.countingCurrent,
            countingLastUserId: gameState.countingLastUserId,
            oneWordStoryLastUserId: gameState.oneWordStoryLastUserId,
            guessNumberTarget: gameState.guessNumberTarget,
          }
        });
      } catch (err) {
        logger.error('FunAPI', 'Error fetching fun config:', err);
        json(res, 500, { error: 'Erreur lors de la récupération de la configuration fun' });
      }
      return true;
    }

    // PATCH /api/dashboard/guilds/:guildId/fun
    if (parts.length === 5 && method === 'PATCH') {
      try {
        const body = await readJsonBody<{
          funEnabled?: boolean;
          funCountingChannelId?: string | null;
          funOneWordStoryChannelId?: string | null;
          funGuessNumberChannelId?: string | null;
        }>(req);

        if (!body) {
          json(res, 400, { error: 'Corps de requête manquant' });
          return true;
        }

        const updatedGuild = await prisma.guild.update({
          where: { id: guildId },
          data: {
            funEnabled: body.funEnabled,
            funCountingChannelId: body.funCountingChannelId,
            funOneWordStoryChannelId: body.funOneWordStoryChannelId,
            funGuessNumberChannelId: body.funGuessNumberChannelId,
          },
        });

        // Initialize target if Guess the Number is enabled and target is 0
        const { getOrCreateFunGameState } = await import('../../../services/features/funService.js');
        const gameState = await getOrCreateFunGameState(guildId);
        if (body.funGuessNumberChannelId && gameState.guessNumberTarget === 0) {
          const newTarget = Math.floor(Math.random() * 1000) + 1;
          await prisma.funGameState.update({
            where: { guildId },
            data: { guessNumberTarget: newTarget }
          });
        }

        await pushAudit(guildId, {
          user: auditUser,
          action: 'Mise à jour Salons Fun',
          context: getGuildName(client, guildId),
          module: 'Fun',
          eventType: 'Manuel',
          details: `Configuration des salons fun modifiée. Actif: ${updatedGuild.funEnabled}`,
          channelId: null
        });

        const latestState = await prisma.funGameState.findUnique({ where: { guildId } });

        json(res, 200, {
          config: {
            funEnabled: updatedGuild.funEnabled,
            funCountingChannelId: updatedGuild.funCountingChannelId,
            funOneWordStoryChannelId: updatedGuild.funOneWordStoryChannelId,
            funGuessNumberChannelId: updatedGuild.funGuessNumberChannelId,
          },
          gameState: {
            countingCurrent: latestState?.countingCurrent ?? 0,
            countingLastUserId: latestState?.countingLastUserId ?? null,
            oneWordStoryLastUserId: latestState?.oneWordStoryLastUserId ?? null,
            guessNumberTarget: latestState?.guessNumberTarget ?? 0,
          }
        });
      } catch (err) {
        logger.error('FunAPI', 'Error updating fun config:', err);
        json(res, 500, { error: 'Erreur lors de la mise à jour de la configuration fun' });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/fun/counting/reset
    if (parts.length === 7 && parts[5] === 'counting' && parts[6] === 'reset' && method === 'POST') {
      try {
        const { resetCounting } = await import('../../../services/features/funService.js');
        const state = await resetCounting(guildId);

        await pushAudit(guildId, {
          user: auditUser,
          action: 'Réinitialisation Comptage',
          context: getGuildName(client, guildId),
          module: 'Fun',
          eventType: 'Manuel',
          details: `Le comptage a été réinitialisé à 0 depuis le dashboard.`,
          channelId: null
        });

        json(res, 200, {
          success: true,
          gameState: {
            countingCurrent: state.countingCurrent,
            countingLastUserId: state.countingLastUserId,
            oneWordStoryLastUserId: state.oneWordStoryLastUserId,
            guessNumberTarget: state.guessNumberTarget,
          }
        });
      } catch (err) {
        logger.error('FunAPI', 'Error resetting counting:', err);
        json(res, 500, { error: 'Erreur lors de la réinitialisation du comptage' });
      }
      return true;
    }

    // POST /api/dashboard/guilds/:guildId/fun/guess-number/reset
    if (parts.length === 7 && parts[5] === 'guess-number' && parts[6] === 'reset' && method === 'POST') {
      try {
        const { resetGuessNumber } = await import('../../../services/features/funService.js');
        const state = await resetGuessNumber(guildId);

        await pushAudit(guildId, {
          user: auditUser,
          action: 'Réinitialisation Nombre Mystère',
          context: getGuildName(client, guildId),
          module: 'Fun',
          eventType: 'Manuel',
          details: `Un nouveau nombre mystère a été généré depuis le dashboard.`,
          channelId: null
        });

        json(res, 200, {
          success: true,
          gameState: {
            countingCurrent: state.countingCurrent,
            countingLastUserId: state.countingLastUserId,
            oneWordStoryLastUserId: state.oneWordStoryLastUserId,
            guessNumberTarget: state.guessNumberTarget,
          }
        });
      } catch (err) {
        logger.error('FunAPI', 'Error resetting guess target:', err);
        json(res, 500, { error: 'Erreur lors du changement du nombre mystère' });
      }
      return true;
    }
  }

  return false;
}
