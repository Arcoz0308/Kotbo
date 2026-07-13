import { IncomingMessage, ServerResponse } from 'node:http';
import { Client } from 'discord.js';
import prisma from '../../../utils/db.js';
import { logger } from '../../../utils/logger.js';
import { json, readJsonBody, getGuildName, pushAudit, type AuthClaims, type DashboardAccess } from '../../shared.js';
import { clanTasks, runDistribution, runClear } from '../../../services/community/clanService.js';

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
        clans: clansWithStats,
        taskInProgress,
      });
    } catch (err) {
      logger.error('ClansAPI', 'Error fetching clans data:', err);
      json(res, 500, { error: 'Erreur lors de la récupération des clans.' });
    }
    return true;
  }

  // PATCH /api/dashboard/guilds/:guildId/clans (Update Settings)
  if (!subAction && method === 'PATCH') {
    try {
      const body = await readJsonBody<{
        clansEnabled?: boolean;
        clansUnique?: boolean;
      }>(req);

      const updateData: Record<string, any> = {};
      if (body?.clansEnabled !== undefined) updateData.clansEnabled = body.clansEnabled;
      if (body?.clansUnique !== undefined) updateData.clansUnique = body.clansUnique;

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
        details: `Paramètres clans mis à jour. Activé: ${updatedGuild.clansEnabled}, Unique: ${updatedGuild.clansUnique}`,
        channelId: null,
      });

      json(res, 200, {
        clansEnabled: updatedGuild.clansEnabled,
        clansUnique: updatedGuild.clansUnique,
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

  return false;
}
