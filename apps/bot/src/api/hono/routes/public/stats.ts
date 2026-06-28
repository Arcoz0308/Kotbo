import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { Client } from 'discord.js';
import prisma from '../../../../utils/db.js';
import { logger } from '../../../../utils/logger.js';
import { registerBotInstanceStats, cleanUpStaleStats } from '../../../../services/system/statsService.js';

// Rate limiter for stats pings (memory-based)
const statsPingRateLimiter = new Map<string, number[]>();
const PING_LIMIT_WINDOW = 10 * 60 * 1000; // 10 minutes
const PING_LIMIT_MAX = 5;

// ===========================================================================
// Schemas
// ===========================================================================

const BotPingPayloadSchema = z.object({
  botClientId: z.string().openapi({ description: 'Discord Client ID of the bot', example: '123456789012345678' }),
  botName: z.string().openapi({ description: 'Username / Display Name of the bot', example: 'Kotbo Bot' }),
  botAvatarUrl: z.string().nullable().openapi({ description: 'URL of the bot avatar', example: 'https://cdn.discordapp.com/avatars/...' }),
  dashboardUrl: z.string().nullable().openapi({ description: 'Custom dashboard URL if any', example: 'https://panel.kotbo.fr' }),
  guildCount: z.number().openapi({ description: 'Number of guilds the bot is on', example: 10 }),
  userCount: z.number().openapi({ description: 'Number of members managed by the bot', example: 500 }),
  version: z.string().nullable().openapi({ description: 'Codebase version of the bot', example: '1.0.0' }),
  isSelfHosted: z.boolean().openapi({ description: 'Whether this is a self-hosted instance', example: false }),
});

const BotStatEntrySchema = z.object({
  botName: z.string(),
  botAvatarUrl: z.string().nullable(),
  dashboardUrl: z.string().nullable(),
  guildCount: z.number(),
  userCount: z.number(),
  isSelfHosted: z.boolean(),
});

const StatsResponseSchema = z.object({
  totalGuilds: z.number(),
  totalUsers: z.number(),
  bots: z.array(BotStatEntrySchema),
});

// ===========================================================================
// Routes Definition
// ===========================================================================

const getStatsRoute = createRoute({
  method: 'get',
  path: '/api/public/stats',
  summary: 'Retrieve aggregated statistics and active bot instances',
  tags: ['PublicStats'],
  responses: {
    200: {
      description: 'Statistics successfully retrieved',
      content: {
        'application/json': { schema: StatsResponseSchema },
      },
    },
    403: {
      description: 'Access denied due to invalid origin or iframe context',
      content: {
        'application/json': { schema: z.object({ error: z.string() }) },
      },
    },
    500: {
      description: 'Internal server error',
      content: {
        'application/json': { schema: z.object({ error: z.string() }) },
      },
    },
  },
});

const pingStatsRoute = createRoute({
  method: 'post',
  path: '/api/public/stats/ping',
  summary: 'Report statistics from a bot instance',
  tags: ['PublicStats'],
  request: {
    body: {
      content: {
        'application/json': { schema: BotPingPayloadSchema },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Ping received and statistics updated',
      content: {
        'application/json': { schema: z.object({ ok: z.boolean() }) },
      },
    },
    400: {
      description: 'Invalid payload',
      content: {
        'application/json': { schema: z.object({ error: z.string() }) },
      },
    },
    429: {
      description: 'Too many pings',
      content: {
        'application/json': { schema: z.object({ error: z.string() }) },
      },
    },
    500: {
      description: 'Internal server error',
      content: {
        'application/json': { schema: z.object({ error: z.string() }) },
      },
    },
  },
});

// ===========================================================================
// Router Factory
// ===========================================================================

export function createPublicStatsRouter(_client: Client) {
  const router = new OpenAPIHono();

  // GET /api/public/stats
  router.openapi(getStatsRoute, async (c) => {
    const origin = c.req.header('origin');
    const referer = c.req.header('referer');
    const secFetchSite = c.req.header('Sec-Fetch-Site');
    const secFetchDest = c.req.header('Sec-Fetch-Dest');

    // 1. Strict Origin & Referer Checks (Only kotbo.fr or localhost allowed)
    let isAllowed = false;
    const isDevUrl = (urlStr: string) => {
      try {
        const u = new URL(urlStr);
        return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
      } catch {
        return false;
      }
    };

    if (origin) {
      if (origin === 'https://kotbo.fr' || origin === 'https://www.kotbo.fr' || isDevUrl(origin)) {
        isAllowed = true;
      }
    } else if (referer) {
      try {
        const refUrl = new URL(referer);
        if (refUrl.hostname === 'kotbo.fr' || refUrl.hostname === 'www.kotbo.fr' || refUrl.hostname === 'localhost' || refUrl.hostname === '127.0.0.1') {
          isAllowed = true;
        }
      } catch {
        // Ignore invalid URL format in Referer header
      }
    }

    if (!isAllowed) {
      logger.warn('StatsAPI', `Rejected request due to invalid origin: ${origin || 'none'} (referer: ${referer || 'none'})`);
      return c.json({ error: 'Access forbidden: unauthorized origin' }, 403);
    }

    // 2. Iframe / Clickjacking Prevention
    // Reject direct loading in frame/iframe
    if (secFetchDest === 'iframe' || secFetchDest === 'frame') {
      logger.warn('StatsAPI', `Rejected request with Sec-Fetch-Dest = ${secFetchDest}`);
      return c.json({ error: 'Access forbidden: iframe context blocked' }, 403);
    }

    // Detect if nested in cross-origin iframe (Sec-Fetch-Site is downgraded to cross-site)
    if (secFetchSite === 'cross-site') {
      const isKotboOrigin = origin && (origin.includes('kotbo.fr') || origin.includes('www.kotbo.fr'));
      if (isKotboOrigin) {
        logger.warn('StatsAPI', 'Rejected request: same-site origin detected in cross-site context (iframe check)');
        return c.json({ error: 'Access forbidden: iframe nesting detected' }, 403);
      }
    }

    // Add security headers to prevent framing the response itself
    c.header('X-Frame-Options', 'DENY');
    c.header('Content-Security-Policy', "frame-ancestors 'none'");

    try {
      // Clean up stale stats (older than 48h) on request
      await cleanUpStaleStats().catch((err) => {
        logger.error('StatsAPI', 'Failed to clean up stale stats:', err);
      });

      // Retrieve all active bot stats
      const activeBots = await prisma.botInstanceStats.findMany({
        orderBy: { guildCount: 'desc' },
      });

      // Aggregate totals
      const totalGuilds = activeBots.reduce((sum, b) => sum + b.guildCount, 0);
      const totalUsers = activeBots.reduce((sum, b) => sum + b.userCount, 0);

      // Map to safe public structure
      const bots = activeBots.map((b) => ({
        botName: b.botName,
        botAvatarUrl: b.botAvatarUrl,
        dashboardUrl: b.dashboardUrl,
        guildCount: b.guildCount,
        userCount: b.userCount,
        isSelfHosted: b.isSelfHosted,
      }));

      return c.json({
        totalGuilds,
        totalUsers,
        bots,
      }, 200);
    } catch (err) {
      logger.error('StatsAPI', 'Error returning aggregated stats:', err);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  // POST /api/public/stats/ping
  router.openapi(pingStatsRoute, async (c) => {
    // Apply IP-based rate limiting
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    const now = Date.now();
    const timestamps = statsPingRateLimiter.get(ip) ?? [];
    const validTimestamps = timestamps.filter((t) => now - t < PING_LIMIT_WINDOW);

    if (validTimestamps.length >= PING_LIMIT_MAX) {
      logger.warn('StatsAPI', `Rate limit exceeded for IP: ${ip}`);
      return c.json({ error: 'Too many pings. Please wait before retrying.' }, 429);
    }

    validTimestamps.push(now);
    statsPingRateLimiter.set(ip, validTimestamps);

    // Clean up empty rate limiter entries occasionally
    if (Math.random() < 0.1) {
      for (const [key, list] of statsPingRateLimiter.entries()) {
        const active = list.filter((t) => now - t < PING_LIMIT_WINDOW);
        if (active.length === 0) {
          statsPingRateLimiter.delete(key);
        } else {
          statsPingRateLimiter.set(key, active);
        }
      }
    }

    try {
      const payload = c.req.valid('json');
      await registerBotInstanceStats(payload);
      return c.json({ ok: true }, 200);
    } catch (err) {
      logger.error('StatsAPI', 'Error storing stats ping:', err);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  return router;
}
