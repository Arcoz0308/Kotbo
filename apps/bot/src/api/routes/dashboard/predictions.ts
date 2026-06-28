import { IncomingMessage, ServerResponse } from 'node:http';
import { Client } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { json, type AuthClaims, type DashboardAccess } from '../../shared.js';
import { getPredictionData } from '../../../services/analytics/predictionService.js';

export async function handlePredictionRoutes(
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
  if (parts[4] !== 'predictions') return false;

  // GET /api/dashboard/guilds/:guildId/predictions?days=30
  if (parts.length === 5 && method === 'GET') {
    try {
      const days = parseInt(url.searchParams.get('days') ?? '30', 10);
      const data = await getPredictionData(guildId, Math.min(Math.max(days, 7), 90));
      json(res, 200, data);
    } catch (err) {
      logger.error('PredictionsAPI', 'Error fetching predictions:', err);
      json(res, 500, { error: 'Erreur lors de la récupération des prédictions' });
    }
    return true;
  }

  return false;
}
