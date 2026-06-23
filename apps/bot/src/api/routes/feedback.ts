import { IncomingMessage, ServerResponse } from 'node:http';
import { Client, EmbedBuilder } from 'discord.js';
import prisma from '../../utils/db.js';
import { logger } from '../../utils/logger.js';
import {
  json,
  verifyAuth,
  readJsonBody,
  getClientIp,
  checkRateLimit,
  feedbackReportRateLimiter,
} from '../shared.js';

export async function handleReportFeedbackRoute(
  req: IncomingMessage,
  res: ServerResponse,
  parts: string[],
  url: URL,
  client: Client
): Promise<boolean> {
  const method = req.method;

  if (parts[0] !== 'api' || parts[1] !== 'report-feedback') {
    return false;
  }

  // POST /api/report-feedback
  if (method === 'POST') {
    const ip = getClientIp(req);
    if (!checkRateLimit(feedbackReportRateLimiter, ip, 5, 15 * 60 * 1000)) {
      json(res, 429, { error: 'Trop de retours envoyés. Veuillez réessayer plus tard.' });
      return true;
    }

    try {
      const payload = await readJsonBody<{
        type: 'retour' | 'bloquage' | 'suggestion' | 'autre';
        message: string;
        url: string;
        guildId?: string | null;
      }>(req);

      if (
        !payload ||
        typeof payload.type !== 'string' ||
        !['retour', 'bloquage', 'suggestion', 'autre'].includes(payload.type) ||
        typeof payload.message !== 'string' ||
        payload.message.trim() === '' ||
        typeof payload.url !== 'string' ||
        (payload.guildId !== undefined && payload.guildId !== null && typeof payload.guildId !== 'string')
      ) {
        json(res, 400, { error: 'Payload invalide' });
        return true;
      }

      const messageStr = payload.message.slice(0, 2000);
      const urlStr = payload.url.slice(0, 500);
      const guildIdStr = payload.guildId ? payload.guildId.slice(0, 50) : 'Aucun';

      const allowedOriginPattern = /^(https?:\/\/)?([a-zA-Z0-9-]+\.)*(nathaan\.me|localhost)(:\d+)?(\/.*)?$/;
      if (payload.url && !allowedOriginPattern.test(payload.url)) {
        json(res, 400, { error: 'URL non autorisée' });
        return true;
      }

      const sanitizeMarkdown = (str: string) => str.replace(/`/g, '\\`');

      const user = verifyAuth(req);
      if (!user) {
        json(res, 401, { error: 'Non authentifié' });
        return true;
      }
      const userInfo = `**Utilisateur:** <@${user.userId}> (${user.username} - ID: ${user.userId})`;

      const ownerId = process.env.DISCORD_CLIENT_OWNER_ID;
      const adminsFromDb = await prisma.globalAdmin.findMany({
        select: { userId: true }
      });
      const adminIds = new Set<string>();
      if (ownerId) {
        adminIds.add(ownerId);
      }
      for (const a of adminsFromDb) {
        adminIds.add(a.userId);
      }

      if (adminIds.size === 0) {
        logger.error('Aucun administrateur configuré pour recevoir le retour.');
        json(res, 500, { error: 'Aucun administrateur configuré' });
        return true;
      }

      const typeLabels: Record<string, string> = {
        retour: "📬 Retour d\'expérience",
        bloquage: '🛑 Bloquage / Bug',
        suggestion: "💡 Suggestion d\'amélioration",
        autre: '💬 Autre retour'
      };

      const typeColors: Record<string, number> = {
        retour: 0x3B82F6,      // Blue
        bloquage: 0xEF4444,    // Red
        suggestion: 0x10B981,  // Emerald green
        autre: 0x8B5CF6        // Purple
      };

      const embed = new EmbedBuilder()
        .setTitle(`💬 Nouveau retour : ${typeLabels[payload.type] || payload.type}`)
        .setColor(typeColors[payload.type] || 0x8B5CF6)
        .setTimestamp()
        .addFields(
          { name: '👤 Utilisateur', value: userInfo },
          { name: '🌐 Page / URL', value: `\`${sanitizeMarkdown(urlStr)}\`` },
          { name: '🏰 Serveur sélectionné', value: `\`${sanitizeMarkdown(guildIdStr)}\`` },
          { name: '📝 Message / Description', value: messageStr }
        );

      let sentCount = 0;
      for (const adminId of adminIds) {
        try {
          const adminUser = await client.users.fetch(adminId).catch(() => null);
          if (adminUser) {
            await adminUser.send({ embeds: [embed] });
            sentCount++;
          } else {
            logger.warn('ReportFeedback', `Impossible de trouver l'administrateur avec l'ID ${adminId}`);
          }
        } catch (err: unknown) {
          const errMessage = err instanceof Error ? err.message : String(err);
          logger.error('ReportFeedback', `Erreur lors de l'envoi du retour à l'admin ${adminId}: ${errMessage}`);
        }
      }

      if (sentCount === 0) {
        json(res, 500, { error: "Impossible d\'envoyer le retour aux administrateurs" });
        return true;
      }

      json(res, 200, { success: true });
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : String(err);
      logger.error('ReportFeedback', `Erreur lors de la transmission du retour: ${errMessage}`);
      json(res, 500, { error: 'Erreur lors de la transmission' });
    }
    return true;
  }

  return false;
}
