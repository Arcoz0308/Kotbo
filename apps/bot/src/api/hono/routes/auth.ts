import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { logger } from '../../../utils/logger.js';
import {
  getMissingOAuthConfig,
  getDiscordClientId,
  getDiscordRedirectUri,
  getDashboardUrl,
  getJwtSecret,
} from '../../shared.js';

export const authRouter = new OpenAPIHono();

const BRIDGE_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script>
(function(){
  var h=window.location.hash.substring(1);
  if(!h){window.location.href='/login?error=no_token';return;}
  var p=new URLSearchParams(h);
  var t=p.get('access_token'),s=p.get('state');
  if(!t||!s){window.location.href='/login?error=no_token';return;}
  fetch('/api/auth/discord/token-exchange',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({access_token:t,state:s}),
    credentials:'same-origin'
  }).then(function(r){return r.json()}).then(function(d){
    window.location.href=d.redirect||'/login?error=auth_failed';
  }).catch(function(){window.location.href='/login?error=auth_failed';});
})();
</script></body></html>`;

function parseCookies(cookieHeader: string): Record<string, string> {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(';').map((s) => {
      const [k, ...v] = s.trim().split('=');
      return [k, v.join('=')];
    }),
  );
}

// ---------------------------------------------------------------------------
// GET /api/auth/discord/login
// ---------------------------------------------------------------------------

const loginRoute = createRoute({
  method:  'get',
  path:    '/api/auth/discord/login',
  summary: 'Démarre le flux OAuth2 Discord (implicit grant)',
  tags:    ['Auth'],
  request: {
    query: z.object({
      returnTo: z.string().optional(),
    }),
  },
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

  const { returnTo } = c.req.valid('query');
  const state = crypto.randomBytes(16).toString('hex');

  c.header(
    'Set-Cookie',
    `kotbo_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`,
  );
  if (returnTo) {
    c.res.headers.append(
      'Set-Cookie',
      `kotbo_oauth_return_to=${encodeURIComponent(returnTo)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`
    );
  }

  const discordUrl = [
    `https://discord.com/api/oauth2/authorize`,
    `?client_id=${getDiscordClientId()}`,
    `&redirect_uri=${encodeURIComponent(getDiscordRedirectUri())}`,
    `&response_type=token`,
    `&scope=identify%20guilds%20openid%20sdk.social_layer`,
    `&state=${state}`,
  ].join('');

  return c.redirect(discordUrl, 302);
});

// ---------------------------------------------------------------------------
// GET /api/auth/discord/callback — bridge page (reads fragment client-side)
// ---------------------------------------------------------------------------

const callbackRoute = createRoute({
  method:  'get',
  path:    '/api/auth/discord/callback',
  summary: 'Bridge page pour le flux implicit grant — lit le fragment côté client',
  tags:    ['Auth'],
  responses: {
    200: { description: 'Page HTML bridge' },
  },
});

authRouter.openapi(callbackRoute, (c) => {
  return c.html(BRIDGE_HTML);
});

// ---------------------------------------------------------------------------
// POST /api/auth/discord/token-exchange — reçoit l'access_token du bridge
// ---------------------------------------------------------------------------

const tokenExchangeRoute = createRoute({
  method:  'post',
  path:    '/api/auth/discord/token-exchange',
  summary: 'Échange l\'access_token Discord implicite contre un JWT Kotbo',
  tags:    ['Auth'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            access_token: z.string().min(1),
            state: z.string().min(1),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'URL de redirection avec JWT',
      content: {
        'application/json': {
          schema: z.object({ redirect: z.string() }),
        },
      },
    },
  },
});

authRouter.openapi(tokenExchangeRoute, async (c) => {
  const missingOAuth = getMissingOAuthConfig();
  if (missingOAuth.length > 0) {
    return c.json({ error: 'Configuration OAuth invalide côté serveur.', missing: missingOAuth }, 500);
  }

  const dashboardUrl = getDashboardUrl();
  const { access_token: accessToken, state: urlState } = c.req.valid('json');

  const cookies = parseCookies(c.req.header('cookie') ?? '');
  const cookieState = cookies['kotbo_oauth_state'];
  const returnTo = cookies['kotbo_oauth_return_to'] ? decodeURIComponent(cookies['kotbo_oauth_return_to']) : '';

  if (!cookieState || cookieState !== urlState) {
    logger.warn('Auth', 'OAuth state CSRF verification failed (token-exchange)');
    return c.json({ redirect: `${dashboardUrl}/login?error=invalid_state` }, 200);
  }

  c.header(
    'Set-Cookie',
    'kotbo_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
  );
  c.res.headers.append(
    'Set-Cookie',
    'kotbo_oauth_return_to=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
  );

  try {
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const userData = await userResponse.json() as {
      id: string;
      username: string;
      avatar: string | null;
      global_name?: string | null;
    };

    if (!userData.id) throw new Error('Discord user fetch failed');

    const token = jwt.sign(
      {
        userId:       userData.id,
        username:     userData.username,
        avatar:       userData.avatar,
        discordToken: accessToken,
      },
      getJwtSecret(),
      { expiresIn: '7d' },
    );

    const returnToUrl = returnTo ? `${returnTo.startsWith('/') ? '' : '/'}${returnTo}` : '';
    return c.json({ redirect: `${dashboardUrl}${returnToUrl}#token=${token}` }, 200);
  } catch (err) {
    logger.error('Auth', 'Token exchange error:', err);
    return c.json({ redirect: `${dashboardUrl}/login?error=auth_failed` }, 200);
  }
});
