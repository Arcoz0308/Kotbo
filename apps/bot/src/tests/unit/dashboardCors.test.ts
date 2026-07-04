import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { dashboardCors } from '../../api/hono/middleware/cors.js';

describe('dashboardCors', () => {
  const app = new Hono();
  app.use('*', dashboardCors());
  app.get('/api/public/stats', (c) => c.json({ ok: true }));

  test('reflects dash.kotbo.fr origin in Access-Control-Allow-Origin', async () => {
    const res = await app.request('/api/public/stats', {
      headers: { Origin: 'https://dash.kotbo.fr' },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://dash.kotbo.fr');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  test('reflects kotbo.fr landing origin', async () => {
    const res = await app.request('/api/public/stats', {
      headers: { Origin: 'https://kotbo.fr' },
    });

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://kotbo.fr');
  });

  test('handles OPTIONS preflight for dash.kotbo.fr', async () => {
    const res = await app.request('/api/public/stats', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://dash.kotbo.fr',
        'Access-Control-Request-Method': 'GET',
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://dash.kotbo.fr');
  });
});
