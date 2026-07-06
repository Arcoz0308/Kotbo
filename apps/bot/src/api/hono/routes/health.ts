import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { Client } from 'discord.js';
import { prisma } from '../../../utils/db.js';
import { getRedis } from '../../../infra/redis.js';

// ---------------------------------------------------------------------------
// Schémas
// ---------------------------------------------------------------------------

const ComponentStatus = z.object({
  status:    z.enum(['up', 'down']),
  latencyMs: z.number().optional(),
  error:     z.string().optional(),
});

const HealthResponse = z.object({
  ok:         z.boolean(),
  service:    z.string(),
  timestamp:  z.string(),
  uptime:     z.number(),
  components: z.object({
    discord:  ComponentStatus,
    database: ComponentStatus,
    redis:    ComponentStatus,
  }),
});

const ComponentResponse = z.object({
  ok:        z.boolean(),
  component: z.string(),
  status:    z.enum(['up', 'down']),
  latencyMs: z.number().optional(),
  error:     z.string().optional(),
});

type ComponentResult = z.infer<typeof ComponentStatus>;

// ---------------------------------------------------------------------------
// Helpers de vérification
// ---------------------------------------------------------------------------

/** Empêche un composant bloqué (DB/Redis qui pend) de faire traîner le check. */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout après ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

// Les endpoints /health/* sont publics (status page). On évite de divulguer
// des détails d'infra (host DB, etc.) dans les messages d'erreur en production.
const EXPOSE_ERRORS = process.env.NODE_ENV !== 'production';

function errMsg(err: unknown): string {
  if (!EXPOSE_ERRORS) return 'Indisponible';
  return err instanceof Error ? err.message : String(err);
}

/** La gateway Discord est-elle connectée et prête (READY) ? */
function checkDiscord(client: Client): ComponentResult {
  const ready = client.isReady();
  if (!ready) return { status: 'down', error: 'Gateway Discord non prête (WebSocket non READY)' };
  return { status: 'up', latencyMs: Math.max(0, Math.round(client.ws.ping)) };
}

/** PostgreSQL répond-il à une requête triviale ? */
async function checkDatabase(): Promise<ComponentResult> {
  const start = Date.now();
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, 3000);
    return { status: 'up', latencyMs: Date.now() - start };
  } catch (err) {
    return { status: 'down', latencyMs: Date.now() - start, error: errMsg(err) };
  }
}

/** Redis répond-il au PING ? */
async function checkRedis(): Promise<ComponentResult> {
  const redis = getRedis();
  if (!redis) return { status: 'down', error: 'Redis non initialisé' };
  const start = Date.now();
  try {
    await withTimeout(redis.ping(), 3000);
    return { status: 'up', latencyMs: Date.now() - start };
  } catch (err) {
    return { status: 'down', latencyMs: Date.now() - start, error: errMsg(err) };
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/**
 * Router de health-check destiné au monitoring externe (Upptime / status page).
 * Renvoie 503 dès qu'un composant critique est down afin que le moniteur
 * marque le service comme indisponible plutôt que "up" à tort.
 */
export function createHealthRouter(client: Client): OpenAPIHono {
  const router = new OpenAPIHono();

  // --- Health global : /health -------------------------------------------
  const healthRoute = createRoute({
    method:  'get',
    path:    '/health',
    summary: 'Health check global (Discord + DB + Redis)',
    tags:    ['System'],
    responses: {
      200: {
        description: 'Tous les composants critiques sont opérationnels',
        content: { 'application/json': { schema: HealthResponse } },
      },
      503: {
        description: 'Au moins un composant critique est indisponible',
        content: { 'application/json': { schema: HealthResponse } },
      },
    },
  });

  router.openapi(healthRoute, async (c) => {
    const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);
    const discord = checkDiscord(client);

    const ok =
      discord.status === 'up' && database.status === 'up' && redis.status === 'up';

    return c.json(
      {
        ok,
        service:   'kotbo-dashboard-api',
        timestamp: new Date().toISOString(),
        uptime:    Math.round(process.uptime()),
        components: { discord, database, redis },
      },
      ok ? 200 : 503,
    );
  });

  // --- Checks granulaires : /health/discord, /health/db, /health/redis ---
  // Une URL par composant pour un affichage séparé sur la status page.
  const componentRoute = (path: string, summary: string) =>
    createRoute({
      method: 'get',
      path,
      summary,
      tags: ['System'],
      responses: {
        200: {
          description: 'Composant opérationnel',
          content: { 'application/json': { schema: ComponentResponse } },
        },
        503: {
          description: 'Composant indisponible',
          content: { 'application/json': { schema: ComponentResponse } },
        },
      },
    });

  const componentBody = (component: string, result: ComponentResult) => ({
    ok: result.status === 'up',
    component,
    ...result,
  });

  router.openapi(
    componentRoute('/health/discord', 'Health check gateway Discord'),
    (c) => {
      const body = componentBody('discord', checkDiscord(client));
      return c.json(body, body.ok ? 200 : 503);
    },
  );

  router.openapi(
    componentRoute('/health/db', 'Health check base de données'),
    async (c) => {
      const body = componentBody('database', await checkDatabase());
      return c.json(body, body.ok ? 200 : 503);
    },
  );

  router.openapi(
    componentRoute('/health/redis', 'Health check Redis'),
    async (c) => {
      const body = componentBody('redis', await checkRedis());
      return c.json(body, body.ok ? 200 : 503);
    },
  );

  return router;
}
