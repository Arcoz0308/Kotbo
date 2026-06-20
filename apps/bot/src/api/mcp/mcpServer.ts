import { IncomingMessage, ServerResponse } from 'node:http';
import { Client } from 'discord.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { json } from '../shared.js';
import { verifyMcpKey } from './mcpKeyService.js';
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

export async function handleMCPRoutes(
  req: IncomingMessage & { bodyText?: string },
  res: ServerResponse,
  parts: string[],
  _url: URL,
  client: Client
): Promise<boolean> {
  if (parts[0] !== 'api' || parts[1] !== 'mcp') return false;

  const guildId = parts[2];
  if (!guildId) {
    json(res, 400, { error: 'guildId manquant dans le chemin /api/mcp/:guildId' });
    return true;
  }

  if (req.method !== 'POST') {
    json(res, 405, { error: 'Méthode non autorisée. Utilisez POST.' });
    return true;
  }

  // Auth
  const authHeader = req.headers['authorization'];
  const rawKey = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : null;

  if (!rawKey) {
    json(res, 401, { error: 'Clé MCP manquante. Utilisez Authorization: Bearer mcp_...' });
    return true;
  }

  const mcpKey = await verifyMcpKey(rawKey, guildId);
  if (!mcpKey) {
    json(res, 401, { error: 'Clé MCP invalide ou inactive.' });
    return true;
  }

  // Rate limit: 100 req/min per key
  if (!checkRateLimit(mcpKey.id, 100, 60_000)) {
    json(res, 429, { error: 'Trop de requêtes. Limite: 100 req/minute par clé.' });
    return true;
  }

  // MCP server (stateless per-request)
  const server = new McpServer({ name: 'kotbo', version: '1.0.0' });
  registerMcpTools(server, guildId, mcpKey.permissions, client);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
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
