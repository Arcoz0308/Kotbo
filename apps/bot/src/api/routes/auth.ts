import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Client } from 'discord.js';
import { json } from '../shared.js';

/**
 * Compatibility endpoint for clients still using the retired implicit grant.
 * All active OAuth routes are implemented by the Hono auth router.
 */
export async function handleAuthRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  parts: string[],
  _url: URL,
  _client: Client,
): Promise<boolean> {
  if (
    parts[0] === 'api' &&
    parts[1] === 'auth' &&
    parts[2] === 'discord' &&
    parts[3] === 'token-exchange' &&
    req.method === 'POST'
  ) {
    json(res, 410, { error: 'Le flux OAuth implicite a été désactivé. Reconnectez-vous avec Discord.' });
    return true;
  }
  return false;
}
