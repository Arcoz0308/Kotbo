import { IncomingMessage, ServerResponse } from 'node:http';
import { Client } from 'discord.js';
import prisma from '../../../utils/db.js';
import { logger } from '../../../utils/logger.js';
import {
  json,
  readJsonBody,
  type AuthClaims,
} from '../../shared.js';
import { fullSyncStaffRoles, autoSetupRoleMappings } from '../../../services/staff/staffServerService.js';

export async function handleStaffServerRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  parts: string[],
  url: URL,
  client: Client,
  user: AuthClaims,
  guildId: string,
): Promise<boolean> {
  const method = req.method;

  if (parts[4] !== 'staff-server') return false;

  // GET /api/dashboard/guilds/:guildId/staff-server
  if (parts.length === 5 && method === 'GET') {
    try {
      const links = await prisma.staffServerLink.findMany({
        where: {
          OR: [{ mainGuildId: guildId }, { staffGuildId: guildId }],
        },
        include: {
          roleMappings: {
            include: { staffRole: true },
          },
          hierarchy: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      const enriched = links.map((l) => {
        const isMain = l.mainGuildId === guildId;
        const otherGuildId = isMain ? l.staffGuildId : l.mainGuildId;
        const otherGuild = client.guilds.cache.get(otherGuildId);
        const mainGuild = client.guilds.cache.get(l.mainGuildId);
        const staffGuild = client.guilds.cache.get(l.staffGuildId);

        return {
          ...l,
          isMain,
          otherGuildId,
          otherGuildName: otherGuild?.name ?? otherGuildId,
          otherGuildIcon: otherGuild?.iconURL() ?? null,
          mainGuildName: mainGuild?.name ?? l.mainGuildId,
          staffGuildName: staffGuild?.name ?? l.staffGuildId,
          roleMappings: l.roleMappings.map((m) => {
            const mainRole = mainGuild?.roles.cache.get(m.mainDiscordRoleId ?? '');
            const staffRole = staffGuild?.roles.cache.get(m.staffDiscordRoleId ?? '');
            return {
              ...m,
              mainRoleName: mainRole?.name ?? m.mainDiscordRoleId,
              mainRoleColor: mainRole?.hexColor ?? null,
              staffRoleName: staffRole?.name ?? m.staffDiscordRoleId,
              staffRoleColor: staffRole?.hexColor ?? null,
            };
          }),
        };
      });

      json(res, 200, enriched);
    } catch (err) {
      logger.error('StaffServerAPI', 'Erreur GET staff-server', err);
      json(res, 500, { error: 'Erreur serveur' });
    }
    return true;
  }

  // POST /api/dashboard/guilds/:guildId/staff-server
  if (parts.length === 5 && method === 'POST') {
    try {
      const body = await readJsonBody(req);
      if (!body?.staffGuildId || !body?.syncMode) {
        json(res, 400, { error: 'staffGuildId et syncMode requis' });
        return true;
      }

      const staffGuild = client.guilds.cache.get(body.staffGuildId);
      if (!staffGuild) {
        json(res, 400, { error: 'Le bot n\'est pas présent sur le serveur staff.' });
        return true;
      }

      const link = await prisma.staffServerLink.create({
        data: {
          mainGuildId: guildId,
          staffGuildId: body.staffGuildId,
          syncMode: body.syncMode,
          hierarchyId: body.hierarchyId ?? null,
          simpleStaffRoleId: body.simpleStaffRoleId ?? null,
          mainLogChannelId: body.mainLogChannelId ?? null,
          staffLogChannelId: body.staffLogChannelId ?? null,
          createdByUserId: user.userId,
        },
        include: { roleMappings: true, hierarchy: true },
      });

      const roleSetup = await autoSetupRoleMappings(link, client);
      const syncResult = await fullSyncStaffRoles(link.id, client);

      const updatedLink = await prisma.staffServerLink.findUnique({
        where: { id: link.id },
        include: { roleMappings: true, hierarchy: true },
      });

      json(res, 201, {
        ...updatedLink,
        autoSetup: roleSetup,
        initialSync: syncResult,
      });
    } catch (err) {
      logger.error('StaffServerAPI', 'Erreur POST staff-server', err);
      json(res, 500, { error: 'Erreur serveur' });
    }
    return true;
  }

  // PATCH /api/dashboard/guilds/:guildId/staff-server/:linkId
  if (parts.length === 6 && method === 'PATCH' && parts[5] !== 'mappings') {
    try {
      const linkId = parts[5];
      const body = await readJsonBody(req);

      const link = await prisma.staffServerLink.findUnique({ where: { id: linkId } });
      if (!link || (link.mainGuildId !== guildId && link.staffGuildId !== guildId)) {
        json(res, 404, { error: 'Lien introuvable' });
        return true;
      }

      const allowedFields = ['syncMode', 'simpleStaffRoleId', 'mainLogChannelId', 'staffLogChannelId', 'enabled'];
      const updateData: Record<string, any> = {};
      for (const field of allowedFields) {
        if (body[field] !== undefined) updateData[field] = body[field];
      }

      const updated = await prisma.staffServerLink.update({
        where: { id: linkId },
        data: updateData,
        include: { roleMappings: true, hierarchy: true },
      });

      json(res, 200, updated);
    } catch (err) {
      logger.error('StaffServerAPI', 'Erreur PATCH staff-server', err);
      json(res, 500, { error: 'Erreur serveur' });
    }
    return true;
  }

  // DELETE /api/dashboard/guilds/:guildId/staff-server/:linkId
  if (parts.length === 6 && method === 'DELETE' && parts[5] !== 'mappings') {
    try {
      const linkId = parts[5];
      const link = await prisma.staffServerLink.findUnique({ where: { id: linkId } });
      if (!link || (link.mainGuildId !== guildId && link.staffGuildId !== guildId)) {
        json(res, 404, { error: 'Lien introuvable' });
        return true;
      }

      await prisma.staffServerLink.delete({ where: { id: linkId } });
      json(res, 200, { ok: true });
    } catch (err) {
      logger.error('StaffServerAPI', 'Erreur DELETE staff-server', err);
      json(res, 500, { error: 'Erreur serveur' });
    }
    return true;
  }

  // POST /api/dashboard/guilds/:guildId/staff-server/:linkId/mappings
  if (parts.length === 7 && parts[6] === 'mappings' && method === 'POST') {
    try {
      const linkId = parts[5];
      const body = await readJsonBody(req);

      const mapping = await prisma.staffServerRoleMapping.create({
        data: {
          staffServerLinkId: linkId,
          staffRoleId: body.staffRoleId ?? null,
          mainDiscordRoleId: body.mainDiscordRoleId ?? null,
          staffDiscordRoleId: body.staffDiscordRoleId ?? null,
        },
      });

      json(res, 201, mapping);
    } catch (err) {
      logger.error('StaffServerAPI', 'Erreur POST mapping', err);
      json(res, 500, { error: 'Erreur serveur' });
    }
    return true;
  }

  // DELETE /api/dashboard/guilds/:guildId/staff-server/:linkId/mappings/:mappingId
  if (parts.length === 8 && parts[6] === 'mappings' && method === 'DELETE') {
    try {
      const mappingId = parts[7];
      await prisma.staffServerRoleMapping.delete({ where: { id: mappingId } });
      json(res, 200, { ok: true });
    } catch (err) {
      logger.error('StaffServerAPI', 'Erreur DELETE mapping', err);
      json(res, 500, { error: 'Erreur serveur' });
    }
    return true;
  }

  // POST /api/dashboard/guilds/:guildId/staff-server/:linkId/sync
  if (parts.length === 7 && parts[6] === 'sync' && method === 'POST') {
    try {
      const linkId = parts[5];
      const result = await fullSyncStaffRoles(linkId, client);
      json(res, 200, result);
    } catch (err) {
      logger.error('StaffServerAPI', 'Erreur sync', err);
      json(res, 500, { error: 'Erreur serveur' });
    }
    return true;
  }

  return false;
}
