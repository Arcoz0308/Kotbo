import { IncomingMessage, ServerResponse } from 'node:http';
import { Client } from 'discord.js';
import { Prisma } from '@prisma/client';
import prisma from '../../../utils/db.js';
import { logger } from '../../../utils/logger.js';
import { createBackup } from '../../../services/system/backupService.js';
import {
  json,
  readJsonBody,
  resolveDashboardAccess,
  pushAudit,
  type AuthClaims,
} from '../../shared.js';

interface ImportBackupData {
  name?: string | null;
  description?: string | null;
  serverName?: string | null;
  serverIcon?: string | null;
  data?: Prisma.InputJsonValue;
  options?: {
    includeMessages?: boolean;
    includeMembers?: boolean;
    includeRoles?: boolean;
    includeChannels?: boolean;
    includeEmojis?: boolean;
    includeStickers?: boolean;
  } | null;
  stats?: {
    sizeBytes?: number;
    rolesCount?: number;
    channelsCount?: number;
    membersCount?: number;
    messagesCount?: number;
    emojisCount?: number;
    stickersCount?: number;
  } | null;
}

interface ImportDataStructure {
  version?: string | null;
  backup?: ImportBackupData | null;
}

export async function handleBackupRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  parts: string[],
  url: URL,
  client: Client,
  user: AuthClaims
): Promise<boolean> {
  const method = req.method;

  // check if path starts with backups
  if (parts[4] !== 'backups') {
    return false;
  }

  const guildId = parts[3];

  // Vérifier l'accès au dashboard
  const access = await resolveDashboardAccess(client, guildId, user.userId);
  if (!access.canManageSettings) {
    json(res, 403, { error: 'Accès refusé' });
    return true;
  }

  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    json(res, 404, { error: 'Serveur non trouvé' });
    return true;
  }

  // GET /api/dashboard/guilds/:guildId/backups
  if (parts.length === 5 && method === 'GET') {
    try {
      const backups = await prisma.serverBackup.findMany({
        where: { guildId },
        orderBy: { createdAt: 'desc' },
      });
      json(res, 200, backups);
    } catch (error) {
      logger.error('BackupAPI', 'Error fetching backups:', error);
      json(res, 500, { error: 'Erreur lors de la récupération des sauvegardes' });
    }
    return true;
  }

  // POST /api/dashboard/guilds/:guildId/backups
  if (parts.length === 5 && method === 'POST') {
    try {
      const body = await readJsonBody<{
        name?: string;
        description?: string;
        includeMessages?: boolean;
        includeMembers?: boolean;
        includeRoles?: boolean;
        includeChannels?: boolean;
        includeEmojis?: boolean;
        includeStickers?: boolean;
      }>(req);

      if (!body) {
        json(res, 400, { error: 'Corps de la requête invalide' });
        return true;
      }

      const backup = await createBackup(guild, {
        name: body.name || '',
        description: body.description || '',
        includeMessages: body.includeMessages ?? false,
        includeMembers: body.includeMembers ?? true,
        includeRoles: body.includeRoles ?? true,
        includeChannels: body.includeChannels ?? true,
        includeEmojis: body.includeEmojis ?? true,
        includeStickers: body.includeStickers ?? true,
        createdByUserId: user.userId,
        createdByUsername: user.username || 'Unknown',
        createdByTag: '0000',
      });

      await pushAudit(guildId, {
        channelId: null,
        user: user.username || `User${user.userId}`,
        action: 'Création sauvegarde',
        context: body.name || 'Sans nom',
        module: 'Sauvegardes',
        eventType: 'Settings',
        details: `Nom: ${body.name || 'Sans nom'} | Description: ${body.description || 'Aucune'} | Messages: ${body.includeMessages ?? false} | Membres: ${body.includeMembers ?? true} | Rôles: ${body.includeRoles ?? true} | Salons: ${body.includeChannels ?? true} | Émojis: ${body.includeEmojis ?? true} | Stickers: ${body.includeStickers ?? true}`,
      });

      json(res, 200, backup);
    } catch (error) {
      logger.error('BackupAPI', 'Error creating backup:', error);
      json(res, 500, { error: 'Erreur lors de la création de la sauvegarde' });
    }
    return true;
  }

  // DELETE /api/dashboard/guilds/:guildId/backups/:backupId
  if (parts.length === 6 && method === 'DELETE') {
    try {
      const backupId = parts[5];
      const backup = await prisma.serverBackup.findUnique({
        where: { id: backupId },
      });

      if (!backup) {
        json(res, 404, { error: 'Sauvegarde non trouvée' });
        return true;
      }

      if (backup.guildId !== guildId) {
        json(res, 403, { error: 'Cette sauvegarde n\'appartient pas à ce serveur' });
        return true;
      }

      await prisma.serverBackup.delete({
        where: { id: backupId },
      });

      await pushAudit(guildId, {
        channelId: null,
        user: user.username || `User${user.userId}`,
        action: 'Suppression sauvegarde',
        context: backup.name,
        module: 'Sauvegardes',
        eventType: 'Settings',
        details: `Nom: ${backup.name} | Créé par: ${backup.createdByUsername} | Date création: ${backup.createdAt.toISOString()}`,
      });

      json(res, 200, { success: true });
    } catch (error) {
      logger.error('BackupAPI', 'Error deleting backup:', error);
      json(res, 500, { error: 'Erreur lors de la suppression de la sauvegarde' });
    }
    return true;
  }

  // GET /api/dashboard/guilds/:guildId/backups/:backupId/export
  if (parts.length === 7 && parts[6] === 'export' && method === 'GET') {
    try {
      const backupId = parts[5];
      const backup = await prisma.serverBackup.findUnique({
        where: { id: backupId },
      });

      if (!backup) {
        json(res, 404, { error: 'Sauvegarde non trouvée' });
        return true;
      }

      if (backup.guildId !== guildId) {
        json(res, 403, { error: 'Cette sauvegarde n\'appartient pas à ce serveur' });
        return true;
      }

      // Créer l'objet JSON à exporter
      const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        backup: {
          name: backup.name,
          description: backup.description,
          serverName: backup.serverName,
          serverIcon: backup.serverIcon,
          createdByUserId: backup.createdByUserId,
          createdByUsername: backup.createdByUsername,
          createdByTag: backup.createdByTag,
          createdAt: backup.createdAt,
          data: backup.data,
          options: {
            includeMessages: backup.includeMessages,
            includeMembers: backup.includeMembers,
            includeRoles: backup.includeRoles,
            includeChannels: backup.includeChannels,
            includeEmojis: backup.includeEmojis,
            includeStickers: backup.includeStickers,
          },
          stats: {
            rolesCount: backup.rolesCount,
            channelsCount: backup.channelsCount,
            membersCount: backup.membersCount,
            messagesCount: backup.messagesCount,
            emojisCount: backup.emojisCount,
            stickersCount: backup.stickersCount,
            sizeBytes: backup.sizeBytes,
          },
        },
      };

      const jsonString = JSON.stringify(exportData, null, 2);
      const buffer = Buffer.from(jsonString, 'utf-8');

      await pushAudit(guildId, {
        channelId: null,
        user: user.username || `User${user.userId}`,
        action: 'Export sauvegarde',
        context: backup.name,
        module: 'Sauvegardes',
        eventType: 'Settings',
        details: `Nom: ${backup.name} | Taille: ${backup.sizeBytes || 0} bytes | Rôles: ${backup.rolesCount} | Salons: ${backup.channelsCount} | Membres: ${backup.membersCount}`,
      });

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${backup.name.replace(/[^a-zA-Z0-9]/g, '_')}_backup.json"`);
      res.setHeader('Content-Length', buffer.length);
      res.writeHead(200);
      res.end(buffer);
    } catch (error) {
      logger.error('BackupAPI', 'Error exporting backup:', error);
      json(res, 500, { error: 'Erreur lors de l\'export de la sauvegarde' });
    }
    return true;
  }

  // POST /api/dashboard/guilds/:guildId/backups/import
  if (parts.length === 6 && parts[5] === 'import' && method === 'POST') {
    try {
      const body = await readJsonBody<{ file?: string; name?: string }>(req);

      if (!body?.file) {
        json(res, 400, { error: 'Fichier requis' });
        return true;
      }

      // Parser le JSON
      let importData: ImportDataStructure;
      try {
        const parsed = JSON.parse(body.file);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          importData = parsed;
        } else {
          json(res, 400, { error: 'Le fichier JSON est invalide' });
          return true;
        }
      } catch {
        json(res, 400, { error: 'Le fichier JSON est invalide' });
        return true;
      }

      // Valider la structure
      if (!importData.version || !importData.backup) {
        json(res, 400, { error: 'Le fichier de sauvegarde a une structure invalide' });
        return true;
      }

      const backupData = importData.backup;

      // Vérifier le nombre de backups existants
      const existingBackups = await prisma.serverBackup.count({
        where: { guildId, isPreset: false },
      });

      const MAX_BACKUPS_PER_GUILD = 3;
      if (existingBackups >= MAX_BACKUPS_PER_GUILD) {
        json(res, 400, { error: 'Limite de sauvegardes atteinte' });
        return true;
      }

      // Générer le nom du backup
      const backupName = body.name || backupData.name || `Import - ${backupData.serverName || 'Serveur'} - ${new Date().toLocaleDateString('fr-FR')}`;

      // Créer le backup dans la base de données
      const newBackup = await prisma.serverBackup.create({
        data: {
          guildId,
          name: backupName,
          description: backupData.description,
          data: backupData.data !== undefined ? backupData.data : Prisma.JsonNull,
          includeMessages: backupData.options?.includeMessages ?? false,
          includeMembers: backupData.options?.includeMembers ?? true,
          includeRoles: backupData.options?.includeRoles ?? true,
          includeChannels: backupData.options?.includeChannels ?? true,
          includeEmojis: backupData.options?.includeEmojis ?? true,
          includeStickers: backupData.options?.includeStickers ?? true,
          createdByUserId: user.userId,
          createdByUsername: user.username || 'Unknown',
          createdByTag: '0000',
          serverName: backupData.serverName || 'Importé',
          serverIcon: backupData.serverIcon,
          sizeBytes: backupData.stats?.sizeBytes || 0,
          rolesCount: backupData.stats?.rolesCount || 0,
          channelsCount: backupData.stats?.channelsCount || 0,
          membersCount: backupData.stats?.membersCount || 0,
          messagesCount: backupData.stats?.messagesCount || 0,
          emojisCount: backupData.stats?.emojisCount || 0,
          stickersCount: backupData.stats?.stickersCount || 0,
          isPreset: false,
        },
      });

      await pushAudit(guildId, {
        channelId: null,
        user: user.username || `User${user.userId}`,
        action: 'Import sauvegarde',
        context: backupName,
        module: 'Sauvegardes',
        eventType: 'Settings',
        details: `Nom: ${backupName} | Taille: ${backupData.stats?.sizeBytes || 0} bytes | Rôles: ${backupData.stats?.rolesCount || 0} | Salons: ${backupData.stats?.channelsCount || 0} | Membres: ${backupData.stats?.membersCount || 0}`,
      });

      json(res, 200, newBackup);
    } catch (error) {
      logger.error('BackupAPI', 'Error importing backup:', error);
      json(res, 500, { error: 'Erreur lors de l\'import de la sauvegarde' });
    }
    return true;
  }

  return false;
}
