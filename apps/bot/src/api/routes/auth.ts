import { IncomingMessage, ServerResponse } from 'node:http';
import { Client } from 'discord.js';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { logger } from '../../utils/logger.js';
import {
  json,
  getMissingOAuthConfig,
  getDiscordClientId,
  getDiscordRedirectUri,
  getDashboardUrl,
  getJwtSecret,
} from '../shared.js';

interface DiscordUserResponse {
  id: string;
  username: string;
  avatar: string | null;
  global_name?: string | null;
}

function parseCookies(req: IncomingMessage): Record<string, string> {
  if (!req.headers.cookie) return {};
  return Object.fromEntries(req.headers.cookie.split(';').map(c => {
    const [k, ...v] = c.trim().split('=');
    return [k, v.join('=')];
  }));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function createBridgeHtml(nonce: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script nonce="${nonce}">
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
}

export async function handleAuthRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  parts: string[],
  url: URL,
  _client: Client
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

      const returnTo = url.searchParams.get('returnTo');
      const state = crypto.randomBytes(16).toString('hex');

      const cookies = [`kotbo_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`];
      if (returnTo) {
        cookies.push(`kotbo_oauth_return_to=${encodeURIComponent(returnTo)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`);
      }
      res.setHeader('Set-Cookie', cookies);

      const discordUrl = `https://discord.com/api/oauth2/authorize?client_id=${getDiscordClientId()}&redirect_uri=${encodeURIComponent(getDiscordRedirectUri())}&response_type=token&scope=identify%20guilds&state=${state}`;
      res.writeHead(302, { Location: discordUrl });
      res.end();
      return true;
    }

    // GET /api/auth/discord/widget-login — OAuth avec scopes widget (sdk.social_layer)
    if (parts[3] === 'widget-login' && method === 'GET') {
      const missingOAuth = getMissingOAuthConfig();
      if (missingOAuth.length > 0) {
        json(res, 500, {
          error: 'Configuration OAuth invalide côté serveur.',
          missing: missingOAuth,
        });
        return true;
      }

      const returnTo = url.searchParams.get('returnTo');
      const state = crypto.randomBytes(16).toString('hex');

      const cookies = [`kotbo_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`];
      if (returnTo) {
        cookies.push(`kotbo_oauth_return_to=${encodeURIComponent(returnTo)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`);
      }
      res.setHeader('Set-Cookie', cookies);

      const discordUrl = `https://discord.com/api/oauth2/authorize?client_id=${getDiscordClientId()}&redirect_uri=${encodeURIComponent(getDiscordRedirectUri())}&response_type=token&scope=identify%20guilds%20openid%20sdk.social_layer&state=${state}`;
      res.writeHead(302, { Location: discordUrl });
      res.end();
      return true;
    }

    // GET /api/auth/discord/callback — bridge page for implicit grant (reads fragment client-side)
    if (parts[3] === 'callback' && method === 'GET') {
      const nonce = crypto.randomBytes(16).toString('base64');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': `default-src 'self'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`,
      });
      res.end(createBridgeHtml(nonce));
      return true;
    }

    // POST /api/auth/discord/token-exchange — receives access_token from bridge page
    if (parts[3] === 'token-exchange' && method === 'POST') {
      const missingOAuth = getMissingOAuthConfig();
      if (missingOAuth.length > 0) {
        json(res, 500, { error: 'Configuration OAuth invalide côté serveur.', missing: missingOAuth });
        return true;
      }

      const dashboardUrl = getDashboardUrl();

      let body: { access_token?: string; state?: string };
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        json(res, 400, { error: 'Corps JSON invalide' });
        return true;
      }

      const { access_token: accessToken, state: urlState } = body;
      if (!accessToken || !urlState) {
        json(res, 400, { redirect: `${dashboardUrl}/login?error=no_token` });
        return true;
      }

      const cookies = parseCookies(req);
      const cookieState = cookies['kotbo_oauth_state'];
      const returnTo = cookies['kotbo_oauth_return_to'] ? decodeURIComponent(cookies['kotbo_oauth_return_to']) : '';

      if (!cookieState || cookieState !== urlState) {
        logger.warn('Auth', 'OAuth state verification failed (token-exchange)');
        json(res, 200, { redirect: `${dashboardUrl}/login?error=invalid_state` });
        return true;
      }

      res.setHeader('Set-Cookie', [
        'kotbo_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
        'kotbo_oauth_return_to=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'
      ]);

      try {
        const userResponse = await fetch('https://discord.com/api/users/@me', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const userData = await userResponse.json() as DiscordUserResponse;

        if (!userData.id) throw new Error('Discord user fetch failed');

        const token = jwt.sign({
          userId: userData.id,
          username: userData.username,
          avatar: userData.avatar,
          discordToken: accessToken,
        }, getJwtSecret(), { expiresIn: '7d' });

        const returnToUrl = returnTo ? `${returnTo.startsWith('/') ? '' : '/'}${returnTo}` : '';
        json(res, 200, { redirect: `${dashboardUrl}${returnToUrl}#token=${token}` });
      } catch (err) {
        logger.error('Auth', 'Token exchange error:', err);
        json(res, 200, { redirect: `${dashboardUrl}/login?error=auth_failed` });
      }
      return true;
    }
  }

  return false;
}
