import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { Client } from 'discord.js';
import prisma from '../../../../utils/db.js';
import { logger } from '../../../../utils/logger.js';
import { getWidgetStats } from '../../../../services/integrations/widgetService.js';

// Rate limiter mémoire par token (les widgets externes pollent périodiquement)
const widgetRateLimiter = new Map<string, number[]>();
const LIMIT_WINDOW = 5 * 60 * 1000; // 5 minutes
const LIMIT_MAX = 30;

const TOKEN_PATTERN = /^wgt_[a-f0-9]{48}$/;

// ===========================================================================
// Schemas
// ===========================================================================

const WidgetStatsResponseSchema = z.object({
  server: z.object({
    name: z.string(),
    iconUrl: z.string(),
    memberCount: z.number(),
    inviteUrl: z.string(),
    inviteImageUrl: z.string(),
  }),
  user: z.object({
    username: z.string(),
    staffRank: z.string(),
    staffSince: z.string(),
    level: z.number(),
    messageCount: z.number(),
    voiceMinutes: z.number(),
    staffScore: z.number(),
  }),
  updatedAt: z.string(),
});

const ErrorSchema = z.object({ error: z.string() });

// ===========================================================================
// Route Definition
// ===========================================================================

const getWidgetDataRoute = createRoute({
  method: 'get',
  path: '/api/public/widget-data',
  summary: 'Widget stats for external widgets (Scriptable iOS, KWGT Android, Windows 11/Edge PWA widget)',
  tags: ['PublicWidget'],
  request: {
    query: z.object({
      token: z.string().optional().openapi({ description: 'Widget token (alternative to the Authorization: Bearer header for clients that cannot set headers, e.g. KWGT)' }),
    }),
  },
  responses: {
    200: {
      description: 'Widget stats successfully retrieved',
      content: { 'application/json': { schema: WidgetStatsResponseSchema } },
    },
    401: {
      description: 'Missing or invalid widget token',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    404: {
      description: 'Staff member or guild no longer available',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    429: {
      description: 'Too many requests for this token',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    500: {
      description: 'Internal server error',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
});

// ===========================================================================
// Router Factory
// ===========================================================================

export function createPublicWidgetDataRouter(_client: Client) {
  const router = new OpenAPIHono();

  router.openapi(getWidgetDataRoute, async (c) => {
    // Token via header Authorization: Bearer (Scriptable, service worker)
    // ou ?token= (KWGT et autres clients sans support des headers)
    const authHeader = c.req.header('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    const token = bearerToken ?? c.req.valid('query').token ?? null;

    if (!token || !TOKEN_PATTERN.test(token)) {
      return c.json({ error: 'Token de widget manquant ou invalide' }, 401);
    }

    // Rate limiting par token
    const now = Date.now();
    const timestamps = (widgetRateLimiter.get(token) ?? []).filter((t) => now - t < LIMIT_WINDOW);
    if (timestamps.length >= LIMIT_MAX) {
      return c.json({ error: 'Trop de requêtes, réessaie dans quelques minutes' }, 429);
    }
    timestamps.push(now);
    widgetRateLimiter.set(token, timestamps);
    if (Math.random() < 0.05) {
      for (const [key, list] of widgetRateLimiter.entries()) {
        if (list.every((t) => now - t >= LIMIT_WINDOW)) widgetRateLimiter.delete(key);
      }
    }

    try {
      const subscription = await prisma.widgetSubscription.findUnique({ where: { token } });
      if (!subscription || !subscription.enabled) {
        return c.json({ error: 'Token de widget manquant ou invalide' }, 401);
      }

      const stats = await getWidgetStats(subscription.guildId, subscription.userId);
      if (!stats) {
        return c.json({ error: 'Membre staff introuvable ou serveur inaccessible' }, 404);
      }

      c.header('Cache-Control', 'private, max-age=300');
      return c.json(stats, 200);
    } catch (err) {
      logger.error('WidgetDataAPI', 'Error building widget stats:', err);
      return c.json({ error: 'Erreur interne du serveur' }, 500);
    }
  });

  return router;
}
