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
  errorReportRateLimiter,
} from '../shared.js';

export async function handleReportErrorRoute(
  req: IncomingMessage,
  res: ServerResponse,
  parts: string[],
  url: URL,
  client: Client
): Promise<boolean> {
  const method = req.method;

  if (parts[0] !== 'api' || parts[1] !== 'report-error') {
    return false;
  }

  // POST /api/report-error
  if (method === 'POST') {
    const ip = getClientIp(req);
    if (!checkRateLimit(errorReportRateLimiter, ip, 5, 15 * 60 * 1000)) {
      json(res, 429, { error: 'Trop de rapports d\'erreur envoyés. Veuillez réessayer plus tard.' });
      return true;
    }

    try {
      const payload = await readJsonBody<{
        error: any;
        stack?: any;
        url: any;
        userAgent: any;
        guildId?: any;
      }>(req);

      if (
        !payload ||
        typeof payload.error !== 'string' ||
        payload.error.trim() === '' ||
        (payload.stack !== undefined && typeof payload.stack !== 'string') ||
        (payload.url !== undefined && typeof payload.url !== 'string') ||
        (payload.userAgent !== undefined && typeof payload.userAgent !== 'string') ||
        (payload.guildId !== undefined && payload.guildId !== null && typeof payload.guildId !== 'string')
      ) {
        json(res, 400, { error: 'Payload invalide' });
        return true;
      }

      const errorStr = payload.error.slice(0, 1000);
      const stackStr = payload.stack ? payload.stack.slice(0, 2000) : undefined;
      const urlStr = payload.url ? payload.url.slice(0, 500) : 'Inconnu';
      const userAgentStr = payload.userAgent ? payload.userAgent.slice(0, 250) : 'Inconnu';
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
        logger.error('Aucun administrateur configuré pour recevoir le rapport d\'erreur.');
        json(res, 500, { error: 'Aucun administrateur configuré' });
        return true;
      }

      const embed = new EmbedBuilder()
        .setTitle('🚨 Rapport d\'erreur du Dashboard')
        .setColor(0xFF0000)
        .setTimestamp()
        .addFields(
          { name: '👤 Utilisateur', value: userInfo },
          { name: '🌐 Page / URL', value: `\`${sanitizeMarkdown(urlStr)}\`` },
          { name: '💻 Navigateur', value: `\`${sanitizeMarkdown(userAgentStr)}\`` },
          { name: '🏰 Serveur sélectionné (Guild ID)', value: `\`${sanitizeMarkdown(guildIdStr)}\`` },
          { name: '❌ Erreur', value: `\`\`\`\n${sanitizeMarkdown(errorStr)}\n\`\`\`` }
        );

      if (stackStr) {
        embed.addFields({ name: '🥞 Stack Trace', value: `\`\`\`javascript\n${sanitizeMarkdown(stackStr)}\n\`\`\`` });
      }

      let sentCount = 0;
      for (const adminId of adminIds) {
        try {
          const adminUser = await client.users.fetch(adminId).catch(() => null);
          if (adminUser) {
            await adminUser.send({ embeds: [embed] });
            sentCount++;
          } else {
            logger.warn('ReportError', `Impossible de trouver l'administrateur avec l'ID ${adminId}`);
          }
        } catch (err: any) {
          logger.error('ReportError', `Erreur lors de l'envoi du rapport à l'admin ${adminId}: ${err.message}`);
        }
      }

      if (sentCount === 0) {
        json(res, 500, { error: 'Impossible d\'envoyer le rapport aux administrateurs' });
        return true;
      }

      json(res, 200, { success: true });
    } catch (err: any) {
      logger.error('ReportError', `Erreur lors de la transmission du rapport d'erreur: ${err.message}`);
      json(res, 500, { error: 'Erreur lors de la transmission' });
    }
    return true;
  }

  return false;
}
