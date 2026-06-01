import { IncomingMessage, ServerResponse } from 'node:http';
import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import prisma from '../../../utils/db.js';
import { logger } from '../../../utils/logger.js';
import { getOrCreateLevelConfig } from '../../../services/levelingService.js';
import { getOrCreateWelcomeConfig } from '../../../services/welcomeGoodbyeService.js';
import { getOrCreateAutoModConfig, invalidateAutoModCache } from '../../../services/autoModService.js';
import { createGiveaway, endGiveaway, rerollGiveaway } from '../../../services/giveawayService.js';
import { createReactionRoleMenu } from '../../../services/reactionRoleService.js';
import { invalidateAutoResponseCache } from '../../../services/autoResponseService.js';
import { resolveSuggestion } from '../../../services/suggestionService.js';
import { json, readJsonBody, getGuildName, pushAudit, type AuthClaims, type DashboardAccess } from '../../shared.js';

export async function handleGeneralistModulesRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  parts: string[],
  url: URL,
  client: Client,
  user: AuthClaims,
  guildId: string,
  access: DashboardAccess
): Promise<boolean> {
  const method = req.method;
  const moduleKey = parts[4];
  const auditUser = user.username ?? `User${user.userId}`;

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
          take: 100, // Limiter au top 100
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

        // Charger les membres en direct du serveur Discord si possible
        const discordGuild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
        let discordMembers = new Map();
        if (discordGuild && userIds.length > 0) {
          discordMembers = await discordGuild.members.fetch({ user: userIds }).catch(() => new Map());
        }

        const levelsWithUserData = levels.map(l => {
          const profile = profileMap.get(l.userId);
          const discordMember = discordMembers.get(l.userId);

          const username = discordMember?.user.username || profile?.username || null;
          const displayName = discordMember?.displayName || profile?.displayName || profile?.globalName || `Utilisateur ${l.userId}`;
          const avatarUrl = discordMember?.user.displayAvatarURL({ size: 128 }) || profile?.avatarUrl || null;

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

  // 3. WELCOME & GOODBYE ROUTES
  if (moduleKey === 'welcome') {
    // GET /api/dashboard/guilds/:guildId/welcome
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

    // PATCH /api/dashboard/guilds/:guildId/welcome
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
          },
        });

        await pushAudit(guildId, {
          user: auditUser,
          action: 'Mise à jour Accueil/Départ',
          context: getGuildName(client, guildId),
          module: 'WelcomeGoodbye',
          eventType: 'Manuel',
          details: `Modifications appliquées. Envoi accueil: ${config.welcomeEnabled}, Envoi départ: ${config.leaveEnabled}`,
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

  // 5. AUTO-RESPONSES ROUTES
  if (moduleKey === 'auto-responses') {
    // GET /api/dashboard/guilds/:guildId/auto-responses
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

    // POST /api/dashboard/guilds/:guildId/auto-responses
    if (parts.length === 5 && method === 'POST') {
      try {
        const body = await readJsonBody<{
          trigger: string;
          response: string;
          matchType: string;
          enabled?: boolean;
        }>(req);

        if (!body || !body.trigger || !body.response) {
          json(res, 400, { error: 'Déclencheur et réponse requis' });
          return true;
        }

        const autoResponse = await prisma.autoResponse.create({
          data: {
            guildId,
            trigger: body.trigger,
            response: body.response,
            matchType: body.matchType || 'CONTAINS',
            enabled: body.enabled ?? true,
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

    // PATCH /api/dashboard/guilds/:guildId/auto-responses/:id
    if (parts.length === 6 && method === 'PATCH') {
      const id = parts[5];
      try {
        const body = await readJsonBody<{
          trigger?: string;
          response?: string;
          matchType?: string;
          enabled?: boolean;
        }>(req);

        if (!body) {
          json(res, 400, { error: 'Corps de requête manquant' });
          return true;
        }

        const autoResponse = await prisma.autoResponse.update({
          where: { id },
          data: {
            trigger: body.trigger,
            response: body.response,
            matchType: body.matchType,
            enabled: body.enabled,
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

    // DELETE /api/dashboard/guilds/:guildId/auto-responses/:id
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
            bypassRoles: body.bypassRoles,
            bypassChannels: body.bypassChannels,
          },
        });

        invalidateAutoModCache(guildId);

        await pushAudit(guildId, {
          user: auditUser,
          action: 'Mise à jour AutoMod',
          context: getGuildName(client, guildId),
          module: 'AutoMod',
          eventType: 'Manuel',
          details: `Verrous de sécurité mis à jour. Anti-spam: ${config.spamEnabled}, Anti-liens: ${config.linksEnabled}`,
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
        const { getOrCreateFeatureConfigs } = await import('../../../services/dashboardManagementService.js');
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

        const { getOrCreateFeatureConfigs, updateFeatureConfig } = await import('../../../services/dashboardManagementService.js');
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
          embed: {
            title?: string;
            description?: string;
            color?: string;
            thumbnailUrl?: string | null;
            imageUrl?: string | null;
            authorName?: string | null;
            authorIconUrl?: string | null;
            footerText?: string | null;
            footerIconUrl?: string | null;
            fields?: Array<{ name: string; value: string; inline?: boolean }>;
          };
        }>(req);

        if (!body || !body.channelId || !body.embed) {
          json(res, 400, { error: 'Salon et données d\'embed requis' });
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

        // Construire l'embed Discord
        const embed = new EmbedBuilder();
        if (body.embed.title) embed.setTitle(body.embed.title);
        if (body.embed.description) embed.setDescription(body.embed.description);
        if (body.embed.color) embed.setColor(body.embed.color as any);
        if (body.embed.thumbnailUrl) embed.setThumbnail(body.embed.thumbnailUrl);
        if (body.embed.imageUrl) embed.setImage(body.embed.imageUrl);
        
        if (body.embed.authorName) {
          embed.setAuthor({
            name: body.embed.authorName,
            iconURL: body.embed.authorIconUrl || undefined
          });
        }

        if (body.embed.footerText) {
          embed.setFooter({
            text: body.embed.footerText,
            iconURL: body.embed.footerIconUrl || undefined
          });
        }

        if (body.embed.fields && body.embed.fields.length > 0) {
          embed.addFields(body.embed.fields.map(f => ({
            name: f.name || '-',
            value: f.value || '-',
            inline: !!f.inline
          })));
        }

        let messageSent;
        if (body.messageId) {
          // Tenter de modifier un message existant
          const msg = await channel.messages.fetch(body.messageId).catch(() => null);
          if (msg) {
            messageSent = await msg.edit({ embeds: [embed] }).catch(() => null);
          }
        }

        if (!messageSent) {
          // Envoyer un nouveau message
          messageSent = await channel.send({ embeds: [embed] }).catch(() => null);
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

  return false;
}
