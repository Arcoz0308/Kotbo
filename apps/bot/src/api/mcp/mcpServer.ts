import { IncomingMessage, ServerResponse } from 'node:http';
import { Client } from 'discord.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { json } from '../shared.js';
import { verifyMcpKey, verifyMcpKeyByClientCredentials } from './mcpKeyService.js';
import { registerMcpTools } from './mcpTools.js';

export const mcpRateLimiter = new Map<string, number[]>();

function checkRateLimit(keyId: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const timestamps = (mcpRateLimiter.get(keyId) ?? []).filter((t) => now - t < windowMs);
  if (timestamps.length >= maxRequests) return false;
  timestamps.push(now);
  mcpRateLimiter.set(keyId, timestamps);
  return true;
}

// Parse application/x-www-form-urlencoded body
function parseFormBody(body: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(body).entries());
}

function oauthError(res: ServerResponse, status: number, error: string, description?: string) {
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = status;
  res.end(JSON.stringify({ error, error_description: description ?? error }));
}

export async function handleMCPRoutes(
  req: IncomingMessage & { bodyText?: string },
  res: ServerResponse,
  parts: string[],
  url: URL,
  client: Client
): Promise<boolean> {
  if (parts[0] !== 'api' || parts[1] !== 'mcp') return false;

  const guildId = parts[2];
  if (!guildId) {
    json(res, 400, { error: 'guildId manquant dans le chemin /api/mcp/:guildId' });
    return true;
  }

  const method = req.method ?? 'GET';
  const subPath = parts.slice(3).join('/'); // e.g. "oauth/token", ".well-known/oauth-authorization-server"

  // ── OAuth metadata discovery ───────────────────────────────────────────────
  // GET /api/mcp/:guildId/.well-known/oauth-authorization-server
  if (subPath === '.well-known/oauth-authorization-server' && method === 'GET') {
    const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim() ?? url.protocol.replace(':', '');
    const host = (req.headers['x-forwarded-host'] as string | undefined) ?? url.host;
    const base = `${proto}://${host}/api/mcp/${guildId}`;
    json(res, 200, {
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      grant_types_supported: ['client_credentials'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
      response_types_supported: ['token'],
      scopes_supported: ['mcp'],
    });
    return true;
  }

  // ── OAuth token endpoint ───────────────────────────────────────────────────
  // POST /api/mcp/:guildId/oauth/token
  if (subPath === 'oauth/token' && method === 'POST') {
    const body = req.bodyText ?? '';
    const contentType = req.headers['content-type'] ?? '';

    let clientId: string | undefined;
    let clientSecret: string | undefined;
    let grantType: string | undefined;

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const params = parseFormBody(body);
      clientId = params['client_id'];
      clientSecret = params['client_secret'];
      grantType = params['grant_type'];
    } else if (contentType.includes('application/json')) {
      try {
        const parsed = JSON.parse(body) as Record<string, string>;
        clientId = parsed['client_id'];
        clientSecret = parsed['client_secret'];
        grantType = parsed['grant_type'];
      } catch {
        oauthError(res, 400, 'invalid_request', 'Corps JSON invalide');
        return true;
      }
    } else {
      // Try form-encoded as fallback
      const params = parseFormBody(body);
      clientId = params['client_id'];
      clientSecret = params['client_secret'];
      grantType = params['grant_type'];
    }

    // Also check Authorization header for Basic auth (client_secret_basic)
    if (!clientId || !clientSecret) {
      const authHeader = req.headers['authorization'];
      if (typeof authHeader === 'string' && authHeader.startsWith('Basic ')) {
        const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
        const [id, secret] = decoded.split(':', 2);
        clientId = clientId || id;
        clientSecret = clientSecret || secret;
      }
    }

    if (grantType !== 'client_credentials') {
      oauthError(res, 400, 'unsupported_grant_type', 'Seul client_credentials est supporté');
      return true;
    }
    if (!clientId || !clientSecret) {
      oauthError(res, 400, 'invalid_request', 'client_id et client_secret requis');
      return true;
    }

    const mcpKey = await verifyMcpKeyByClientCredentials(clientId, clientSecret, guildId);
    if (!mcpKey) {
      oauthError(res, 401, 'invalid_client', 'Identifiants invalides ou clé inactive');
      return true;
    }

    // access_token = the raw full key (reused as Bearer on subsequent MCP calls)
    // We don't store it plain — but client_secret IS the full key, so we return it as the token
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({
      access_token: clientSecret, // the full mcp_ key
      token_type: 'Bearer',
      expires_in: 7776000, // 90 days
      scope: 'mcp',
    }));
    return true;
  }

  // ── OAuth authorize endpoint (minimal — spec compliance) ───────────────────
  // GET /api/mcp/:guildId/oauth/authorize
  if (subPath === 'oauth/authorize' && method === 'GET') {
    const redirectUri = url.searchParams.get('redirect_uri');
    const state = url.searchParams.get('state');
    if (redirectUri) {
      const redirect = new URL(redirectUri);
      redirect.searchParams.set('error', 'invalid_request');
      redirect.searchParams.set('error_description', 'Utilise le flow client_credentials sur /oauth/token');
      if (state) redirect.searchParams.set('state', state);
      res.setHeader('Location', redirect.toString());
      res.statusCode = 302;
      res.end();
    } else {
      json(res, 400, { error: 'Ce serveur MCP utilise client_credentials, pas authorization_code.' });
    }
    return true;
  }

  // ── MCP calls ─────────────────────────────────────────────────────────────
  // POST /api/mcp/:guildId  (main JSON-RPC endpoint)
  if (subPath === '' || subPath === undefined) {
    if (method !== 'POST') {
      json(res, 405, { error: 'Méthode non autorisée. Utilisez POST.' });
      return true;
    }

    const authHeader = req.headers['authorization'];
    const rawKey = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : null;

    if (!rawKey) {
      res.setHeader('WWW-Authenticate', `Bearer realm="${guildId}", error="invalid_token"`);
      json(res, 401, { error: 'Clé MCP manquante. Utilisez Authorization: Bearer mcp_...' });
      return true;
    }

    const mcpKey = await verifyMcpKey(rawKey, guildId);
    if (!mcpKey) {
      res.setHeader('WWW-Authenticate', `Bearer realm="${guildId}", error="invalid_token", error_description="Clé invalide ou inactive"`);
      json(res, 401, { error: 'Clé MCP invalide ou inactive.' });
      return true;
    }

    if (!checkRateLimit(mcpKey.id, 100, 60_000)) {
      json(res, 429, { error: 'Trop de requêtes. Limite: 100 req/minute par clé.' });
      return true;
    }

    const server = new McpServer({ name: 'kotbo', version: '1.0.0' });
    registerMcpTools(server, guildId, mcpKey.permissions, client);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    await server.connect(transport);

    let parsedBody: unknown;
    try {
      parsedBody = req.bodyText ? JSON.parse(req.bodyText) : undefined;
    } catch {
      json(res, 400, { error: 'Corps JSON invalide' });
      return true;
    }

    await transport.handleRequest(req, res, parsedBody);
    return true;
  }

  return false;
}
