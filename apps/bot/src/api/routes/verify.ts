import { IncomingMessage, ServerResponse } from 'node:http';
import { Client } from 'discord.js';
import jwt from 'jsonwebtoken';
import prisma from '../../utils/db.js';
import { logger } from '../../utils/logger.js';
import {
  json,
  getClientIp,
  getMissingOAuthConfig,
  getDiscordClientId,
  getDiscordClientSecret,
  getDashboardUrl,
  getJwtSecret,
  readJsonBody,
  HttpError,
} from '../shared.js';
import {
  getVerificationByToken,
  completeVerification,
} from '../../services/moderation/securityVerificationService.js';

interface VerifyPayload {
  discordToken: string;
}

export async function handleVerifyRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  parts: string[],
  url: URL,
  client: Client,
): Promise<boolean> {
  const method = req.method;

  if (parts[0] !== 'api' || parts[1] !== 'verify') {
    return false;
  }

  // GET /api/verify/:guildId/:token — get verification session info
  if (parts.length === 4 && method === 'GET') {
    const guildId = parts[2];
    const token = parts[3];

    const verification = await getVerificationByToken(token);
    if (!verification || verification.guildId !== guildId) {
      json(res, 404, { error: 'Session de vérification invalide ou expirée.' });
      return true;
    }

    const guild = await client.guilds.fetch(guildId).catch(() => null);
    const guildConfig = await prisma.guild.findUnique({
      where: { id: guildId },
      select: {
        verificationEmbedTitle: true,
        verificationEmbedColor: true,
      },
    });

    json(res, 200, {
      guildId: verification.guildId,
      userId: verification.userId,
      guildName: guild?.name || 'Serveur inconnu',
      guildIcon: guild?.iconURL({ size: 128 }) || null,
      title: guildConfig?.verificationEmbedTitle || 'Vérification de sécurité',
      color: guildConfig?.verificationEmbedColor || '#5865F2',
      expiresAt: verification.expiresAt.toISOString(),
    });
    return true;
  }

  // GET /api/verify/:guildId/:token/oauth — redirect to Discord OAuth for verification
  if (parts.length === 5 && parts[4] === 'oauth' && method === 'GET') {
    const guildId = parts[2];
    const token = parts[3];

    const missingOAuth = getMissingOAuthConfig();
    if (missingOAuth.length > 0) {
      json(res, 500, { error: 'Configuration OAuth invalide.' });
      return true;
    }

    const verification = await getVerificationByToken(token);
    if (!verification || verification.guildId !== guildId) {
      res.writeHead(302, { Location: `${getDashboardUrl()}/verify/${guildId}/${token}?error=expired` });
      res.end();
      return true;
    }

    const VERIFY_REDIRECT_URI = `${getDashboardUrl().replace(/\/$/, '')}/api/verify/callback`;
    const state = Buffer.from(JSON.stringify({ guildId, token })).toString('base64url');

    const discordUrl = `https://discord.com/api/oauth2/authorize?client_id=${getDiscordClientId()}&redirect_uri=${encodeURIComponent(VERIFY_REDIRECT_URI)}&response_type=code&scope=identify&state=${state}`;
    res.writeHead(302, { Location: discordUrl });
    res.end();
    return true;
  }

  // POST /api/verify/:guildId/:token/complete — complete verification with Discord token
  if (parts.length === 5 && parts[4] === 'complete' && method === 'POST') {
    const guildId = parts[2];
    const token = parts[3];
    const ipAddress = getClientIp(req);

    try {
      const body = await readJsonBody<VerifyPayload>(req);
      if (!body?.discordToken) {
        json(res, 400, { error: 'Token Discord requis.' });
        return true;
      }

      // Fetch user identity from Discord with the provided token
      const userResponse = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${body.discordToken}` },
      });

      if (!userResponse.ok) {
        json(res, 401, { error: 'Token Discord invalide.' });
        return true;
      }

      const userData = await userResponse.json() as { id: string; username: string; avatar: string | null };

      const result = await completeVerification({
        token,
        verifiedDiscordId: userData.id,
        ipAddress,
        dashboardUrl: getDashboardUrl(),
        client,
      });

      json(res, result.success ? 200 : 400, result);
    } catch (err) {
      if (err instanceof HttpError) {
        json(res, err.statusCode, { error: err.message });
      } else {
        logger.error('VerifyAPI', 'Erreur lors de la vérification:', err);
        json(res, 500, { error: 'Erreur interne.' });
      }
    }
    return true;
  }

  // GET /api/verify/callback — Discord OAuth callback for verification
  if (parts.length === 4 && parts[2] === 'callback' && method === 'GET') {
    const code = url.searchParams.get('code');
    const stateParam = url.searchParams.get('state');

    if (!code || !stateParam) {
      res.writeHead(302, { Location: `${getDashboardUrl()}/verify?error=missing_params` });
      res.end();
      return true;
    }

    let stateData: { guildId: string; token: string };
    try {
      stateData = JSON.parse(Buffer.from(stateParam, 'base64url').toString('utf-8'));
    } catch {
      res.writeHead(302, { Location: `${getDashboardUrl()}/verify?error=invalid_state` });
      res.end();
      return true;
    }

    const missingOAuth = getMissingOAuthConfig({ includeSecret: true });
    if (missingOAuth.length > 0) {
      res.writeHead(302, { Location: `${getDashboardUrl()}/verify/${stateData.guildId}/${stateData.token}?error=oauth_config` });
      res.end();
      return true;
    }

    const VERIFY_REDIRECT_URI = `${getDashboardUrl().replace(/\/$/, '')}/api/verify/callback`;

    try {
      const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        body: new URLSearchParams({
          client_id: getDiscordClientId()!,
          client_secret: getDiscordClientSecret(),
          grant_type: 'authorization_code',
          code,
          redirect_uri: VERIFY_REDIRECT_URI,
        }),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const tokenData = await tokenResponse.json() as { access_token?: string; error?: string };
      if (tokenData.error || !tokenData.access_token) {
        res.writeHead(302, { Location: `${getDashboardUrl()}/verify/${stateData.guildId}/${stateData.token}?error=oauth_failed` });
        res.end();
        return true;
      }

      // Complete verification using the access token
      const ipAddress = getClientIp(req);
      const userResponse = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userResponse.ok) {
        res.writeHead(302, { Location: `${getDashboardUrl()}/verify/${stateData.guildId}/${stateData.token}?error=user_fetch` });
        res.end();
        return true;
      }

      const userData = await userResponse.json() as { id: string; username: string };

      const result = await completeVerification({
        token: stateData.token,
        verifiedDiscordId: userData.id,
        ipAddress,
        dashboardUrl: getDashboardUrl(),
        client,
      });

      const resultParam = Buffer.from(JSON.stringify(result)).toString('base64url');
      res.writeHead(302, {
        Location: `${getDashboardUrl()}/verify/${stateData.guildId}/${stateData.token}?result=${resultParam}`,
      });
      res.end();
    } catch (err) {
      logger.error('VerifyAPI', 'OAuth callback error:', err);
      res.writeHead(302, { Location: `${getDashboardUrl()}/verify/${stateData.guildId}/${stateData.token}?error=internal` });
      res.end();
    }
    return true;
  }

  // POST /api/verify/:guildId/deploy — deploy verification embed in a channel (staff only)
  if (parts.length === 4 && parts[3] === 'deploy' && method === 'POST') {
    const guildId = parts[2];
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      json(res, 401, { error: 'Non authentifié.' });
      return true;
    }

    let claims: { userId: string };
    try {
      claims = jwt.verify(authHeader.split(' ')[1], getJwtSecret()) as { userId: string };
    } catch {
      json(res, 401, { error: 'Token invalide.' });
      return true;
    }

    try {
      const body = await readJsonBody<{ channelId: string }>(req);
      if (!body?.channelId) {
        json(res, 400, { error: 'channelId requis.' });
        return true;
      }

      const { sendVerificationEmbed } = await import('../../services/moderation/securityVerificationService.js');
      const success = await sendVerificationEmbed(client, guildId, body.channelId, getDashboardUrl());

      if (success) {
        json(res, 200, { success: true, message: 'Embed de vérification envoyé.' });
      } else {
        json(res, 400, { error: "Impossible d\'envoyer l\'embed." });
      }
    } catch (err) {
      if (err instanceof HttpError) {
        json(res, err.statusCode, { error: err.message });
      } else {
        json(res, 500, { error: 'Erreur interne.' });
      }
    }
    return true;
  }

  return false;
}
