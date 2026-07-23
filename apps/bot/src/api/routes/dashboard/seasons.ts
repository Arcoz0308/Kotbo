import { IncomingMessage, ServerResponse } from 'node:http';
import { Client } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { json, type AuthClaims, type DashboardAccess } from '../../shared.js';
import {
  getSeasonsDashboardData,
  createSeason,
  startSeason,
  endSeason,
  getSeasonLeaderboard,
} from '../../../services/progression/seasonService.js';

function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(new Error('Invalid JSON')); }
    });
  });
}

export async function handleSeasonRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  parts: string[],
  url: URL,
  client: Client,
  user: AuthClaims,
  guildId: string,
  _access: DashboardAccess,
): Promise<boolean> {
  const method = req.method;
  if (parts[4] !== 'seasons') return false;

  // GET /api/dashboard/guilds/:guildId/seasons
  if (parts.length === 5 && method === 'GET') {
    try {
      const data = await getSeasonsDashboardData(guildId);
      json(res, 200, data);
    } catch (err) {
      logger.error('SeasonsAPI', 'Error fetching seasons:', err);
      json(res, 500, { error: 'Erreur lors de la récupération des saisons' });
    }
    return true;
  }

  // POST /api/dashboard/guilds/:guildId/seasons
  if (parts.length === 5 && method === 'POST') {
    try {
      const body = await parseBody(req) as { name: string; startDate: string; endDate: string; rewards?: any; topRoleId?: string };
      const season = await createSeason(guildId, {
        name: body.name,
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
        rewards: body.rewards,
        topRoleId: body.topRoleId,
      });
      json(res, 201, season);
    } catch (err) {
      logger.error('SeasonsAPI', 'Error creating season:', err);
      json(res, 500, { error: 'Erreur lors de la création' });
    }
    return true;
  }

  // POST /api/dashboard/guilds/:guildId/seasons/:seasonId/start
  if (parts.length === 7 && parts[6] === 'start' && method === 'POST') {
    try {
      const success = await startSeason(guildId, parts[5]);
      json(res, success ? 200 : 400, success ? { ok: true } : { error: 'Impossible de démarrer la saison' });
    } catch (err) {
      logger.error('SeasonsAPI', 'Error starting season:', err);
      json(res, 500, { error: 'Erreur lors du démarrage' });
    }
    return true;
  }

  // POST /api/dashboard/guilds/:guildId/seasons/:seasonId/end
  if (parts.length === 7 && parts[6] === 'end' && method === 'POST') {
    try {
      const success = await endSeason(client, guildId, parts[5]);
      json(res, success ? 200 : 400, success ? { ok: true } : { error: 'Impossible de terminer la saison' });
    } catch (err) {
      logger.error('SeasonsAPI', 'Error ending season:', err);
      json(res, 500, { error: 'Erreur lors de la fin de saison' });
    }
    return true;
  }

  // GET /api/dashboard/guilds/:guildId/seasons/:seasonId/leaderboard
  if (parts.length === 7 && parts[6] === 'leaderboard' && method === 'GET') {
    try {
      const leaderboard = await getSeasonLeaderboard(guildId, parts[5]);
      json(res, 200, { leaderboard });
    } catch (err) {
      logger.error('SeasonsAPI', 'Error fetching leaderboard:', err);
      json(res, 500, { error: 'Erreur lors de la récupération du classement' });
    }
    return true;
  }

  return false;
}
