import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import {
  getDiscordClientId,
  getMissingOAuthConfig,
} from '../../shared.js';
import { configRateLimiter } from '../../limiters.js';
import { getCurrentInstance } from '../../../utils/instanceContext.js';
import { rateLimit } from '../middleware/rateLimit.js';

export const configRouter = new OpenAPIHono();

// ---------------------------------------------------------------------------
// GET /api/config
// ---------------------------------------------------------------------------

const configRoute = createRoute({
  method:  'get',
  path:    '/api/config',
  summary: 'Configuration publique du client Discord (OAuth)',
  tags:    ['Config'],
  responses: {
    200: {
      description: 'Configuration OAuth',
      content: {
        'application/json': {
          schema: z.object({ discordClientId: z.string() }),
        },
      },
    },
    429: {
      description: 'Trop de requêtes',
      content: { 'application/json': { schema: z.object({ error: z.string() }) } },
    },
    500: {
      description: 'Configuration OAuth invalide côté serveur',
      content: { 'application/json': { schema: z.object({ error: z.string(), missing: z.array(z.string()) }) } },
    },
  },
});

configRouter.use('/api/config', rateLimit(configRateLimiter, 30, 60 * 1000));
configRouter.openapi(configRoute, (c) => {
  const missingOAuth = getMissingOAuthConfig();
  if (missingOAuth.length > 0) {
    return c.json({
      error: 'Configuration OAuth invalide côté serveur.',
      missing: missingOAuth,
    }, 500);
  }
  return c.json({ discordClientId: getDiscordClientId() }, 200);
});

// ---------------------------------------------------------------------------
// GET /api/branding
// ---------------------------------------------------------------------------

const BrandingResponse = z.object({
  instanceId:   z.string(),
  slug:         z.string(),
  name:         z.string(),
  color:        z.string().nullable(),
  logoUrl:      z.string().nullable(),
  faviconUrl:   z.string().nullable(),
  footerText:   z.string().nullable(),
  isWhiteLabel: z.boolean(),
});

const brandingRoute = createRoute({
  method:  'get',
  path:    '/api/branding',
  summary: 'Informations de branding white-label pour le dashboard',
  tags:    ['Config'],
  responses: {
    200: {
      description: 'Branding de l\'instance courante',
      content: { 'application/json': { schema: BrandingResponse } },
    },
  },
});

configRouter.openapi(brandingRoute, (c) => {
  const inst = getCurrentInstance();
  return c.json({
    instanceId:   inst.id,
    slug:         inst.slug,
    name:         inst.brandName,
    color:        inst.brandColor,
    logoUrl:      inst.brandLogoUrl,
    faviconUrl:   inst.brandFaviconUrl,
    footerText:   inst.brandFooterText,
    isWhiteLabel: !inst.isDefault,
  }, 200);
});
