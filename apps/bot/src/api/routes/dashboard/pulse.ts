import { IncomingMessage, ServerResponse } from 'node:http';
import { Client } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { json, type AuthClaims, type DashboardAccess } from '../../shared.js';
import { getPulseDashboardData, computePulseSnapshot } from '../../../services/analytics/pulseService.js';

export async function handlePulseRoutes(
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
  if (parts[4] !== 'pulse') return false;

  // GET /api/dashboard/guilds/:guildId/pulse
  if (parts.length === 5 && method === 'GET') {
    try {
      const data = await getPulseDashboardData(guildId);
      json(res, 200, data);
    } catch (err) {
      logger.error('PulseAPI', 'Error fetching pulse data:', err);
      json(res, 500, { error: 'Erreur lors de la récupération des données Pulse' });
    }
    return true;
  }

  // POST /api/dashboard/guilds/:guildId/pulse/refresh
  if (parts.length === 6 && parts[5] === 'refresh' && method === 'POST') {
    try {
      await computePulseSnapshot(client, guildId);
      const data = await getPulseDashboardData(guildId);
      json(res, 200, data);
    } catch (err) {
      logger.error('PulseAPI', 'Error refreshing pulse:', err);
      json(res, 500, { error: 'Erreur lors du rafraîchissement' });
    }
    return true;
  }

  return false;
}
