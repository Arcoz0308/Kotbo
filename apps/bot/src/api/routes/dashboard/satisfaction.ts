import { IncomingMessage, ServerResponse } from 'node:http';
import { Client } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { json, type AuthClaims, type DashboardAccess } from '../../shared.js';
import { getSatisfactionDashboardData } from '../../../services/features/ticketSatisfactionService.js';

export async function handleSatisfactionRoutes(
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
  if (parts[4] !== 'satisfaction') return false;

  // GET /api/dashboard/guilds/:guildId/satisfaction
  if (parts.length === 5 && method === 'GET') {
    try {
      const data = await getSatisfactionDashboardData(guildId, client);
      json(res, 200, data);
    } catch (err) {
      logger.error('SatisfactionAPI', 'Error fetching satisfaction data:', err);
      json(res, 500, { error: 'Erreur lors de la récupération des données' });
    }
    return true;
  }

  return false;
}
