import { IncomingMessage, ServerResponse } from 'node:http';
import { Client } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { json, type AuthClaims, type DashboardAccess } from '../../shared.js';
import { getMarketplaceDashboardData } from '../../../services/economy/marketplaceService.js';

export async function handleMarketplaceRoutes(
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
  if (parts[4] !== 'marketplace') return false;

  // GET /api/dashboard/guilds/:guildId/marketplace
  if (parts.length === 5 && method === 'GET') {
    try {
      const data = await getMarketplaceDashboardData(guildId);
      json(res, 200, data);
    } catch (err) {
      logger.error('MarketplaceAPI', 'Error fetching marketplace data:', err);
      json(res, 500, { error: 'Erreur lors de la récupération des données' });
    }
    return true;
  }

  return false;
}
