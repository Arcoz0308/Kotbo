import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { logger } from '../../../utils/logger.js';
import {
  getMissingOAuthConfig,
  getDiscordClientId,
  getDiscordClientSecret,
  getDiscordRedirectUri,
  getDashboardUrl,
  getJwtSecret,
} from '../../shared.js';

export const authRouter = new OpenAPIHono();

// ---------------------------------------------------------------------------
// GET /api/auth/discord/login
// ---------------------------------------------------------------------------

const loginRoute = createRoute({
  method:  'get',
  path:    '/api/auth/discord/login',
  summary: 'Démarre le flux OAuth2 Discord',
  tags:    ['Auth'],
  responses: {
    302: { description: 'Redirection vers Discord OAuth' },
    500: {
      description: 'Configuration OAuth incomplète',
      content: {
        'application/json': {
          schema: z.object({ error: z.string(), missing: z.array(z.string()) }),
        },
      },
    },
  },
});

authRouter.openapi(loginRoute, (c) => {
  const missingOAuth = getMissingOAuthConfig();
  if (missingOAuth.length > 0) {
    return c.json({ error: 'Configuration OAuth invalide côté serveur.', missing: missingOAuth }, 500);
  }

  const state = crypto.randomBytes(16).toString('hex');

  // Pose le cookie CSRF anti-forgery
  c.header(
    'Set-Cookie',
    `kotbo_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`,
  );

  const discordUrl = [
    `https://discord.com/api/oauth2/authorize`,
    `?client_id=${getDiscordClientId()}`,
    `&redirect_uri=${encodeURIComponent(getDiscordRedirectUri())}`,
    `&response_type=code`,
    `&scope=identify%20guilds`,
    `&state=${state}`,
  ].join('');

  return c.redirect(discordUrl, 302);
});

// ---------------------------------------------------------------------------
// GET /api/auth/discord/callback
// ---------------------------------------------------------------------------

const callbackQuerySchema = z.object({
  code:  z.string().min(1, 'Le paramètre code est requis').optional(),
  state: z.string().min(1, 'Le paramètre state est requis').optional(),
  error: z.string().optional(),
});

const callbackRoute = createRoute({
  method:  'get',
  path:    '/api/auth/discord/callback',
  summary: 'Callback OAuth2 Discord — échange le code contre un JWT',
  tags:    ['Auth'],
  request: {
    query: callbackQuerySchema,
  },
  responses: {
    302: { description: 'Redirection vers le dashboard avec token ou erreur' },
    500: {
      description: 'Configuration OAuth incomplète',
      content: {
        'application/json': {
          schema: z.object({ error: z.string(), missing: z.array(z.string()) }),
        },
      },
    },
  },
});

authRouter.openapi(callbackRoute, async (c) => {
  const missingOAuth = getMissingOAuthConfig({ includeSecret: true });
  if (missingOAuth.length > 0) {
    return c.json({ error: 'Configuration OAuth invalide côté serveur.', missing: missingOAuth }, 500);
  }

  const dashboardUrl = getDashboardUrl();
  const { code, state: urlState, error: discordError } = c.req.valid('query');

  // Erreur renvoyée par Discord directement
  if (discordError) {
    logger.warn('Auth', `Discord OAuth error: ${discordError}`);
    return c.redirect(`${dashboardUrl}/login?error=${encodeURIComponent(discordError)}`, 302);
  }

  // Vérification CSRF via cookie state
  const cookieHeader = c.req.header('cookie') ?? '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map((s) => {
      const [k, ...v] = s.trim().split('=');
      return [k, v.join('=')];
    }),
  );
  const cookieState = cookies['kotbo_oauth_state'];

  if (!cookieState || !urlState || cookieState !== urlState) {
    logger.warn('Auth', 'OAuth state CSRF verification failed');
    return c.redirect(`${dashboardUrl}/login?error=invalid_state`, 302);
  }

  // Effacer le cookie state
  c.header(
    'Set-Cookie',
    'kotbo_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
  );

  if (!code) {
    return c.redirect(`${dashboardUrl}/login?error=no_code`, 302);
  }

  try {
    // Échange code → access_token
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id:     getDiscordClientId(),
        client_secret: getDiscordClientSecret(),
        grant_type:    'authorization_code',
        code,
        redirect_uri:  getDiscordRedirectUri(),
      }),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const tokenData = await tokenResponse.json() as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (tokenData.error || !tokenData.access_token) {
      throw new Error(tokenData.error_description ?? tokenData.error ?? 'Token exchange failed');
    }

    // Récupère l'utilisateur Discord
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userResponse.json() as {
      id: string;
      username: string;
      avatar: string | null;
      global_name?: string | null;
    };

    // Signe un JWT interne
    const token = jwt.sign(
      {
        userId:       userData.id,
        username:     userData.username,
        avatar:       userData.avatar,
        discordToken: tokenData.access_token,
      },
      getJwtSecret(),
      { expiresIn: '7d' },
    );

    return c.redirect(`${dashboardUrl}#token=${token}`, 302);
  } catch (err) {
    logger.error('Auth', 'Discord callback error:', err);
    return c.redirect(`${dashboardUrl}/login?error=auth_failed`, 302);
  }
});
