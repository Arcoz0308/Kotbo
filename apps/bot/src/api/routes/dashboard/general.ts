import { IncomingMessage, ServerResponse } from 'node:http';
import { Client, ChannelType } from 'discord.js';
import prisma from '../../../utils/db.js';
import { logger } from '../../../utils/logger.js';
import { isGuildActivated, activateGuild } from '../../../utils/activation.js';
import { translate } from '../../../services/translationService.js';
import {
  json,
  readJsonBody,
  getGuildName,
  resolveAdminAccess,
  resolveDashboardAccess,
  getGuildState,
  type AuthClaims,
  type DashboardAccess,
} from '../../shared.js';

export async function handleGeneralRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  parts: string[],
  url: URL,
  client: Client,
  user: AuthClaims
): Promise<boolean> {
  const method = req.method;

  // POST /api/dashboard/translate
  if (parts.length === 3 && parts[2] === 'translate' && method === 'POST') {
    try {
      const body = await readJsonBody<{ text: string; targetLang?: string }>(req);
      if (!body?.text) {
        json(res, 400, { error: 'Texte à traduire requis' });
        return true;
      }
      const translatedText = await translate(body.text, body.targetLang || 'fr');
      json(res, 200, { translatedText });
    } catch (err) {
      logger.error('GeneralAPI', 'Error translating text:', err);
      json(res, 500, { error: 'Erreur lors de la traduction' });
    }
    return true;
  }

  // GET /api/dashboard/guilds
  if (parts.length === 3 && parts[2] === 'guilds' && method === 'GET') {
    try {
      const guilds = await prisma.guild.findMany({
        orderBy: { updatedAt: 'desc' },
        select: { id: true, updatedAt: true }
      });

      const payload: Array<{
        id: string;
        name: string;
        updatedAt: string;
        accessLevel: 'admin' | 'moderator';
        activated: boolean;
      }> = [];

      const isGlobalAdmin = await resolveAdminAccess(client, user.userId);
      for (const guild of guilds) {
        const activated = isGuildActivated(guild.id);
        if (!activated && !isGlobalAdmin) continue;

        const access = await resolveDashboardAccess(client, guild.id, user.userId);
        if (!access.canViewDashboard) continue;

        payload.push({
          id: guild.id,
          name: getGuildName(client, guild.id),
          updatedAt: guild.updatedAt.toISOString(),
          accessLevel: access.level === 'admin' ? 'admin' : 'moderator',
          activated: activated
        });
      }

      json(res, 200, { guilds: payload });
    } catch (err) {
      logger.error('GeneralAPI', 'Error listing guilds:', err);
      json(res, 500, { error: 'Erreur lors de la récupération des serveurs' });
    }
    return true;
  }

  return false;
}

export async function handleGuildGeneralRoutes(
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

  // GET /api/dashboard/guilds/:guildId or /api/dashboard/guilds/:guildId/state
  if ((parts.length === 4 || (parts.length === 5 && parts[4] === 'state')) && method === 'GET') {
    try {
      const state = await getGuildState(client, guildId, access, user.userId);
      if (!state) {
        json(res, 404, { error: 'Guilde introuvable' });
        return true;
      }
      json(res, 200, state);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('GeneralAPI', `Error getting guild state for ${guildId}:`, err);
      const hint = /column|sidebarFavorites|commandRestrictions|channelId/i.test(message)
        ? 'Exécutez les migrations Prisma : bun run db:migrate:deploy'
        : undefined;
      json(res, 500, {
        error: 'Erreur interne de chargement de l\'état de la guilde',
        ...(hint ? { hint } : {}),
      });
    }
    return true;
  }

  // GET /api/dashboard/guilds/:guildId/channels — salons Discord (texte, vocal, catégories)
  if (parts.length === 5 && parts[4] === 'channels' && method === 'GET') {
    try {
      let discordGuild = client.guilds.cache.get(guildId) ?? null;
      if (!discordGuild) {
        discordGuild = await client.guilds.fetch(guildId).catch(() => null) as any;
      }
      if (!discordGuild) {
        json(res, 404, { error: 'Serveur Discord introuvable' });
        return true;
      }
      if (discordGuild.channels.cache.size === 0) {
        await discordGuild.channels.fetch().catch(() => null);
      }
      const allCh = Array.from(discordGuild.channels.cache.values()) as any[];
      const textChannels = allCh
        .filter((ch) => ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement)
        .map((ch) => ({ id: ch.id, name: ch.name, mention: `<#${ch.id}>`, position: ch.rawPosition ?? 0 }))
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'fr'))
        .map(({ id, name, mention }) => ({ id, name, mention }));
      const voiceChannels = allCh
        .filter((ch) => ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice)
        .map((ch) => ({ id: ch.id, name: ch.name, mention: `<#${ch.id}>`, position: ch.rawPosition ?? 0 }))
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'fr'))
        .map(({ id, name, mention }) => ({ id, name, mention }));
      const categories = allCh
        .filter((ch) => ch.type === ChannelType.GuildCategory)
        .map((ch) => ({ id: ch.id, name: ch.name, mention: `<#${ch.id}>`, position: ch.rawPosition ?? 0 }))
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'fr'))
        .map(({ id, name, mention }) => ({ id, name, mention }));

      json(res, 200, { textChannels, voiceChannels, categories });
    } catch (err) {
      logger.error('GeneralAPI', `Error getting guild channels for ${guildId}:`, err);
      json(res, 500, { error: 'Erreur lors de la récupération des salons Discord' });
    }
    return true;
  }

  // POST /api/dashboard/guilds/:guildId/activate - Activate a guild with a code
  if (parts.length === 5 && parts[4] === 'activate' && method === 'POST') {
    try {
      const isGlobalAdmin = await resolveAdminAccess(client, user.userId);
      const canActivate = isGlobalAdmin || access.level === 'admin';
      if (!canActivate) {
        json(res, 403, { error: 'Seuls les administrateurs du serveur ou les administrateurs globaux peuvent activer ce serveur.' });
        return true;
      }

      const body = await readJsonBody<{ code?: string }>(req);
      const rawCode = body?.code?.trim() || '';
      if (!rawCode) {
        json(res, 400, { error: 'Le code d\'activation est requis.' });
        return true;
      }

      const codeRow = await prisma.activationCode.findUnique({
        where: { code: rawCode.toUpperCase() }
      });

      if (!codeRow) {
        json(res, 404, { error: 'Code d\'activation introuvable.' });
        return true;
      }

      if (!codeRow.isActive || codeRow.usedAt) {
        json(res, 400, { error: 'Ce code d\'activation a déjà été utilisé ou est désactivé.' });
        return true;
      }

      await activateGuild(guildId, rawCode);
      json(res, 200, { ok: true, message: 'Le serveur a été activé avec succès.' });
    } catch (err) {
      logger.error('GeneralAPI', `Error activating guild ${guildId}:`, err);
      json(res, 500, { error: 'Erreur lors de l\'activation du serveur.' });
    }
    return true;
  }

  return false;
}
