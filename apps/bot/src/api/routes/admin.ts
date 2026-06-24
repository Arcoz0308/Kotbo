import { IncomingMessage, ServerResponse } from 'node:http';
import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BannedWord } from '@prisma/client';
import prisma from '../../utils/db.js';
import { logger } from '../../utils/logger.js';
import { activateGuild, deactivateGuild } from '../../utils/activation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const servicePath = path.resolve(__dirname, '../../services/analytics/messageScraperService.js');
import {
  json,
  verifyAuth,
  resolveAdminAccess,
  collectShardSnapshots,
  collectShardGuilds,
  loadShardingConfig,
  saveShardingConfig,
  requestContainerRestart,
  requestShardRespawn,
  resolveGuildById,
  normalizeGlobalBannedWord,
  normalizeGlobalBannedWordCategory,
  cleanupGlobalBannedWords,
  getGuildName,
  readJsonBody,
  COLORS,
  ShardSnapshot,
  ShardingMode,
  ShardingConfig,
} from '../shared.js';
import {
  getModuleActivationStats,
  getModuleUsageStats,
  getModulePerformanceStats,
  getModuleStatsSummary,
  KOTBO_MODULES,
  type KotboModule,
} from '../../services/analytics/moduleStatsService.js';

export async function handleAdminRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  parts: string[],
  url: URL,
  client: Client
): Promise<boolean> {
  const method = req.method;

  if (parts[0] !== 'api' || parts[1] !== 'admin') {
    return false;
  }

  const user = verifyAuth(req);
  if (!user) {
    json(res, 401, { error: 'Non authentifié' });
    return true;
  }

  // Verification 1: Is bot admin (needed for all /api/admin endpoints)
  const isBotAdmin = await resolveAdminAccess(client, user.userId);
  if (!isBotAdmin) {
    json(res, 403, { error: 'Accès administrateur requis' });
    return true;
  }

  // GET /api/admin/stats
  if (parts[2] === 'stats' && method === 'GET') {
    try {
      const shardSnapshots = await collectShardSnapshots(client);
      const guilds = await collectShardGuilds(client);
      const guildCount = guilds.length;
      const userCount = guilds.reduce((acc: number, guild: { memberCount: number }) => acc + guild.memberCount, 0);
      const activeSanctions = await prisma.sanction.count({ where: { status: 'ACTIVE' } });
      const dailyAlgoSubmissions = await prisma.dailyAlgoSubmission.count();

      json(res, 200, {
        guildCount,
        userCount,
        activeSanctions,
        dailyAlgoSubmissions,
        uptime: Math.floor(process.uptime()),
        memoryUsage: process.memoryUsage(),
        shardCount: shardSnapshots.length,
        onlineShardCount: shardSnapshots.filter((snapshot) => snapshot.status !== 'offline').length,
        averageShardPing: shardSnapshots.length > 0
          ? Math.round(shardSnapshots.reduce((acc: number, snapshot: ShardSnapshot) => acc + snapshot.ping, 0) / shardSnapshots.length)
          : 0,
      });
    } catch (err) {
      logger.error('AdminAPI', 'Error fetching admin stats:', err);
      json(res, 500, { error: 'Erreur interne du serveur' });
    }
    return true;
  }

  // GET /api/admin/stats/modules - Module statistics
  if (parts[2] === 'stats' && parts[3] === 'modules' && method === 'GET') {
    try {
      const guildId = url.searchParams.get('guildId') || undefined;
      const moduleNameRaw = url.searchParams.get('moduleName') || undefined;
      const moduleName = (moduleNameRaw && (KOTBO_MODULES as readonly string[]).includes(moduleNameRaw)) ? (moduleNameRaw as KotboModule) : undefined;
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
      logger.error('AdminAPI', 'Error fetching module stats:', err);
      json(res, 500, { error: 'Erreur interne du serveur' });
    }
    return true;
  }

  // GET /api/admin/guilds
  if (parts[2] === 'guilds' && parts.length === 3 && method === 'GET') {
    try {
      const dbGuilds = await prisma.guild.findMany({
        select: {
          id: true,
          activated: true,
          activationCode: true,
          statsConfig: true,
        }
      });
      const dbGuildsMap = new Map(dbGuilds.map((guild) => [guild.id, guild] as const));

      const shardGuilds = await collectShardGuilds(client);
      interface ShardGuild {
        id: string;
        name: string;
        icon: string | null;
        memberCount: number;
        joinedAt: string | null;
        shardId: number;
      }
      const guilds = shardGuilds.map((g: ShardGuild) => {
        const dbGuild = dbGuildsMap.get(g.id);
        return {
          id: g.id,
          name: g.name,
          icon: g.icon,
          memberCount: g.memberCount,
          joinedAt: g.joinedAt,
          activated: dbGuild?.activated ?? false,
          activationCode: dbGuild?.activationCode ?? null,
          statsConfig: dbGuild?.statsConfig ?? null,
          shardId: g.shardId ?? 0,
        };
      });

      json(res, 200, { guilds });
    } catch (err) {
      logger.error('AdminAPI', 'Error listing admin guilds:', err);
      json(res, 500, { error: 'Erreur interne du serveur' });
    }
    return true;
  }

  // Shards management
  if (parts[2] === 'shards') {
    // GET /api/admin/shards
    if (method === 'GET' && parts.length === 3) {
      try {
        const config = await loadShardingConfig();
        const shardSnapshots = await collectShardSnapshots(client);
        json(res, 200, {
          config,
          shards: shardSnapshots,
          onlineShardCount: shardSnapshots.filter((snapshot) => snapshot.status !== 'offline').length,
        });
      } catch (err) {
        logger.error('AdminAPI', 'Error loading shards config:', err);
        json(res, 500, { error: 'Erreur interne' });
      }
      return true;
    }

    // POST /api/admin/shards/restart-all
    if (method === 'POST' && parts.length === 4 && parts[3] === 'restart-all') {
      requestContainerRestart();
      json(res, 200, { ok: true, restart: 'container' });
      return true;
    }

    // POST /api/admin/shards/:shardId/restart
    if (method === 'POST' && parts.length === 5 && parts[4] === 'restart') {
      const shardId = Number(parts[3]);
      if (!Number.isInteger(shardId) || shardId < 0) {
        json(res, 400, { error: 'Identifiant de shard invalide.' });
        return true;
      }

      try {
        requestShardRespawn(shardId);
        json(res, 200, { ok: true, restart: 'shard', targetShard: shardId });
      } catch (err) {
        requestContainerRestart();
        json(res, 200, { ok: true, restart: 'container', targetShard: shardId });
      }
      return true;
    }

    // POST /api/admin/shards/reconfigure
    if (method === 'POST' && parts.length === 4 && parts[3] === 'reconfigure') {
      try {
        const body = await readJsonBody<{ mode?: ShardingMode; shardCount?: number }>(req);
        const nextMode: ShardingMode = body?.mode === 'fixed' ? 'fixed' : 'auto';
        const nextShardCount = Number(body?.shardCount);

        if (nextMode === 'fixed' && (!Number.isInteger(nextShardCount) || nextShardCount < 1)) {
          json(res, 400, { error: 'Un nombre de shards supérieur à zéro est requis en mode fixe.' });
          return true;
        }

        const nextConfig: ShardingConfig = {
          mode: nextMode,
          shardCount: nextMode === 'fixed' ? nextShardCount : null,
        };

        await saveShardingConfig(nextConfig);
        json(res, 200, { ok: true, config: nextConfig, restartRequired: true });
        requestContainerRestart();
      } catch (err) {
        logger.error('AdminAPI', 'Error reconfiguring shards:', err);
        json(res, 500, { error: 'Erreur lors de la reconfiguration' });
      }
      return true;
    }
  }

  // Guild specific invite/leave
  if (parts[2] === 'guilds' && parts.length === 5 && (parts[4] === 'invite' || parts[4] === 'leave')) {
    const guildId = parts[3];

    let guildExists = false;
    // Check if guild exists across shards
    if (client.shard) {
      const results = await client.shard.broadcastEval<boolean, string>((c, id) => c.guilds.cache.has(id), { context: guildId });
      guildExists = results.some((r) => r);
    } else {
      guildExists = client.guilds.cache.has(guildId) || !!(await client.guilds.fetch(guildId).catch(() => null));
    }

    if (!guildExists) {
      json(res, 404, { error: 'Serveur introuvable' });
      return true;
    }

    // POST /api/admin/guilds/:guildId/invite
    if (parts[4] === 'invite' && method === 'POST') {
      if (client.shard) {
        const results = await client.shard.broadcastEval<{ error?: string; url?: string } | null, { guildId: string }>(async (shardClient, context) => {
          const guild = shardClient.guilds.cache.get(context.guildId);
          if (!guild) return null;
          const channel = guild.channels.cache.find(c => c.type === 0 && c.permissionsFor(shardClient.user!)?.has('CreateInstantInvite'));
          if (!channel) return { error: 'NO_CHANNEL' };
          try {
            if (channel && 'createInvite' in channel && typeof channel.createInvite === 'function') {
              const invite = await channel.createInvite({ maxAge: 86400, maxUses: 1 });
              return { url: invite.url };
            }
            return { error: 'CREATE_FAILED' };
          } catch {
            return { error: 'CREATE_FAILED' };
          }
        }, { context: { guildId } });

        const result = results.find(r => r !== null);
        if (!result) {
          json(res, 404, { error: 'Serveur introuvable' });
        } else if (result.error === 'NO_CHANNEL') {
          json(res, 400, { error: 'Impossible de créer une invitation (pas de salon textuel ou pas la permission)' });
        } else if (result.error === 'CREATE_FAILED') {
          json(res, 500, { error: "Erreur lors de la création de l'invitation" });
        } else if (result.url) {
          json(res, 200, { url: result.url });
        }
      } else {
        const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
          json(res, 404, { error: 'Serveur introuvable' });
          return true;
        }
        const channel = guild.channels.cache.find(c => c.type === 0 && c.permissionsFor(guild.members.me!)?.has('CreateInstantInvite'));
        if (!channel) {
          json(res, 400, { error: 'Impossible de créer une invitation (pas de salon textuel ou pas la permission)' });
          return true;
        }
        try {
          const invite = await (channel as TextChannel).createInvite({ maxAge: 86400, maxUses: 1 });
          json(res, 200, { url: invite.url });
        } catch (err) {
          json(res, 500, { error: "Erreur lors de la création de l'invitation" });
        }
      }
      return true;
    }

    // POST /api/admin/guilds/:guildId/leave
    if (parts[4] === 'leave' && method === 'POST') {
      if (client.shard) {
        const results = await client.shard.broadcastEval<{ success: boolean } | null, { guildId: string }>(async (shardClient, context) => {
          const guild = shardClient.guilds.cache.get(context.guildId);
          if (!guild) return null;
          try {
            await guild.leave();
            return { success: true };
          } catch {
            return { success: false };
          }
        }, { context: { guildId } });

        const result = results.find(r => r !== null);
        if (!result) {
          json(res, 404, { error: 'Serveur introuvable' });
        } else if (result.success) {
          json(res, 200, { success: true });
        } else {
          json(res, 500, { error: 'Impossible de quitter le serveur' });
        }
      } else {
        const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
          json(res, 404, { error: 'Serveur introuvable' });
          return true;
        }
        try {
          await guild.leave();
          json(res, 200, { success: true });
        } catch (err) {
          json(res, 500, { error: 'Impossible de quitter le serveur' });
        }
      }
      return true;
    }
  }

  // Global Admins CRUD
  if (parts[2] === 'admins') {
    // GET /api/admin/admins
    if (method === 'GET' && parts.length === 3) {
      try {
        const admins = await prisma.globalAdmin.findMany({
          orderBy: { createdAt: 'desc' }
        });
        const enrichedAdmins = await Promise.all(admins.map(async (admin) => {
          try {
            const discordUser = await client.users.fetch(admin.userId);
            return { ...admin, username: discordUser.username, avatarUrl: discordUser.displayAvatarURL() };
          } catch {
            return { ...admin, username: 'Inconnu', avatarUrl: null };
          }
        }));
        json(res, 200, { admins: enrichedAdmins });
      } catch (err) {
        json(res, 500, { error: 'Erreur de base de données' });
      }
      return true;
    }

    // POST /api/admin/admins
    if (method === 'POST' && parts.length === 3) {
      try {
         const body = await readJsonBody<{userId: string}>(req);
         if (!body || !body.userId) {
           json(res, 400, { error: 'ID Discord requis' }); 
           return true;
         }
         try {
            const discordUser = await client.users.fetch(body.userId);
            if (!discordUser) throw new Error();
            await prisma.globalAdmin.upsert({
              where: { userId: body.userId },
              update: {},
              create: { userId: body.userId, addedBy: user.userId }
            });
            json(res, 201, { success: true });
         } catch {
            json(res, 400, { error: 'Utilisateur Discord introuvable' });
         }
      } catch (err) {
        json(res, 500, { error: 'Erreur lors du traitement' });
      }
      return true;
    }

    // DELETE /api/admin/admins/:userId
    if (method === 'DELETE' && parts.length === 4) {
       const targetId = parts[3];
       if (targetId === '457275321171968000') {
         json(res, 403, { error: 'Impossible de supprimer le créateur' }); 
         return true;
       }
       try {
         await prisma.globalAdmin.delete({ where: { userId: targetId } }).catch(() => {});
         json(res, 200, { success: true });
       } catch (err) {
         json(res, 500, { error: 'Erreur de base de données' });
       }
       return true;
    }
  }

  // Global Blacklist CRUD
  if (parts[2] === 'blacklist') {
    // GET /api/admin/blacklist
    if (method === 'GET') {
      try {
        const blacklist = await prisma.globalBlacklist.findMany({
          orderBy: { createdAt: 'desc' }
        });
        const enriched = await Promise.all(blacklist.map(async (entry) => {
          try {
            const discordUser = await client.users.fetch(entry.userId);
            return { ...entry, username: discordUser.username, avatarUrl: discordUser.displayAvatarURL() };
          } catch {
            return { ...entry, username: 'Inconnu', avatarUrl: null };
          }
        }));
        json(res, 200, { blacklist: enriched });
      } catch (err) {
        json(res, 500, { error: 'Erreur de base de données' });
      }
      return true;
    }

    // POST /api/admin/blacklist
    if (method === 'POST') {
      try {
         const body = await readJsonBody<{userId: string, reason?: string}>(req);
         if (!body || !body.userId) {
           json(res, 400, { error: 'ID Discord requis' });
           return true;
         }
         try {
            const discordUser = await client.users.fetch(body.userId);
            if (!discordUser) throw new Error();
            await prisma.globalBlacklist.upsert({
              where: { userId: body.userId },
              update: { reason: body.reason },
              create: { userId: body.userId, reason: body.reason, addedBy: user.userId }
            });

            const blacklistSet: Set<string> = globalThis.KOTBO_BLACKLIST || new Set();
            blacklistSet.add(body.userId);
            globalThis.KOTBO_BLACKLIST = blacklistSet;

            json(res, 201, { success: true });
         } catch (err) {
            logger.error('AdminAPI', 'Error adding to blacklist:', err);
            json(res, 400, { error: 'Utilisateur Discord introuvable' });
         }
      } catch (err) {
        json(res, 500, { error: 'Erreur lors du traitement' });
      }
      return true;
    }

    // DELETE /api/admin/blacklist/:userId
    if (method === 'DELETE' && parts.length === 4) {
       const targetId = parts[3];
       try {
         await prisma.globalBlacklist.delete({ where: { userId: targetId } }).catch(() => {});
         
         const blacklistSet: Set<string> = globalThis.KOTBO_BLACKLIST;
         if (blacklistSet) {
           blacklistSet.delete(targetId);
         }

         json(res, 200, { success: true });
       } catch (err) {
         json(res, 500, { error: 'Erreur de base de données' });
       }
       return true;
    }
  }

  // Global Banned Words (blacklist of nicknames/words across servers)
  if (parts[2] === 'banned-words') {
    // GET /api/admin/banned-words
    if (method === 'GET' && parts.length === 3) {
      try {
        const words = await prisma.bannedWord.findMany({
          where: { guildId: null },
          orderBy: [{ word: 'asc' }],
        });
        json(res, 200, { words });
      } catch (err) {
        json(res, 500, { error: 'Erreur interne' });
      }
      return true;
    }

    // POST /api/admin/banned-words
    if (method === 'POST' && parts.length === 3) {
      try {
        const body = await readJsonBody<{ words?: Array<{ word: string; category?: string; enabled?: boolean }> }>(req);
        const entries = Array.isArray(body?.words) ? body.words : [];

        if (entries.length === 0) {
          json(res, 400, { error: 'Aucun mot à enregistrer' });
          return true;
        }

        const seen = new Map<string, { word: string; category: string; enabled: boolean }>();
        for (const entry of entries) {
          const word = normalizeGlobalBannedWord(entry?.word);
          if (!word) continue;

          if (word.includes('automod') || word.includes('pseudo non conforme')) {
            continue;
          }

          seen.set(word, {
            word,
            category: normalizeGlobalBannedWordCategory(entry?.category),
            enabled: typeof entry?.enabled === 'boolean' ? entry.enabled : true,
          });
        }

        if (seen.size === 0) {
          json(res, 400, { error: 'Aucun mot valide à enregistrer' });
          return true;
        }

        const created: BannedWord[] = [];
        const updated: BannedWord[] = [];

        for (const entry of seen.values()) {
          const existing = await prisma.bannedWord.findFirst({ where: { guildId: null, word: entry.word } });
          if (existing) {
            const next = await prisma.bannedWord.update({
              where: { id: existing.id },
              data: { category: entry.category, enabled: entry.enabled },
            });
            updated.push(next);
          } else {
            const next = await prisma.bannedWord.create({
              data: {
                guildId: null,
                word: entry.word,
                category: entry.category,
                enabled: entry.enabled,
              },
            });
            created.push(next);
          }
        }

        const words = await prisma.bannedWord.findMany({
          where: { guildId: null },
          orderBy: [{ word: 'asc' }],
        });

        json(res, 200, {
          ok: true,
          createdCount: created.length,
          updatedCount: updated.length,
          words,
        });
      } catch (err) {
        logger.error('AdminAPI', 'Error registering banned words:', err);
        json(res, 500, { error: 'Erreur serveur' });
      }
      return true;
    }

    // POST /api/admin/banned-words/cleanup
    if (method === 'POST' && parts.length === 4 && parts[3] === 'cleanup') {
      try {
        const result = await cleanupGlobalBannedWords();
        json(res, 200, { ok: true, ...result });
      } catch (err) {
        logger.error('BannedWordsAPI', 'POST banned-words cleanup error:', err);
        json(res, 500, { error: 'Erreur lors du nettoyage des mots globaux' });
      }
      return true;
    }

    // Operations on a specific banned word
    if (parts.length === 4) {
      const wordId = parts[3];

      // PATCH /api/admin/banned-words/:wordId
      if (method === 'PATCH') {
        try {
          const body = await readJsonBody<{ enabled?: boolean; word?: string; category?: string }>(req);
          const hasEnabled = typeof body?.enabled === 'boolean';
          const hasWord = typeof body?.word === 'string';
          const hasCategory = typeof body?.category === 'string';

          if (!hasEnabled && !hasWord && !hasCategory) {
            json(res, 400, { error: 'Au moins un champ doit être fourni' });
            return true;
          }

          const existing = await prisma.bannedWord.findFirst({ where: { id: wordId, guildId: null } });
          if (!existing) {
            json(res, 404, { error: 'Mot global introuvable' });
            return true;
          }

          const nextWord = hasWord ? normalizeGlobalBannedWord(body.word) : existing.word;
          const nextCategory = hasCategory ? normalizeGlobalBannedWordCategory(body.category) : existing.category;
          const nextEnabled = hasEnabled ? body.enabled : existing.enabled;

          if (!nextWord) {
            json(res, 400, { error: 'Le mot ne peut pas être vide' });
            return true;
          }

          if (nextWord.includes('automod') || nextWord.includes('pseudo non conforme')) {
            json(res, 400, { error: 'Ce mot ne peut pas être banni (réservé par le système de modération)' });
            return true;
          }

          const duplicate = await prisma.bannedWord.findFirst({
            where: {
              guildId: null,
              word: nextWord,
              NOT: { id: wordId },
            },
          });

          if (duplicate) {
            json(res, 409, { error: 'Ce mot global existe déjà' });
            return true;
          }

          const updated = await prisma.bannedWord.update({
            where: { id: wordId },
            data: { word: nextWord, category: nextCategory, enabled: nextEnabled },
          });

          json(res, 200, { ok: true, word: updated });
        } catch (err) {
          logger.error('BannedWordsAPI', 'PATCH global banned-word error:', err);
          json(res, 500, { error: 'Erreur lors de la mise à jour' });
        }
        return true;
      }

      // DELETE /api/admin/banned-words/:wordId
      if (method === 'DELETE') {
        try {
          const existing = await prisma.bannedWord.findFirst({ where: { id: wordId, guildId: null } });
          if (!existing) {
            json(res, 404, { error: 'Mot global introuvable' });
            return true;
          }

          await prisma.bannedWord.delete({ where: { id: wordId } });
          json(res, 200, { ok: true });
        } catch (err) {
          logger.error('BannedWordsAPI', 'DELETE global banned-word error:', err);
          json(res, 500, { error: 'Erreur lors de la suppression' });
        }
        return true;
      }
    }
  }

  // Global Config (Maintenance toggle)
  if (parts[2] === 'config') {
    // GET /api/admin/config
    if (method === 'GET') {
       try {
         const config = await prisma.botGlobalConfig.findUnique({ where: { key: 'MAINTENANCE_MODE' } });
         json(res, 200, { maintenance: config?.value === 'true' });
       } catch (err) {
         json(res, 500, { error: 'Erreur interne' });
       }
       return true;
    }

    // POST /api/admin/config
    if (method === 'POST') {
       try {
         const body = await readJsonBody<{maintenance: boolean}>(req);
         if (!body || typeof body.maintenance !== 'boolean') {
           json(res, 400, { error: 'Valeur maintenance (boolean) requise' }); 
           return true;
         }
         await prisma.botGlobalConfig.upsert({
           where: { key: 'MAINTENANCE_MODE' },
           update: { value: body.maintenance ? 'true' : 'false' },
           create: { key: 'MAINTENANCE_MODE', value: body.maintenance ? 'true' : 'false' }
         });
         globalThis.KOTBO_MAINTENANCE_MODE = body.maintenance;
         json(res, 200, { success: true });
       } catch (err) {
         json(res, 500, { error: 'Erreur de base de données' });
       }
       return true;
    }
  }

  // Bot error logs listing/clear
  if (parts[2] === 'errors') {
    // GET /api/admin/errors
    if (method === 'GET') {
       try {
         const errors = await prisma.botErrorLog.findMany({
           orderBy: { createdAt: 'desc' },
           take: 50
         });
         json(res, 200, { errors });
       } catch (err) {
         json(res, 500, { error: 'Erreur de base de données' });
       }
       return true;
    }

    // DELETE /api/admin/errors
    if (method === 'DELETE') {
       try {
         await prisma.botErrorLog.deleteMany({});
         json(res, 200, { success: true });
       } catch (err) {
         json(res, 500, { error: 'Erreur de base de données' });
       }
       return true;
    }
  }

  // Global announcements broadcast
  if (parts[2] === 'broadcast' && method === 'POST') {
    try {
      const body = await readJsonBody<{message: string}>(req);
      if (!body || !body.message) {
        json(res, 400, { error: 'Message requis' }); 
        return true;
      }
      
      let successCount = 0;
      let failCount = 0;

      if (client.shard) {
        const dbGuilds = await prisma.guild.findMany({
          select: {
            id: true,
            newsChannelId: true,
            publicChannelId: true,
          },
        });
        const guildChannelMap = Object.create(null);
        for (const guild of dbGuilds) {
          guildChannelMap[guild.id] = {
            newsChannelId: guild.newsChannelId,
            publicChannelId: guild.publicChannelId,
          };
        }

        const results = await client.shard.broadcastEval<{ successCount: number; failCount: number }, {
          message: string;
          guildChannelMap: Record<string, { newsChannelId: string | null; publicChannelId: string | null }>;
        }>(async (
          shardClient,
          context
        ) => {
          let shardSuccessCount = 0;
          let shardFailCount = 0;

          for (const [id, guild] of shardClient.guilds.cache) {
            try {
              const dbGuild = context.guildChannelMap?.[id];
              const targetChannelId = dbGuild?.newsChannelId || dbGuild?.publicChannelId;

              let channel;
              if (targetChannelId) {
                channel = guild.channels.cache.get(targetChannelId);
              }

              if (!channel || channel.type !== 0) {
                channel = guild.channels.cache.find((c) => c.type === 0 && c.permissionsFor(shardClient.user!)?.has('SendMessages'));
              }

              if (channel && channel.isTextBased()) {
                const embed = new EmbedBuilder()
                  .setTitle('📢 Annonce Globale Kotbo')
                  .setDescription(context.message)
                  .setColor(COLORS.primary)
                  .setFooter({ text: "Système d'annonce globale" })
                  .setTimestamp();
                await channel.send({ embeds: [embed] });
                shardSuccessCount++;
              } else {
                shardFailCount++;
              }
            } catch {
              shardFailCount++;
            }
          }

          return { successCount: shardSuccessCount, failCount: shardFailCount };
        }, { context: { message: body.message, guildChannelMap } });

        for (const result of results) {
          successCount += result.successCount;
          failCount += result.failCount;
        }
      } else {
        const guilds = client.guilds.cache;
        for (const [id, guild] of guilds) {
          try {
            const dbGuild = await prisma.guild.findUnique({ where: { id } });
            const targetChannelId = dbGuild?.newsChannelId || dbGuild?.publicChannelId;

            let channel;
            if (targetChannelId) {
              channel = guild.channels.cache.get(targetChannelId);
            }

            if (!channel || channel.type !== 0) {
              channel = guild.channels.cache.find(c => c.type === 0 && c.permissionsFor(client.user!)?.has('SendMessages'));
            }

            if (channel && channel.isTextBased()) {
              const embed = new EmbedBuilder()
                .setTitle('📢 Annonce Globale Kotbo')
                .setDescription(body.message)
                .setColor(COLORS.primary)
                .setFooter({ text: "Système d'annonce globale" })
                .setTimestamp();
              await channel.send({ embeds: [embed] });
              successCount++;
            } else {
              failCount++;
            }
          } catch {
            failCount++;
          }
        }
      }
      
      json(res, 200, { success: true, successCount, failCount });
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : String(err);
      logger.error('AdminAPI', `Global announcement broadcast error: ${errMessage}`);
      json(res, 500, { error: 'Erreur de base de données' });
    }
    return true;
  }

  // --- GLOBAL ADMIN CODES AND DEACTIVATION ---
  const isGlobalAdmin = await resolveAdminAccess(client, user.userId);
  if (!isGlobalAdmin) {
    json(res, 403, { error: 'Accès réservé aux administrateurs globaux Kotbo.' });
    return true;
  }

  // GET /api/admin/activation-codes
  if (parts.length === 3 && parts[2] === 'activation-codes' && method === 'GET') {
    try {
      const guildNames = new Map((await collectShardGuilds(client)).map((g: { id: string; name: string }) => [g.id, g.name] as const));
      const codes = await prisma.activationCode.findMany({
        orderBy: { createdAt: 'desc' }
      });
      const enrichedCodes = await Promise.all(codes.map(async (c) => {
        let guildName = null;
        if (c.usedByGuildId) {
          guildName = guildNames.get(c.usedByGuildId) ?? getGuildName(client, c.usedByGuildId);
        }
        return {
          ...c,
          guildName
        };
      }));
      json(res, 200, enrichedCodes);
    } catch (err) {
      logger.error('AdminAPI', 'Erreur lors de la récupération des codes :', err);
      json(res, 500, { error: "Erreur lors de la récupération des codes d'activation." });
    }
    return true;
  }

  // POST /api/admin/activation-codes
  if (parts.length === 3 && parts[2] === 'activation-codes' && method === 'POST') {
    try {
      const code = `KB-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      
      const newCode = await prisma.activationCode.create({
        data: {
          code,
          createdById: user.userId,
          isActive: true
        }
      });

      json(res, 201, newCode);
    } catch (err) {
      logger.error('AdminAPI', "Erreur lors de la création d'un code :", err);
      json(res, 500, { error: "Erreur lors de la création du code d'activation." });
    }
    return true;
  }

  // DELETE /api/admin/activation-codes/:id
  if (parts.length === 4 && parts[2] === 'activation-codes' && method === 'DELETE') {
    const codeId = parts[3];
    try {
      const codeRow = await prisma.activationCode.findUnique({
        where: { id: codeId }
      });

      if (!codeRow) {
        json(res, 404, { error: 'Code introuvable.' });
        return true;
      }

      if (codeRow.usedByGuildId) {
        await deactivateGuild(codeRow.usedByGuildId);
      }

      await prisma.activationCode.delete({
        where: { id: codeId }
      });

      json(res, 200, { ok: true });
    } catch (err) {
      logger.error('AdminAPI', 'Erreur lors de la suppression du code :', err);
      json(res, 500, { error: "Erreur lors de la suppression du code d'activation." });
    }
    return true;
  }

  // POST /api/admin/guilds/:guildId/deactivate
  if (parts.length === 5 && parts[2] === 'guilds' && parts[4] === 'deactivate' && method === 'POST') {
    const guildId = parts[3];
    try {
      await deactivateGuild(guildId);
      json(res, 200, { ok: true, message: 'Le serveur a été désactivé.' });
    } catch (err) {
      logger.error('AdminAPI', 'Erreur lors de la désactivation du serveur :', err);
      json(res, 500, { error: 'Erreur lors de la désactivation du serveur.' });
    }
    return true;
  }

  // POST /api/admin/guilds/:guildId/activate-auto
  if (parts.length === 5 && parts[2] === 'guilds' && parts[4] === 'activate-auto' && method === 'POST') {
    const guildId = parts[3];
    try {
      const code = `KB-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      await prisma.activationCode.create({
        data: {
          code,
          createdById: user.userId,
          isActive: true
        }
      });

      await activateGuild(guildId, code);

      json(res, 200, { ok: true, code, message: 'Le serveur a été activé automatiquement.' });
    } catch (err) {
      logger.error('AdminAPI', 'Erreur lors de la génération et affectation du code :', err);
      json(res, 500, { error: "Erreur lors de l'activation automatique du serveur." });
    }
    return true;
  }

  // POST /api/admin/guilds/:guildId/rescan-stats
  if (parts.length === 5 && parts[2] === 'guilds' && parts[4] === 'rescan-stats' && method === 'POST') {
    const guildId = parts[3];

    // Check if guild exists across shards
    let guildExists = false;
    if (client.shard) {
      const results = await client.shard.broadcastEval<boolean, string>((c, id) => c.guilds.cache.has(id), { context: guildId });
      guildExists = results.some(r => r);
    } else {
      guildExists = client.guilds.cache.has(guildId) || !!(await client.guilds.fetch(guildId).catch(() => null));
    }

    if (!guildExists) {
      json(res, 404, { error: 'Serveur introuvable' });
      return true;
    }

    try {
      const body = await readJsonBody<{ force?: boolean; forcer?: boolean }>(req);
      const force = !!(body?.force || body?.forcer);

      if (client.shard) {
        const results = await client.shard.broadcastEval<{ success: boolean; error?: string } | null, { guildId: string; force: boolean; servicePath: string }>(async (shardClient, context) => {
          const guild = shardClient.guilds.cache.get(context.guildId);
          if (!guild) return null;
          try {
            const { startHistoricalScraping } = await import(context.servicePath);
            await startHistoricalScraping(shardClient, context.guildId, context.force);
            return { success: true };
          } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : String(err) };
          }
        }, { context: { guildId, force, servicePath } });

        const result = results.find(r => r !== null);
        if (!result) {
          json(res, 404, { error: 'Serveur introuvable' });
        } else if (result.success) {
          json(res, 200, { ok: true, message: 'Scraping historique lancé avec succès.' });
        } else {
          json(res, 500, { error: result.error || 'Erreur lors du lancement du scraping' });
        }
      } else {
        const { startHistoricalScraping } = await import('../../services/analytics/messageScraperService.js');
        await startHistoricalScraping(client, guildId, force);
        json(res, 200, { ok: true, message: 'Scraping historique lancé avec succès.' });
      }
    } catch (err) {
      logger.error('AdminAPI', 'POST rescan-stats error:', err);
      json(res, 500, { error: 'Erreur lors du lancement du scraping' });
    }
    return true;
  }

  // ============================================================================
  // WHITE-LABEL INSTANCE MANAGEMENT
  // ============================================================================

  // GET /api/admin/whitelabel — List all instances
  if (parts[2] === 'whitelabel' && parts.length === 3 && method === 'GET') {
    try {
      const instances = await prisma.whiteLabelInstance.findMany({
        include: { _count: { select: { guilds: true } } },
        orderBy: { createdAt: 'desc' },
      });

      const safe = instances.map(inst => ({
        id: inst.id,
        slug: inst.slug,
        name: inst.name,
        enabled: inst.enabled,
        discordClientId: inst.discordClientId,
        dashboardUrl: inst.dashboardUrl,
        apiPort: inst.apiPort,
        brandName: inst.brandName,
        brandColor: inst.brandColor,
        brandLogoUrl: inst.brandLogoUrl,
        brandFaviconUrl: inst.brandFaviconUrl,
        brandFooterText: inst.brandFooterText,
        ownerId: inst.ownerId,
        maxGuilds: inst.maxGuilds,
        guildCount: inst._count.guilds,
        createdAt: inst.createdAt,
        updatedAt: inst.updatedAt,
      }));

      json(res, 200, { instances: safe });
    } catch (err) {
      logger.error('AdminAPI', 'GET whitelabel error:', err);
      json(res, 500, { error: 'Erreur lors de la récupération des instances' });
    }
    return true;
  }

  // POST /api/admin/whitelabel — Create instance
  if (parts[2] === 'whitelabel' && parts.length === 3 && method === 'POST') {
    try {
      const body = await readJsonBody(req);
      if (!body) { json(res, 400, { error: 'Body JSON requis' }); return true; }

      const { slug, name, discordToken, discordClientId, discordClientSecret,
        discordRedirectUri, dashboardUrl, apiPort, brandName, brandColor,
        brandLogoUrl, brandFaviconUrl, brandFooterText, ownerId, maxGuilds } = body;

      if (!slug || !name || !discordToken || !discordClientId || !discordClientSecret || !ownerId) {
        json(res, 400, { error: 'Champs requis: slug, name, discordToken, discordClientId, discordClientSecret, ownerId' });
        return true;
      }

      const existing = await prisma.whiteLabelInstance.findUnique({ where: { slug } });
      if (existing) {
        json(res, 409, { error: `Le slug "${slug}" est déjà utilisé.` });
        return true;
      }

      const instance = await prisma.whiteLabelInstance.create({
        data: {
          slug,
          name,
          discordToken,
          discordClientId,
          discordClientSecret,
          discordRedirectUri: discordRedirectUri || null,
          dashboardUrl: dashboardUrl || null,
          apiPort: apiPort ? Number(apiPort) : null,
          brandName: brandName || null,
          brandColor: brandColor || '#5865F2',
          brandLogoUrl: brandLogoUrl || null,
          brandFaviconUrl: brandFaviconUrl || null,
          brandFooterText: brandFooterText || null,
          ownerId,
          maxGuilds: maxGuilds ? Number(maxGuilds) : 1,
        },
      });

      json(res, 201, { instance: { id: instance.id, slug: instance.slug, name: instance.name } });
    } catch (err) {
      logger.error('AdminAPI', 'POST whitelabel error:', err);
      json(res, 500, { error: 'Erreur lors de la création de l\'instance' });
    }
    return true;
  }

  // GET /api/admin/whitelabel/:id — Get instance details
  if (parts[2] === 'whitelabel' && parts[3] && parts.length === 4 && method === 'GET') {
    try {
      const instance = await prisma.whiteLabelInstance.findUnique({
        where: { id: parts[3] },
        include: {
          guilds: { select: { id: true, activated: true } },
        },
      });

      if (!instance) {
        json(res, 404, { error: 'Instance introuvable' });
        return true;
      }

      json(res, 200, {
        instance: {
          ...instance,
          discordToken: '••••' + instance.discordToken.slice(-6),
          discordClientSecret: '••••' + instance.discordClientSecret.slice(-4),
          jwtSecret: instance.jwtSecret ? '••••' : null,
        },
      });
    } catch (err) {
      logger.error('AdminAPI', 'GET whitelabel/:id error:', err);
      json(res, 500, { error: 'Erreur lors de la récupération de l\'instance' });
    }
    return true;
  }

  // PATCH /api/admin/whitelabel/:id — Update instance
  if (parts[2] === 'whitelabel' && parts[3] && parts.length === 4 && method === 'PATCH') {
    try {
      const body = await readJsonBody(req);
      if (!body) { json(res, 400, { error: 'Body JSON requis' }); return true; }

      const existing = await prisma.whiteLabelInstance.findUnique({ where: { id: parts[3] } });
      if (!existing) {
        json(res, 404, { error: 'Instance introuvable' });
        return true;
      }

      const allowedFields = [
        'name', 'slug', 'enabled', 'discordToken', 'discordClientId',
        'discordClientSecret', 'discordRedirectUri', 'dashboardUrl', 'apiPort',
        'brandName', 'brandColor', 'brandLogoUrl', 'brandFaviconUrl',
        'brandFooterText', 'jwtSecret', 'ownerId', 'maxGuilds',
      ] as const;

      const updateData: Record<string, unknown> = {};
      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          if (field === 'apiPort' || field === 'maxGuilds') {
            updateData[field] = body[field] === null ? null : Number(body[field]);
          } else if (field === 'enabled') {
            updateData[field] = Boolean(body[field]);
          } else {
            updateData[field] = body[field];
          }
        }
      }

      if (updateData.dashboardUrl) {
        try {
          updateData.dashboardOrigin = new URL(updateData.dashboardUrl).origin;
        } catch {
          updateData.dashboardOrigin = updateData.dashboardUrl.replace(/\/$/, '');
        }
      }

      const updated = await prisma.whiteLabelInstance.update({
        where: { id: parts[3] },
        data: updateData,
      });

      json(res, 200, { instance: { id: updated.id, slug: updated.slug, name: updated.name } });
    } catch (err) {
      logger.error('AdminAPI', 'PATCH whitelabel/:id error:', err);
      json(res, 500, { error: 'Erreur lors de la mise à jour de l\'instance' });
    }
    return true;
  }

  // DELETE /api/admin/whitelabel/:id — Delete instance
  if (parts[2] === 'whitelabel' && parts[3] && parts.length === 4 && method === 'DELETE') {
    try {
      const existing = await prisma.whiteLabelInstance.findUnique({
        where: { id: parts[3] },
        include: { _count: { select: { guilds: true } } },
      });

      if (!existing) {
        json(res, 404, { error: 'Instance introuvable' });
        return true;
      }

      if (existing._count.guilds > 0) {
        json(res, 409, { error: `Impossible de supprimer : ${existing._count.guilds} guild(s) rattachée(s). Détachez-les d'abord.` });
        return true;
      }

      await prisma.whiteLabelInstance.delete({ where: { id: parts[3] } });
      json(res, 200, { ok: true });
    } catch (err) {
      logger.error('AdminAPI', 'DELETE whitelabel/:id error:', err);
      json(res, 500, { error: 'Erreur lors de la suppression de l\'instance' });
    }
    return true;
  }

  // POST /api/admin/whitelabel/:id/guilds — Bind a guild to an instance
  if (parts[2] === 'whitelabel' && parts[3] && parts[4] === 'guilds' && parts.length === 5 && method === 'POST') {
    try {
      const body = await readJsonBody(req);
      if (!body?.guildId) { json(res, 400, { error: 'guildId requis' }); return true; }

      const instance = await prisma.whiteLabelInstance.findUnique({
        where: { id: parts[3] },
        include: { _count: { select: { guilds: true } } },
      });

      if (!instance) {
        json(res, 404, { error: 'Instance introuvable' });
        return true;
      }

      if (instance._count.guilds >= instance.maxGuilds) {
        json(res, 409, { error: `Limite atteinte : ${instance.maxGuilds} guild(s) maximum pour cette instance.` });
        return true;
      }

      await prisma.guild.update({
        where: { id: body.guildId },
        data: { instanceId: instance.id },
      });

      json(res, 200, { ok: true });
    } catch (err) {
      logger.error('AdminAPI', 'POST whitelabel/:id/guilds error:', err);
      json(res, 500, { error: 'Erreur lors du rattachement de la guild' });
    }
    return true;
  }

  // DELETE /api/admin/whitelabel/:id/guilds/:guildId — Unbind a guild
  if (parts[2] === 'whitelabel' && parts[3] && parts[4] === 'guilds' && parts[5] && parts.length === 6 && method === 'DELETE') {
    try {
      await prisma.guild.update({
        where: { id: parts[5] },
        data: { instanceId: null },
      });

      json(res, 200, { ok: true });
    } catch (err) {
      logger.error('AdminAPI', 'DELETE whitelabel guild unbind error:', err);
      json(res, 500, { error: 'Erreur lors du détachement de la guild' });
    }
    return true;
  }

  return false;
}
