import { IncomingMessage, ServerResponse } from 'node:http';
import { Client } from 'discord.js';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { logger } from '../../utils/logger.js';
import {
  json,
  getMissingOAuthConfig,
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_REDIRECT_URI,
  DASHBOARD_URL,
  JWT_SECRET,
} from '../shared.js';

export async function handleAuthRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  parts: string[],
  url: URL,
  client: Client
): Promise<boolean> {
  const method = req.method;

  if (parts[0] !== 'api' || parts[1] !== 'auth') {
    return false;
  }

  if (parts[2] === 'discord') {
    // GET /api/auth/discord/login
    if (parts[3] === 'login' && method === 'GET') {
      const missingOAuth = getMissingOAuthConfig();
      if (missingOAuth.length > 0) {
        json(res, 500, {
          error: 'Configuration OAuth invalide côté serveur.',
          missing: missingOAuth,
        });
        return true;
      }

      const state = crypto.randomBytes(16).toString('hex');
      res.setHeader('Set-Cookie', `kotbo_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`);

      const discordUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI!)}&response_type=code&scope=identify%20guilds&state=${state}`;
      res.writeHead(302, { Location: discordUrl });
      res.end();
      return true;
    }

    // GET /api/auth/discord/callback
    if (parts[3] === 'callback' && method === 'GET') {
      const missingOAuth = getMissingOAuthConfig({ includeSecret: true });
      if (missingOAuth.length > 0) {
        json(res, 500, {
          error: 'Configuration OAuth invalide côté serveur.',
          missing: missingOAuth,
        });
        return true;
      }

      const cookies = req.headers.cookie ? Object.fromEntries(req.headers.cookie.split(';').map(c => c.trim().split('='))) : {};
      const cookieState = cookies['kotbo_oauth_state'];
      const urlState = url.searchParams.get('state');

      if (!cookieState || !urlState || cookieState !== urlState) {
        logger.warn('Auth', 'OAuth state verification failed');
        res.writeHead(302, { Location: `${DASHBOARD_URL}/login?error=invalid_state` });
        res.end();
        return true;
      }

      res.setHeader('Set-Cookie', 'kotbo_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');

      const code = url.searchParams.get('code');
      if (!code) {
        res.writeHead(302, { Location: `${DASHBOARD_URL}/login?error=no_code` });
        res.end();
        return true;
      }

      try {
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
          method: 'POST',
          body: new URLSearchParams({
            client_id: DISCORD_CLIENT_ID!,
            client_secret: DISCORD_CLIENT_SECRET!,
            grant_type: 'authorization_code',
            code,
            redirect_uri: DISCORD_REDIRECT_URI!,
          }),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        const tokenData = await tokenResponse.json() as any;
        if (tokenData.error) throw new Error(tokenData.error_description);

        const userResponse = await fetch('https://discord.com/api/users/@me', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const userData = await userResponse.json() as any;

        const token = jwt.sign({
          userId: userData.id,
          username: userData.username,
          avatar: userData.avatar,
          discordToken: tokenData.access_token
        }, JWT_SECRET, { expiresIn: '7d' });

        res.writeHead(302, { Location: `${DASHBOARD_URL}#token=${token}` });
        res.end();
      } catch (err) {
        logger.error('Auth', 'Discord callback error:', err);
        if (err instanceof Error) {
          logger.error('Auth', `Message: ${err.message}`);
        }
        res.writeHead(302, { Location: `${DASHBOARD_URL}/login?error=auth_failed` });
        res.end();
      }
      return true;
    }
  }

  return false;
}
