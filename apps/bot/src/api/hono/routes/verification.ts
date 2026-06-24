import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { Client } from 'discord.js';
import { requireAuth } from '../middleware/auth.js';
import { requireGuildAccess } from '../middleware/guildAccess.js';
import { getVerificationService } from '../../../serviceFactory.js';
import { getDashboardUrl } from '../../shared.js';

export function createVerificationRouter(client: Client) {
  const router = new OpenAPIHono();

  const deployRoute = createRoute({
    method: 'post',
    path: '/api/verify/{guildId}/deploy',
    summary: 'Déployer un embed de vérification dans un salon',
    tags: ['Verification'],
    request: {
      params: z.object({ guildId: z.string() }),
      body: {
        content: {
          'application/json': {
            schema: z.object({ channelId: z.string().min(15).max(20) }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Embed déployé',
        content: {
          'application/json': {
            schema: z.object({ success: z.boolean(), message: z.string().optional() }),
          },
        },
      },
      400: {
        description: 'Erreur',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      },
      401: {
        description: 'Non authentifié',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      },
      403: {
        description: 'Accès refusé',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      },
    },
  });

  router.use('/api/verify/:guildId/deploy', requireAuth);
  router.use('/api/verify/:guildId/deploy', requireGuildAccess(client, 'moderator'));

  router.openapi(deployRoute, async (c) => {
    const { guildId } = c.req.valid('param');
    const { channelId } = c.req.valid('json');

    const service = getVerificationService();
    const result = await service.deployVerificationEmbed({
      guildId,
      channelId,
      dashboardUrl: getDashboardUrl(),
    });

    if (!result.success) {
      return c.json({ error: result.error! }, 400);
    }
    return c.json({ success: true, message: 'Embed de vérification envoyé.' }, 200);
  });

  return router;
}
