import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { OkResponse } from '../schemas/common.js';

export const healthRouter = new OpenAPIHono();

const healthRoute = createRoute({
  method:  'get',
  path:    '/health',
  summary: 'Health check',
  tags:    ['System'],
  responses: {
    200: {
      description: 'Service opérationnel',
      content: {
        'application/json': {
          schema: OkResponse.extend({ service: z.string() }),
        },
      },
    },
  },
});

healthRouter.openapi(healthRoute, (c) =>
  c.json({ ok: true, service: 'kotbo-dashboard-api' }),
);
