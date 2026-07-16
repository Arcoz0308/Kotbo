import { IncomingMessage, ServerResponse } from 'node:http';
import { Client } from 'discord.js';
import prisma from '../../../utils/db.js';
import { logger } from '../../../utils/logger.js';
import { json, readJsonBody, getGuildName, pushAudit, type AuthClaims, type DashboardAccess } from '../../shared.js';
import { clanTasks, runDistribution, runClear, handleEndSeason } from '../../../services/community/clanService.js';

export async function handleClansRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  parts: string[],
  client: Client,
  user: AuthClaims,
  guildId: string,
  _access: DashboardAccess
): Promise<boolean> {
  const method = req.method;
  const auditUser = `${user.username} (${user.userId})`;

  // Path matches: /api/dashboard/guilds/:guildId/clans/...
  const subAction = parts[5]; // undefined | id | distribute | clear | reset-season

  // GET /api/dashboard/guilds/:guildId/clans
  if (!subAction && method === 'GET') {
    try {
      const guildData = await prisma.guild.findUnique({
        where: { id: guildId },
        select: {
          clansEnabled: true,
          clansUnique: true,
          currentClanSeason: true,
          clanXpFromLevelUp: true,
          clanXpPerLevelUp: true,
          clanAnnouncementChannelId: true,
          clanRewardGiveaway: true,
          clanRewardXpBoost: true,
          clanRewardXpBoostRate: true,
          clanRewardLeaderRole: true,
          lastWinningClanId: true,
          clanSeasonStartsAt: true,
          clanSeasonEndsAt: true,
        },
      });

      if (!guildData) {
        json(res, 404, { error: 'Serveur non trouvé en base de données.' });
        return true;
      }

      const clans = await prisma.clan.findMany({
        where: { guildId },
        orderBy: { name: 'asc' },
      });

      // Calculer dynamiquement le nombre de membres et l'XP de la saison en cours pour chaque clan
      const discordGuild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
      
      const clansWithStats = await Promise.all(
        clans.map(async (clan) => {
          // Nombre de membres réels ayant le rôle actuellement
          const memberCount = discordGuild?.roles.cache.get(clan.roleId)?.members.size ?? 0;

          // Somme des contributions d'XP pour la saison active
          const aggregate = await prisma.clanMemberContribution.aggregate({
            where: {
              guildId,
              clanId: clan.id,
              season: guildData.currentClanSeason,
            },
            _sum: { xp: true },
          });

          return {
            ...clan,
            memberCount,
            totalXp: aggregate._sum.xp ?? 0,
          };
        })
      );

      const taskInProgress = clanTasks.get(guildId) || null;

      json(res, 200, {
        clansEnabled: guildData.clansEnabled,
        clansUnique: guildData.clansUnique,
        currentClanSeason: guildData.currentClanSeason,
        clanXpFromLevelUp: guildData.clanXpFromLevelUp,
        clanXpPerLevelUp: guildData.clanXpPerLevelUp,
        clanAnnouncementChannelId: guildData.clanAnnouncementChannelId,
        clanRewardGiveaway: guildData.clanRewardGiveaway,
        clanRewardXpBoost: guildData.clanRewardXpBoost,
        clanRewardXpBoostRate: guildData.clanRewardXpBoostRate,
        clanRewardLeaderRole: guildData.clanRewardLeaderRole,
        lastWinningClanId: guildData.lastWinningClanId,
        clanSeasonStartsAt: guildData.clanSeasonStartsAt,
        clanSeasonEndsAt: guildData.clanSeasonEndsAt,
        clans: clansWithStats,
        taskInProgress,
      });
    } catch (err) {
      logger.error('ClansAPI', 'Error fetching clans data:', err);
      json(res, 500, { error: 'Erreur lors de la récupération des clans.' });
    }
    return true;
  }

  if (!subAction && method === 'PATCH') {
    try {
      const body = await readJsonBody<{
        clansEnabled?: boolean;
        clansUnique?: boolean;
        clanXpFromLevelUp?: boolean;
        clanXpPerLevelUp?: number;
        clanAnnouncementChannelId?: string | null;
        clanRewardGiveaway?: boolean;
        clanRewardXpBoost?: boolean;
        clanRewardXpBoostRate?: number;
        clanRewardLeaderRole?: boolean;
        clanSeasonStartsAt?: string | null;
        clanSeasonEndsAt?: string | null;
      }>(req);

      const updateData: Record<string, any> = {};
      if (body?.clansEnabled !== undefined) updateData.clansEnabled = body.clansEnabled;
      if (body?.clansUnique !== undefined) updateData.clansUnique = body.clansUnique;
      if (body?.clanXpFromLevelUp !== undefined) updateData.clanXpFromLevelUp = body.clanXpFromLevelUp;
      if (body?.clanXpPerLevelUp !== undefined) {
        if (typeof body.clanXpPerLevelUp !== 'number' || body.clanXpPerLevelUp < 0) {
          json(res, 400, { error: 'Le nombre de points par passage de niveau doit être un entier positif.' });
          return true;
        }
        updateData.clanXpPerLevelUp = Math.floor(body.clanXpPerLevelUp);
      }
      if (body?.clanAnnouncementChannelId !== undefined) updateData.clanAnnouncementChannelId = body.clanAnnouncementChannelId || null;
      if (body?.clanRewardGiveaway !== undefined) updateData.clanRewardGiveaway = body.clanRewardGiveaway;
      if (body?.clanRewardXpBoost !== undefined) updateData.clanRewardXpBoost = body.clanRewardXpBoost;
      if (body?.clanRewardXpBoostRate !== undefined) {
        if (typeof body.clanRewardXpBoostRate !== 'number' || body.clanRewardXpBoostRate < 1.0) {
          json(res, 400, { error: "Le taux de boost d'XP doit être supérieur ou égal à 1.0." });
          return true;
        }
        updateData.clanRewardXpBoostRate = body.clanRewardXpBoostRate;
      }
      if (body?.clanRewardLeaderRole !== undefined) updateData.clanRewardLeaderRole = body.clanRewardLeaderRole;
      if (body?.clanSeasonStartsAt !== undefined) {
        updateData.clanSeasonStartsAt = body.clanSeasonStartsAt ? new Date(body.clanSeasonStartsAt) : null;
      }
      if (body?.clanSeasonEndsAt !== undefined) {
        updateData.clanSeasonEndsAt = body.clanSeasonEndsAt ? new Date(body.clanSeasonEndsAt) : null;
      }

      if (Object.keys(updateData).length === 0) {
        json(res, 400, { error: 'Aucune donnée valide à mettre à jour.' });
        return true;
      }

      const updatedGuild = await prisma.guild.update({
        where: { id: guildId },
        data: updateData,
      });

      await pushAudit(guildId, {
        user: auditUser,
        action: 'Mise à jour configuration Clans',
        context: getGuildName(client, guildId),
        module: 'Clans',
        eventType: 'Manuel',
        details: `Paramètres clans mis à jour. Activé: ${updatedGuild.clansEnabled}, Unique: ${updatedGuild.clansUnique}, XP Level Up: ${updatedGuild.clanXpFromLevelUp} (${updatedGuild.clanXpPerLevelUp} pts)`,
        channelId: null,
      });

      json(res, 200, {
        clansEnabled: updatedGuild.clansEnabled,
        clansUnique: updatedGuild.clansUnique,
        clanXpFromLevelUp: updatedGuild.clanXpFromLevelUp,
        clanXpPerLevelUp: updatedGuild.clanXpPerLevelUp,
        clanAnnouncementChannelId: updatedGuild.clanAnnouncementChannelId,
        clanRewardGiveaway: updatedGuild.clanRewardGiveaway,
        clanRewardXpBoost: updatedGuild.clanRewardXpBoost,
        clanRewardXpBoostRate: updatedGuild.clanRewardXpBoostRate,
        clanRewardLeaderRole: updatedGuild.clanRewardLeaderRole,
        clanSeasonStartsAt: updatedGuild.clanSeasonStartsAt,
        clanSeasonEndsAt: updatedGuild.clanSeasonEndsAt,
      });
    } catch (err) {
      logger.error('ClansAPI', 'Error updating clan settings:', err);
      json(res, 500, { error: 'Erreur lors de la mise à jour de la configuration des clans.' });
    }
    return true;
  }

  // POST /api/dashboard/guilds/:guildId/clans (Create Clan)
  if (!subAction && method === 'POST') {
    try {
      const body = await readJsonBody<{
        name: string;
        description?: string;
        roleId: string;
        generalChannelId?: string | null;
        leaderRoleId?: string | null;
      }>(req);

      if (!body?.name || !body?.roleId) {
        json(res, 400, { error: 'Le nom et le rôle du clan sont requis.' });
        return true;
      }

      // Vérifier si le rôle existe sur Discord
      const discordGuild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
      if (!discordGuild) {
        json(res, 400, { error: 'Serveur introuvable sur Discord.' });
        return true;
      }

      const roleExists = discordGuild.roles.cache.has(body.roleId);
      if (!roleExists) {
        json(res, 400, { error: "Le rôle sélectionné n'existe pas sur ce serveur Discord." });
        return true;
      }

      // Vérifier l'unicité du rôle
      const existingRoleClan = await prisma.clan.findUnique({
        where: { roleId: body.roleId },
      });
      if (existingRoleClan) {
        json(res, 400, { error: 'Ce rôle est déjà assigné à un autre clan.' });
        return true;
      }

      // Créer le clan
      const clan = await prisma.clan.create({
        data: {
          guildId,
          name: body.name,
          description: body.description ?? null,
          roleId: body.roleId,
          generalChannelId: body.generalChannelId ?? null,
          leaderRoleId: body.leaderRoleId ?? null,
        },
      });

      await pushAudit(guildId, {
        user: auditUser,
        action: 'Création de clan',
        context: getGuildName(client, guildId),
        module: 'Clans',
        eventType: 'Manuel',
        details: `Clan "${clan.name}" créé avec le rôle ${clan.roleId}.`,
        channelId: null,
      });

      json(res, 201, { clan });
    } catch (err) {
      logger.error('ClansAPI', 'Error creating clan:', err);
      json(res, 500, { error: 'Erreur lors de la création du clan.' });
    }
    return true;
  }

  // PUT /api/dashboard/guilds/:guildId/clans/:id
  if (subAction && subAction !== 'distribute' && subAction !== 'clear' && subAction !== 'reset-season' && method === 'PUT') {
    try {
      const clanId = subAction;
      const body = await readJsonBody<{
        name: string;
        description?: string;
        roleId: string;
        generalChannelId?: string | null;
        leaderRoleId?: string | null;
      }>(req);

      if (!body?.name || !body?.roleId) {
        json(res, 400, { error: 'Le nom et le rôle du clan sont requis.' });
        return true;
      }

      // Vérifier l'existence du rôle sur Discord
      const discordGuild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
      if (discordGuild && !discordGuild.roles.cache.has(body.roleId)) {
        json(res, 400, { error: "Le rôle sélectionné n'existe pas sur Discord." });
        return true;
      }

      // Vérifier l'unicité du rôle
      const existingRoleClan = await prisma.clan.findFirst({
        where: { roleId: body.roleId, id: { not: clanId } },
      });
      if (existingRoleClan) {
        json(res, 400, { error: 'Ce rôle est déjà attribué à un autre clan.' });
        return true;
      }

      const updatedClan = await prisma.clan.update({
        where: { id: clanId, guildId },
        data: {
          name: body.name,
          description: body.description ?? null,
          roleId: body.roleId,
          generalChannelId: body.generalChannelId ?? null,
          leaderRoleId: body.leaderRoleId ?? null,
        },
      });

      await pushAudit(guildId, {
        user: auditUser,
        action: 'Modification de clan',
        context: getGuildName(client, guildId),
        module: 'Clans',
        eventType: 'Manuel',
        details: `Clan "${updatedClan.name}" mis à jour. Rôle : ${updatedClan.roleId}.`,
        channelId: null,
      });

      json(res, 200, { clan: updatedClan });
    } catch (err) {
      logger.error('ClansAPI', 'Error updating clan:', err);
      json(res, 500, { error: 'Erreur lors de la modification du clan.' });
    }
    return true;
  }

  // DELETE /api/dashboard/guilds/:guildId/clans/:id
  if (subAction && subAction !== 'distribute' && subAction !== 'clear' && subAction !== 'reset-season' && method === 'DELETE') {
    try {
      const clanId = subAction;

      const deletedClan = await prisma.clan.delete({
        where: { id: clanId, guildId },
      });

      await pushAudit(guildId, {
        user: auditUser,
        action: 'Suppression de clan',
        context: getGuildName(client, guildId),
        module: 'Clans',
        eventType: 'Manuel',
        details: `Clan "${deletedClan.name}" supprimé.`,
        channelId: null,
      });

      json(res, 200, { success: true });
    } catch (err) {
      logger.error('ClansAPI', 'Error deleting clan:', err);
      json(res, 500, { error: 'Erreur lors de la suppression du clan.' });
    }
    return true;
  }

  // POST /api/dashboard/guilds/:guildId/clans/distribute (Bulk Random Distribution)
  if (subAction === 'distribute' && method === 'POST') {
    try {
      const message = await runDistribution(guildId, client, auditUser);
      json(res, 200, { message });
    } catch (err: any) {
      logger.error('ClansAPI', 'Error launching distribution:', err);
      json(res, err.message.includes('déjà en cours') || err.message.includes('configurer') ? 400 : 500, { error: err.message });
    }
    return true;
  }

  // POST /api/dashboard/guilds/:guildId/clans/clear (Bulk Remove Clan Roles)
  if (subAction === 'clear' && method === 'POST') {
    try {
      const message = await runClear(guildId, client, auditUser);
      json(res, 200, { message });
    } catch (err: any) {
      logger.error('ClansAPI', 'Error launching clear:', err);
      json(res, err.message.includes('déjà en cours') || err.message.includes('Aucun clan') ? 400 : 500, { error: err.message });
    }
    return true;
  }

  // POST /api/dashboard/guilds/:guildId/clans/reset-season (New Season / Reset)
  if (subAction === 'reset-season' && method === 'POST') {
    try {
      const guild = await prisma.guild.findUnique({
        where: { id: guildId },
        select: { currentClanSeason: true },
      });

      if (!guild) {
        json(res, 404, { error: 'Serveur introuvable.' });
        return true;
      }

      const nextSeason = guild.currentClanSeason + 1;

      // 1. Décerner les bonus, renommer les QG et publier les annonces de fin de saison
      await handleEndSeason(guildId, client, auditUser, guild.currentClanSeason, nextSeason);

      // 2. Mettre à jour la saison en base de données
      await prisma.guild.update({
        where: { id: guildId },
        data: { currentClanSeason: nextSeason },
      });

      await pushAudit(guildId, {
        user: auditUser,
        action: 'Reset Saison de Clans',
        context: getGuildName(client, guildId),
        module: 'Clans',
        eventType: 'Manuel',
        details: `Saison de clan réinitialisée. Nouvelle saison active: ${nextSeason}`,
        channelId: null,
      });

      json(res, 200, { currentClanSeason: nextSeason });
    } catch (err) {
      logger.error('ClansAPI', 'Error resetting clan season:', err);
      json(res, 500, { error: 'Erreur lors de la réinitialisation de la saison.' });
    }
    return true;
  }

  // POST /api/dashboard/guilds/:guildId/clans/points (Add points manually to a clan or a member)
  if (subAction === 'points' && method === 'POST') {
    try {
      const body = await readJsonBody<{
        clanId: string;
        userId?: string | null;
        amount: number;
      }>(req);

      if (!body?.clanId || typeof body.amount !== 'number') {
        json(res, 400, { error: 'Paramètres clanId et amount (nombre) requis.' });
        return true;
      }

      // 1. Vérifier si le clan existe
      const clan = await prisma.clan.findUnique({
        where: { id: body.clanId }
      });
      if (!clan || clan.guildId !== guildId) {
        json(res, 404, { error: 'Clan introuvable pour ce serveur.' });
        return true;
      }

      // 2. Récupérer la saison en cours
      const guild = await prisma.guild.findUnique({
        where: { id: guildId },
        select: { currentClanSeason: true }
      });
      if (!guild) {
        json(res, 404, { error: 'Serveur introuvable.' });
        return true;
      }

      const season = guild.currentClanSeason;
      const targetUserId = body.userId?.trim() || 'system_manual_points';

      // 3. Upsert la contribution
      const contribution = await prisma.clanMemberContribution.upsert({
        where: {
          guildId_clanId_userId_season: {
            guildId,
            clanId: body.clanId,
            userId: targetUserId,
            season,
          }
        },
        update: {
          xp: { increment: body.amount }
        },
        create: {
          guildId,
          clanId: body.clanId,
          userId: targetUserId,
          season,
          xp: body.amount
        }
      });

      await pushAudit(guildId, {
        user: auditUser,
        action: 'Ajout de points de clan',
        context: getGuildName(client, guildId),
        module: 'Clans',
        eventType: 'Manuel',
        details: `Ajout manuel de ${body.amount} XP au clan "${clan.name}"` + (body.userId ? ` pour l'utilisateur ${body.userId}` : ' (global)'),
        channelId: null,
      });

      json(res, 200, { success: true, contribution });
    } catch (err) {
      logger.error('ClansAPI', 'Error adding manual points:', err);
      json(res, 500, { error: 'Erreur lors de l\'ajout de points manuel.' });
    }
    return true;
  }

  return false;
}
