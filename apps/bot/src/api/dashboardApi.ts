import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import { Client } from 'discord.js';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const debugLogFile = path.resolve(__dirname, '../../scratch/debug_api.log');

import prisma from '../utils/db.js';
import { logger } from '../utils/logger.js';
import jwt from 'jsonwebtoken';
import {
  json,
  JWT_SECRET,
  DISCORD_CLIENT_ID,
  DASHBOARD_URL,
  splitPath,
  parseDiscordMarkdown,
  extractMediaUrls,
  configRateLimiter,
  errorReportRateLimiter,
  feedbackReportRateLimiter,
  setDashboardStateBroadcaster,
  type DashboardSanctionType,
  BunServerResponse,
} from './shared.js';

// Modular Route Handlers
import { handlePublicRoutes } from './routes/public.js';
import { handleAuthRoutes } from './routes/auth.js';
import { handleReportErrorRoute } from './routes/error.js';
import { handleReportFeedbackRoute } from './routes/feedback.js';
import { handleUserRoutes } from './routes/user.js';
import { handleAdminRoutes } from './routes/admin.js';
import { handleDashboardRoutes } from './routes/dashboard.js';
import { handleMCPRoutes, mcpRateLimiter } from './mcp/mcpServer.js';

export type { DashboardSanctionType };

export async function notifyDashboardSanctionReportRequired(params: {
  guildId: string;
  sanctionId: string;
  sanctionType: DashboardSanctionType;
  targetTag: string;
  moderatorTag: string;
}) {
  const details = [
    `Sanction ${params.sanctionType} appliquée à ${params.targetTag}.`,
    `Rapport à compléter pour ${params.moderatorTag}.`,
    `ID sanction: ${params.sanctionId}.`,
  ].join(' ');

  await prisma.dashboardAuditLog.create({
    data: {
      guildId: params.guildId,
      user: params.moderatorTag,
      action: 'Rapport de sanction requis',
      context: `Sanction ${params.sanctionType}`,
      module: 'Sanctions',
      eventType: 'Action requise',
      details,
      dateIso: new Date(),
    },
  });

  const broadcaster = (globalThis as any).KOTBO_WS_BROADCASTER;
  if (typeof broadcaster === 'function') {
    broadcaster(params.guildId, 'sanction_report_required');
  }
}

interface WebSocketData {
  isAuthenticated: boolean;
  userId?: string;
}

export const startDashboardApi = (client: Client) => {
  const port = Number(process.env.DASHBOARD_API_PORT ?? '8787');
  const strictOAuthConfig = process.env.DASHBOARD_OAUTH_STRICT === 'true';

  const missingOAuthAtStartup = (() => {
    const missing: string[] = [];
    if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_ID.trim()) missing.push('DISCORD_CLIENT_ID');
    if (!process.env.DISCORD_REDIRECT_URI || !process.env.DISCORD_REDIRECT_URI.trim()) missing.push('DISCORD_REDIRECT_URI');
    if (!process.env.DISCORD_CLIENT_SECRET || !process.env.DISCORD_CLIENT_SECRET.trim()) missing.push('DISCORD_CLIENT_SECRET');
    return missing;
  })();

  if (missingOAuthAtStartup.length > 0) {
    const message = `Configuration OAuth invalide: variables manquantes (${missingOAuthAtStartup.join(', ')})`;
    if (strictOAuthConfig) {
      logger.error('DashboardAPI', message);
      throw new Error(message);
    }

    logger.warn('DashboardAPI', `${message}. Les routes OAuth renverront une erreur tant que ces variables ne sont pas définies.`);
  }

  const broadcastDashboardStateChangeLocal = (guildId: string, reason: string) => {
    const payload = JSON.stringify({
      type: 'dashboard_state_changed',
      guildId,
      reason,
      at: new Date().toISOString(),
    });

    server.publish('authenticated-dashboard', payload);
  };

  setDashboardStateBroadcaster(broadcastDashboardStateChangeLocal);
  (globalThis as any).KOTBO_WS_BROADCASTER = broadcastDashboardStateChangeLocal;

  // Clean up expired entries every 10 minutes
  setInterval(() => {
    const now = Date.now();
    const cleanLimiter = (limiterMap: Map<string, number[]>, windowMs: number) => {
      for (const [ip, timestamps] of limiterMap.entries()) {
        const valid = timestamps.filter(t => now - t < windowMs);
        if (valid.length === 0) {
          limiterMap.delete(ip);
        } else {
          limiterMap.set(ip, valid);
        }
      }
    };
    cleanLimiter(configRateLimiter, 60 * 1000);
    cleanLimiter(errorReportRateLimiter, 15 * 60 * 1000);
    cleanLimiter(feedbackReportRateLimiter, 15 * 60 * 1000);
    cleanLimiter(mcpRateLimiter, 60 * 1000);
  }, 10 * 60 * 1000).unref();

  const server = Bun.serve<WebSocketData>({
    port,
    async fetch(request, serverInstance) {
      const url = new URL(request.url);

      if (url.pathname === '/api/dashboard/ws') {
        const success = serverInstance.upgrade(request, {
          data: {
            isAuthenticated: false,
          },
        });
        if (success) {
          return undefined;
        }
      }

      // Convert request standard to IncomingMessage
      const socket = new Socket();
      const req = new IncomingMessage(socket);
      req.method = request.method;
      req.url = url.pathname + url.search;
      req.headers = {};
      request.headers.forEach((value, key) => {
        req.headers[key.toLowerCase()] = value;
      });

      const logFile = debugLogFile;
      const logMsg = (msg: string) => {
        try {
          appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`, 'utf8');
        } catch {}
      };

      logMsg(`Request: ${request.method} ${request.url}`);
      logMsg(`Headers: ${JSON.stringify(req.headers)}`);

      let bodyText = '';
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        try {
          bodyText = await request.text();
          logMsg(`Body read success: length=${bodyText.length}, content="${bodyText}"`);
        } catch (err) {
          const errMsg = err instanceof Error ? err.stack || err.message : String(err);
          logMsg(`Body read error: ${errMsg}`);
        }
      }
      req.bodyText = bodyText;

      if (bodyText) {
        req.push(Buffer.from(bodyText, 'utf8'));
      }
      req.push(null);


      return new Promise<Response>((resolve) => {
        const res = new BunServerResponse(req, resolve);

        void (async () => {
          // MCP endpoints are public APIs — allow any origin
          const isMcpPath = url.pathname.startsWith('/api/mcp/') || url.pathname === '/.well-known/oauth-authorization-server';

          if (isMcpPath) {
            res.setHeader('Access-Control-Allow-Origin', '*');
          } else {
            // CORS whitelist verification
            const allowedOrigins = new Set([
              DASHBOARD_URL.replace(/\/$/, ''),
              'http://localhost:5173',
              'http://localhost:3000'
            ]);
            const isAllowedDevOrigin = (candidate: string) => {
              try {
                const parsed = new URL(candidate);
                if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
                return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
              } catch {
                return false;
              }
            };

            const origin = req.headers.origin;
            const originStr = Array.isArray(origin) ? origin[0] : origin;
            if (originStr) {
              const sanitizedOrigin = originStr.replace(/\/$/, '');
              if (allowedOrigins.has(sanitizedOrigin) || isAllowedDevOrigin(sanitizedOrigin)) {
                res.setHeader('Access-Control-Allow-Origin', originStr);
                res.setHeader('Access-Control-Allow-Credentials', 'true');
              } else {
                res.setHeader('Access-Control-Allow-Origin', DASHBOARD_URL);
              }
            } else {
              res.setHeader('Access-Control-Allow-Origin', DASHBOARD_URL);
            }
          }
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin, X-Requested-With, Cache-Control, Pragma, X-Kotbo-API-Key, X-API-Key');
          res.setHeader('Access-Control-Max-Age', '86400');

          // Security response headers
          res.setHeader('Content-Security-Policy', "default-src 'self';");
          res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
          res.setHeader('X-Frame-Options', 'DENY');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
          res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');

          try {
            if (req.method === 'OPTIONS') {
              res.statusCode = 204;
              res.end();
              return;
            }

            const parts = splitPath(url.pathname);

            // Route to modular sub-routers
            if (await handlePublicRoutes(req, res, parts, url, client)) {
              return;
            }
            if (await handleAuthRoutes(req, res, parts, url, client)) {
              return;
            }
            if (await handleReportErrorRoute(req, res, parts, url, client)) {
              return;
            }
            if (await handleReportFeedbackRoute(req, res, parts, url, client)) {
              return;
            }
            if (await handleUserRoutes(req, res, parts, url, client)) {
              return;
            }
            if (await handleAdminRoutes(req, res, parts, url, client)) {
              return;
            }
            if (await handleMCPRoutes(req, res, parts, url, client)) {
              return;
            }
            if (await handleDashboardRoutes(req, res, parts, url, client)) {
              return;
            }

            // No route matched
            json(res, 404, { error: 'Route introuvable' });
          } catch (error) {
            logger.error('DashboardAPI', error);
            json(res, 500, { error: 'Erreur interne API dashboard' });
          }
        })();
      });
    },
    websocket: {
      open(ws) {
        // Enforce authentication timeout (disconnect if not authenticated within 5s)
        setTimeout(() => {
          if (!ws.data.isAuthenticated) {
            ws.close(4008, 'Timeout authentification');
          }
        }, 5000);
      },
      message(ws, messageData) {
        try {
          const raw = typeof messageData === 'string' ? messageData : new TextDecoder().decode(messageData);
          const data = JSON.parse(raw) as { type?: string; token?: string };

          if (data.type === 'auth') {
            const token = data.token;
            if (!token) {
              ws.close(4001, 'Token manquant');
              return;
            }

            try {
              const decoded = (jwt.verify(token, JWT_SECRET!) as unknown) as { userId: string };
              ws.data.isAuthenticated = true;
              ws.data.userId = decoded.userId;

              ws.subscribe('authenticated-dashboard');

              ws.send(
                JSON.stringify({
                  type: 'dashboard_ws_connected',
                  at: new Date().toISOString(),
                }),
              );
            } catch {
              ws.close(4003, 'Token invalide');
            }
          }
        } catch {
          ws.close(4000, 'Payload invalide');
        }
      },
      close(ws) {
        ws.unsubscribe('authenticated-dashboard');
      }
    }
  });

  // Diffuser les messages des salons de tickets en temps réel
  client.on('messageCreate', async (msg) => {
    if (msg.author.bot && msg.author.id !== client.user!.id) return;
    try {
      const ticket = await prisma.ticket.findFirst({
        where: { channelId: msg.channelId }
      });
      if (!ticket) return;

      const authorName = msg.member?.displayName || msg.author.displayName || msg.author.username;

      const payload = JSON.stringify({
        type: 'new_ticket_message',
        ticketId: ticket.id,
        message: {
          id: msg.id,
          authorId: msg.author.id,
          authorName,
          authorAvatar: msg.author.displayAvatarURL(),
          isStaff: msg.author.bot,
          content: msg.content,
          htmlContent: parseDiscordMarkdown(msg.content, msg.guild || undefined),
          mediaUrls: extractMediaUrls(msg.content),
          stickers: msg.stickers ? msg.stickers.map(s => ({ id: s.id, name: s.name, url: s.url })) : [],
          attachments: msg.attachments.map(a => ({ url: a.url, contentType: a.contentType })),
          embeds: msg.embeds.map(e => ({
            title: e.title,
            description: e.description,
            htmlDescription: e.description ? parseDiscordMarkdown(e.description, msg.guild || undefined) : '',
            color: e.hexColor,
            fields: e.fields ? e.fields.map(f => ({
              name: f.name,
              value: f.value,
              htmlValue: f.value ? parseDiscordMarkdown(f.value, msg.guild || undefined) : ''
            })) : [],
            image: e.image ? { url: e.image.url } : null,
            thumbnail: e.thumbnail ? { url: e.thumbnail.url } : null,
            video: e.video ? { url: e.video.url } : null
          })),
          createdAt: msg.createdAt.toISOString()
        }
      });

      server.publish('authenticated-dashboard', payload);
    } catch (err) {
      logger.error('DashboardWS', 'Erreur lors de la diffusion du message live du ticket:', err);
    }
  });

  logger.success('DashboardAPI', `API dashboard active sur http://localhost:${port}`);

  return server;
};
